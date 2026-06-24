-- Agent-facing service note: what the agent gets with this selection (e.g.
-- "25-40 edited photos, interior + exterior, delivered next day").
ALTER TABLE services ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '';

-- Rebuild services_client so agents (client role) can read the new description
-- column when booking. The view enumerates columns at build time, so a column
-- added later is invisible until rebuilt. Cost stays scrubbed.
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

GRANT SELECT ON public.services_client TO anon, authenticated;
