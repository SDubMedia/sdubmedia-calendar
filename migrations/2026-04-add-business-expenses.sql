-- Business expenses (owner credit card / receipts)
create table if not exists business_expenses (
  id text primary key,
  org_id text not null default '' references organizations(id) on delete cascade,
  date text not null,
  description text not null default '',
  category text not null default 'Other',
  amount numeric not null default 0,
  serial_number text not null default '',
  notes text not null default '',
  chase_category text not null default '',
  created_at timestamptz not null default now()
);

-- Keyword → category auto-categorization rules
create table if not exists category_rules (
  id text primary key,
  org_id text not null default '' references organizations(id) on delete cascade,
  keyword text not null,
  category text not null,
  created_at timestamptz not null default now(),
  unique(org_id, keyword)
);

alter table business_expenses enable row level security;
alter table category_rules enable row level security;

create policy "owner_all_business_expenses" on business_expenses
  for all using (public.user_role() = 'owner' and org_id = public.user_org_id());

create policy "owner_all_category_rules" on category_rules
  for all using (public.user_role() = 'owner' and org_id = public.user_org_id());
