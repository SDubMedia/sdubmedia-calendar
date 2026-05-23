-- Phase A: link a proposal template to the master contract template that
-- should auto-generate when a client accepts. The link copies onto each
-- Proposal at send time so per-proposal overrides are possible later.

ALTER TABLE proposal_templates
  ADD COLUMN IF NOT EXISTS contract_template_id text REFERENCES contract_templates(id) ON DELETE SET NULL;

ALTER TABLE proposals
  ADD COLUMN IF NOT EXISTS contract_template_id text REFERENCES contract_templates(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS proposals_contract_template_idx ON proposals (contract_template_id) WHERE deleted_at IS NULL;
