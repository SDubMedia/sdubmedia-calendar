-- ============================================================
-- RLS FIX: scope series_episodes / series_messages / episode_comments
-- owner policies by org. Found by the RLS smoke test 2026-04-19.
--
-- Same pattern as the user_profiles leak: owner_all_* had only
-- user_role() = 'owner' with no org check, so every self-signup
-- (who becomes owner of their own auto-created org) could read
-- every other org's series data.
--
-- Scoping goes through the series parent table since the child
-- tables only have series_id (no direct org_id column).
-- ============================================================

DROP POLICY IF EXISTS "owner_all_series_episodes" ON series_episodes;
CREATE POLICY "owner_all_series_episodes" ON series_episodes
  FOR ALL USING (
    public.user_role() = 'owner'
    AND series_id IN (SELECT id FROM series WHERE org_id = public.user_org_id())
  );

DROP POLICY IF EXISTS "owner_all_series_messages" ON series_messages;
CREATE POLICY "owner_all_series_messages" ON series_messages
  FOR ALL USING (
    public.user_role() = 'owner'
    AND series_id IN (SELECT id FROM series WHERE org_id = public.user_org_id())
  );

DROP POLICY IF EXISTS "owner_all_episode_comments" ON episode_comments;
CREATE POLICY "owner_all_episode_comments" ON episode_comments
  FOR ALL USING (
    public.user_role() = 'owner'
    AND series_id IN (SELECT id FROM series WHERE org_id = public.user_org_id())
  );
