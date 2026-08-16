const { createClient } = require('@supabase/supabase-js')

// Full-fidelity behavioural event sink for patchmap.app/main (Analytics Addendum §3).
// Every event from the sales page's track() chokepoint lands here with its
// anonymous_id, first-touch attribution, and a jsonb payload — the raw rows the
// indiesoft/dashboard rollups (§5) read from.
//
// INTEGRATION: indiesoft/dashboard — reconcile `sales_events` / `attribution`
// against the dashboard's existing tables before building rollups. Requires the
// migration in supabase/analytics_capture.sql to be applied to the same Supabase
// project /api/pageview and the dashboard already use.
//
// Fire-and-forget: never blocks the page, never 500s a beacon. If the tables
// aren't there yet, the insert error is logged and swallowed — the attribution
// spine still persists via /api/pageview → landing_events in the meantime.

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY)

// Short/alternate spellings of a platform, folded to one name.
//
// Mirrors normalizeSource() in index.html. Duplicated rather than shared because
// that file is inline browser JS with no build step — and duplicated ON PURPOSE
// rather than trusting the client: returning visitors keep running a CACHED copy
// of index.html for as long as their browser holds it, so the old page will send
// `ig` well after the fix ships. Normalising here is what makes the data correct
// from today rather than eventually.
//
// PLATFORM ONLY. utm_medium is never touched — paid_social vs social vs bio is a
// real distinction, and `ig` carried nothing that medium did not already say.
const SOURCE_ALIASES = { ig: 'instagram', insta: 'instagram' }
function normalizeSource(v) {
  if (typeof v !== 'string') return v
  return SOURCE_ALIASES[v.trim().toLowerCase()] || v
}

function clean(v, len = 300) {
  return typeof v === 'string' && v.length > 0 ? v.slice(0, len) : null
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // sendBeacon delivers the body as a raw string; req.body may already be parsed.
  let body = req.body
  if (typeof body === 'string') {
    try { body = JSON.parse(body) } catch { body = {} }
  }
  body = body || {}

  const attr = body.attribution || {}
  const row = {
    event_name: clean(body.event, 80),
    anonymous_id: clean(body.anonymous_id, 64),
    user_id: clean(body.user_id, 64),
    path: clean(body.path, 300),
    is_returning: !!body.is_returning,
    payload: body.payload && typeof body.payload === 'object' ? body.payload : {},
    utm_source: normalizeSource(clean(attr.utm_source, 120)),
    utm_medium: clean(attr.utm_medium, 120),
    utm_campaign: clean(attr.utm_campaign, 120),
    utm_content: clean(attr.utm_content, 120),
    utm_term: clean(attr.utm_term, 120),
    channel: normalizeSource(clean(attr.channel, 120)),
    referrer: clean(attr.referrer, 500),
    country: clean(req.headers['x-vercel-ip-country'], 8),
  }

  try {
    // §2 first-touch — write once, never overwrite, so the original discovery
    // keeps channel credit.
    //
    // A PLAIN INSERT, deliberately not an upsert. This was `.upsert(..., {
    // onConflict, ignoreDuplicates })` and wrote nothing at all for months: the
    // table sat at 0 rows while sales_events below it passed 9,000. Postgres
    // requires SELECT privilege AND an UPDATE policy for INSERT ... ON CONFLICT —
    // it checks the UPDATE policy at plan time even when DO NOTHING means no row
    // can ever be updated — and anon has neither. Every write died 42501, and
    // this handler logs-and-swallows so the beacon never 500s, so it was silent.
    //
    // The primary key already enforces write-once. A returning visitor's insert
    // fails with 23505 and the original row survives untouched, which is exactly
    // the upsert's intent — reached without granting anon UPDATE on a table whose
    // whole job is to never be updated. 23505 is therefore the EXPECTED outcome on
    // every visit after the first and is not logged; anything else still is.
    if (row.anonymous_id) {
      const a = await supabase.from('attribution').insert({
        anonymous_id: row.anonymous_id,
        utm_source: row.utm_source, utm_medium: row.utm_medium,
        utm_campaign: row.utm_campaign, utm_content: row.utm_content, utm_term: row.utm_term,
        channel: row.channel, referrer: row.referrer,
        landing_page: clean(attr.landing_page, 300),
        first_seen_at: attr.first_seen_at || new Date().toISOString(),
      })
      if (a.error && a.error.code !== '23505') {
        console.error('attribution insert error:', a.error.code, a.error.message)
      }
    }

    const e = await supabase.from('sales_events').insert(row)
    if (e.error) console.error('sales_events insert error:', e.error.message)
  } catch (err) {
    console.error('track handler error:', err && err.message)
  }

  // Always succeed from the beacon's perspective.
  return res.status(204).end()
}
