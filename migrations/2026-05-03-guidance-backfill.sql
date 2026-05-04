-- Backfill: existing users (anyone who already completed onboarding before
-- the guidance system shipped) shouldn't see the one-time business-info
-- setup modal — they've already configured their org through Settings or
-- the original onboarding wizard. Mark them as having seen it so the
-- modal doesn't fire on their next login. Also pre-populate seenGuides
-- so any future re-introduction of auto-popping page guides skips them.
--
-- New users (post-launch) start with guidance = '{}', so `businessInfoSetupSeen`
-- is false and the modal fires once after they finish the onboarding wizard.

UPDATE user_profiles
SET guidance = jsonb_build_object(
  'seenGuides', jsonb_build_object(
    'pipeline', NOW()::text,
    'contracts', NOW()::text,
    'deliveries', NOW()::text
  ),
  'businessInfoSetupSeen', true,
  'stripeOptedOut', COALESCE((guidance->>'stripeOptedOut')::boolean, false),
  'manualCompletions', COALESCE(guidance->'manualCompletions', '{}'::jsonb)
)
WHERE has_completed_onboarding = true
  AND (guidance->'seenGuides' IS NULL OR guidance->'seenGuides' = '{}'::jsonb);
