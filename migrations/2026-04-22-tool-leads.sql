-- Email leads captured from getslate.net tools (marketing funnel).
-- Upserted on (email, source) so re-captures bump counters, not rows.

create table if not exists tool_leads (
  id text primary key,
  email text not null,
  source text not null,           -- slug of the tool / page that captured
  context text,                   -- "download" | "index-banner" | "related-cta"
  ip_hash text,                   -- sha256 of IP (for light rate-limiting, not tracking)
  referrer text,                  -- document.referrer at capture time
  utm_source text,
  utm_campaign text,
  drip_stage int not null default 0, -- 0 = not yet in drip, increments per email sent
  unsubscribed_at timestamptz,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  capture_count int not null default 1,
  unique (email, source)
);

create index if not exists tool_leads_email_idx on tool_leads(email);
create index if not exists tool_leads_ip_hash_recent_idx on tool_leads(ip_hash, first_seen_at desc);
create index if not exists tool_leads_drip_stage_idx on tool_leads(drip_stage) where unsubscribed_at is null;

-- RLS: this is a marketing table; only service role reads/writes.
alter table tool_leads enable row level security;
-- No policies = no one can read/write via anon. Service role bypasses RLS.
