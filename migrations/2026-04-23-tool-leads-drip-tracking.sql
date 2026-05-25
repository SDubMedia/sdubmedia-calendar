-- ============================================================
-- Add drip tracking columns to tool_leads.
--
-- drip_stage already exists (0-5, how far through the nurture).
-- Add last_sent_at + last_template_id to prevent double-sends and
-- make debugging easier.
-- ============================================================

alter table public.tool_leads
  add column if not exists last_sent_at timestamptz,
  add column if not exists last_template_id text;

create index if not exists tool_leads_drip_queue_idx
  on public.tool_leads (drip_stage, first_seen_at)
  where unsubscribed_at is null and drip_stage < 5;
