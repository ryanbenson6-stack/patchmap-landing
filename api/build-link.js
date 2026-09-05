const crypto = require('crypto')
const { createClient } = require('@supabase/supabase-js')
const { Resend } = require('resend')

// Warm-viewer page → "Email me a build link".
//
// The visitor is anonymous, is holding someone else's share link, and is very
// often mid-load-in — the worst possible moment to ask them to build anything.
// This endpoint captures the intent now and time-shifts the work to whenever
// they're next at a desktop.
//
// ── WHY THIS ISN'T app/api/desktop-link ─────────────────────────────────────
// That route requires a session, takes no recipient, and sends a token-less
// link. All three are wrong here, and the middle one is wrong on purpose — its
// comment says the missing recipient exists "so this can never be pointed at
// someone else's inbox and turned into a send-anyone-an-email endpoint."
//
// This route IS that endpoint, so it has to earn it. Three things do:
//
//   1. THE BODY IS FIXED. The caller chooses the recipient and nothing else.
//      No subject, no message, no caller-supplied string is rendered into the
//      email — `token` and `medium` are validated and only ever appear as URL
//      parameters. The worst thing anyone can send anybody is a link to
//      patchmap.app, which is a link we publish.
//   2. RATE LIMITS IN THE DATABASE (supabase/build-link-sends.sql). Serverless
//      functions are stateless, so in-process counters would reset constantly.
//      The check and the write are one statement, so two concurrent requests
//      can't both pass.
//   3. NO ENUMERATION. The response is identical whether the send happened, hit
//      a cap, or the address was already used — so this can't be used to probe
//      who has a PatchMap account, and a rate-limited abuser gets no signal that
//      their limit is what stopped them.

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
)

// Same verified sender as the waitlist. patchmap.app is NOT verified in Resend;
// only indiesoft.app is, and a verified domain is not a mailbox — so no
// reply-to, deliberately.
const resend = new Resend(process.env.ResendWaitlist)

const APP = 'https://app.patchmap.app'

// Mirrors lib/shareRef.ts in the app. Kept in sync by hand because the landing
// is a separate deployment with no shared package — if the UTM contract moves
// there, it moves here.
const SHARE_UTM_SOURCE = 'share'
const SHARE_UTM_CAMPAIGN = 'viewer_cta'

/** A viewer token is a short opaque string. Anything else is not one, and a long
 *  value is the shape an attempt to stuff utm_content would take. Mirrors the
 *  clamp in decodeShareRef(). */
function cleanToken(v) {
  if (typeof v !== 'string') return null
  const t = v.trim()
  if (!t || t.length > 128) return null
  if (!/^[A-Za-z0-9._~-]+$/.test(t)) return null
  return t
}

function cleanMedium(v) {
  return v === 'qr' ? 'qr' : 'link'
}

/** The link the email actually carries. This is the whole point of the endpoint:
 *  the referring token has to survive the round-trip through an inbox, so it
 *  rides ON THE LINK rather than in a session that will be long gone by the time
 *  they open it. A signup off this link lands in `attribution` as utm_source=
 *  share with the token in utm_content, which is what closes the K-factor loop. */
function buildLink(token, medium) {
  const u = new URL(APP)
  if (token) {
    u.searchParams.set('utm_source', SHARE_UTM_SOURCE)
    u.searchParams.set('utm_medium', medium)
    u.searchParams.set('utm_campaign', SHARE_UTM_CAMPAIGN)
    u.searchParams.set('utm_content', token)
  } else {
    // No token — still a real link, just credited as a direct warm-page visit
    // rather than to a share that we can't prove happened.
    u.searchParams.set('utm_source', 'warm_page')
    u.searchParams.set('utm_medium', 'email')
  }
  return u.toString()
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const body = req.body || {}
  const email = typeof body.email === 'string' ? body.email.trim() : ''
  const token = cleanToken(body.token)
  const medium = cleanMedium(body.medium)

  // Shape check only. Deliverability is Resend's problem and a bounce is not
  // worth a round-trip here.
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return res.status(400).json({ error: 'Enter a valid email address.' })
  }

  // Salted so the table never holds anything that reverses to an IP. A fixed
  // fallback salt keeps this working before the env var is set — it weakens the
  // hash, not the rate limit, which is what the column is actually for.
  const fwd = req.headers['x-forwarded-for'] || ''
  const ip = fwd.split(',')[0].trim() || req.socket?.remoteAddress || ''
  const salt = process.env.BUILD_LINK_IP_SALT || 'patchmap-build-link'
  const ipHash = ip
    ? crypto.createHash('sha256').update(salt + ip).digest('hex').slice(0, 32)
    : null

  const ua = String(req.headers['user-agent'] || '').slice(0, 400)

  let allowed = false
  try {
    const { data, error } = await supabase.rpc('pm_record_build_link', {
      p_email: email,
      p_token: token,
      p_medium: medium,
      p_ip_hash: ipHash,
      p_ua: ua,
    })
    if (error) {
      // Fail CLOSED. This is the only thing standing between an open mail
      // endpoint and the internet, so if the limiter is unreachable we do not
      // send. The caller still gets the generic success response — see the
      // no-enumeration note at the top.
      console.error('build-link rate check failed:', error)
      return res.status(200).json({ ok: true })
    }
    allowed = data === true
  } catch (err) {
    console.error('build-link rate check threw:', err)
    return res.status(200).json({ ok: true })
  }

  if (!allowed) {
    return res.status(200).json({ ok: true })
  }

  const link = buildLink(token, medium)

  // NOTE: emails.send() returns { data, error } rather than throwing, so a
  // try/catch alone would report success on a 403. Check `error` explicitly —
  // this exact pair silently killed every daily signups digest for weeks.
  try {
    const { error: sendErr } = await resend.emails.send({
      from: 'Indie at PatchMap <hello@indiesoft.app>',
      to: email,
      subject: 'Build your own show',
      html: emailHtml(link),
      text: emailText(link),
    })
    if (sendErr) console.error('build-link email failed:', sendErr)
  } catch (err) {
    console.error('build-link email threw:', err)
  }

  return res.status(200).json({ ok: true })
}

const emailHtml = (link) => `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
        <tr>
          <td style="padding:0 0 32px 0;border-bottom:1px solid #2a2a2e;">
            <span style="font-family:Impact,Haettenschweiler,'Arial Narrow Bold',sans-serif;font-size:24px;letter-spacing:0.12em;color:#f5a623;text-transform:uppercase;">PatchMap</span>
          </td>
        </tr>
        <tr>
          <td style="padding:36px 0 0 0;">
            <p style="margin:0 0 20px 0;font-size:16px;line-height:1.7;color:#e8e8ea;">Here's your build link.</p>
            <p style="margin:0 0 20px 0;font-size:16px;line-height:1.7;color:#e8e8ea;">You were looking at a show someone built in PatchMap. This is where you build your own — drop in a rider and watch it patch itself. Takes about a minute.</p>
            <p style="margin:0 0 32px 0;font-size:16px;line-height:1.7;color:#e8e8ea;">Finish your first show and your first month of Plus is on us. No card, and it lapses back to free on its own — there's nothing to cancel.</p>
            <table cellpadding="0" cellspacing="0" style="margin:0 0 36px 0;">
              <tr><td style="background:#f5a623;border-radius:3px;">
                <a href="${link}" style="display:inline-block;padding:14px 28px;font-family:'Courier New',monospace;font-size:13px;letter-spacing:0.1em;text-transform:uppercase;color:#0a0a0a;text-decoration:none;">Build your show</a>
              </td></tr>
            </table>
            <p style="margin:0 0 36px 0;font-size:13px;line-height:1.7;color:#888890;">Or paste this in: <a href="${link}" style="color:#888890;">${link}</a></p>
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:36px;">
              <tr><td style="height:1px;background:#2a2a2e;"></td></tr>
            </table>
            <p style="margin:0 0 4px 0;font-size:15px;color:#e8e8ea;">Ryan</p>
            <p style="margin:0;font-size:13px;color:#888890;">Founder, PatchMap — <a href="https://patchmap.app" style="color:#888890;">patchmap.app</a></p>
          </td>
        </tr>
        <tr>
          <td style="padding:36px 0 0 0;border-top:1px solid #2a2a2e;">
            <p style="margin:0 0 8px 0;font-size:11px;color:#55555e;letter-spacing:0.06em;">© 2026 PatchMap — Built by Indiesoft.app</p>
            <p style="margin:0;font-size:11px;color:#55555e;">You're receiving this because you asked for a build link at patchmap.app.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`

const emailText = (link) => `Here's your build link.

You were looking at a show someone built in PatchMap. This is where you build your own — drop in a rider and watch it patch itself. Takes about a minute.

Finish your first show and your first month of Plus is on us. No card, and it lapses back to free on its own — there's nothing to cancel.

${link}

Ryan
Founder, PatchMap — patchmap.app

---
© 2026 PatchMap — Built by Indiesoft.app
You're receiving this because you asked for a build link at patchmap.app.`
