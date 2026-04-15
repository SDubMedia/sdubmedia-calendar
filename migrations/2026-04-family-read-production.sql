-- Allow family role to read production data (read-only view of calendar)
DROP POLICY IF EXISTS "family_read_projects" ON projects;
CREATE POLICY "family_read_projects" ON projects
  FOR SELECT USING (public.user_role() = 'family' AND org_id = public.user_org_id());

DROP POLICY IF EXISTS "family_read_clients" ON clients;
CREATE POLICY "family_read_clients" ON clients
  FOR SELECT USING (public.user_role() = 'family' AND org_id = public.user_org_id());

DROP POLICY IF EXISTS "family_read_locations" ON locations;
CREATE POLICY "family_read_locations" ON locations
  FOR SELECT USING (public.user_role() = 'family' AND org_id = public.user_org_id());

DROP POLICY IF EXISTS "family_read_project_types" ON project_types;
CREATE POLICY "family_read_project_types" ON project_types
  FOR SELECT USING (public.user_role() = 'family' AND org_id = public.user_org_id());
