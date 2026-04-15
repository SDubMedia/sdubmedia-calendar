-- ============================================================
-- CRITICAL: Lock down all tables with proper RLS
-- Supabase flagged publicly accessible tables
-- This ensures every table has RLS enabled and proper policies
-- ============================================================

-- Enable RLS on ALL tables (idempotent — safe to run if already enabled)
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE crew_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE personal_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE manual_trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE contractor_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE series ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE proposal_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE crew_location_distances ENABLE ROW LEVEL SECURITY;
ALTER TABLE category_rules ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- Drop and recreate policies for ALL org-scoped tables
-- Pattern: owner gets full access, scoped by org_id
-- ============================================================

-- Helper: ensure user_role() and user_org_id() functions exist
-- (These should already exist from initial setup)

-- clients
DROP POLICY IF EXISTS "owner_all_clients" ON clients;
CREATE POLICY "owner_all_clients" ON clients
  FOR ALL USING (public.user_role() = 'owner' AND org_id = public.user_org_id());
DROP POLICY IF EXISTS "partner_read_clients" ON clients;
CREATE POLICY "partner_read_clients" ON clients
  FOR SELECT USING (public.user_role() = 'partner' AND org_id = public.user_org_id());
DROP POLICY IF EXISTS "staff_read_clients" ON clients;
CREATE POLICY "staff_read_clients" ON clients
  FOR SELECT USING (public.user_role() = 'staff' AND org_id = public.user_org_id());
DROP POLICY IF EXISTS "client_read_clients" ON clients;
CREATE POLICY "client_read_clients" ON clients
  FOR SELECT USING (public.user_role() = 'client' AND org_id = public.user_org_id());

-- crew_members
DROP POLICY IF EXISTS "owner_all_crew_members" ON crew_members;
CREATE POLICY "owner_all_crew_members" ON crew_members
  FOR ALL USING (public.user_role() = 'owner' AND org_id = public.user_org_id());
DROP POLICY IF EXISTS "partner_read_crew" ON crew_members;
CREATE POLICY "partner_read_crew" ON crew_members
  FOR SELECT USING (public.user_role() = 'partner' AND org_id = public.user_org_id());
DROP POLICY IF EXISTS "staff_read_crew" ON crew_members;
CREATE POLICY "staff_read_crew" ON crew_members
  FOR SELECT USING (public.user_role() = 'staff' AND org_id = public.user_org_id());

-- projects
DROP POLICY IF EXISTS "owner_all_projects" ON projects;
CREATE POLICY "owner_all_projects" ON projects
  FOR ALL USING (public.user_role() = 'owner' AND org_id = public.user_org_id());
DROP POLICY IF EXISTS "partner_read_projects" ON projects;
CREATE POLICY "partner_read_projects" ON projects
  FOR SELECT USING (public.user_role() = 'partner' AND org_id = public.user_org_id());
DROP POLICY IF EXISTS "staff_read_projects" ON projects;
CREATE POLICY "staff_read_projects" ON projects
  FOR SELECT USING (public.user_role() = 'staff' AND org_id = public.user_org_id());
DROP POLICY IF EXISTS "client_read_projects" ON projects;
CREATE POLICY "client_read_projects" ON projects
  FOR SELECT USING (public.user_role() = 'client' AND org_id = public.user_org_id());

-- locations
DROP POLICY IF EXISTS "owner_all_locations" ON locations;
CREATE POLICY "owner_all_locations" ON locations
  FOR ALL USING (public.user_role() = 'owner' AND org_id = public.user_org_id());
DROP POLICY IF EXISTS "partner_read_locations" ON locations;
CREATE POLICY "partner_read_locations" ON locations
  FOR SELECT USING (public.user_role() IN ('partner', 'staff', 'client', 'family') AND org_id = public.user_org_id());

-- project_types
DROP POLICY IF EXISTS "owner_all_project_types" ON project_types;
CREATE POLICY "owner_all_project_types" ON project_types
  FOR ALL USING (public.user_role() = 'owner' AND org_id = public.user_org_id());
DROP POLICY IF EXISTS "others_read_project_types" ON project_types;
CREATE POLICY "others_read_project_types" ON project_types
  FOR SELECT USING (public.user_role() IN ('partner', 'staff', 'client', 'family') AND org_id = public.user_org_id());

-- invoices
DROP POLICY IF EXISTS "owner_all_invoices" ON invoices;
CREATE POLICY "owner_all_invoices" ON invoices
  FOR ALL USING (public.user_role() = 'owner' AND org_id = public.user_org_id());
DROP POLICY IF EXISTS "partner_read_invoices" ON invoices;
CREATE POLICY "partner_read_invoices" ON invoices
  FOR SELECT USING (public.user_role() = 'partner' AND org_id = public.user_org_id());
DROP POLICY IF EXISTS "client_read_invoices" ON invoices;
CREATE POLICY "client_read_invoices" ON invoices
  FOR SELECT USING (public.user_role() = 'client' AND org_id = public.user_org_id());

-- organizations
DROP POLICY IF EXISTS "owner_all_organizations" ON organizations;
CREATE POLICY "owner_all_organizations" ON organizations
  FOR ALL USING (public.user_role() = 'owner' AND org_id = id);
DROP POLICY IF EXISTS "members_read_org" ON organizations;
CREATE POLICY "members_read_org" ON organizations
  FOR SELECT USING (public.user_role() IN ('partner', 'staff', 'client', 'family') AND id = public.user_org_id());

-- user_profiles
DROP POLICY IF EXISTS "owner_all_profiles" ON user_profiles;
CREATE POLICY "owner_all_profiles" ON user_profiles
  FOR ALL USING (public.user_role() = 'owner' AND org_id = public.user_org_id());
DROP POLICY IF EXISTS "self_read_profile" ON user_profiles;
CREATE POLICY "self_read_profile" ON user_profiles
  FOR SELECT USING (id = auth.uid());
DROP POLICY IF EXISTS "self_update_profile" ON user_profiles;
CREATE POLICY "self_update_profile" ON user_profiles
  FOR UPDATE USING (id = auth.uid());

-- marketing_expenses
DROP POLICY IF EXISTS "owner_all_marketing_expenses" ON marketing_expenses;
CREATE POLICY "owner_all_marketing_expenses" ON marketing_expenses
  FOR ALL USING (public.user_role() = 'owner' AND org_id = public.user_org_id());

-- business_expenses
DROP POLICY IF EXISTS "owner_all_business_expenses" ON business_expenses;
CREATE POLICY "owner_all_business_expenses" ON business_expenses
  FOR ALL USING (public.user_role() = 'owner' AND org_id = public.user_org_id());

-- manual_trips
DROP POLICY IF EXISTS "owner_all_manual_trips" ON manual_trips;
CREATE POLICY "owner_all_manual_trips" ON manual_trips
  FOR ALL USING (public.user_role() = 'owner' AND org_id = public.user_org_id());
DROP POLICY IF EXISTS "staff_own_trips" ON manual_trips;
CREATE POLICY "staff_own_trips" ON manual_trips
  FOR ALL USING (public.user_role() = 'staff' AND org_id = public.user_org_id());

-- contractor_invoices
DROP POLICY IF EXISTS "owner_all_contractor_invoices" ON contractor_invoices;
CREATE POLICY "owner_all_contractor_invoices" ON contractor_invoices
  FOR ALL USING (public.user_role() = 'owner' AND org_id = public.user_org_id());
DROP POLICY IF EXISTS "partner_read_contractor_invoices" ON contractor_invoices;
CREATE POLICY "partner_read_contractor_invoices" ON contractor_invoices
  FOR SELECT USING (public.user_role() = 'partner' AND org_id = public.user_org_id());

-- time_entries
DROP POLICY IF EXISTS "owner_all_time_entries" ON time_entries;
CREATE POLICY "owner_all_time_entries" ON time_entries
  FOR ALL USING (public.user_role() = 'owner' AND org_id = public.user_org_id());
DROP POLICY IF EXISTS "staff_own_time_entries" ON time_entries;
CREATE POLICY "staff_own_time_entries" ON time_entries
  FOR ALL USING (public.user_role() = 'staff' AND org_id = public.user_org_id());

-- contracts
DROP POLICY IF EXISTS "owner_all_contracts" ON contracts;
CREATE POLICY "owner_all_contracts" ON contracts
  FOR ALL USING (public.user_role() = 'owner' AND org_id = public.user_org_id());
DROP POLICY IF EXISTS "client_read_contracts" ON contracts;
CREATE POLICY "client_read_contracts" ON contracts
  FOR SELECT USING (public.user_role() = 'client' AND org_id = public.user_org_id());

-- proposals
DROP POLICY IF EXISTS "owner_all_proposals" ON proposals;
CREATE POLICY "owner_all_proposals" ON proposals
  FOR ALL USING (public.user_role() = 'owner' AND org_id = public.user_org_id());
DROP POLICY IF EXISTS "client_read_proposals" ON proposals;
CREATE POLICY "client_read_proposals" ON proposals
  FOR SELECT USING (public.user_role() = 'client' AND org_id = public.user_org_id());

-- pipeline_leads
DROP POLICY IF EXISTS "owner_all_pipeline_leads" ON pipeline_leads;
CREATE POLICY "owner_all_pipeline_leads" ON pipeline_leads
  FOR ALL USING (public.user_role() = 'owner' AND org_id = public.user_org_id());

-- series
DROP POLICY IF EXISTS "owner_all_series" ON series;
CREATE POLICY "owner_all_series" ON series
  FOR ALL USING (public.user_role() = 'owner' AND org_id = public.user_org_id());
DROP POLICY IF EXISTS "others_read_series" ON series;
CREATE POLICY "others_read_series" ON series
  FOR SELECT USING (public.user_role() IN ('partner', 'staff', 'client') AND org_id = public.user_org_id());

-- contract_templates
DROP POLICY IF EXISTS "owner_all_contract_templates" ON contract_templates;
CREATE POLICY "owner_all_contract_templates" ON contract_templates
  FOR ALL USING (public.user_role() = 'owner' AND org_id = public.user_org_id());

-- proposal_templates
DROP POLICY IF EXISTS "owner_all_proposal_templates" ON proposal_templates;
CREATE POLICY "owner_all_proposal_templates" ON proposal_templates
  FOR ALL USING (public.user_role() = 'owner' AND org_id = public.user_org_id());

-- crew_location_distances
DROP POLICY IF EXISTS "owner_all_distances" ON crew_location_distances;
CREATE POLICY "owner_all_distances" ON crew_location_distances
  FOR ALL USING (public.user_role() = 'owner' AND org_id = public.user_org_id());
DROP POLICY IF EXISTS "staff_read_distances" ON crew_location_distances;
CREATE POLICY "staff_read_distances" ON crew_location_distances
  FOR SELECT USING (public.user_role() = 'staff' AND org_id = public.user_org_id());

-- category_rules
DROP POLICY IF EXISTS "owner_all_category_rules" ON category_rules;
CREATE POLICY "owner_all_category_rules" ON category_rules
  FOR ALL USING (public.user_role() = 'owner' AND org_id = public.user_org_id());

-- personal_events (ensure family + owner access)
DROP POLICY IF EXISTS "owner_all_personal_events" ON personal_events;
CREATE POLICY "owner_all_personal_events" ON personal_events
  FOR ALL USING (public.user_role() = 'owner' AND org_id = public.user_org_id());
DROP POLICY IF EXISTS "family_all_personal_events" ON personal_events;
CREATE POLICY "family_all_personal_events" ON personal_events
  FOR ALL USING (public.user_role() = 'family' AND org_id = public.user_org_id());

-- Family read access for production calendar (read-only)
DROP POLICY IF EXISTS "family_read_projects" ON projects;
CREATE POLICY "family_read_projects" ON projects
  FOR SELECT USING (public.user_role() = 'family' AND org_id = public.user_org_id());
DROP POLICY IF EXISTS "family_read_clients" ON clients;
CREATE POLICY "family_read_clients" ON clients
  FOR SELECT USING (public.user_role() = 'family' AND org_id = public.user_org_id());
