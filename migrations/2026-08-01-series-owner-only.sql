-- Content series: owner only.
--
-- `others_read_series` let partner AND staff read every series in the org —
-- the strategy, the goal, the episode plans for each content client. Neither
-- role has a route to it in the app (all /series pages are owner-gated), so
-- this was read access with no purpose.
--
-- Clients don't need a policy: they reach their series through the public
-- review link (/review/series/:token), which is served by
-- api/series-public-view.ts under the service role and validated by token, not
-- by RLS.
--
-- Nothing breaks downstream. ProjectDetailSheet loops `data.series` to sync a
-- linked episode's status when a project advances, but series_episodes has
-- been owner-only since 2026-04-19-fix-series-rls-leaks.sql — so that loop
-- already returns nothing for staff and partner today. Removing series read
-- changes an empty result into an empty result.

DROP POLICY IF EXISTS "others_read_series" ON public.series;
