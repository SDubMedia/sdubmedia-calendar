-- Pipeline CRM upgrades: expected value, dated follow-ups, won/lost close-out.
--
-- expected_value      — dollars (numeric, NOT cents; matches proposals.total,
--   which analytics compares it against).
-- follow_up_date      — real date (YYYY-MM-DD), like availability.specific_date.
--   NOT modeled on pipeline_leads.event_date, which is text holding whatever
--   datetime-local string the website form sent.
-- follow_up_note      — optional short note shown with the follow-up.
-- followup_due_notified_at — idempotency stamp for the cron's "follow-ups due"
--   digest + bell notification. Deliberately separate from followup_nudged_at,
--   which is load-bearing for the stale-lead re-arm logic in
--   api/cron-lead-followup.ts (do NOT reuse it). The client NULLs this stamp
--   whenever follow_up_date changes, re-arming the notification.
-- closed_outcome      — '' (open) | 'won' | 'lost'. Orthogonal to
--   pipeline_stage: the stage list is org-customizable, so close-out is its
--   own field and stage is left as-is on close.
-- closed_at           — when the outcome was recorded.
-- lost_reason         — one of the fixed list (Price, Date conflict, Went with
--   someone else, Ghosted, Not a fit, Other). Kept clean for aggregation;
--   free text goes in lost_reason_note.
-- lost_reason_note    — optional free text (pairs with 'Other').
--
-- RLS: pipeline_leads already has the owner-only policy with org_id check
-- (2026-04-fix-rls-org-isolation.sql). Column adds inherit it — no policy
-- changes. Table is already in the realtime publication with REPLICA
-- IDENTITY FULL (2026-04-enable-realtime.sql).

ALTER TABLE pipeline_leads ADD COLUMN IF NOT EXISTS expected_value numeric NOT NULL DEFAULT 0;
ALTER TABLE pipeline_leads ADD COLUMN IF NOT EXISTS follow_up_date date;
ALTER TABLE pipeline_leads ADD COLUMN IF NOT EXISTS follow_up_note text NOT NULL DEFAULT '';
ALTER TABLE pipeline_leads ADD COLUMN IF NOT EXISTS followup_due_notified_at timestamptz;
ALTER TABLE pipeline_leads ADD COLUMN IF NOT EXISTS closed_outcome text NOT NULL DEFAULT '';
ALTER TABLE pipeline_leads ADD COLUMN IF NOT EXISTS closed_at timestamptz;
ALTER TABLE pipeline_leads ADD COLUMN IF NOT EXISTS lost_reason text NOT NULL DEFAULT '';
ALTER TABLE pipeline_leads ADD COLUMN IF NOT EXISTS lost_reason_note text NOT NULL DEFAULT '';

-- Guarded check constraint (re-runnable).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pipeline_leads_closed_outcome_check'
  ) THEN
    ALTER TABLE pipeline_leads
      ADD CONSTRAINT pipeline_leads_closed_outcome_check
      CHECK (closed_outcome IN ('', 'won', 'lost'));
  END IF;
END $$;
