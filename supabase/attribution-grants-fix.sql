-- Fix: `attribution` has been rejecting every write since it shipped.
-- Run in the PatchMap Supabase project (xottjtannqlnkmwizxvi). Idempotent.
--
-- SYMPTOM: `attribution` had 0 rows while `sales_events` had 9,394. Both are
-- written by the same handler (patchmap-landing/api/track.js) with the same anon
-- client, in the same try block, attribution first.
--
-- CAUSE: the anon GRANT on `attribution` never took. Probed directly:
--
--   anon  → POST /rest/v1/attribution  →  401  42501 permission denied
--   service_role → same POST           →  201  OK
--
-- The adjacent `grant insert on public.sales_events to anon` (analytics_capture.sql:74)
-- DID apply, which is why that table filled up normally and this one didn't. The
-- Supabase SQL editor runs statements outside a transaction, so a mid-script
-- failure leaves exactly this: table created, RLS enabled, grant missing. The
-- handler logs `attribution upsert error:` to Vercel and swallows it — by design,
-- so the beacon never 500s — which is why it stayed invisible for months.
--
-- This is the same gotcha as profiles-grants.sql and session-logs-grants.sql.
-- This DB does not auto-grant. Every new table needs its GRANT stated explicitly,
-- and an RLS policy alone is not enough: the grant is checked FIRST, so a correct
-- policy over a missing grant fails with 42501 and looks like an RLS problem.

-- ── 1. The actual fix ───────────────────────────────────────────────────────
-- SELECT is the one that actually matters, and it is not obvious. api/track.js
-- writes this table with .upsert({ onConflict: 'anonymous_id', ignoreDuplicates })
-- which Postgres executes as INSERT ... ON CONFLICT — and ON CONFLICT requires
-- SELECT privilege on the target table. `anon` never had it, so every write died
-- at 42501 even once INSERT was granted. Proven by probe:
--
--   anon → attribution  plain INSERT       → 201
--   anon → attribution  UPSERT on_conflict → 401 42501
--   anon → sales_events plain INSERT       → 201  (and SELECT is denied there too)
--
-- sales_events is the control: same role, same handler, SELECT equally denied,
-- but it uses a plain .insert() and has always worked. The two tables differ by
-- exactly ON CONFLICT, which is the whole bug.
GRANT INSERT ON public.attribution TO anon;

DROP POLICY IF EXISTS attribution_anon_insert ON public.attribution;
CREATE POLICY attribution_anon_insert ON public.attribution
  FOR INSERT TO anon WITH CHECK (true);

NOTIFY pgrst, 'reload schema';

-- THAT IS ALL THE PRIVILEGE THIS TABLE NEEDS, because api/track.js now writes it
-- with a plain .insert(). The upsert is gone — see the comment there. Write-once
-- is enforced by the primary key (a repeat visitor's insert fails 23505 and the
-- original row survives), which is what the upsert was for, so anon never needs
-- UPDATE on a table whose entire purpose is to not be updated.
--
-- If anyone ever restores the upsert, it will silently stop working again unless
-- they ALSO grant SELECT and add an anon UPDATE policy. Don't. Fix forward.

-- ── Optional hygiene, not required for the fix ──────────────────────────────
-- The live DB has anon holding UPDATE, TRUNCATE, REFERENCES and TRIGGER on this
-- table from an earlier broad grant. None is reachable through PostgREST (it
-- exposes no TRUNCATE verb, and nothing issues an UPDATE), so this is tidying
-- rather than closing a hole — but anon being able to rewrite or empty the
-- first-touch record is the wrong default for a write-once table.
REVOKE UPDATE, TRUNCATE, REFERENCES, TRIGGER ON public.attribution FROM anon;
DROP POLICY IF EXISTS attribution_anon_update ON public.attribution;

-- ── 2. Recover the history ──────────────────────────────────────────────────
-- Nothing was actually lost. `sales_events` denormalises the whole first-touch
-- payload onto EVERY row (utm_*, channel, referrer), so first touch is simply the
-- earliest row per anonymous_id. 9,393 of 9,394 rows carry `channel` and 7,615
-- carry `utm_source`, so this reconstructs the table rather than approximating it.
--
-- DISTINCT ON + ORDER BY created_at is what makes it first-touch: one row per
-- visitor, the oldest one. ON CONFLICT DO NOTHING means re-running this after the
-- landing page has started writing for real can never overwrite a genuine row.
INSERT INTO public.attribution (
  anonymous_id, utm_source, utm_medium, utm_campaign, utm_content, utm_term,
  channel, referrer, landing_page, first_seen_at
)
SELECT DISTINCT ON (s.anonymous_id)
  s.anonymous_id, s.utm_source, s.utm_medium, s.utm_campaign, s.utm_content,
  s.utm_term, s.channel, s.referrer,
  -- sales_events stores the path of the event, not the landing page. For the
  -- earliest row those are the same thing, which is the only row we take.
  s.path,
  s.created_at
FROM public.sales_events s
WHERE s.anonymous_id IS NOT NULL
ORDER BY s.anonymous_id, s.created_at ASC
ON CONFLICT (anonymous_id) DO NOTHING;

-- ── 3. What this does NOT recover ───────────────────────────────────────────
-- The 3 existing `conversions` rows stay unattributed, and that is not fixable.
-- Joining a conversion to attribution needs an `identities` row (user_id →
-- anonymous_id), `identities` is empty because the bridge only ever ran on the
-- magic-link/OAuth path (fixed app-side in v1.93.2), and `sales_events.user_id`
-- is NULL on all 9,394 rows for the same reason. There is no surviving link
-- between those three paying accounts and any anonymous_id.
--
-- From here the chain is whole: landing writes attribution (this file) → signup
-- writes identities (v1.93.2) → the Stripe webhook joins them and copies all nine
-- fields onto the conversion (v1.93.2 + conversions-attribution-widen.sql).

-- ── 4. Verify ───────────────────────────────────────────────────────────────
-- Expect a few thousand rows, and instagram/launch_test_july to dominate.
SELECT count(*) AS rows,
       count(*) FILTER (WHERE utm_source IS NOT NULL) AS with_utm_source,
       count(*) FILTER (WHERE channel  IS NOT NULL)   AS with_channel
FROM public.attribution;

SELECT channel, count(*) FROM public.attribution GROUP BY channel ORDER BY 2 DESC LIMIT 10;
