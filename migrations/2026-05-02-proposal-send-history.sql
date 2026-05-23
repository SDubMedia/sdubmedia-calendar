-- Lightweight versioning for proposals. Every time a proposal moves to
-- "sent" status (manual send button on the proposals page), the API
-- appends an entry to send_history with a timestamp + snapshot of total,
-- packages, and payment_milestones. Lets the owner see "sent 3 times,
-- last on May 5" and audit what changed between sends.
--
-- JSONB shape (each entry):
--   { sentAt: ISO, total: number, packageIds: string[],
--     milestoneCount: number }
--
-- Default '[]' for back-compat with existing proposals.

ALTER TABLE proposals
  ADD COLUMN IF NOT EXISTS send_history jsonb NOT NULL DEFAULT '[]';
