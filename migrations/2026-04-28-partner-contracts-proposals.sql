-- Add partner read access to contracts + proposals, scoped to assigned client_ids.
-- Previously: partners had no policy on these tables, so they got 0 rows when
-- logged in directly — even for their own clients. This fixes that gap.

DROP POLICY IF EXISTS "partner_read_contracts" ON contracts;
CREATE POLICY "partner_read_contracts" ON contracts
  FOR SELECT USING (
    public.user_role() = 'partner'
    AND org_id = public.user_org_id()
    AND client_id = ANY(public.user_client_ids())
  );

DROP POLICY IF EXISTS "partner_read_proposals" ON proposals;
CREATE POLICY "partner_read_proposals" ON proposals
  FOR SELECT USING (
    public.user_role() = 'partner'
    AND org_id = public.user_org_id()
    AND client_id = ANY(public.user_client_ids())
  );

-- Templates are org-wide (partners can pick from any template when creating
-- a new contract/proposal — though writes still require owner role).
DROP POLICY IF EXISTS "partner_read_contract_templates" ON contract_templates;
CREATE POLICY "partner_read_contract_templates" ON contract_templates
  FOR SELECT USING (
    public.user_role() = 'partner'
    AND org_id = public.user_org_id()
  );

DROP POLICY IF EXISTS "partner_read_proposal_templates" ON proposal_templates;
CREATE POLICY "partner_read_proposal_templates" ON proposal_templates
  FOR SELECT USING (
    public.user_role() = 'partner'
    AND org_id = public.user_org_id()
  );
