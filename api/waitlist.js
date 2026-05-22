const { createClient } = require('@supabase/supabase-js')
const { Resend } = require('resend')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const resend = new Resend(process.env.ResendWaitlist)

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { email, source } = req.body

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
            <p style="margin:0 0 20px 0;font-size:16px;line-height:1.7;color:#e8e8ea;">You're on the list. No intake form, no beta access hoops.</p>
            <p style="margin:0 0 20px 0;font-size:16px;line-height:1.7;color:#e8e8ea;">We're building PatchMap for A1s, TDs, and monitor engineers who are tired of doing professional work in a spreadsheet. <strong style="color:#ffffff;">July 2026 is the target.</strong> When we open the doors, you'll be first through them.</p>
            <p style="margin:0 0 36px 0;font-size:16px;line-height:1.7;color:#e8e8ea;">We'll send a few notes between now and then — what the tiers look like, what's in v1, and a heads up before launch day. Nothing you didn't sign up for.</p>
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:36px;">
              <tr><td style="height:1px;background:#2a2a2e;"></td></tr>
            </table>
            <p style="margin:0 0 4px 0;font-size:15px;color:#e8e8ea;">Talk soon,</p>
            <p style="margin:0 0 4px 0;font-size:15px;color:#e8e8ea;">Indie</p>
            <p style="margin:0;font-size:13px;color:#888890;">Founder, PatchMap</p>
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

You're on the list. No intake form, no beta access hoops.

We're building PatchMap for A1s, TDs, and monitor engineers who are tired of doing professional work in a spreadsheet. July 2026 is the target. When we open the doors, you'll be first through them.

We'll send a few notes between now and then — what the tiers look like, what's in v1, and a heads up before launch day.

Talk soon,
Indie
Founder, PatchMap

---
© 2026 PatchMap — Built by Indiesoft.app
You're receiving this because you signed up at patchmap.app.`
