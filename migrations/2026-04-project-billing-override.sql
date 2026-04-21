-- Per-project override of the client's default billing model.
-- When set on a project, it wins over the client's default.
-- NULL = inherit from client (the normal case).

alter table projects
  add column if not exists billing_model text,
  add column if not exists billing_rate numeric;

-- Optional sanity constraint: billing_model is hourly | per_project | null
alter table projects
  drop constraint if exists projects_billing_model_check;
alter table projects
  add constraint projects_billing_model_check
  check (billing_model is null or billing_model in ('hourly','per_project'));
