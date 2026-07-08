const crypto = require('crypto')
const { createClient } = require('@supabase/supabase-js')
const { Resend } = require('resend')

// SHA-256, normalized (trim + lowercase) — the format both Meta and Reddit
// expect for hashed match keys like email.
const sha256 = (v) => crypto.createHash('sha256').update(String(v).trim().toLowerCase()).digest('hex')

// ── Server-side conversion reporting (CAPI) ─────────────────────────────────
// Both calls no-op unless their token env var is set, so this stays dormant
// until the tokens are added in Vercel. Each carries the same eventId as the
// browser pixel so Meta/Reddit dedupe the two reports into one conversion.

async function sendMetaCapi({ email, eventId, ip, ua, sourceUrl }) {
  const token = process.env.META_CAPI_TOKEN
  if (!token) return
  const pixelId = process.env.META_PIXEL_ID || '1053165947067170'
  const payload = {
    data: [{
      event_name: 'Lead',
      event_time: Math.floor(Date.now() / 1000),
      event_id: eventId,                 // dedupe key — matches fbq eventID
      action_source: 'website',
      event_source_url: sourceUrl,
      user_data: {
        em: [sha256(email)],
        client_ip_address: ip,
        client_user_agent: ua,
      },
    }],
  }
  const url = `https://graph.facebook.com/v21.0/${pixelId}/events?access_token=${encodeURIComponent(token)}`
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!r.ok) console.error('Meta CAPI error:', r.status, await r.text())
}

async function sendRedditCapi({ email, eventId, ip, ua }) {
  const token = process.env.REDDIT_CONVERSION_TOKEN
  if (!token) return
  const pixelId = process.env.REDDIT_PIXEL_ID || 'a2_j3utzpduugxz'
  const payload = {
    test_mode: process.env.REDDIT_CAPI_TEST === 'true',
    events: [{
      event_at: new Date().toISOString(),
      event_type: { tracking_type: 'SignUp' },
      event_metadata: { conversion_id: eventId },  // dedupe key — matches rdt conversionId
      user: {
        email: sha256(email),
        ip_address: ip,
        user_agent: ua,
      },
    }],
  }
  const url = `https://ads-api.reddit.com/api/v2.0/conversions/events/${pixelId}`
  const r = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!r.ok) console.error('Reddit CAPI error:', r.status, await r.text())
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
)

const resend = new Resend(process.env.ResendWaitlist)

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { email, source, eventId: bodyEventId } = req.body

  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Invalid email' })
  }

  const { error } = await supabase
    .from('waitlist')
    .insert({ email, source })

  if (error && error.code !== '23505') {
    console.error('Waitlist insert error:', error)
    return res.status(500).json({ error: 'Failed to save' })
  }

  if (!error) {
    try {
      await resend.emails.send({
        from: 'Indie at PatchMap <hello@indiesoft.app>',
        to: email,
        subject: "You're patched in.",
        html: welcomeHtml,
        text: welcomeText,
      })
    } catch (emailErr) {
      console.error('Welcome email failed:', emailErr)
    }
  }

  // Server-side conversion reporting, deduped with the browser pixels via eventId.
  // Fire both platforms; never let a CAPI failure break the signup response.
  const eventId = bodyEventId || crypto.randomUUID()
  const fwd = req.headers['x-forwarded-for'] || ''
  const ip = fwd.split(',')[0].trim() || req.socket?.remoteAddress || undefined
  const ua = req.headers['user-agent'] || undefined
  const sourceUrl = req.headers.referer || req.headers.origin || 'https://patchmap.app'
  await Promise.allSettled([
    sendMetaCapi({ email, eventId, ip, ua, sourceUrl }),
    sendRedditCapi({ email, eventId, ip, ua }),
  ])

  return res.status(200).json({ success: true })
}

const welcomeHtml = `<!DOCTYPE html>
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
            <p style="margin:0 0 20px 0;font-size:16px;line-height:1.7;color:#e8e8ea;">Hey —</p>
            <p style="margin:0 0 20px 0;font-size:16px;line-height:1.7;color:#e8e8ea;">You're on the list.</p>
            <p style="margin:0 0 20px 0;font-size:16px;line-height:1.7;color:#e8e8ea;">PatchMap launches July 15th. I'll send two more notes before then — one with a feature overview, and one the day we open for signup.</p>
            <p style="margin:0 0 36px 0;font-size:16px;line-height:1.7;color:#e8e8ea;">Free tier is real and useful, not a trial. More on that in the next one.</p>
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:36px;">
              <tr><td style="height:1px;background:#2a2a2e;"></td></tr>
            </table>
            <p style="margin:0 0 4px 0;font-size:15px;color:#e8e8ea;">Ryan</p>
            <p style="margin:0;font-size:13px;color:#888890;">Founder, PatchMap — <a href="https://patchmap.app" style="color:#888890;">patchmap.app</a><br>hello@indiesoft.app</p>
          </td>
        </tr>
        <tr>
          <td style="padding:36px 0 0 0;border-top:1px solid #2a2a2e;">
            <p style="margin:0 0 8px 0;font-size:11px;color:#55555e;letter-spacing:0.06em;">© 2026 PatchMap — Built by Indiesoft.app</p>
            <p style="margin:0;font-size:11px;color:#55555e;">You're receiving this because you signed up at patchmap.app.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`

const welcomeText = `Hey —

You're on the list.

PatchMap launches July 15th. I'll send two more notes before then — one with a feature overview, and one the day we open for signup.

Free tier is real and useful, not a trial. More on that in the next one.

Ryan
Founder, PatchMap — patchmap.app
hello@indiesoft.app

---
© 2026 PatchMap — Built by Indiesoft.app
You're receiving this because you signed up at patchmap.app.`
