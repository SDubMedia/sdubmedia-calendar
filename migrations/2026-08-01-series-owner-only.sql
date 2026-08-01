-- Content series: owner manages, partner and client read their own.
--
-- Two changes here.
--
-- 1) `others_read_series` gave partner AND staff read access to every series in
--    the org — strategy, goal and episode plans for every content client.
--    Staff have no route to it (all /series pages are owner-gated), so it was
--    access with no purpose.
--
-- 2) The replacement partner/client policies (applied by hand before this file
--    existed) have two faults worth correcting:
--      * FOR ALL, not FOR SELECT — that hands clients and partners the right to
--        create, edit and delete series rows, not merely read them. Same shape
--        as the staff time-entry regression: the permissive test governs writes
--        too when there's no WITH CHECK.
--      * no org_id check. CLAUDE.md requires one on every policy because this
--        is multi-tenant; scoping by client_id alone means a client id that
--        collided across two orgs would cross the boundary.
--
-- Clients don't strictly need this policy — the review link
-- (/review/series/:token) is served by api/series-public-view.ts under the
-- service role and validated by token, not RLS — but a scoped read does no harm
-- and covers an in-app view later.
--
-- Nothing downstream breaks for staff. ProjectDetailSheet loops data.series to
-- sync a linked episode when a project advances, but series_episodes has been
-- owner-only since 2026-04-19-fix-series-rls-leaks.sql, so that loop has
-- returned nothing for non-owners all along.

DROP POLICY IF EXISTS "others_read_series" ON public.series;

DROP POLICY IF EXISTS "partner_series" ON public.series;
CREATE POLICY "partner_read_own_series" ON public.series
  FOR SELECT USING (
    public.user_role() = 'partner'
    AND org_id = public.user_org_id()
    AND client_id = ANY (public.user_client_ids())
  );

DROP POLICY IF EXISTS "client_series" ON public.series;
CREATE POLICY "client_read_own_series" ON public.series
  FOR SELECT USING (
    public.user_role() = 'client'
    AND org_id = public.user_org_id()
    AND client_id = ANY (public.user_client_ids())
  );
