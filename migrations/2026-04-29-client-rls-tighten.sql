-- Tighten client-role RLS to enforce client_ids scoping.
-- Same bug we caught with partner — client_read_* policies only checked
-- role + org_id, so a client like Sam (role=client, client_ids=[client_cbsr])
-- could read the entire org's schedule via REST API. The frontend was hiding
-- it for impersonation but a direct login bypasses that.
--
-- Effect: when Sam logs in, RLS will only return CBSR-related rows.

-- ----------------------------------------------------------------------
-- clients
-- ----------------------------------------------------------------------
DROP POLICY IF EXISTS "client_read_clients" ON clients;
CREATE POLICY "client_read_clients" ON clients
  FOR SELECT USING (
    public.user_role() = 'client'
    AND org_id = public.user_org_id()
    AND id = ANY(public.user_client_ids())
  );

-- ----------------------------------------------------------------------
-- projects
-- ----------------------------------------------------------------------
DROP POLICY IF EXISTS "client_read_projects" ON projects;
CREATE POLICY "client_read_projects" ON projects
  FOR SELECT USING (
    public.user_role() = 'client'
    AND org_id = public.user_org_id()
    AND client_id = ANY(public.user_client_ids())
  );

-- ----------------------------------------------------------------------
-- invoices
-- ----------------------------------------------------------------------
DROP POLICY IF EXISTS "client_read_invoices" ON invoices;
CREATE POLICY "client_read_invoices" ON invoices
  FOR SELECT USING (
    public.user_role() = 'client'
    AND org_id = public.user_org_id()
    AND client_id = ANY(public.user_client_ids())
  );

-- ----------------------------------------------------------------------
-- contracts — drop the open `client_read_contracts` AND the redundant
-- `client_read_own_contracts` (created by an older migration). Replace
-- with one tight policy.
-- ----------------------------------------------------------------------
DROP POLICY IF EXISTS "client_read_contracts" ON contracts;
DROP POLICY IF EXISTS "client_read_own_contracts" ON contracts;
CREATE POLICY "client_read_contracts" ON contracts
  FOR SELECT USING (
    public.user_role() = 'client'
    AND org_id = public.user_org_id()
    AND client_id = ANY(public.user_client_ids())
  );

-- ----------------------------------------------------------------------
-- proposals — same pattern as contracts.
-- ----------------------------------------------------------------------
DROP POLICY IF EXISTS "client_read_proposals" ON proposals;
DROP POLICY IF EXISTS "client_read_own_proposals" ON proposals;
CREATE POLICY "client_read_proposals" ON proposals
  FOR SELECT USING (
    public.user_role() = 'client'
    AND org_id = public.user_org_id()
    AND client_id = ANY(public.user_client_ids())
  );

-- Note: client_read_own_project_deliveries on `deliveries` already has
-- the correct client_ids check via a project lookup — no change needed.
