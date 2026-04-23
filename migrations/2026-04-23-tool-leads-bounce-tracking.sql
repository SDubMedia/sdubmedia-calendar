-- Track bounces + message IDs for the drip nurture. When Resend fires a
-- bounce webhook, Scout's webhook handler joins by last_message_id and
-- sets bounced_at — the drip cron then skips that lead from then on.

alter table public.tool_leads
  add column if not exists bounced_at timestamptz,
  add column if not exists last_message_id text;

create index if not exists tool_leads_last_message_id_idx
  on public.tool_leads (last_message_id)
  where last_message_id is not null;

-- Extend scout_drip grants so the cron can stamp the message_id on send
-- and the webhook can set bounced_at on hard bounces / unsubscribed_at on
-- complaints.
grant update (last_message_id, bounced_at, unsubscribed_at) on public.tool_leads to scout_drip;
grant select (bounced_at, last_message_id) on public.tool_leads to scout_drip;
