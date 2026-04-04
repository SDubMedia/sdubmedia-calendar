-- W-9 tax ID for 1099 filing (owner-only, sensitive)
alter table crew_members
  add column if not exists tax_id text not null default '',
  add column if not exists tax_id_type text not null default '';
