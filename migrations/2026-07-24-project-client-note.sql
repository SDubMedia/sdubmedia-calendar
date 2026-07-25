-- Client-facing project note: a delivery summary written FOR the client
-- (revisions, how many videos delivered, who's in them). Separate from the
-- internal `notes` field so internal notes never leak to clients. Shown on the
-- client report.

ALTER TABLE projects ADD COLUMN IF NOT EXISTS client_note text NOT NULL DEFAULT '';

-- Rebuild projects_client so it picks up the new client_note column. The view
-- enumerates columns from information_schema at build time, so a new column
-- isn't visible to client logins until rebuilt. client_note is client-facing
-- by design, so it passes through unscrubbed. Same cost-scrub + broker/bill-to
-- scoping as the prior definition.
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
