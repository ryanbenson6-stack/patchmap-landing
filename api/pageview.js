const { createClient } = require('@supabase/supabase-js')

// Landing-page beacon for patchmap.app. The page POSTs a `pageview` on load and a
// `signup` when the visitor converts (waitlist join now; "Get Started" /
// app.patchmap.app click-through at launch). Writes to the PatchMap Supabase
// project's landing_events table — the same project the dashboard reads.
//
// Uses the anon key (same as waitlist.js); landing_events has an anon INSERT-only
// RLS policy. Fire-and-forget: always returns fast, never blocks the page.

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
)

function clean(v, len = 120) {
  return typeof v === 'string' && v.length > 0 ? v.slice(0, len) : null
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // sendBeacon may deliver the body as a raw string; req.body may already be parsed.
  let body = req.body
  if (typeof body === 'string') {
    try { body = JSON.parse(body) } catch { body = {} }
  }
  body = body || {}

  const utm = body.utm || {}
  const type = body.type === 'signup' ? 'signup' : body.type === 'cta_click' ? 'cta_click' : 'pageview'

  const row = {
    event_type: type,
    path: clean(body.path, 300),
    visitor_id: clean(body.visitorId, 64),
    is_returning: !!body.isReturning,
    utm_source: clean(utm.source),
    utm_medium: clean(utm.medium),
    utm_campaign: clean(utm.campaign),
    utm_content: clean(utm.content),
    utm_term: clean(utm.term),
    referrer: clean(body.referrer, 500),
    target: clean(body.target, 200),
    country: clean(req.headers['x-vercel-ip-country'], 8),
    user_agent: clean(req.headers['user-agent'], 300),
  }

  const { error } = await supabase.from('landing_events').insert(row)
  if (error) {
    console.error('pageview insert error:', error.message)
    return res.status(500).json({ error: 'Failed to save' })
  }
  return res.status(204).end()
}
