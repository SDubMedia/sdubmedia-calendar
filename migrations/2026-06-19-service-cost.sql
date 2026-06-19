-- Per-piece cost (your payout) alongside the existing price on each service.
-- Lets each bundle piece carry both "what I charge" (price) and "what it costs
-- me" (default_cost / cost — the photographer/editor payout) so margin shows
-- automatically on a shoot. Existing rows default to 0 — no behavior change.
-- ProjectServiceSelection.cost rides in the existing projects.services jsonb;
-- no projects column change needed.

ALTER TABLE services
  ADD COLUMN IF NOT EXISTS default_cost numeric NOT NULL DEFAULT 0;

ALTER TABLE service_variants
  ADD COLUMN IF NOT EXISTS cost numeric NOT NULL DEFAULT 0;
