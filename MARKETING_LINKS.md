# Canonical marketing links

Every link that points at patchmap.app from somewhere we control should be tagged.
An untagged link is not "unknown traffic" — it lands in the **direct** bucket, where
it is indistinguishable from genuine word-of-mouth. That is worse than no data,
because it silently inflates the one number we most want to be honest about.

These are the canonical URLs. Copy them exactly; the values are the grouping keys
every report joins on, so a stray `Instagram` or `IG` becomes its own channel row.

| Placement | Paste this | Lands on |
|---|---|---|
| Instagram profile bio | `https://patchmap.app/ig` | `/?utm_source=instagram&utm_medium=bio` |
| Anywhere a raw query string reads as spam | `https://patchmap.app/ig` | as above |
| Instagram bio → straight to the walkthrough clips | `https://patchmap.app/?utm_source=instagram&utm_medium=bio&watch=true` | itself, scrolled to Foundation |

## Vanity paths

`/ig` is a redirect defined in `vercel.json`, for the places where a visible
`?utm_source=…` looks like spam — an Instagram bio shows the URL in full and
won't truncate it, so the tag ends up being the most prominent thing about the
link. The redirect keeps the display clean and still lands the visitor on the
tagged URL, which is all the beacon reads (`index.html` parses
`location.search` after the hop, so attribution is unaffected).

**Kept as a temporary redirect (307), deliberately.** A permanent one gets cached
hard by browsers, and retagging the link later would mean fighting every cache
that ever saw it — the same class of problem that caused the redirect loop on
indiesoft.app. There is no SEO reason to want a 301 here; nothing should be
indexing `/ig`.

Add a vanity path when a placement displays its URL to a human. Don't add one for
links people only click (emails, buttons, ad destinations) — the extra hop buys
nothing there and one more redirect is one more thing to break.

## Where the values come from

- `utm_source=instagram` — the dashboard's account-detail acquisition view treats
  `instagram` (with `ig`, `facebook`, `fb`, `meta`) as a **tagged** arrival, meaning
  "came through one of our own funnels". Any other spelling falls through to
  `other` and stops being counted as in-network.
  (`indiesoft-dashboard/lib/userDetail.ts` → `TAGGED_SOURCES`)
- `utm_medium=bio` — separates the always-on profile link from paid Meta placements,
  which carry their own `utm_medium`. Without it, bio traffic and ad traffic pool
  into one Instagram number and the ad spend can't be judged.
- `watch=true` — optional. **Behaviour changed at the 2026-09-09 landing
  switchover.** It used to open a Bunny video modal on load; the current landing
  page has no modal, so it now scrolls the visitor straight to the Foundation
  section, whose clips autoplay when they come into view — the same place the
  hero's "Watch it in action" link goes. The param is still honoured and still
  accepts `1`/`true`/`yes`, so any link already in the wild keeps working; it
  fires `video_deep_link` rather than the old `video_open`. Use the plain URL
  unless the bio copy is specifically promising the video.
  (`index.html`, `handleWatchDeepLink`. The full-modal version is preserved at
  `/old` if you ever want it back.)

## Applying it

The bio link lives in the Instagram profile settings, not in this repo — it has to
be pasted in by hand:

**Instagram app → your profile → Edit profile → Links → edit the website link.**

Traffic re-attributes from the next visit onward. Nothing backfills: visits already
recorded as `direct` stay that way, so the honest read of the change is a
before/after comparison, not a restatement.

## Adding a placement

New source = new row in every channel report, with no code change anywhere
(channels are derived from the data, never hardcoded — see `ANALYTICS_PICKUP.md`
§"Channels are DATA, not code"). So the only real requirement is that the spelling
stays stable. Add the link to the table above when you create it.

## Recapture emails → `/whats-new`

**Never paste a bare `patchmap.app/whats-new` link into a recapture email.** It
will work, and it will quietly cost you the funnel.

| Placement | Paste this | Lands on |
|---|---|---|
| Recapture email, one link per recipient | `https://app.patchmap.app/r/<token>?dest=whats-new` | `patchmap.app/whats-new?c=<campaign>&u=<account_id>` |

The token is minted per recipient by the dashboard's segment export
(`indiesoft-dashboard/app/api/dashboard/recapture/export`), so the link is
attached to a campaign and an account by construction. It is a **`/r` link on
the app domain**, not a landing-page link, and the hop is the point:

1. `/r/<token>` stamps `clicked_at` on `recap_recipients`.
2. It sets the `pm_recap` cookie **on `app.patchmap.app`**.
3. *Then* it forwards here, adding `c` and `u` to the URL because this page is on
   another origin and cannot read that cookie.

Step 2 is the load-bearing one. Recipients of a recapture email are dormant and
therefore usually logged out, so the CTA on this page bounces them through
`/login` — and a query string does not survive that bounce. The cookie does, and
it is what lets the app fire `recap.arrived` and join the eventual build back to
the campaign. A link that skips `/r` skips both the click stamp and the cookie,
which is the untagged 12 Aug 2026 send all over again.

`dest` is an allowlisted key, not a URL (`patch-map/app/r/[token]/route.ts`).
To point a campaign somewhere else, add a row to `DESTS` — never a passthrough.

**The page renders fine with no params at all**, so a forwarded link with the
query stripped still shows the right page; it just records a `recap.page_view`
with a null campaign, which is the organic denominator rather than missing data.
Event definitions: `patch-map/docs/events.md` → *Recapture* → *The landing page
steps*.

**No holdout logic lives here.** The 15% holdout is applied at send time — those
recipients are simply not emailed — so this page only ever sees the 85%.
