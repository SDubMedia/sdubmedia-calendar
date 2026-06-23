-- Let an agent edit or cancel their OWN shoot request, but only while it's
-- still pending (before the owner approves). Mirrors the existing client_insert/
-- client_read policies. A broker can't touch an agent's request (its client_id
-- is the agent, not in the broker's client_ids) — only the orderer can.

DROP POLICY IF EXISTS "client_update_own_pending_shoot_requests" ON shoot_requests;
CREATE POLICY "client_update_own_pending_shoot_requests" ON shoot_requests
  FOR UPDATE USING (
    public.user_role() = 'client'
    AND org_id = public.user_org_id()
    AND client_id = ANY(public.user_client_ids())
    AND status = 'pending'
  ) WITH CHECK (
    public.user_role() = 'client'
    AND org_id = public.user_org_id()
    AND client_id = ANY(public.user_client_ids())
    AND status = 'pending'
  );

DROP POLICY IF EXISTS "client_delete_own_pending_shoot_requests" ON shoot_requests;
CREATE POLICY "client_delete_own_pending_shoot_requests" ON shoot_requests
  FOR DELETE USING (
    public.user_role() = 'client'
    AND org_id = public.user_org_id()
    AND client_id = ANY(public.user_client_ids())
    AND status = 'pending'
  );
