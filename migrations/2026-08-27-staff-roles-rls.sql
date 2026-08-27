-- ============================================================
-- staff_roles was writable by anyone on the internet.
--
-- The table carried a single policy, "Allow all", granting ALL operations with
-- USING (true) / WITH CHECK (true). Proved 2026-08-27: an INSERT sent with only
-- the public anon key and no session returned 201 Created. DELETE and UPDATE
-- were equally open, so a stranger could have emptied the list.
--
-- No customer data is involved — it is twelve crew job titles ("Main
-- Videographer" and so on). The risk was vandalism, not disclosure: every
-- project's crew assignments reference these rows.
--
-- The application never touches this table. It appears once in the generated
-- database types and nowhere else in client/src or api/, so read access is kept
-- (harmless, and something may yet read it) while writes are removed entirely.
-- With no INSERT/UPDATE/DELETE policy, only the service role can change it —
-- which is how a shared lookup table should behave.
--
-- Same class as the April 2026 incident where three tables were publicly
-- accessible because an initial permissive policy was never dropped.
-- ============================================================

ALTER TABLE public.staff_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all" ON public.staff_roles;

-- Read-only, and only for a signed-in user. Anonymous visitors get nothing.
DROP POLICY IF EXISTS staff_roles_read ON public.staff_roles;
CREATE POLICY staff_roles_read ON public.staff_roles
  FOR SELECT TO authenticated
  USING (true);
