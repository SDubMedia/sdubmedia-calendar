-- Enable Supabase Realtime for all app tables
-- Run this in the Supabase SQL Editor if realtime isn't working

-- Add all tables to the realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE clients;
ALTER PUBLICATION supabase_realtime ADD TABLE crew_members;
ALTER PUBLICATION supabase_realtime ADD TABLE locations;
ALTER PUBLICATION supabase_realtime ADD TABLE project_types;
ALTER PUBLICATION supabase_realtime ADD TABLE projects;
ALTER PUBLICATION supabase_realtime ADD TABLE marketing_expenses;
ALTER PUBLICATION supabase_realtime ADD TABLE invoices;
ALTER PUBLICATION supabase_realtime ADD TABLE contractor_invoices;
ALTER PUBLICATION supabase_realtime ADD TABLE crew_location_distances;
ALTER PUBLICATION supabase_realtime ADD TABLE manual_trips;
ALTER PUBLICATION supabase_realtime ADD TABLE business_expenses;
ALTER PUBLICATION supabase_realtime ADD TABLE category_rules;
ALTER PUBLICATION supabase_realtime ADD TABLE time_entries;
ALTER PUBLICATION supabase_realtime ADD TABLE contract_templates;
ALTER PUBLICATION supabase_realtime ADD TABLE contracts;
ALTER PUBLICATION supabase_realtime ADD TABLE proposal_templates;
ALTER PUBLICATION supabase_realtime ADD TABLE proposals;
ALTER PUBLICATION supabase_realtime ADD TABLE pipeline_leads;
ALTER PUBLICATION supabase_realtime ADD TABLE series;
ALTER PUBLICATION supabase_realtime ADD TABLE organizations;

-- Set REPLICA IDENTITY FULL so UPDATE/DELETE events include the full row
-- (default is DEFAULT which only sends the primary key for old rows)
ALTER TABLE clients REPLICA IDENTITY FULL;
ALTER TABLE crew_members REPLICA IDENTITY FULL;
ALTER TABLE locations REPLICA IDENTITY FULL;
ALTER TABLE project_types REPLICA IDENTITY FULL;
ALTER TABLE projects REPLICA IDENTITY FULL;
ALTER TABLE marketing_expenses REPLICA IDENTITY FULL;
ALTER TABLE invoices REPLICA IDENTITY FULL;
ALTER TABLE contractor_invoices REPLICA IDENTITY FULL;
ALTER TABLE crew_location_distances REPLICA IDENTITY FULL;
ALTER TABLE manual_trips REPLICA IDENTITY FULL;
ALTER TABLE business_expenses REPLICA IDENTITY FULL;
ALTER TABLE category_rules REPLICA IDENTITY FULL;
ALTER TABLE time_entries REPLICA IDENTITY FULL;
ALTER TABLE contract_templates REPLICA IDENTITY FULL;
ALTER TABLE contracts REPLICA IDENTITY FULL;
ALTER TABLE proposal_templates REPLICA IDENTITY FULL;
ALTER TABLE proposals REPLICA IDENTITY FULL;
ALTER TABLE pipeline_leads REPLICA IDENTITY FULL;
ALTER TABLE series REPLICA IDENTITY FULL;
ALTER TABLE organizations REPLICA IDENTITY FULL;
