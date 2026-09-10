-- "You've been added to a project" — one push + email per (project, crew
-- member), the first time they're put on it.
--
-- WHY: until now nobody was told when the owner added them to a project
-- unless they carried the requires_shoot_confirmation flag (one person).
-- Everyone else found out by opening the app. project.crew is a JSONB
-- snapshot overwritten on every edit, so "already told" has to live in its
-- own table, same reason shoot_confirmations does.
--
-- Service-role writes only (api/notify-project-assignment.ts). Owner can read
-- their org's rows; staff have no policy — nothing here is theirs to see.

CREATE TABLE IF NOT EXISTS public.project_assignment_notices (
  id text PRIMARY KEY,
  org_id text NOT NULL DEFAULT '',
  project_id text NOT NULL,
  crew_member_id text NOT NULL,
  notified_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, crew_member_id)
);

ALTER TABLE public.project_assignment_notices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner_read_project_assignment_notices" ON public.project_assignment_notices;
CREATE POLICY "owner_read_project_assignment_notices" ON public.project_assignment_notices
  FOR SELECT USING (
    public.user_role() = 'owner'
    AND org_id = public.user_org_id()
  );
