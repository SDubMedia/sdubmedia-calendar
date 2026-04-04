-- Business info (address, phone, email, EIN) on organizations
alter table organizations add column if not exists business_info jsonb not null default '{}';
