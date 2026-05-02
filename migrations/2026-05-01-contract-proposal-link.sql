-- Phase A — auto-generate draft contracts from proposal acceptance.
-- Each contract can be linked back to the proposal that produced it (so the
-- approval queue, send-back flow, and audit trail can find their roots).

ALTER TABLE contracts
  ADD COLUMN IF NOT EXISTS proposal_id text REFERENCES proposals(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS master_template_version_id text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS firing_log jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS send_back_reason text NOT NULL DEFAULT '';

-- Find pending approvals quickly: status = 'draft' + linked to a proposal.
CREATE INDEX IF NOT EXISTS contracts_proposal_idx ON contracts (proposal_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS contracts_pending_approval_idx ON contracts (org_id, status) WHERE status = 'draft' AND deleted_at IS NULL;
