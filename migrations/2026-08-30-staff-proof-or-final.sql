-- She can now choose which pile a file lands in, not just finals.
--
-- WHY: pinning her inserts to stage='final' assumed proofs were always the
-- owner's job. In practice the editor needs to load proofs too — before
-- selection settings are configured, before the client has picked, in any
-- phase. The gallery UI decides when to offer her the choice; this policy
-- only needs to stop blocking it.
--
-- Still INSERT only. No UPDATE, no DELETE — she cannot alter or remove a
-- client's photos, or move a file between proof and final after the fact.
-- That stays the owner's call (owner_all_delivery_files already grants him
-- FOR ALL).
DROP POLICY IF EXISTS "staff_add_finals" ON public.delivery_files;
DROP POLICY IF EXISTS "staff_add_files" ON public.delivery_files;
CREATE POLICY "staff_add_files" ON public.delivery_files
  FOR INSERT WITH CHECK (
    public.user_role() = 'staff'
    AND org_id = public.user_org_id()
    AND stage IN ('proof', 'final')
    AND delivery_id IN (
      SELECT d.id FROM public.deliveries d
      WHERE d.project_id IS NOT NULL
        AND d.project_id IN (SELECT sap.id FROM public.staff_assigned_projects() sap)
    )
  );

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT policyname, cmd FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'delivery_files'
    ORDER BY policyname
  LOOP
    RAISE NOTICE 'delivery_files | % | %', r.policyname, r.cmd;
  END LOOP;
END $$;
