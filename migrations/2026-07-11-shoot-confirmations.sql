-- ============================================================
-- Shoot availability confirmation.
--
-- Certain crew members (flagged with requires_shoot_confirmation) must tap
-- "Confirm I'll be there" when assigned to a shoot. The owner sees confirmed
-- vs awaiting; the crew member is notified once when first assigned.
--
-- Confirmations live in their own table keyed by (project_id, crew_member_id) —
-- project.crew is a JSONB snapshot that's overwritten on every edit, so the
-- confirmation status can't live there. A row is created when the crew member
-- is first notified (notified_at) and stamped confirmed_at when they confirm.
-- ============================================================

-- Per-crew flag: only these people are asked to confirm.
ALTER TABLE crew_members ADD COLUMN IF NOT EXISTS requires_shoot_confirmation boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS shoot_confirmations (
  id text PRIMARY KEY,
  org_id text NOT NULL DEFAULT '',
  project_id text NOT NULL,
  crew_member_id text NOT NULL,
  notified_at timestamptz,   -- when we first pushed "please confirm" (dedups re-notifies)
  confirmed_at timestamptz,  -- set when the crew member confirms; null = still awaiting
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, crew_member_id)
);

ALTER TABLE shoot_confirmations ENABLE ROW LEVEL SECURITY;

-- Owner: full access within their org.
DROP POLICY IF EXISTS "owner_all_shoot_confirmations" ON shoot_confirmations;
CREATE POLICY "owner_all_shoot_confirmations" ON shoot_confirmations
  FOR ALL USING (
    public.user_role() = 'owner'
    AND org_id = public.user_org_id()
  );

-- Staff: read/write only their OWN confirmation rows.
DROP POLICY IF EXISTS "staff_own_shoot_confirmations" ON shoot_confirmations;
CREATE POLICY "staff_own_shoot_confirmations" ON shoot_confirmations
  FOR ALL USING (
    public.user_role() = 'staff'
    AND org_id = public.user_org_id()
    AND crew_member_id = (SELECT crew_member_id FROM user_profiles WHERE id = auth.uid())
  );

-- Realtime so the owner sees a confirmation land without refreshing.
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE shoot_confirmations;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_object THEN NULL; END $$;
