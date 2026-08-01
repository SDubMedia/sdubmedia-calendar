-- STEP B of 2 — run this ONLY after step A has run AND the matching code is
-- deployed. This is the statement that actually closes the leak: until the
-- columns are gone, any staff/client/family login can still read the calendar
-- feed token straight off the organizations row.
--
-- Deployed code must already be reading both values from org_secrets:
--   api/calendar.ics.ts            resolves the org by feed token
--   api/gallery-drive-prepare.ts   reads the Drive refresh token
--   api/gallery-drive-upload.ts    reads the Drive refresh token
--   api/google-drive-callback.ts   writes it
--   api/google-drive-disconnect.ts clears it
--   client CalendarSyncPage        reads the token from org_secrets (owner only)

ALTER TABLE public.organizations DROP COLUMN IF EXISTS calendar_feed_token;
ALTER TABLE public.organizations DROP COLUMN IF EXISTS google_drive_refresh_token;
