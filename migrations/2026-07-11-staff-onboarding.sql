-- ============================================================
-- Staff onboarding: 1099 agreement signing + official W-9 filing.
--
-- New staff must (1) update their own info, (2) sign a 1099
-- independent-contractor agreement the owner countersigns, and
-- (3) fill + sign the official IRS W-9. Owner-only can countersign
-- and view W-9s (they contain SSNs). See staff_agreements below.
--
-- Reuses the existing private `w9-documents` storage bucket
-- (migrations/2026-04-add-w9-upload.sql) for both the blank org
-- template and each staff member's completed W-9 PDF — served only
-- via 60s signed URLs. SSN/EIN stays AES-256-GCM encrypted in
-- crew_members.tax_id via api/tax-info.ts.
-- ============================================================

-- 1) Signed 1099 agreements — one row per crew member per agreement version.
--    Signature JSONB mirrors the contract shape:
--    { name, email, ip, timestamp, signatureData, signatureType }.
CREATE TABLE IF NOT EXISTS staff_agreements (
  id text PRIMARY KEY,
  org_id text NOT NULL DEFAULT '',
  crew_member_id text NOT NULL,
  agreement_version text NOT NULL DEFAULT '',
  agreement_title text NOT NULL DEFAULT '',
  staff_signature jsonb,
  staff_signed_at timestamptz,
  owner_signature jsonb,
  owner_signed_at timestamptz,
  status text NOT NULL DEFAULT 'awaiting_staff', -- awaiting_staff -> staff_signed -> completed
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE staff_agreements ENABLE ROW LEVEL SECURITY;

-- Owner: full access within their org.
DROP POLICY IF EXISTS "owner_all_staff_agreements" ON staff_agreements;
CREATE POLICY "owner_all_staff_agreements" ON staff_agreements
  FOR ALL USING (
    public.user_role() = 'owner'
    AND org_id = public.user_org_id()
  );

-- Staff: read-only on their OWN agreement row. All writes go through the
-- service-role endpoints (staff-sign-agreement, owner-countersign-agreement),
-- so no staff INSERT/UPDATE policy. No partner/client/family policies —
-- 1099/W-9 are owner-only per product decision.
DROP POLICY IF EXISTS "staff_read_own_staff_agreements" ON staff_agreements;
CREATE POLICY "staff_read_own_staff_agreements" ON staff_agreements
  FOR SELECT USING (
    public.user_role() = 'staff'
    AND org_id = public.user_org_id()
    AND crew_member_id = (SELECT crew_member_id FROM user_profiles WHERE id = auth.uid())
  );

-- 2) Org-level blank W-9 template + the AcroForm field-name map discovered
--    when the owner uploads it (semantic key -> real PDF field name).
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS w9_template_path text DEFAULT '';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS w9_field_map jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 3) Completed-W9 timestamp on the crew member (path reuses crew_members.w9_url).
ALTER TABLE crew_members ADD COLUMN IF NOT EXISTS w9_submitted_at timestamptz;

-- 4) The blocking-gate flag: staff onboarding is complete once this is set.
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS staff_onboarding_completed_at timestamptz;

-- 5) Realtime so the owner sees a staff signature appear without refreshing.
--    Guarded — no-op if the publication already covers the table.
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE staff_agreements;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_object THEN NULL; END $$;
