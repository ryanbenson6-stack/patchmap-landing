-- Analytics Addendum §5 — raw capture tables for patchmap.app/main.
--
-- Apply in the PatchMap Supabase project (the SAME project /api/pageview and the
-- indiesoft/dashboard already read). These are the raw sinks; the rollups
-- (channel_rollup / funnel_rollup / tier_engagement_rollup) and dashboard views
-- live in indiesoft/dashboard and read from here.
--
-- INTEGRATION: indiesoft/dashboard — before promoting rollups, reconcile these
-- names with any existing dashboard tables. `landing_events` already exists and
-- stays as-is; these ADD the behavioural + first-touch spine, they don't replace it.

-- ── §2 FIRST-TOUCH ATTRIBUTION ──────────────────────────────────────────────
-- One row per anonymous visitor. Written once, never overwritten (the app-side
-- upsert uses ignoreDuplicates), so original discovery keeps channel credit.
create table if not exists public.attribution (
  anonymous_id text primary key,
  utm_source   text,
  utm_medium   text,
  utm_campaign text,
  utm_content  text,
  utm_term     text,
  channel      text,           -- derived from utm_source, else referrer (organic-search / referral:<host> / direct)
  referrer     text,
  landing_page text,
  first_seen_at timestamptz not null default now()
);

-- ── §3 BEHAVIOURAL EVENTS ───────────────────────────────────────────────────
-- Full-fidelity stream from the sales page's track() chokepoint.
create table if not exists public.sales_events (
  id           bigint generated always as identity primary key,
  event_name   text not null,  -- page_view, tier_toggle, cta_click, pricing_toggle, pricing_card_view, scroll_depth, tier_dwell, faq_open, exit
  anonymous_id text,
  user_id      text,           -- null until the identity bridge aliases it (§4)
  path         text,
  is_returning boolean default false,
  payload      jsonb not null default '{}'::jsonb,
  utm_source   text,
  utm_medium   text,
  utm_campaign text,
  utm_content  text,
  utm_term     text,
  channel      text,
  referrer     text,
  country      text,
  created_at   timestamptz not null default now()
);
create index if not exists sales_events_anon_idx    on public.sales_events (anonymous_id);
create index if not exists sales_events_name_idx    on public.sales_events (event_name);
create index if not exists sales_events_campaign_idx on public.sales_events (utm_campaign);
create index if not exists sales_events_created_idx on public.sales_events (created_at);

-- ── RLS: anon insert/upsert only (mirrors landing_events' anon-insert policy) ──
alter table public.attribution  enable row level security;
alter table public.sales_events enable row level security;

-- Idempotent: drop-then-create so re-running the whole file never errors on
-- an already-existing policy (Supabase's SQL editor runs statements outside a
-- transaction, so a mid-script error can otherwise leave RLS on with no policy).
drop policy if exists attribution_anon_insert on public.attribution;
create policy attribution_anon_insert on public.attribution
  for insert to anon with check (true);
drop policy if exists attribution_anon_update on public.attribution;
create policy attribution_anon_update on public.attribution
  for update to anon using (true) with check (true);
drop policy if exists sales_events_anon_insert on public.sales_events;
create policy sales_events_anon_insert on public.sales_events
  for insert to anon with check (true);

-- Base table privileges. An RLS policy gates WHICH rows the role may write, but
-- the role still needs the underlying GRANT — tables created via the SQL editor
-- don't always inherit Supabase's default anon/authenticated grants, which
-- leaves inserts failing even with a correct policy.
grant insert on public.sales_events to anon;
grant insert, update on public.attribution to anon;

-- Tell PostgREST (the REST API the app calls) to pick up the new tables/grants.
notify pgrst, 'reload schema';

-- ── §4 CONVERSIONS + CAMPAIGN SPEND (schema staged now; wiring lands in the app
--      /dashboard — Stripe webhook writes conversions, dashboard form writes spend) ──
create table if not exists public.conversions (
  id            bigint generated always as identity primary key,
  user_id       text,
  anonymous_id  text,
  tier          text,
  amount        numeric,
  interval      text,           -- monthly | annual
  converted_at  timestamptz not null default now(),
  -- joined first-touch attribution (loop closure)
  utm_source    text,
  utm_campaign  text,
  utm_content   text
);
create index if not exists conversions_campaign_idx on public.conversions (utm_campaign);

create table if not exists public.campaign_spend (
  id            bigint generated always as identity primary key,
  campaign      text not null,  -- matches utm_campaign
  platform      text,           -- free-text: reddit, church-sound-podcast, ...
  spend_amount  numeric not null default 0,
  start_date    date,
  end_date      date,
  notes         text,
  created_at    timestamptz not null default now()
);
