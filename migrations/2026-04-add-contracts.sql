-- Contract templates (reusable)
create table if not exists contract_templates (
  id text primary key,
  org_id text not null default '',
  name text not null default '',
  content text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Contracts (sent to clients)
create table if not exists contracts (
  id text primary key,
  org_id text not null default '',
  template_id text references contract_templates(id) on delete set null,
  client_id text not null default '',
  project_id text,
  title text not null default '',
  content text not null default '',
  status text not null default 'draft',
  sent_at timestamptz,
  client_signed_at timestamptz,
  owner_signed_at timestamptz,
  client_signature jsonb,
  owner_signature jsonb,
  client_email text not null default '',
  sign_token text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table contract_templates enable row level security;
alter table contracts enable row level security;

create policy "owner_all_contract_templates" on contract_templates
  for all using (public.user_role() = 'owner');

create policy "owner_all_contracts" on contracts
  for all using (public.user_role() = 'owner');

create policy "client_read_own_contracts" on contracts
  for select using (
    public.user_role() = 'client'
    and client_id = any(public.user_client_ids())
  );
