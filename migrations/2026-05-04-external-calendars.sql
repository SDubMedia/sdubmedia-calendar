-- External calendar subscriptions — owner pastes a webcal:// or
-- https:// iCal URL (e.g. published Apple Calendar feed) and Slate
-- pulls events on a 30-min cron, displaying them as read-only chips
-- on the My Life calendar. Owner-only; events are scoped to the
-- adding user (not the org) so multiple owners would each have
-- their own subscriptions later.
--
-- Two tables:
--   external_calendars — one row per subscribed feed. Stores the
--     URL + display options + last-sync metadata.
--   external_events — events parsed from the latest feed pull.
--     Wholesale-replaced on each sync (no incremental diffing).

CREATE TABLE IF NOT EXISTS external_calendars (
  id text PRIMARY KEY,
  org_id text NOT NULL DEFAULT '',
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label text NOT NULL DEFAULT '',
  url text NOT NULL,
  color text NOT NULL DEFAULT '#94a3b8',
  enabled boolean NOT NULL DEFAULT true,
  last_synced_at timestamptz,
  last_error text DEFAULT '',
  event_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS external_calendars_owner_idx
  ON external_calendars (owner_user_id);
CREATE INDEX IF NOT EXISTS external_calendars_org_idx
  ON external_calendars (org_id);

CREATE TABLE IF NOT EXISTS external_events (
  id text PRIMARY KEY,
  external_calendar_id text NOT NULL REFERENCES external_calendars(id) ON DELETE CASCADE,
  ical_uid text NOT NULL DEFAULT '',
  title text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  location text NOT NULL DEFAULT '',
  start_at timestamptz NOT NULL,
  end_at timestamptz,
  all_day boolean NOT NULL DEFAULT false,
  raw jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS external_events_cal_idx
  ON external_events (external_calendar_id);
CREATE INDEX IF NOT EXISTS external_events_start_idx
  ON external_events (start_at);

ALTER TABLE external_calendars ENABLE ROW LEVEL SECURITY;
ALTER TABLE external_events ENABLE ROW LEVEL SECURITY;

-- Owner can manage their own external calendars + see only their own events.
CREATE POLICY "owner_own_external_calendars" ON external_calendars
  FOR ALL USING (
    public.user_role() = 'owner'
    AND owner_user_id = auth.uid()
    AND org_id = public.user_org_id()
  );

CREATE POLICY "owner_own_external_events" ON external_events
  FOR ALL USING (
    public.user_role() = 'owner'
    AND external_calendar_id IN (
      SELECT id FROM external_calendars WHERE owner_user_id = auth.uid()
    )
  );
