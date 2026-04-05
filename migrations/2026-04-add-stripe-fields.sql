-- Stripe integration fields on organizations
alter table organizations add column if not exists stripe_account_id text;
alter table organizations add column if not exists stripe_customer_id text;
