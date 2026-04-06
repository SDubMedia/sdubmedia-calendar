-- Add service catalog to organizations
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS services jsonb NOT NULL DEFAULT '[]';
