-- ============================================================
-- Broker portal — a brokerage (client-role, client_type='broker') sees their
-- agents' shoots and roster. Both changes are additive (no drops).
-- ============================================================

-- 1) A broker reads their own agents' client records (contact + the price they
--    pay; agent records carry no internal cost). Scoped to agents under THEM.
DROP POLICY IF EXISTS "broker_read_agents" ON public.clients;
CREATE POLICY "broker_read_agents" ON public.clients
  FOR SELECT USING (
    public.user_role() = 'client'
    AND org_id = public.user_org_id()
    AND broker_id = ANY(public.user_client_ids())
  );

-- 2) Rebuild projects_client so a broker sees shoots for ALL their agents (the
--    house is stored under the agent; the broker bills for it). Agents still see
--    only their own. Same cost-free scrub as before, built from the live schema.
DO $$
DECLARE cols text;
BEGIN
  SELECT string_agg(
    CASE column_name
      WHEN 'crew' THEN $f$COALESCE((SELECT jsonb_agg(e - 'payRatePerHour' - 'flatAmount' - 'payType') FROM jsonb_array_elements(COALESCE(p.crew,'[]'::jsonb)) e), '[]'::jsonb) AS crew$f$
      WHEN 'post_production' THEN $f$COALESCE((SELECT jsonb_agg(e - 'payRatePerHour' - 'flatAmount' - 'payType') FROM jsonb_array_elements(COALESCE(p.post_production,'[]'::jsonb)) e), '[]'::jsonb) AS post_production$f$
      WHEN 'services' THEN $f$COALESCE((SELECT jsonb_agg(e - 'cost') FROM jsonb_array_elements(COALESCE(p.services,'[]'::jsonb)) e), '[]'::jsonb) AS services$f$
      WHEN 'products' THEN $f$'[]'::jsonb AS products$f$
      ELSE 'p.' || quote_ident(column_name)
    END, ', ' ORDER BY ordinal_position)
  INTO cols FROM information_schema.columns WHERE table_schema='public' AND table_name='projects';
  EXECUTE format(
    'CREATE OR REPLACE VIEW public.projects_client AS SELECT %s FROM public.projects p '
    'WHERE p.org_id = public.user_org_id() AND public.user_role() = ''client'' AND ('
    '  p.client_id = ANY(public.user_client_ids()) '
    '  OR p.client_id IN (SELECT id FROM public.clients WHERE broker_id = ANY(public.user_client_ids()))'
    ')', cols);
END $$;

GRANT SELECT ON public.projects_client TO anon, authenticated;
