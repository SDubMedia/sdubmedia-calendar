-- ============================================================
-- analytics_events table — conversion funnel + attribution.
-- Written AFTER the fact (table already exists in production).
-- Reverse-engineered from the live schema on 2026-04-19 so that
-- a fresh environment build is reproducible.
--
-- Used by:
--   - slate-producer/api/track.ts
--   - sdubmedia-calendar/api/track.ts
--
-- Event names: landing_attributed, signup_attributed, upgrade_dialog_viewed,
-- checkout_started, checkout_completed, portal_opened.
-- ============================================================

CREATE TABLE IF NOT EXISTS analytics_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name text NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  org_id text,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS analytics_events_event_name_idx
  ON analytics_events(event_name);
CREATE INDEX IF NOT EXISTS analytics_events_created_at_idx
  ON analytics_events(created_at DESC);
CREATE INDEX IF NOT EXISTS analytics_events_user_id_idx
  ON analytics_events(user_id)
  WHERE user_id IS NOT NULL;

-- RLS: service role (used by /api/track) bypasses by default.
-- User-facing read access is owner-only; no one else needs to see raw events.
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner_read_analytics_events" ON analytics_events;
CREATE POLICY "owner_read_analytics_events" ON analytics_events
  FOR SELECT USING (public.user_role() = 'owner');
