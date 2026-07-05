# PatchMap — Session Handoff

_Written 2026-07-05. Read `ANALYTICS_PICKUP.md` alongside this — it holds the full analytics spec, data contract, and deferred build order. This doc is the "where everything is and what's done" map for restarting cold._

---

## The two repos

| Repo | Path | GitHub | Deploys to |
|---|---|---|---|
| **patchmap-landing** (static sales page) | `C:\Users\Indie\OneDrive\Documents\Claude Projects\Development\patchmap-landing` | `ryanbenson6-stack/patchmap-landing` | `patchmap.app` — sales page at **`patchmap.app/main`** (folder `main/index.html`) |
| **patch-map** (the Next.js app) | `C:\Users\Indie\OneDrive\Documents\Claude Projects\Development\Apps\patch-map` | `ryanbenson6-stack/stage-plot-pro` | `app.patchmap.app` |

Both auto-deploy from `master` on Vercel. They **share one Supabase project** (the "PatchMap project" — has `profiles`, `landing_events`, and the new analytics tables).

The three source briefs (build brief, revision brief, analytics addendum) were pasted in-session and are **not saved to disk** — recommend dropping them in `patchmap-landing/docs/` next session. Locked copy/pricing already live in `main/index.html`; the analytics spec is captured in `ANALYTICS_PICKUP.md`.

---

## Workstream status

### 1. Sales page — ✅ DONE & LIVE (`patchmap-landing/main/index.html`)
One self-contained, config-driven static file. Revision pass 1 fully applied + the signature conductor-bundle toggle animation built. Key commits: `ddfeb8b` (page), plus the revision + animation commits after it.
- Tier-routed content (Free/Plus/Pro/Tour), annual-first pricing w/ monthly⇄annual toggle + honest discounts (17/17/19%), venue tooltip + FAQ, Show Intelligence as Tour spotlight, compressed tier-accented pain sections.
- Signature animation: SVG conductor-bundle strike on tier toggle (WAAPI `stroke-dashoffset`), top-to-bottom section reveal, reduced-motion fallback.
- Spotlight assets are tasteful placeholders (real videos exist in `patchmap-landing/assets/` — not wired in, per decision).

### 2. Analytics capture layer (Addendum §2/§3) — ✅ DONE, LIVE & VERIFIED END-TO-END
Files: `main/index.html` (ATTRIBUTION + ANALYTICS block), `api/track.js` (events sink), `api/pageview.js` (existing, attribution spine), `supabase/analytics_capture.sql`.
Commits: `fe81a58` (capture), `da51c66` (pickup doc), `a1c64e9` (idempotent policies), `e80b7a1` (grants).
- First-touch attribution (`anonymous_id` in first-party cookie, UTMs, referrer, derived channel), never overwritten.
- One `track()` chokepoint → `/api/track` (full stream) + `/api/pageview` (spine) + inert PostHog seam.
- 9 events: page_view, tier_toggle, cta_click, pricing_toggle, pricing_card_view, scroll_depth, tier_dwell, faq_open, exit.
- App CTAs decorated with `?aid=<anonymous_id>` for the identity bridge.
- **Verified:** live event `curl-test-0009` landed in `sales_events`. Working.

### 3. Identity bridge (Addendum §4, step 1) — ✅ MERGED & LIVE (PR #1, merged 2026-07-05)
Repo: **patch-map**, on `master`. **PR #1** merged (`6c39bbb`).
Files: `middleware.ts` (persists `?aid=` → httpOnly `pm_aid` cookie across OAuth), `app/auth/callback/route.ts` (aliases anonymous_id→user_id in `identities`, backfills `sales_events.user_id`; service-role, best-effort, never blocks login), `supabase/identity-bridge.sql`.
- ✅ `identities` table created + migration run; `tsc` passes; merged to master (auto-deployed).
- ⬜ **Still TODO: smoke test** — hit app with `?aid=test-bridge-123`, sign up throwaway acct, then `select * from identities where anonymous_id='test-bridge-123';`. (Merged but not yet verified in prod.)

### 4. Stripe conversion webhook (Addendum §4, step 2) — ✅ MERGED & LIVE (PR #2, merged 2026-07-05)
Repo: **patch-map**, on `master`. **PR #2** merged (`ea64c06`).
File: `app/api/stripe/webhook/route.ts` — `recordConversion()` on `checkout.session.completed`; joins `identities`→`attribution`, writes one `conversions` row. `conversions` table confirmed to exist (empty, as expected — fills on first real paid checkout).
- ⬜ **Not yet proven end-to-end** — needs a real (or test-mode) paid checkout to confirm a `conversions` row lands. Also note: Stripe Price IDs are env-driven and may still be blank (`isBillingConfigured()` / `tierForPriceId`), so verify billing is actually configured before expecting conversions.

---

## Supabase tables (all in the shared PatchMap project)
- Pre-existing: `profiles`, `landing_events`.
- Added this session: `sales_events`, `attribution`, `identities`. Staged (created, not yet wired): `conversions`, `campaign_spend`.
- Migrations to re-apply if rebuilding: `patchmap-landing/supabase/analytics_capture.sql`, `patch-map/supabase/identity-bridge.sql`.

### ⚠️ Supabase gotchas learned (cost us an hour — don't repeat)
A brand-new table's inserts from the app (anon key) need **all three**:
1. RLS enabled **+** an `anon` INSERT policy, AND
2. `grant insert on public.<table> to anon;` (new tables don't inherit default grants), AND
3. sometimes `notify pgrst, 'reload schema';` (PostgREST schema cache is stale).
Service-role writes (webhook, auth callback) bypass all of this — that's why the identity bridge tables need no anon policy.
Also: the Supabase SQL editor shows **only the last statement's result** when you run several at once — run verification `select`s alone. Confirm you're in the right project by checking a known row (`landing_events` had `curl-test-0001`).

---

## What's NEXT (deferred — build order per Addendum §9)
1. **Merge PR #1 (identity bridge) + smoke test** (above).
2. **Stripe conversion webhook (§4)** — ✅ BUILT, 🟡 in **PR #2: https://github.com/ryanbenson6-stack/stage-plot-pro/pull/2** (branch `analytics/stripe-conversions`, off master). Extends `app/api/stripe/webhook/route.ts` with `recordConversion()` on `checkout.session.completed`. `tsc` passes.
   - **Decisions locked (2026-07-05):** fire on `checkout.session.completed` **only** (one conversion per customer; guarded against retry double-count). `amount` = tier's recurring list price (not `amount_total`). Organic signups still record with null attribution.
   - ⬜ **Before it's fully live:** (a) confirm `conversions` table exists in the shared Supabase project — `select to_regclass('public.conversions');` (user agreed to verify); (b) merge **PR #1** so the `identities` join resolves; (c) merge PR #2.
3. **Campaign spend form (§4)** — dashboard: writes `campaign_spend` (already staged). CAC = spend ÷ conversions for that `utm_campaign`.
4. **Rollups via Cron (§5)** — `channel_rollup`, `funnel_rollup`, `tier_engagement_rollup`. → `indiesoft/dashboard`.
5. **Dashboard Views A–D (§6)** — scorecard/drill-down/funnel/insights. → `indiesoft/dashboard`.
6. **Claude insight layer (§7)** — advisory only, hard guardrail on small samples. → `indiesoft/dashboard`.

Full spec, event/attribution data contract, §1 design principles, and §8 tooltip copy are in **`ANALYTICS_PICKUP.md`**.

### Needed before continuing the dashboard side
- **PostHog project key** (activates the inert seam + identify/alias).
- Confirm app Supabase project == landing project (looks confirmed — `identities` was created in the `sales_events` project and the app points there).
- Stripe webhook signing secret / which events map to a conversion.

---

## Cleanup (optional)
Test rows to delete when convenient:
```sql
delete from sales_events   where anonymous_id like 'curl-test-%' or anonymous_id = 'sql-0006';
delete from attribution    where anonymous_id like 'curl-test-%';
delete from landing_events where visitor_id   like 'curl-test-%';
delete from identities     where anonymous_id like 'test-bridge-%';
```
