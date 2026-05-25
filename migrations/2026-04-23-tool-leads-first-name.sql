-- Add optional first name to tool_leads for personalized nurture emails.
-- Also extend scout_drip's SELECT grant to cover it.

alter table public.tool_leads
  add column if not exists first_name text;

grant select (first_name) on public.tool_leads to scout_drip;
