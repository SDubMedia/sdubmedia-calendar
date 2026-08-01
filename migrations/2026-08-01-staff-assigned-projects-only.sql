-- Staff see only the jobs they're assigned to.
--
-- Until now `staff_read_projects` let any staff login SELECT every project in
-- the org. The app's staff screens filtered down to their own assignments, but
-- the rest still travelled to their browser, where dev tools would show the
-- client rate, the billed hours, and every other contractor's pay. This moves
-- the rule into the database so unassigned jobs simply never load.
--
-- Assigned = named on the project's crew (the shoot) or post_production (the
-- edit), in any role. Same test the project_documents policy already uses, plus
-- two hardening details:
--   * jsonb_typeof guard — an error raised inside a policy fails the whole
--     query, so a malformed crew column would lock a staff member out of the
--     app entirely. Treat anything that isn't an array as empty.
--   * both key spellings — rows written by the app use "crewMemberId", but
--     older rows may carry "crew_member_id" (see normalizeCrewEntry).
--
-- Not covered here, still readable by any staff login: clients, locations,
-- crew_members, meetings, services. Those are their own migrations.

DROP POLICY IF EXISTS "staff_read_projects" ON public.projects;
DROP POLICY IF EXISTS "staff_read_assigned_projects" ON public.projects;

CREATE POLICY "staff_read_assigned_projects" ON public.projects
  FOR SELECT USING (
    public.user_role() = 'staff'
    AND org_id = public.user_org_id()
    AND (
      EXISTS (
        SELECT 1 FROM jsonb_array_elements(
          CASE WHEN jsonb_typeof(crew) = 'array' THEN crew ELSE '[]'::jsonb END
        ) e
        WHERE COALESCE(e->>'crewMemberId', e->>'crew_member_id') = public.user_crew_member_id()
      )
      OR EXISTS (
        SELECT 1 FROM jsonb_array_elements(
          CASE WHEN jsonb_typeof(post_production) = 'array' THEN post_production ELSE '[]'::jsonb END
        ) e
        WHERE COALESCE(e->>'crewMemberId', e->>'crew_member_id') = public.user_crew_member_id()
      )
    )
  );
