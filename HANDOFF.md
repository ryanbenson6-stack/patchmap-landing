# PatchMap Landing Page — Handoff Report
_Session: 2026-05-13_

## What This Is
Pre-launch email capture page for PatchMap. Separate from the main app. Static HTML — no framework, no build step.

**File:** `patchmap-landing/index.html`

---

## Hosting Plan

| URL | Project | Status |
|---|---|---|
| `patchmap.app` | New Vercel project (`patchmap-landing`) | TODO |
| `app.patchmap.app` | Existing Vercel project (the app) | TODO |

### Deployment Steps (do in this order to avoid downtime)
1. In existing Vercel app project → Settings → Domains → add `app.patchmap.app`
2. Add the CNAME record in DNS, verify the app loads at `app.patchmap.app`
3. Create new GitHub repo: `patchmap-landing`
4. Push `index.html` → connect to Vercel → verify at `.vercel.app` preview URL
5. In existing app project → remove `patchmap.app` from domains
6. In landing page project → add `patchmap.app` and `www.patchmap.app`
7. Update env vars in the app: `NEXTAUTH_URL` and `NEXT_PUBLIC_APP_URL` → `https://app.patchmap.app`
8. Update OAuth redirect URIs in your auth provider to `app.patchmap.app`

---

## Email Infrastructure

**Stack:** Resend (already wired in app) + Supabase waitlist table

**Why this over Mailchimp/Kit:** You pay per email sent, not per subscriber. Your list lives in your own Supabase DB — no vendor lock-in. If Resend raises prices, swap the API; your data doesn't move.

### What Still Needs Building
- [ ] Supabase table: `waitlist (id uuid, email text, source text, created_at timestamptz)`
- [ ] API route in Next.js app: `POST app.patchmap.app/api/waitlist`
  - Writes email + source to Supabase
  - Sends welcome email via Resend
  - Returns 200
- [ ] Update `handleSignup()` in `index.html` to POST to `https://app.patchmap.app/api/waitlist`
- [ ] Write the welcome email (one short note: what PatchMap is, what they get, when they'll hear from you)

**Source tagging:** The form passes a `source` field — `hero-form` or `cta-form`. Keep this when building the API route so you can segment later.

---

## Copy Decisions (Locked)

| Section | Decision |
|---|---|
| Hero sub | Three value props pulled out as `→` list below paragraph |
| Pricing | None — Free/Pro/Tour tier tags on features only |
| Feature order | Free, Free, Pro, Tour, Tour (tier grouping preserved) |
| Show Record detail list | Rewritten — 4 bullets, documentation framing not "replace verbal comms" |
| Footer | "© 2026 PatchMap — Built by Indiesoft.app" |

---

## Video Assets Needed

Record these in priority order. Drop finished files in `/assets/` in the repo root.

| Priority | Filename | Length | What to Capture |
|---|---|---|---|
| 1 | `feat-musician.mp4` | ~20s | **Money shot.** Phone screen. QR scan → musician name entry → channel appears → monitor request sent → engineer's screen receives it. Two screens if possible. |
| 2 | `feat-autopatch.mp4` | 10–12s | Channel with input name filled, signal flow empty. Click snake box assignment. Watch rack input, Dante channel, signal path resolve in sequence. Hold resolved state 2s. |
| 3 | `feat-canvas.mp4` | ~10s | Partially built stage plot already on screen. Drag one instrument on, watch it snap to grid, label it. Natural gesture, not a toolbar drag. |
| 4 | `feat-crew.mp4` | ~15s | A1 desktop view. Flag notification slides in from "Stage Tech · Stage Left" with specific channel. Routes to correct role. Crew panel shows 3–4 populated names/roles. |
| 5 | `feat-record.mp4` | ~15s | Timeline running mid-show. Drop a scene marker ("Set 1 · 9:14 PM"). Issue marked resolved, collapses into log. Glimpse of export button at end. |
| 6 | `hero-demo.mp4` | static ok | Full canvas, real show loaded, instruments placed, input list + signal flow populated. Do this last when you have a polished show file. A screenshot works too. |

**Notes for all recordings:**
- Use real show data — fake-but-plausible names (Kick In, Lead Vox, Keys L), not Lorem Ipsum
- Slow cursor movements — deliberate reads better in loops
- Loop end state should be close to loop start state
- Desktop: 1280×800 minimum. Musician portal: native phone resolution.

### Swapping Placeholders
Each feature block has a comment showing exactly what to uncomment:
```html
<!-- SWAP: <video src="/assets/feat-canvas.mp4" autoplay muted loop playsinline></video> -->
```
Remove the placeholder `<div class="media-placeholder">...</div>` and uncomment the video tag.

---

## What's Left Before This Page Is Shippable

- [ ] GitHub repo created and connected to Vercel
- [ ] Domain swap executed (steps above)
- [ ] `app.patchmap.app` confirmed working
- [ ] Supabase `waitlist` table created
- [ ] `POST /api/waitlist` route built in Next.js app
- [ ] `handleSignup()` wired to real endpoint
- [ ] Welcome email written and tested
- [ ] At least 1–2 video assets recorded (hero + one feature)
- [ ] Test email capture end-to-end on live URL
