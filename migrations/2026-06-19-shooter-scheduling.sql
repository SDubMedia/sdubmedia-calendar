-- ============================================================
-- Per-shooter scheduling: all-day availability + operating rules + free/busy.
-- Each shooter (owner + staff, by crew_member_id) controls how they operate;
-- open booking slots = their availability, minus shoots already on the
-- production calendar (plus travel buffer), capped at their max-per-day.
-- ============================================================

-- All-day option on an availability block (ignores start/end when true).
ALTER TABLE availability ADD COLUMN IF NOT EXISTS all_day boolean NOT NULL DEFAULT false;

-- Per-shooter operating rules.
CREATE TABLE IF NOT EXISTS shooter_prefs (
  crew_member_id text PRIMARY KEY,
  org_id text NOT NULL DEFAULT '',
  shoot_minutes integer NOT NULL DEFAULT 60,   -- how long a shoot blocks off
  buffer_minutes integer NOT NULL DEFAULT 30,  -- travel time required between shoots
  max_per_day integer NOT NULL DEFAULT 0,      -- 0 = unlimited
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE shooter_prefs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner_all_shooter_prefs" ON shooter_prefs;
CREATE POLICY "owner_all_shooter_prefs" ON shooter_prefs
  FOR ALL USING (public.user_role() = 'owner' AND org_id = public.user_org_id());

DROP POLICY IF EXISTS "staff_own_shooter_prefs" ON shooter_prefs;
CREATE POLICY "staff_own_shooter_prefs" ON shooter_prefs
  FOR ALL USING (
    public.user_role() = 'staff' AND org_id = public.user_org_id()
    AND crew_member_id = public.user_crew_member_id()
  )
  WITH CHECK (
    public.user_role() = 'staff' AND org_id = public.user_org_id()
    AND crew_member_id = public.user_crew_member_id()
  );

DROP POLICY IF EXISTS "partner_read_shooter_prefs" ON shooter_prefs;
CREATE POLICY "partner_read_shooter_prefs" ON shooter_prefs
  FOR SELECT USING (public.user_role() = 'partner' AND org_id = public.user_org_id());

DROP POLICY IF EXISTS "client_read_shooter_prefs" ON shooter_prefs;
CREATE POLICY "client_read_shooter_prefs" ON shooter_prefs
  FOR SELECT USING (public.user_role() = 'client' AND org_id = public.user_org_id());

-- Free/busy: when each shooter is already booked — TIMES ONLY, no client,
-- address, or cost. Lets an agent's app subtract your bookings when finding an
-- open slot without seeing who/what the booking is. Security-definer + org WHERE
-- so any logged-in user sees only their org's busy blocks; anon gets nothing.
CREATE OR REPLACE VIEW public.shooter_busy AS
SELECT (c->>'crewMemberId') AS crew_member_id, p.date, p.start_time, p.end_time, p.org_id
FROM public.projects p
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(p.crew, '[]'::jsonb)) AS c
WHERE COALESCE(p.status, '') <> 'cancelled'
  AND p.org_id = public.user_org_id();

GRANT SELECT ON public.shooter_busy TO anon, authenticated;
