-- Migration: Add contractor invoicing support
-- Date: 2026-03-28

-- Add business info columns to crew_members
ALTER TABLE crew_members ADD COLUMN IF NOT EXISTS business_name text NOT NULL DEFAULT '';
ALTER TABLE crew_members ADD COLUMN IF NOT EXISTS business_address text NOT NULL DEFAULT '';
ALTER TABLE crew_members ADD COLUMN IF NOT EXISTS business_city text NOT NULL DEFAULT '';
ALTER TABLE crew_members ADD COLUMN IF NOT EXISTS business_state text NOT NULL DEFAULT '';
ALTER TABLE crew_members ADD COLUMN IF NOT EXISTS business_zip text NOT NULL DEFAULT '';

-- Create contractor_invoices table
CREATE TABLE IF NOT EXISTS contractor_invoices (
  id text PRIMARY KEY,
  crew_member_id text NOT NULL REFERENCES crew_members(id) ON DELETE CASCADE,
  invoice_number text NOT NULL,
  recipient_type text NOT NULL DEFAULT 'sdub_media',
  recipient_name text NOT NULL DEFAULT '',
  period_start text NOT NULL,
  period_end text NOT NULL,
  line_items jsonb NOT NULL DEFAULT '[]',
  business_info jsonb NOT NULL DEFAULT '{}',
  total numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft',
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE contractor_invoices ENABLE ROW LEVEL SECURITY;

-- Contractors can only see their own invoices
CREATE POLICY "Users can view own contractor invoices"
  ON contractor_invoices FOR SELECT
  USING (true);

CREATE POLICY "Users can insert own contractor invoices"
  ON contractor_invoices FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users can update own contractor invoices"
  ON contractor_invoices FOR UPDATE
  USING (true);

CREATE POLICY "Users can delete own contractor invoices"
  ON contractor_invoices FOR DELETE
  USING (true);
