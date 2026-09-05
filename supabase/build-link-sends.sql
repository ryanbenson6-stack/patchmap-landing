-- Warm-viewer page: the build-link email log + its rate limiter.
-- Run in the PatchMap Supabase project (xottjtannqlnkmwizxvi). Idempotent.
--
-- ── WHY THIS EXISTS AT ALL ──────────────────────────────────────────────────
-- The build spec says the warm page is "a warm front-end to the existing
-- desktop-link email mechanic, not new plumbing." That turned out not to be
-- true, and the difference matters:
--
--   app/api/desktop-link/route.ts  — requires an authenticated session, takes
--     NO recipient (it emails `user.email` and nothing else), and sends a
--     token-less link. Its own comment says the missing recipient is deliberate,
--     "so this can never be pointed at someone else's inbox and turned into a
--     send-anyone-an-email endpoint."
--
--   The warm page's visitor is ANONYMOUS and types their own address, and the
--     link has to carry a share token or the K-factor loop stays open.
--
-- So this is a genuinely new endpoint that does the exact thing the existing one
-- refused to do. That is fine — it's what the page is for — but it means the
-- abuse controls are ours to build, and they are the whole content of this file.
--
-- ── THE SHAPE OF THE ABUSE ──────────────────────────────────────────────────
-- An unauthenticated endpoint that sends mail to an arbitrary address is a spam
-- relay unless something stops it. Three things do:
--
--   1. The body is fixed. The sender controls the recipient and nothing else —
--      no subject, no message, no attacker-supplied text is rendered. The worst
--      payload is a PatchMap build link, which is a link we publish anyway.
--   2. Rate limits, enforced HERE rather than in the handler, because Vercel
--      functions are stateless and per-instance memory would reset constantly.
--   3. The counters are checked and the row written in ONE statement, so two
--      concurrent requests can't both read "under the cap" and both send.
--
-- ── WHY A FUNCTION AND NOT A TABLE GRANT ────────────────────────────────────
-- Rate limiting needs to COUNT past sends, and the landing only has the anon
-- key. Granting anon SELECT on this table would let anyone holding that key —
-- it ships in the page source — read every address that ever used the form.
-- So anon gets EXECUTE on one SECURITY DEFINER function and no table privilege
-- whatsoever: it can cause a row to exist and can never read one back.
--
-- Same gotcha as attribution-grants-fix.sql: this DB does not auto-grant, and a
-- policy over a missing grant fails 42501 and looks like an RLS problem.

-- ── 1. The log ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.build_link_sends (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at   timestamptz NOT NULL DEFAULT now(),
  email        text        NOT NULL,
  -- The referring viewer token. This is the K-factor link: it is what lets a
  -- signup that arrives days later, from an email, be joined back to the share
  -- that caused it. Nullable because someone can reach the page without one
  -- (typed the URL, stripped params) and we would still rather send the link.
  token        text,
  medium       text,       -- 'qr' | 'link', mirrors lib/shareRef.ts
  -- Salted hash, never a raw IP. Enough to rate-limit, not enough to be a
  -- location record on people who have not signed up for anything.
  ip_hash      text,
  user_agent   text
);

ALTER TABLE public.build_link_sends ENABLE ROW LEVEL SECURITY;

-- No anon policy and no anon grant, on purpose. Every write goes through the
-- function below, which runs as owner and bypasses both.

CREATE INDEX IF NOT EXISTS build_link_sends_email_idx
  ON public.build_link_sends (lower(email), created_at DESC);
CREATE INDEX IF NOT EXISTS build_link_sends_ip_idx
  ON public.build_link_sends (ip_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS build_link_sends_token_idx
  ON public.build_link_sends (token) WHERE token IS NOT NULL;

-- ── 2. Check-and-record, atomically ─────────────────────────────────────────
-- Returns true if the caller may send. Returns false if a cap is hit, and in
-- that case writes nothing.
--
-- The caps are deliberately loose enough that a real person never meets one.
-- A viewer at a load-in types their address once; three sends in a day is
-- already someone testing, and six from one network in an hour is a script.
CREATE OR REPLACE FUNCTION public.pm_record_build_link(
  p_email   text,
  p_token   text,
  p_medium  text,
  p_ip_hash text,
  p_ua      text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
-- Empty search_path so a caller cannot shadow `public` and have this definer
-- function resolve `build_link_sends` to a table they control. Every reference
-- below is schema-qualified for the same reason.
SET search_path = ''
AS $$
DECLARE
  v_email text := lower(trim(p_email));
  v_per_email int;
  v_per_ip int;
BEGIN
  IF v_email IS NULL OR v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN
    RETURN false;
  END IF;

  SELECT count(*) INTO v_per_email
  FROM public.build_link_sends
  WHERE lower(email) = v_email
    AND created_at > now() - interval '24 hours';

  IF v_per_email >= 3 THEN
    RETURN false;
  END IF;

  IF p_ip_hash IS NOT NULL THEN
    SELECT count(*) INTO v_per_ip
    FROM public.build_link_sends
    WHERE ip_hash = p_ip_hash
      AND created_at > now() - interval '1 hour';

    IF v_per_ip >= 6 THEN
      RETURN false;
    END IF;
  END IF;

  INSERT INTO public.build_link_sends (email, token, medium, ip_hash, user_agent)
  VALUES (v_email,
          nullif(trim(coalesce(p_token, '')), ''),
          CASE WHEN p_medium IN ('qr', 'link') THEN p_medium ELSE NULL END,
          p_ip_hash,
          left(coalesce(p_ua, ''), 400));

  RETURN true;
END;
$$;

-- The function is the entire public surface. Note EXECUTE is granted to anon
-- but the table is not — that asymmetry is the security model, not an oversight.
REVOKE ALL ON FUNCTION public.pm_record_build_link(text, text, text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.pm_record_build_link(text, text, text, text, text) TO anon;

NOTIFY pgrst, 'reload schema';

-- ── 3. Verify ───────────────────────────────────────────────────────────────
-- Expect true, then true, then true, then FALSE — the fourth trips the 3/day
-- per-email cap. Roll it back after.
-- BEGIN;
--   SELECT public.pm_record_build_link('probe@example.com', 'tok_1', 'qr', 'h1', 'probe');
--   SELECT public.pm_record_build_link('probe@example.com', 'tok_1', 'qr', 'h1', 'probe');
--   SELECT public.pm_record_build_link('probe@example.com', 'tok_1', 'qr', 'h1', 'probe');
--   SELECT public.pm_record_build_link('probe@example.com', 'tok_1', 'qr', 'h1', 'probe');
-- ROLLBACK;

-- ── 4. The question this table exists to answer ─────────────────────────────
-- How many warm-page emails turned into signups, and which shares caused them.
-- Runnable once conversions/attribution start carrying utm_content.
--
-- SELECT b.token,
--        count(DISTINCT b.email)                             AS emails_sent,
--        count(DISTINCT a.anonymous_id)                      AS signups_attributed
-- FROM public.build_link_sends b
-- LEFT JOIN public.attribution a
--   ON a.utm_content = b.token AND a.utm_source = 'share'
-- GROUP BY b.token
-- ORDER BY signups_attributed DESC NULLS LAST;
