-- Add feature flags and defaults to organizations
alter table organizations
  add column if not exists features jsonb not null default '{"calendar":true,"crewManagement":true,"invoicing":true,"mileage":false,"expenses":false,"clientPortal":false,"contentSeries":false,"partnerSplits":false}',
  add column if not exists production_type text not null default 'both',
  add column if not exists default_billing_model text not null default 'hourly',
  add column if not exists default_billing_rate numeric not null default 0;
