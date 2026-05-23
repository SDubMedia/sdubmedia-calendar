-- Meetings — lightweight, unpaid calendar entries.
-- Optionally tied to a client. When visible_to_client=true AND client_id is
-- set, the assigned client role can see the meeting on their schedule.

CREATE TABLE IF NOT EXISTS meetings (
  id text PRIMARY KEY,
  org_id text NOT NULL DEFAULT '',
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  date text NOT NULL,                       -- YYYY-MM-DD
  start_time text NOT NULL DEFAULT '',
  end_time text NOT NULL DEFAULT '',
  client_id text REFERENCES clients(id) ON DELETE SET NULL,
  location_text text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  visible_to_client boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS meetings_org_date_idx ON meetings (org_id, date);
CREATE INDEX IF NOT EXISTS meetings_client_idx ON meetings (client_id);

ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;

-- Owner: full access within org
DROP POLICY IF EXISTS "owner_all_meetings" ON meetings;
CREATE POLICY "owner_all_meetings" ON meetings
  FOR ALL
  USING (public.user_role() = 'owner' AND org_id = public.user_org_id())
  WITH CHECK (public.user_role() = 'owner' AND org_id = public.user_org_id());

-- Family: full access within org (mirrors family scope on personal_events)
DROP POLICY IF EXISTS "family_all_meetings" ON meetings;
CREATE POLICY "family_all_meetings" ON meetings
  FOR ALL
  USING (public.user_role() = 'family' AND org_id = public.user_org_id())
  WITH CHECK (public.user_role() = 'family' AND org_id = public.user_org_id());

-- Partner: read meetings tied to one of their assigned clients (or unattached)
DROP POLICY IF EXISTS "partner_read_meetings" ON meetings;
CREATE POLICY "partner_read_meetings" ON meetings
  FOR SELECT
  USING (
    public.user_role() = 'partner'
    AND org_id = public.user_org_id()
    AND (client_id IS NULL OR client_id = ANY(public.user_client_ids()))
  );

-- Staff: read meetings within org
DROP POLICY IF EXISTS "staff_read_meetings" ON meetings;
CREATE POLICY "staff_read_meetings" ON meetings
  FOR SELECT
  USING (public.user_role() = 'staff' AND org_id = public.user_org_id());

-- Client: read meetings explicitly shared (visible_to_client=true) AND tied
-- to one of the client's assigned client_ids. Both gates are required —
-- the toggle is the opt-in switch.
DROP POLICY IF EXISTS "client_read_meetings" ON meetings;
CREATE POLICY "client_read_meetings" ON meetings
  FOR SELECT
  USING (
    public.user_role() = 'client'
    AND org_id = public.user_org_id()
    AND visible_to_client = true
    AND client_id = ANY(public.user_client_ids())
  );
