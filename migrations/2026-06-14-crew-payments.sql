-- Owner-logged direct payments to crew/staff for a specific project.
-- Lets the owner record "paid Antonio $200 for the June 6 wedding" without
-- waiting for the staffer to submit a contractor invoice, and links each
-- payment to a project so the contractor-invoice review can warn against
-- double-paying. Owner-only visibility (not partner, not staff) by design.

CREATE TABLE IF NOT EXISTS crew_payments (
  id text PRIMARY KEY,
  org_id text NOT NULL DEFAULT '',
  crew_member_id text NOT NULL,
  project_id text NOT NULL,
  role text,
  amount numeric NOT NULL DEFAULT 0,
  payment_method text NOT NULL,
  paid_at timestamptz NOT NULL,
  reference text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crew_payments_org_idx ON crew_payments (org_id);
CREATE INDEX IF NOT EXISTS crew_payments_member_project_idx
  ON crew_payments (crew_member_id, project_id);

ALTER TABLE crew_payments ENABLE ROW LEVEL SECURITY;

-- Owner-only: full access scoped to org. No partner/staff/client policy by
-- design — this data is owner-only, so other roles get silent denial (their
-- queries return 0 rows). Verify after deploy: anon-key select returns 0 rows.
DROP POLICY IF EXISTS "owner_all_crew_payments" ON crew_payments;
CREATE POLICY "owner_all_crew_payments" ON crew_payments
  FOR ALL USING (
    public.user_role() = 'owner'
    AND org_id = public.user_org_id()
  );
