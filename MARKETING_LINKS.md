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
| Instagram bio → straight to the walkthrough video | `https://patchmap.app/?utm_source=instagram&utm_medium=bio&watch=true` | itself |

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
- `watch=true` — optional. Auto-opens the walkthrough video modal on load
  (`index.html`, the `TUTORIAL VIDEO MODAL` block). Use the plain URL unless the
  bio copy is specifically promising the video.

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
