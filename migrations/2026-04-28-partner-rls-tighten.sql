-- Tighten partner-role RLS to enforce client_ids scoping at the database layer.
-- Previously, partner_read_* policies only checked role + org_id, meaning a
-- partner could (via direct API call) read ALL clients/projects/invoices in
-- their org regardless of which client_ids were assigned to their profile.
-- The frontend AppContext useMemo did the filtering, but a determined partner
-- could bypass it.
--
-- This migration adds `id IN public.user_client_ids()` (or the equivalent
-- `client_id IN`) so RLS enforces the same scope as the UI.
--
-- Tables NOT changed (partners still have org-wide read):
--   crew_members  — partners need to see who's on shoots
--   locations     — partners need to schedule against shared locations
--   contractor_invoices — these are crew-pay records spanning multiple clients
--
-- Effect on Dan Raper (partner @ org_sdubmedia, client_ids=['client_cbsr']):
--   Before: could read all 9 clients, projects, invoices in the org via API
--   After:  reads only CBSR-related rows, matching what the UI already showed

-- ----------------------------------------------------------------------
-- clients
-- ----------------------------------------------------------------------
DROP POLICY IF EXISTS "partner_read_clients" ON clients;
CREATE POLICY "partner_read_clients" ON clients
  FOR SELECT USING (
    public.user_role() = 'partner'
    AND org_id = public.user_org_id()
    AND id = ANY(public.user_client_ids())
  );

-- ----------------------------------------------------------------------
-- projects
-- ----------------------------------------------------------------------
DROP POLICY IF EXISTS "partner_read_projects" ON projects;
CREATE POLICY "partner_read_projects" ON projects
  FOR SELECT USING (
    public.user_role() = 'partner'
    AND org_id = public.user_org_id()
    AND client_id = ANY(public.user_client_ids())
  );

-- ----------------------------------------------------------------------
-- invoices
-- ----------------------------------------------------------------------
DROP POLICY IF EXISTS "partner_read_invoices" ON invoices;
CREATE POLICY "partner_read_invoices" ON invoices
  FOR SELECT USING (
    public.user_role() = 'partner'
    AND org_id = public.user_org_id()
    AND client_id = ANY(public.user_client_ids())
  );

-- ----------------------------------------------------------------------
-- deliveries (galleries) — scope to partner's assigned-client projects
-- ----------------------------------------------------------------------
DROP POLICY IF EXISTS "partner_all_deliveries" ON deliveries;
CREATE POLICY "partner_all_deliveries" ON deliveries
  FOR ALL USING (
    public.user_role() = 'partner'
    AND org_id = public.user_org_id()
    AND project_id IS NOT NULL
    AND project_id IN (
      SELECT id FROM projects WHERE client_id = ANY(public.user_client_ids())
    )
  );

DROP POLICY IF EXISTS "partner_all_delivery_files" ON delivery_files;
CREATE POLICY "partner_all_delivery_files" ON delivery_files
  FOR ALL USING (
    public.user_role() = 'partner'
    AND org_id = public.user_org_id()
    AND delivery_id IN (
      SELECT d.id FROM deliveries d
      WHERE d.project_id IS NOT NULL
        AND d.project_id IN (
          SELECT id FROM projects WHERE client_id = ANY(public.user_client_ids())
        )
    )
  );

DROP POLICY IF EXISTS "partner_all_delivery_selections" ON delivery_selections;
CREATE POLICY "partner_all_delivery_selections" ON delivery_selections
  FOR ALL USING (
    public.user_role() = 'partner'
    AND org_id = public.user_org_id()
    AND delivery_id IN (
      SELECT d.id FROM deliveries d
      WHERE d.project_id IS NOT NULL
        AND d.project_id IN (
          SELECT id FROM projects WHERE client_id = ANY(public.user_client_ids())
        )
    )
  );

-- Note: contracts and proposals have NO partner-read policy currently,
-- which means partners can't see ANY contracts/proposals when logged in
-- directly (regardless of client_ids). If you want partners to see
-- contracts/proposals for their assigned clients, add policies similar
-- to the invoices one above. Leaving as-is for now.
