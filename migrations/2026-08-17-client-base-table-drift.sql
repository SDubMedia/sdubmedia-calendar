-- Clients read the scrubbed views, not the raw tables.
--
-- WHY: `2026-06-19-client-safe-views-phase2.sql` dropped the client read
-- policies on the base tables because the app switched to reading
-- `projects_client` / `services_client` / `service_variants_client`. Those
-- policies are live again in production (verified 2026-08-17 by signing in as
-- a client-role probe), so the drop either never ran or was re-created.
--
-- What a client login can currently pull straight from `projects`, on their
-- own project row, that the view scrubs:
--
--   crew:            payRatePerHour 100        → crew pay rates
--   post_production: flatAmount 270            → what the editor was paid
--   source_files_url: drive.google.com/…       → the raw footage folder
--
-- The app never displays any of it — it reads the view. But the policy is
-- what decides, not the app: anyone holding their own login token can query
-- the table directly and get all three.
--
-- The three `*_client` views do their own scoping (a client sees exactly one
-- project through `projects_client`, not all 67), so they do not depend on
-- these base-table policies. Dropping them is the whole fix.
--
-- AFTER RUNNING: log in as an agent and confirm My Houses still lists their
-- shoots and prices. If anything went blank, re-run
-- `migrations/2026-06-19-client-safe-views-phase2.sql` to rebuild the views.

DROP POLICY IF EXISTS "client_read_projects" ON public.projects;
DROP POLICY IF EXISTS "client_all_projects" ON public.projects;
DROP POLICY IF EXISTS "client_read_services" ON public.services;
DROP POLICY IF EXISTS "client_read_service_variants" ON public.service_variants;

-- Show what's left on those three tables, so the run output says plainly who
-- can still read them rather than needing a separate check.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT tablename, policyname, cmd, qual::text
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('projects', 'services', 'service_variants')
    ORDER BY tablename, policyname
  LOOP
    RAISE NOTICE '% | % | % | %', r.tablename, r.policyname, r.cmd, left(r.qual, 120);
  END LOOP;
END $$;
