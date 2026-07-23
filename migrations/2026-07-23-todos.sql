-- To-dos: owner-managed tasks, assignable to staff, optionally tied to a
-- project, optionally due on a date (shown on the calendar). Owner sees all;
-- staff see only the to-dos assigned to them (whether the owner assigned them
-- or the staffer added their own). created_by_user_id lets the owner tell a
-- self-added to-do from one they assigned.

CREATE TABLE IF NOT EXISTS todos (
  id text PRIMARY KEY,
  org_id text NOT NULL DEFAULT '',
  title text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  -- The crew member responsible. NULL = a general/owner to-do not tied to a
  -- specific staffer.
  assigned_crew_member_id text,
  -- Who created it (user_profiles.id). Distinguishes owner-assigned from
  -- staff-self-added in the owner's view.
  created_by_user_id text NOT NULL DEFAULT '',
  -- Optional project link (per-project checklist).
  project_id text,
  -- Optional due date (YYYY-MM-DD). Drives calendar display; overdue items
  -- keep showing until done (handled in app logic).
  due_date text,
  done boolean NOT NULL DEFAULT false,
  done_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE todos ENABLE ROW LEVEL SECURITY;

-- Owner: full access to every to-do in the org.
DROP POLICY IF EXISTS "owner_all_todos" ON todos;
CREATE POLICY "owner_all_todos" ON todos FOR ALL
  USING (public.user_role() = 'owner' AND org_id = public.user_org_id())
  WITH CHECK (public.user_role() = 'owner' AND org_id = public.user_org_id());

-- Staff: only the to-dos assigned to them. WITH CHECK keeps a staffer from
-- creating/reassigning a to-do to anyone but themselves.
DROP POLICY IF EXISTS "staff_own_todos" ON todos;
CREATE POLICY "staff_own_todos" ON todos FOR ALL
  USING (
    public.user_role() = 'staff'
    AND org_id = public.user_org_id()
    AND assigned_crew_member_id = public.user_crew_member_id()
  )
  WITH CHECK (
    public.user_role() = 'staff'
    AND org_id = public.user_org_id()
    AND assigned_crew_member_id = public.user_crew_member_id()
  );

CREATE INDEX IF NOT EXISTS idx_todos_org ON todos(org_id);
CREATE INDEX IF NOT EXISTS idx_todos_assigned ON todos(assigned_crew_member_id);
CREATE INDEX IF NOT EXISTS idx_todos_project ON todos(project_id);
