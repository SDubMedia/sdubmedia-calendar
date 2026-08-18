-- An editor can see the gallery for a job they're on.
--
-- WHY: a client picks 15 frames out of 198 and the editor is the person who
-- acts on that — but staff could see zero galleries, so the picks, the
-- filenames and the files were all invisible to them. The handoff was the
-- owner copying a filename list into a message by hand.
--
-- SCOPE: assigned jobs only, via staff_assigned_projects() — the same
-- SECURITY DEFINER lookup that already scopes their clients and locations
-- (2026-08-01-staff-scope-clients-locations-crew.sql). An editor on one
-- wedding sees that wedding's gallery and nothing else. A gallery with no
-- project attached stays owner-only, because there's nothing to scope it by.
--
-- READ-ONLY, deliberately. SELECT and nothing more: an editor needs to see
-- which frames were chosen and download them, not delete a client's photos,
-- rename them, or re-order the gallery.
--
-- NOT granted: delivery_downloads (who downloaded what — an owner metric),
-- gallery_visitors (visitor emails), and the deliveries UPDATE/DELETE that
-- would let a contractor change what a client sees.
--
-- The subquery goes through the function, NOT a bare `SELECT ... FROM
-- projects`. A subquery inside a policy is filtered by RLS too, so reading
-- projects directly here would silently return nothing the moment the staff
-- project policy changes — the exact bug that blanked client galleries on
-- 2026-08-17.

-- ---- the galleries themselves ----
DROP POLICY IF EXISTS "staff_read_assigned_deliveries" ON public.deliveries;
CREATE POLICY "staff_read_assigned_deliveries" ON public.deliveries
  FOR SELECT USING (
    public.user_role() = 'staff'
    AND org_id = public.user_org_id()
    AND project_id IS NOT NULL
    AND project_id IN (SELECT sap.id FROM public.staff_assigned_projects() sap)
  );

-- ---- the files in them ----
DROP POLICY IF EXISTS "staff_read_assigned_delivery_files" ON public.delivery_files;
CREATE POLICY "staff_read_assigned_delivery_files" ON public.delivery_files
  FOR SELECT USING (
    public.user_role() = 'staff'
    AND org_id = public.user_org_id()
    AND delivery_id IN (
      SELECT d.id FROM public.deliveries d
      WHERE d.project_id IS NOT NULL
        AND d.project_id IN (SELECT sap.id FROM public.staff_assigned_projects() sap)
    )
  );

-- ---- which frames the client chose ----
DROP POLICY IF EXISTS "staff_read_assigned_delivery_selections" ON public.delivery_selections;
CREATE POLICY "staff_read_assigned_delivery_selections" ON public.delivery_selections
  FOR SELECT USING (
    public.user_role() = 'staff'
    AND org_id = public.user_org_id()
    AND delivery_id IN (
      SELECT d.id FROM public.deliveries d
      WHERE d.project_id IS NOT NULL
        AND d.project_id IN (SELECT sap.id FROM public.staff_assigned_projects() sap)
    )
  );

-- Marking a pick "edited" is the editor's own progress, so that one write is
-- allowed — scoped identically, and only that column's row.
DROP POLICY IF EXISTS "staff_update_assigned_delivery_selections" ON public.delivery_selections;
CREATE POLICY "staff_update_assigned_delivery_selections" ON public.delivery_selections
  FOR UPDATE USING (
    public.user_role() = 'staff'
    AND org_id = public.user_org_id()
    AND delivery_id IN (
      SELECT d.id FROM public.deliveries d
      WHERE d.project_id IS NOT NULL
        AND d.project_id IN (SELECT sap.id FROM public.staff_assigned_projects() sap)
    )
  );

-- What can read these four tables now.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT tablename, policyname, cmd
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('deliveries', 'delivery_files', 'delivery_selections', 'delivery_downloads')
    ORDER BY tablename, policyname
  LOOP
    RAISE NOTICE '% | % | %', r.tablename, r.policyname, r.cmd;
  END LOOP;
END $$;
