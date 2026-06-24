-- Per-piece on-site duration (minutes). The agent-facing appointment length is
-- the sum of the picked pieces' durations; travel buffer is reserved separately
-- by the slot engine. 0 = fall back to the shooter's flat shoot length.
ALTER TABLE services ADD COLUMN IF NOT EXISTS duration_minutes integer NOT NULL DEFAULT 0;
ALTER TABLE service_variants ADD COLUMN IF NOT EXISTS duration_minutes integer NOT NULL DEFAULT 0;

-- Rebuild the client-safe views so agents (client role) can read the new
-- duration_minutes column when booking. These views enumerate columns at build
-- time, so a column added later is invisible until rebuilt. Cost stays scrubbed.

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

GRANT SELECT ON public.services_client TO anon, authenticated;
GRANT SELECT ON public.service_variants_client TO anon, authenticated;
