-- Availability: when each shooter (owner + staff, by crew_member_id) is open to
-- be booked. Two shapes in one table, chosen per row:
--   * recurring = true  → weekday (0=Sun..6=Sat) + start/end time, repeats weekly
--   * recurring = false → specific_date + start/end time, one-time only
-- Existing projects/meetings on the calendar are subtracted from this when
-- showing open slots to an agent — this table is the "offered" window, not a
-- guarantee of a free slot.
--
-- Read access is broad (owner, partner, staff, client/agent) because open times
-- carry no PII and agents must see them to request a shoot. WRITE is scoped:
-- owner manages everyone; staff manage only their own crew_member_id.

CREATE TABLE IF NOT EXISTS availability (
  id text PRIMARY KEY,
  org_id text NOT NULL DEFAULT '',
  crew_member_id text NOT NULL,          -- whose availability (shooter)
  recurring boolean NOT NULL DEFAULT true,
  weekday smallint,                      -- 0..6 when recurring; null otherwise
  specific_date date,                    -- set when recurring = false
  start_time text NOT NULL DEFAULT '09:00',
  end_time text NOT NULL DEFAULT '17:00',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS availability_org_idx ON availability (org_id);
CREATE INDEX IF NOT EXISTS availability_crew_idx ON availability (crew_member_id);

ALTER TABLE availability ENABLE ROW LEVEL SECURITY;

-- Owner: full control over everyone's availability.
DROP POLICY IF EXISTS "owner_all_availability" ON availability;
CREATE POLICY "owner_all_availability" ON availability
  FOR ALL USING (
    public.user_role() = 'owner'
    AND org_id = public.user_org_id()
  );

-- Staff: manage ONLY their own availability (matched via their crew_member_id).
DROP POLICY IF EXISTS "staff_own_availability" ON availability;
CREATE POLICY "staff_own_availability" ON availability
  FOR ALL USING (
    public.user_role() = 'staff'
    AND org_id = public.user_org_id()
    AND crew_member_id = public.user_crew_member_id()
  )
  WITH CHECK (
    public.user_role() = 'staff'
    AND org_id = public.user_org_id()
    AND crew_member_id = public.user_crew_member_id()
  );

-- Partner: read-only.
DROP POLICY IF EXISTS "partner_read_availability" ON availability;
CREATE POLICY "partner_read_availability" ON availability
  FOR SELECT USING (
    public.user_role() = 'partner'
    AND org_id = public.user_org_id()
  );

-- Client/agent: read-only (needed to see open times when requesting a shoot).
DROP POLICY IF EXISTS "client_read_availability" ON availability;
CREATE POLICY "client_read_availability" ON availability
  FOR SELECT USING (
    public.user_role() = 'client'
    AND org_id = public.user_org_id()
  );
