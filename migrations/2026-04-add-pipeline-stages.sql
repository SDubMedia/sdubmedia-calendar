-- Add customizable pipeline stages to organizations
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS pipeline_stages jsonb NOT NULL DEFAULT '[]';
