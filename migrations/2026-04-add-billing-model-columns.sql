-- ============================================================
-- Add billing model columns to clients + project_rate to projects
-- Run in Supabase SQL Editor
-- ============================================================

-- ---- Clients: billing settings ----
alter table clients
  add column if not exists billing_model text not null default 'hourly',
  add column if not exists billing_rate_per_hour numeric not null default 0,
  add column if not exists per_project_rate numeric not null default 0,
  add column if not exists project_type_rates jsonb not null default '[]',
  add column if not exists allowed_project_type_ids text[] not null default '{}',
  add column if not exists default_project_type_id text not null default '',
  add column if not exists role_billing_multipliers jsonb not null default '[]';

-- ---- Crew Members: role rates + default pay rate ----
alter table crew_members
  add column if not exists role_rates jsonb not null default '[]',
  add column if not exists default_pay_rate_per_hour numeric not null default 0;

-- ---- Projects: per-project rate override ----
alter table projects
  add column if not exists project_rate numeric;
