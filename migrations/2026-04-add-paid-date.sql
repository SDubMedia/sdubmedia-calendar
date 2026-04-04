-- Add paid_date to projects for tracking payment status
alter table projects add column if not exists paid_date text;
