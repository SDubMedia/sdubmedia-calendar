-- ============================================================
-- RLS FIX: drop permissive user_profiles policy.
--
-- The `owner_all_user_profiles` policy was `user_role() = 'owner'`
-- with NO org scope, so any org owner could read every user_profile
-- across every tenant. Found by the RLS smoke test 2026-04-19.
--
-- The properly-scoped `owner_all_profiles` policy
-- (user_role() = 'owner' AND org_id = user_org_id()) already
-- covers legitimate owner access within their own org, so this
-- drop is pure hardening with no legitimate-access regression.
-- ============================================================

DROP POLICY IF EXISTS "owner_all_user_profiles" ON user_profiles;
