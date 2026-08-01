-- STEP A of 2 — run this first, then deploy the code, then run step B.
--
-- Why: every non-owner login (staff, client, family, partner) can SELECT the
-- whole organizations row — see "members_read_org" in
-- migrations/2026-04-fix-all-rls-critical.sql. Two credentials live on that
-- row:
--   calendar_feed_token       plaintext, and on its own it pulls the entire
--                             company calendar as .ics — every client, every
--                             property address, every time. Directly usable by
--                             anyone who reads it, including agents/brokers.
--   google_drive_refresh_token encrypted at rest, but still a credential.
--
-- RLS can't hide individual columns, so the fix is to move both into their own
-- owner-only table. google_drive_email and google_drive_folder_id stay on
-- organizations: the app shows the email as connection status, and neither is
-- a secret.
--
-- This step is additive and safe to run against live traffic — the old columns
-- stay in place, so the currently deployed code keeps working.

CREATE TABLE IF NOT EXISTS public.org_secrets (
  org_id text PRIMARY KEY,
  calendar_feed_token text NOT NULL DEFAULT ('cal_' || replace(gen_random_uuid()::text, '-', '')),
  google_drive_refresh_token text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.org_secrets ENABLE ROW LEVEL SECURITY;

-- Owner only. No partner/staff/client/family policy on purpose: a missing
-- policy is a denial, which is exactly what we want here.
DROP POLICY IF EXISTS "owner_all_org_secrets" ON public.org_secrets;
CREATE POLICY "owner_all_org_secrets" ON public.org_secrets FOR ALL
  USING (public.user_role() = 'owner' AND org_id = public.user_org_id())
  WITH CHECK (public.user_role() = 'owner' AND org_id = public.user_org_id());

-- Carry existing values across, keeping every current subscription working.
INSERT INTO public.org_secrets (org_id, calendar_feed_token, google_drive_refresh_token)
SELECT
  id,
  COALESCE(NULLIF(calendar_feed_token, ''), 'cal_' || replace(gen_random_uuid()::text, '-', '')),
  COALESCE(google_drive_refresh_token, '')
FROM public.organizations
ON CONFLICT (org_id) DO UPDATE SET
  calendar_feed_token = EXCLUDED.calendar_feed_token,
  google_drive_refresh_token = EXCLUDED.google_drive_refresh_token,
  updated_at = now();

-- A new org used to get its feed token from a column default. Keep that
-- behaviour now that the token lives elsewhere.
CREATE OR REPLACE FUNCTION public.create_org_secrets()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.org_secrets (org_id) VALUES (NEW.id)
  ON CONFLICT (org_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS org_secrets_on_org_insert ON public.organizations;
CREATE TRIGGER org_secrets_on_org_insert
  AFTER INSERT ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.create_org_secrets();
