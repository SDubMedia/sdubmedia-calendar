-- Dashboard widget configuration
alter table organizations add column if not exists dashboard_widgets jsonb;
