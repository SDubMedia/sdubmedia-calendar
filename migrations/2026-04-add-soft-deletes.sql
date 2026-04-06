-- Soft deletes: add deleted_at to key tables
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE contract_templates ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE proposal_templates ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE pipeline_leads ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
