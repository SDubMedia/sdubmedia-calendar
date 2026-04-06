-- Proposal templates (reusable)
create table if not exists proposal_templates (
  id text primary key,
  org_id text not null default '',
  name text not null default '',
  line_items jsonb not null default '[]',
  contract_content text not null default '',
  payment_config jsonb not null default '{"option":"none","depositPercent":0,"depositAmount":0}',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Proposals (sent to clients)
create table if not exists proposals (
  id text primary key,
  org_id text not null default '',
  client_id text not null default '',
  project_id text,
  title text not null default '',
  line_items jsonb not null default '[]',
  subtotal numeric not null default 0,
  tax_rate numeric not null default 0,
  tax_amount numeric not null default 0,
  total numeric not null default 0,
  contract_content text not null default '',
  payment_config jsonb not null default '{"option":"none","depositPercent":0,"depositAmount":0}',
  status text not null default 'draft',
  sent_at timestamptz,
  accepted_at timestamptz,
  completed_at timestamptz,
  client_signature jsonb,
  owner_signature jsonb,
  invoice_id text,
  stripe_session_id text,
  paid_at timestamptz,
  client_email text not null default '',
  view_token text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table proposal_templates enable row level security;
alter table proposals enable row level security;

create policy "owner_all_proposal_templates" on proposal_templates
  for all using (public.user_role() = 'owner');

create policy "owner_all_proposals" on proposals
  for all using (public.user_role() = 'owner');

create policy "client_read_own_proposals" on proposals
  for select using (
    public.user_role() = 'client'
    and client_id = any(public.user_client_ids())
  );
