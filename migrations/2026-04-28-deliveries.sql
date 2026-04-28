-- Slate Galleries — photo delivery + proofing system.
-- Clients access via tokenized public URL, optionally favorite N photos for
-- editing, optionally pay for extras above the org's per-gallery free limit.

-- ----------------------------------------------------------------------
-- deliveries — one row per gallery
-- ----------------------------------------------------------------------
create table if not exists deliveries (
  id text primary key,
  org_id text not null default '',
  project_id text,                                  -- nullable: galleries can exist without a project
  title text not null default '',
  cover_file_id text,                               -- references delivery_files.id, set after upload
  token text not null,                              -- public URL slug (random, ~16 chars)
  password_hash text,                               -- nullable; bcrypt if set
  expires_at timestamptz,                           -- nullable

  -- Proofing config (per-gallery)
  selection_limit int not null default 0,           -- 0 = no proofing feature; otherwise the "free picks" allowance
  per_extra_photo_cents int not null default 0,    -- 0 = no per-photo upsell
  buy_all_flat_cents int not null default 0,        -- 0 = no flat unlock-all option

  -- Lifecycle: draft -> sent -> submitted -> working -> delivered
  status text not null default 'draft',

  -- Captured at submission
  client_name text,
  client_email text,
  submitted_at timestamptz,
  working_at timestamptz,                           -- when org marks "in progress" — locks selections
  delivered_at timestamptz,

  view_count int not null default 0,
  download_count int not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists deliveries_token_idx on deliveries (token);
create index if not exists deliveries_org_id_idx on deliveries (org_id);
create index if not exists deliveries_project_id_idx on deliveries (project_id);

-- ----------------------------------------------------------------------
-- delivery_files — one row per uploaded photo
-- ----------------------------------------------------------------------
create table if not exists delivery_files (
  id text primary key,
  delivery_id text not null references deliveries(id) on delete cascade,
  org_id text not null default '',                  -- denormalized for RLS
  storage_path text not null,                       -- R2 key: <org_id>/<delivery_id>/<filename>
  original_name text not null default '',
  size_bytes bigint not null default 0,
  width int,
  height int,
  mime_type text not null default '',
  position int not null default 0,                  -- display order
  download_count int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists delivery_files_delivery_id_idx on delivery_files (delivery_id);
create index if not exists delivery_files_org_id_idx on delivery_files (org_id);

-- ----------------------------------------------------------------------
-- delivery_selections — one row per photo a client picked
-- ----------------------------------------------------------------------
create table if not exists delivery_selections (
  id text primary key,
  delivery_id text not null references deliveries(id) on delete cascade,
  file_id text not null references delivery_files(id) on delete cascade,
  org_id text not null default '',                  -- denormalized for RLS
  is_paid boolean not null default false,           -- true if part of a paid extras checkout
  stripe_payment_intent_id text,                    -- present if is_paid
  edited_at timestamptz,                            -- when org marks this selection as edited
  created_at timestamptz not null default now()
);

create unique index if not exists delivery_selections_unique_idx on delivery_selections (delivery_id, file_id);
create index if not exists delivery_selections_delivery_id_idx on delivery_selections (delivery_id);
create index if not exists delivery_selections_org_id_idx on delivery_selections (org_id);

-- ----------------------------------------------------------------------
-- RLS — clients access via API endpoints using service role (token-gated),
-- so RLS only needs to scope owner/partner/staff for the in-app UI.
-- ----------------------------------------------------------------------
alter table deliveries enable row level security;
alter table delivery_files enable row level security;
alter table delivery_selections enable row level security;

create policy "owner_all_deliveries" on deliveries
  for all using (public.user_role() = 'owner' and org_id = public.user_org_id());

create policy "owner_all_delivery_files" on delivery_files
  for all using (public.user_role() = 'owner' and org_id = public.user_org_id());

create policy "owner_all_delivery_selections" on delivery_selections
  for all using (public.user_role() = 'owner' and org_id = public.user_org_id());

-- Partner gets the same access as owner for galleries (collaborator pattern).
create policy "partner_all_deliveries" on deliveries
  for all using (public.user_role() = 'partner' and org_id = public.user_org_id());

create policy "partner_all_delivery_files" on delivery_files
  for all using (public.user_role() = 'partner' and org_id = public.user_org_id());

create policy "partner_all_delivery_selections" on delivery_selections
  for all using (public.user_role() = 'partner' and org_id = public.user_org_id());

-- Clients reading their own project's galleries when authenticated through Slate
-- (separate from the public token flow). Useful if a client has Slate access.
create policy "client_read_own_project_deliveries" on deliveries
  for select using (
    public.user_role() = 'client'
    and org_id = public.user_org_id()
    and project_id is not null
    and exists (
      select 1 from projects p
      where p.id = deliveries.project_id
        and p.client_id = any(public.user_client_ids())
    )
  );
