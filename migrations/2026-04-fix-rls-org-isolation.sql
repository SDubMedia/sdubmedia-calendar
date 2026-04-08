-- ============================================================
-- Fix RLS: Add org_id isolation to all tables
-- Prevents cross-tenant data access when Slate goes multi-tenant
-- ============================================================

-- 1. Enable RLS on personal_events (was missing entirely)
ALTER TABLE personal_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "owner_all_personal_events" ON personal_events;
CREATE POLICY "owner_all_personal_events" ON personal_events
  FOR ALL USING (public.user_role() = 'owner' AND org_id = public.user_org_id());

-- 2. Fix contract_templates — add org_id check
DROP POLICY IF EXISTS "owner_all_contract_templates" ON contract_templates;
CREATE POLICY "owner_all_contract_templates" ON contract_templates
  FOR ALL USING (public.user_role() = 'owner' AND org_id = public.user_org_id());

-- 3. Fix contracts — add org_id check to owner and client policies
DROP POLICY IF EXISTS "owner_all_contracts" ON contracts;
CREATE POLICY "owner_all_contracts" ON contracts
  FOR ALL USING (public.user_role() = 'owner' AND org_id = public.user_org_id());

DROP POLICY IF EXISTS "client_read_own_contracts" ON contracts;
CREATE POLICY "client_read_own_contracts" ON contracts
  FOR SELECT USING (
    client_id = any(public.user_client_ids())
    AND org_id = public.user_org_id()
  );

-- 4. Fix proposal_templates — add org_id check
DROP POLICY IF EXISTS "owner_all_proposal_templates" ON proposal_templates;
CREATE POLICY "owner_all_proposal_templates" ON proposal_templates
  FOR ALL USING (public.user_role() = 'owner' AND org_id = public.user_org_id());

-- 5. Fix proposals — add org_id check to owner and client policies
DROP POLICY IF EXISTS "owner_all_proposals" ON proposals;
CREATE POLICY "owner_all_proposals" ON proposals
  FOR ALL USING (public.user_role() = 'owner' AND org_id = public.user_org_id());

DROP POLICY IF EXISTS "client_read_own_proposals" ON proposals;
CREATE POLICY "client_read_own_proposals" ON proposals
  FOR SELECT USING (
    client_id = any(public.user_client_ids())
    AND org_id = public.user_org_id()
  );

-- 6. Fix time_entries — add org_id check
DROP POLICY IF EXISTS "owner_all_time_entries" ON time_entries;
CREATE POLICY "owner_all_time_entries" ON time_entries
  FOR ALL USING (public.user_role() = 'owner' AND org_id = public.user_org_id());

-- 7. Fix manual_trips — add org_id check
DROP POLICY IF EXISTS "owner_all_manual_trips" ON manual_trips;
CREATE POLICY "owner_all_manual_trips" ON manual_trips
  FOR ALL USING (public.user_role() = 'owner' AND org_id = public.user_org_id());

-- 8. Fix pipeline_leads — add org_id check
DROP POLICY IF EXISTS "owner_all_pipeline_leads" ON pipeline_leads;
CREATE POLICY "owner_all_pipeline_leads" ON pipeline_leads
  FOR ALL USING (public.user_role() = 'owner' AND org_id = public.user_org_id());

-- 9. Fix contractor_invoices — add org_id check
DROP POLICY IF EXISTS "owner_all_contractor_invoices" ON contractor_invoices;
CREATE POLICY "owner_all_contractor_invoices" ON contractor_invoices
  FOR ALL USING (public.user_role() = 'owner' AND org_id = public.user_org_id());

DROP POLICY IF EXISTS "partner_read_contractor_invoices" ON contractor_invoices;
CREATE POLICY "partner_read_contractor_invoices" ON contractor_invoices
  FOR SELECT USING (
    public.user_role() = 'partner'
    AND org_id = public.user_org_id()
  );

-- 10. Fix crew_location_distances — add org_id check
DROP POLICY IF EXISTS "owner_all_crew_location_distances" ON crew_location_distances;
CREATE POLICY "owner_all_crew_location_distances" ON crew_location_distances
  FOR ALL USING (public.user_role() = 'owner' AND org_id = public.user_org_id());
