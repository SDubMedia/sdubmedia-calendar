-- Customer testimonials — captured in-app, moderated before publishing.
create table if not exists testimonials (
  id text primary key,
  org_id text not null default '' references organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  content text not null,
  author_name text not null default '',
  author_company text not null default '',
  status text not null default 'pending',
  trigger text not null default '',
  submitted_at timestamptz not null default now(),
  approved_at timestamptz,
  constraint testimonials_status_check check (status in ('pending', 'approved', 'hidden'))
);

alter table testimonials enable row level security;

-- Owner can read/write testimonials in their own org.
create policy "owner_all_testimonials" on testimonials
  for all using (public.user_role() = 'owner' and org_id = public.user_org_id());

-- Mark the org once it's been prompted so we don't re-prompt.
alter table organizations
  add column if not exists testimonial_prompted_at timestamptz;
