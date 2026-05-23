-- Allow staff role to manage their own contractor invoices.
-- Previously contractor_invoices had only owner_all_* and partner_read_*
-- policies, so staff (e.g. photo editors invoicing for their own work)
-- were blocked by RLS on insert/select/update. Symptom: Melissa hitting
-- "Create invoice" got "new row violates row-level security policy".
--
-- Same pattern as staff_own_trips / staff_own_time_entries from
-- 2026-04-29-staff-rls-tighten.sql: scoped to the caller's own
-- crew_member_id via user_profiles lookup.

DROP POLICY IF EXISTS "staff_own_contractor_invoices" ON contractor_invoices;
CREATE POLICY "staff_own_contractor_invoices" ON contractor_invoices
  FOR ALL USING (
    public.user_role() = 'staff'
    AND org_id = public.user_org_id()
    AND crew_member_id = (SELECT crew_member_id FROM user_profiles WHERE id = auth.uid())
  );
