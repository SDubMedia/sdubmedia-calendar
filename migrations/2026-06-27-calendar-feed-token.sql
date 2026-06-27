-- ============================================================
-- Calendar feed security — per-org secret token
-- ------------------------------------------------------------
-- Before this, /api/calendar.ics?key=<org_id> served an org's FULL calendar
-- (projects, locations, personal events, meetings) to anyone who knew the org
-- id. Org ids are not secret, so this was an unauthenticated data leak.
--
-- Fix: each org gets a random secret feed token. The endpoint now resolves the
-- feed BY this token, never by org id. Existing subscribers (who used the old
-- org-id URL) must re-subscribe with the new URL from the Calendar Sync screen.
-- ============================================================

alter table public.organizations
  add column if not exists calendar_feed_token text;

-- Backfill every existing org with a strong random token.
update public.organizations
  set calendar_feed_token = 'cal_' || replace(gen_random_uuid()::text, '-', '')
  where calendar_feed_token is null;

-- New orgs get a token automatically.
alter table public.organizations
  alter column calendar_feed_token set default ('cal_' || replace(gen_random_uuid()::text, '-', ''));

alter table public.organizations
  alter column calendar_feed_token set not null;
