-- Fix contractor_invoices RLS policies (previously USING (true) = no security)

-- Add org_id column if missing
ALTER TABLE contractor_invoices ADD COLUMN IF NOT EXISTS org_id text NOT NULL DEFAULT '';

-- Drop overly permissive policies
DROP POLICY IF EXISTS "Users can view own contractor invoices" ON contractor_invoices;
DROP POLICY IF EXISTS "Users can insert own contractor invoices" ON contractor_invoices;
DROP POLICY IF EXISTS "Users can update own contractor invoices" ON contractor_invoices;
DROP POLICY IF EXISTS "Users can delete own contractor invoices" ON contractor_invoices;

-- Replace with proper role-based policies
CREATE POLICY "owner_all_contractor_invoices" ON contractor_invoices
  FOR ALL USING (public.user_role() = 'owner');

CREATE POLICY "partner_read_contractor_invoices" ON contractor_invoices
  FOR SELECT USING (public.user_role() = 'partner');
