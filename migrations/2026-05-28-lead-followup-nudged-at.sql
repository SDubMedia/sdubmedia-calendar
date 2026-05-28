-- Lead follow-up nudges: track when we last nudged the owner about a stale
-- lead, so the daily cron sends at most one nudge per "stale period" and
-- re-arms when the owner touches the lead (updated_at moves past this).
-- Nullable, no RLS change needed (pipeline_leads already has owner RLS).

ALTER TABLE pipeline_leads
  ADD COLUMN IF NOT EXISTS followup_nudged_at timestamptz;
