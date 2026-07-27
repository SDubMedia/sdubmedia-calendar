-- On-camera talent: a per-project list of the people featured on camera
-- (agents, clients, guests — free-text names). Owner + assigned crew edit it
-- from the project detail; it shows in the Projects & Activity section of the
-- client report. Stored as a jsonb array of strings.

ALTER TABLE projects ADD COLUMN IF NOT EXISTS on_camera_talent jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Rebuild projects_client so client logins can read on_camera_talent. The view
-- enumerates columns from information_schema at build time. on_camera_talent is
-- client-facing by design, so it passes through unscrubbed (ELSE branch).
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
    '  OR p.client_id IN (SELECT id FROM public.clients WHERE broker_id = ANY(public.user_client_ids())) '
    '  OR p.bill_to_id = ANY(public.user_client_ids())'
    ')', cols);
END $$;
GRANT SELECT ON public.projects_client TO anon, authenticated;
