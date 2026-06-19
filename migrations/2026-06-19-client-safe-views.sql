-- ============================================================
-- Client-safe views — hide internal money from agents/brokers (client role).
--
-- Slate's client role reads rows directly, and Postgres RLS is row-level (it
-- can't hide individual columns). Agents/brokers (client-role logins) must NOT
-- see crew pay, per-piece cost, product cost, or margin — only what they pay.
--
-- Fix: route client reads through SECURITY DEFINER views that keep every
-- client-needed field but strip the sensitive ones, then drop the client/family
-- read policies on the raw tables. Built dynamically from the LIVE schema so a
-- future column never silently leaks or breaks the portal.
--
-- Owner / staff / partner are untouched — they keep reading the raw tables.
-- ROLLOUT: deploy the app code that reads these views together with this
-- migration (the app's client read-path is switched to *_client in the same
-- release). Anon stays at zero rows (role/org guards fail without a JWT).
-- ============================================================

-- ---- projects_client : scrub pay from crew/post, cost from services/products
DO $$
DECLARE cols text;
BEGIN
  SELECT string_agg(
    CASE column_name
      WHEN 'crew' THEN
        $f$COALESCE((SELECT jsonb_agg(e - 'payRatePerHour' - 'flatAmount' - 'payType') FROM jsonb_array_elements(COALESCE(p.crew,'[]'::jsonb)) e), '[]'::jsonb) AS crew$f$
      WHEN 'post_production' THEN
        $f$COALESCE((SELECT jsonb_agg(e - 'payRatePerHour' - 'flatAmount' - 'payType') FROM jsonb_array_elements(COALESCE(p.post_production,'[]'::jsonb)) e), '[]'::jsonb) AS post_production$f$
      WHEN 'services' THEN
        $f$COALESCE((SELECT jsonb_agg(e - 'cost') FROM jsonb_array_elements(COALESCE(p.services,'[]'::jsonb)) e), '[]'::jsonb) AS services$f$
      WHEN 'products' THEN
        $f$'[]'::jsonb AS products$f$
      ELSE 'p.' || quote_ident(column_name)
    END, ', ' ORDER BY ordinal_position)
  INTO cols
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'projects';

  EXECUTE format(
    'CREATE OR REPLACE VIEW public.projects_client AS SELECT %s FROM public.projects p '
    'WHERE p.org_id = public.user_org_id() AND public.user_role() = ''client'' '
    'AND p.client_id = ANY(public.user_client_ids())', cols);
END $$;

-- ---- services_client : every column except the cost (your payout)
DO $$
DECLARE cols text;
BEGIN
  SELECT string_agg('s.' || quote_ident(column_name), ', ' ORDER BY ordinal_position)
  INTO cols
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'services' AND column_name <> 'default_cost';

  EXECUTE format(
    'CREATE OR REPLACE VIEW public.services_client AS SELECT %s FROM public.services s '
    'WHERE s.org_id = public.user_org_id() AND public.user_role() = ''client''', cols);
END $$;

-- ---- service_variants_client : every column except the cost
DO $$
DECLARE cols text;
BEGIN
  SELECT string_agg('v.' || quote_ident(column_name), ', ' ORDER BY ordinal_position)
  INTO cols
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'service_variants' AND column_name <> 'cost';

  EXECUTE format(
    'CREATE OR REPLACE VIEW public.service_variants_client AS SELECT %s FROM public.service_variants v '
    'WHERE v.org_id = public.user_org_id() AND public.user_role() = ''client''', cols);
END $$;

-- Expose the views to the API roles (the views'' own WHERE clauses enforce
-- org + client-role + client-id scoping; anon has no JWT so it gets nothing).
GRANT SELECT ON public.projects_client TO anon, authenticated;
GRANT SELECT ON public.services_client TO anon, authenticated;
GRANT SELECT ON public.service_variants_client TO anon, authenticated;

-- STEP 1 ONLY (this file): additive — views exist, web reads them. The raw-table
-- client read policies are intentionally LEFT IN PLACE so the current iOS app
-- keeps working. The final lock (dropping those policies) is a separate file,
-- 2026-06-19-client-safe-views-phase2.sql, run AFTER the iOS update ships.
