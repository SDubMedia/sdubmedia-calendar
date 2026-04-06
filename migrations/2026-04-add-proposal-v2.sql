-- Proposal V2: multi-page documents, selectable packages, payment milestones, pipeline

-- Add new columns to proposal_templates
ALTER TABLE proposal_templates ADD COLUMN IF NOT EXISTS cover_image_url text NOT NULL DEFAULT '';
ALTER TABLE proposal_templates ADD COLUMN IF NOT EXISTS pages jsonb NOT NULL DEFAULT '[]';
ALTER TABLE proposal_templates ADD COLUMN IF NOT EXISTS packages jsonb NOT NULL DEFAULT '[]';

-- Add new columns to proposals
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS pages jsonb NOT NULL DEFAULT '[]';
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS packages jsonb NOT NULL DEFAULT '[]';
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS selected_package_id text;
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS payment_milestones jsonb NOT NULL DEFAULT '[]';
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS pipeline_stage text NOT NULL DEFAULT 'inquiry';
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS viewed_at timestamptz;
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS lead_source text NOT NULL DEFAULT '';

-- Pipeline leads table (pre-proposal CRM tracking)
CREATE TABLE IF NOT EXISTS pipeline_leads (
  id text PRIMARY KEY,
  org_id text NOT NULL DEFAULT '',
  client_id text,
  name text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  project_type text NOT NULL DEFAULT '',
  event_date text,
  location text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  lead_source text NOT NULL DEFAULT '',
  pipeline_stage text NOT NULL DEFAULT 'inquiry',
  proposal_id text,
  recent_activity text NOT NULL DEFAULT '',
  recent_activity_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE pipeline_leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_all_pipeline_leads" ON pipeline_leads
  FOR ALL USING (public.user_role() = 'owner');
