-- Documents attached to a project (teleprompter scripts, shot lists, call
-- sheets, etc.). Files live in R2; this table holds the metadata. Owner manages
-- all; assigned crew (on the project's crew or post-production) can see + add
-- documents for that project. Clients never see them.

CREATE TABLE IF NOT EXISTS project_documents (
  id text PRIMARY KEY,
  org_id text NOT NULL DEFAULT '',
  project_id text NOT NULL,
  file_name text NOT NULL DEFAULT '',
  storage_path text NOT NULL DEFAULT '',
  size_bytes bigint NOT NULL DEFAULT 0,
  mime_type text NOT NULL DEFAULT '',
  uploaded_by_user_id text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE project_documents ENABLE ROW LEVEL SECURITY;

-- Owner: full access to every document in the org.
DROP POLICY IF EXISTS "owner_all_project_documents" ON project_documents;
CREATE POLICY "owner_all_project_documents" ON project_documents FOR ALL
  USING (public.user_role() = 'owner' AND org_id = public.user_org_id())
  WITH CHECK (public.user_role() = 'owner' AND org_id = public.user_org_id());

-- Staff: documents for projects they're assigned to (on crew or post-production).
DROP POLICY IF EXISTS "staff_assigned_project_documents" ON project_documents;
CREATE POLICY "staff_assigned_project_documents" ON project_documents FOR ALL
  USING (
    public.user_role() = 'staff'
    AND org_id = public.user_org_id()
    AND project_id IN (
      SELECT p.id FROM public.projects p
      WHERE p.org_id = public.user_org_id()
      AND (
        EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(p.crew, '[]'::jsonb)) e
                WHERE e->>'crewMemberId' = public.user_crew_member_id())
        OR EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(p.post_production, '[]'::jsonb)) e
                WHERE e->>'crewMemberId' = public.user_crew_member_id())
      )
    )
  )
  WITH CHECK (
    public.user_role() = 'staff'
    AND org_id = public.user_org_id()
    AND project_id IN (
      SELECT p.id FROM public.projects p
      WHERE p.org_id = public.user_org_id()
      AND (
        EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(p.crew, '[]'::jsonb)) e
                WHERE e->>'crewMemberId' = public.user_crew_member_id())
        OR EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(p.post_production, '[]'::jsonb)) e
                WHERE e->>'crewMemberId' = public.user_crew_member_id())
      )
    )
  );

CREATE INDEX IF NOT EXISTS idx_project_documents_org ON project_documents(org_id);
CREATE INDEX IF NOT EXISTS idx_project_documents_project ON project_documents(project_id);
