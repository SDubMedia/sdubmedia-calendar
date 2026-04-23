-- Tool usage events — pageviews + downloads + email captures from getslate.net
-- Append-only log. Aggregated for admin.sdubmedia.com metrics.

create table if not exists tool_events (
  id text primary key,
  tool_slug text not null,
  event_type text not null,   -- 'view' | 'download' | 'email_captured'
  ip_hash text,
  referrer text,
  utm_source text,
  utm_campaign text,
  created_at timestamptz not null default now(),
  constraint tool_events_type_check check (event_type in ('view', 'download', 'email_captured'))
);

create index if not exists tool_events_slug_idx on tool_events(tool_slug);
create index if not exists tool_events_created_idx on tool_events(created_at desc);
create index if not exists tool_events_slug_type_idx on tool_events(tool_slug, event_type);

alter table tool_events enable row level security;
-- No policies — service role only.
