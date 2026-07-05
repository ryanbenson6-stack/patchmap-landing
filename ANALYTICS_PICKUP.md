# PatchMap Analytics — Pickup Doc

_For resuming the analytics/attribution build later. Written 2026-07-03._
_Source specs: `patchmap-salespage-build-brief.md`, `…-revision-brief.md`, and the **Analytics & Attribution Addendum (Instruction Set 3)** — the addendum is authoritative for this layer._

---

## TL;DR — where we are

The **capture layer is DONE and deployed** on `patchmap.app/main`. The **compute + interpret layers are NOT built** — they live in `indiesoft/dashboard` and are the next job.

- ✅ Done & live: first-touch attribution, `anonymous_id`, single `track()` chokepoint, all 9 behavioural events, cross-domain `anonymous_id` hand-off, `/api/track` sink, migration SQL.
- ⚠️ **One manual step to fully activate capture** (see below).
- ⬜ Not built: identity alias in the app, Stripe conversion webhook, Cron rollups, dashboard Views A–D, Claude insight layer, PostHog wiring.

Relevant commits in `patchmap-landing`: `ddfeb8b` (sales page), `fe81a58` (capture layer).

---

## ⚠️ DO THIS FIRST (activates the full event stream)

Run the migration against the **PatchMap Supabase project** (the same one `/api/pageview` and the dashboard already use):

```
supabase/analytics_capture.sql
```

Creates: `attribution`, `sales_events` (+ RLS anon-insert policies), and staged `conversions` + `campaign_spend`.

**Until this runs:** `/api/track` inserts fail silently (caught, page unaffected), so the full behavioural stream is dropped. The **attribution spine still persists** via the existing `/api/pageview → landing_events`, so channel credit is NOT being lost in the meantime — but rich behavioural events (dwell, toggles, card views, funnel steps) only start persisting once the tables exist. Run it before spending real ad dollars.

Verify after running: load `patchmap.app/main?utm_source=test_pickup`, toggle a tier, then check `select * from sales_events order by created_at desc limit 20;` and `select * from attribution where utm_source='test_pickup';`.

---

## What shipped (capture layer) — the data contract

All in `main/index.html` (the `ATTRIBUTION + ANALYTICS` block) + `api/track.js`.

### First-touch attribution (§2)
Stored in a first-party cookie `pm_attr` (400-day), written once on first load, **never overwritten**. Shape:
```json
{ "anonymous_id": "<uuid>", "utm_source": null, "utm_medium": null,
  "utm_campaign": null, "utm_content": null, "utm_term": null,
  "referrer": "<document.referrer>", "channel": "organic-search|referral:<host>|direct|<utm_source>",
  "landing_page": "/main", "first_seen_at": "<iso>", "last_touch": { … optional … } }
```
`channel` = `utm_source` if present, else derived from referrer (known search domains → `organic-search`, else `referral:<host>`, else `direct`).

### Events (§3) — every payload also carries `anonymous_id` + `user_id`
| event | payload keys |
|---|---|
| `page_view` | `path`, `tier` |
| `tier_toggle` | `to_tier`, `from_tier` |
| `cta_click` | `tier`, `cta_type` (`purchase`\|`watch_it_built`), `cta`, `label` |
| `pricing_toggle` | `value` (`monthly`\|`annual`) |
| `pricing_card_view` | `tier` (fires once per card) |
| `scroll_depth` | `milestone` (25/50/75/100), `tier` |
| `tier_dwell` | `tier`, `seconds` |
| `faq_open` | `index`, `question` |
| `exit` | `last_section`, `seconds`, `tier` |

### Chokepoint fan-out (`track()`)
1. `/api/track` — full `{event, payload, attribution, anonymous_id, user_id, is_returning}` → `sales_events` (+ first-touch upsert into `attribution`).
2. `/api/pageview` — only `page_view` / `cta_click` / `signup` → existing `landing_events` (attribution spine, no schema change).
3. PostHog — **inert seam**; activates automatically when `window.posthog` is present. `window.pmIdentify(uid)` is the identity hook.

### Identity bridge, client half (§4)
Outbound `app.patchmap.app` links are decorated with `?aid=<anonymous_id>` (+ utm_source/campaign). **The app must read `aid` at signup** and alias anonymous_id → user_id (see below).

---

## Build order for the rest (all in `indiesoft/dashboard` unless noted)

Addendum §9 priority order. Steps 1–3 first.

### 1. Identity alias at signup (§4) — app repo (`patch-map`), not dashboard
- On account creation, read `?aid=` (the `anonymous_id`) and alias → `user_id`.
- Write mapping to an `identities` table (`anonymous_id`, `user_id`, `aliased_at`) and call PostHog `alias`/`identify` once wired.
- Backfill: `update sales_events set user_id = … where anonymous_id = …` so pre-signup behaviour connects.

### 2. Stripe conversion webhook (§4) — app repo
- On successful subscription webhook, look up the user's first-touch attribution (`attribution` joined via `anonymous_id`/`user_id`) and insert a `conversions` row: `tier, amount, interval, converted_at` + joined `utm_source/campaign/content`.
- This is loop closure: "reddit / aug_launch / utility_angle" → "$299 Pro annual".
- `conversions` table already staged in the migration.

### 3. Campaign spend input (§4) — dashboard
- Simple form → `campaign_spend` row (`campaign` matches `utm_campaign`, `platform` free-text, `spend_amount`, dates, notes). Table staged.
- CAC = campaign spend ÷ conversions attributed to that `utm_campaign`.
- Keep the `spend_amount` field shape so an automated per-platform pull can populate it later with no downstream change.

### 4. Rollups via Vercel Cron (§5)
Pre-computed so the dashboard reads fast and channels stay **data-derived** (never hardcode channel names — new `utm_source` = new row, zero code change):
- `channel_rollup` — per `utm_source`: visitors, signups, conversions, revenue, spend (joined via campaign), CAC, visitor→signup %, signup→paid %.
- `funnel_rollup` — per channel + overall: visited → toggled → pricing CTA → signup started → paid.
- `tier_engagement_rollup` — per tier: avg dwell, toggle-in count, conversions.

Funnel stage sources: visited=`page_view`, toggled=`tier_toggle`, pricing CTA=`cta_click` where `cta_type='purchase'`, signup started=`identities`/app signup event, paid=`conversions`.

### 5. Dashboard Views A–D (§6) — GUI-first, progressive disclosure
- **A. Channel Scorecard** — channels (rows, auto from `utm_source`) × metrics; conditional per-column heatmap (best green / worst red); every cell shows its denominator; provisional cells (small sample) muted; each row → View B.
- **B. Expanded Channel** — per-campaign + per-`utm_content` breakdown, full funnel, dwell-by-tier, trend lines. Real counts, no rounding to happy numbers.
- **C. Funnel** — visual funnel, overall + filterable by channel, highlights biggest drop-off.
- **D. Insights** — the Claude layer (§7).

### 6. Claude insight layer (§7) — ADVISORY ONLY
- Cron and/or "Generate Insights" button packages rollup data → Claude API. System prompt = marketing analyst who knows THIS situation (solo founder, these 4 tiers, launch timeline, Reddit-first → podcasts).
- **HARD GUARDRAIL:** must say "too early to tell / not enough data" on small samples; never manufacture confident patterns. A confidently-wrong insight is worse than none.
- Claude **never** acts on budgets/campaigns — displays observations only; human decides. Store insights with timestamps.
- Use the latest Claude model (see `/claude-api` skill for current model ids).

---

## §1 design principles the dashboard MUST honour (don't violate)
1. **No number appears naked** — always comparative, always with its denominator ("3 of 47", not "6%").
2. **Small samples flagged, never dressed up** — default threshold <30 conversions in a cell → render provisional (muted + marker).
3. **Channels are DATA, not code** — derived from `utm_source`; new source = new row, zero code change.
4. **Progressive disclosure** — simple comparative overview on top, full detail one click deeper. Simplify presentation, never the data.
5. **Automated pulls everywhere except ad spend** (manual per-campaign for now, swappable later).
6. **Built for a non-marketer** — every metric carries a plain-language teaching tooltip.

Tooltip copy is written verbatim in Addendum §8 (CAC, Visitor→Signup %, Signup→Paid %, Retention, Spend, Provisional marker) — use it as-is.

---

## Integration decisions needed before starting the dashboard side
- **PostHog project key** — to activate the seam (`window.posthog` on `/main`) and the alias/identify calls.
- **Table-name reconciliation** — I introduced `attribution` + `sales_events` in the PatchMap Supabase project. Confirm these don't collide with existing `indiesoft/dashboard` tables, or rename to match its conventions (the addendum says reconcile, not create parallel structures). `landing_events` stays as-is.
- **Stripe** — webhook signing secret + which subscription events map to a conversion.

## Key files
| File | Purpose |
|---|---|
| `main/index.html` (`ATTRIBUTION + ANALYTICS` block) | Client capture: attribution, `track()`, events, link decoration |
| `api/track.js` | Full behavioural event sink → `sales_events` + `attribution` upsert |
| `api/pageview.js` | Existing landing beacon → `landing_events` (attribution spine) |
| `supabase/analytics_capture.sql` | Raw capture tables + RLS (**run this first**) |

Every seam that must connect to the dashboard is marked in-code with `// INTEGRATION: indiesoft/dashboard`.
