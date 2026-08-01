-- Housekeeping: two pairs of policies that say the same thing twice.
--
-- Duplicates aren't harmful on their own (policies are OR'd, and both halves of
-- each pair are identical in effect), but they make an audit harder to read —
-- and today proved that reading the policy list correctly is what catches real
-- holes. Fewer rows, less to check.
--
--   crew_members: partner_read_crew (2026-04-fix-all-rls-critical.sql) and
--     partner_read_crew_members (base schema) are both
--     "partner AND org matches". Keep the base-schema name.
--
--   locations: family_read_locations is redundant now that
--     partner_read_locations covers partner/client/family
--     (2026-08-01-staff-scope-clients-locations-crew.sql rebuilt it).
--
-- Verify after running: family logins still see locations, partners still see
-- crew.

DROP POLICY IF EXISTS "partner_read_crew" ON public.crew_members;
DROP POLICY IF EXISTS "family_read_locations" ON public.locations;
