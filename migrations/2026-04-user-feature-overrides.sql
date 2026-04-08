-- ============================================================
-- Add per-user feature overrides to user_profiles
-- Allows owner to grant/revoke individual features per user
-- Check order: user override → role override → global feature
-- ============================================================

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS feature_overrides jsonb DEFAULT NULL;

COMMENT ON COLUMN user_profiles.feature_overrides IS
  'Per-user feature visibility overrides. Keys match OrgFeatures. Most specific wins: user → role → global.';
