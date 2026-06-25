-- ============================================================
-- Foreign-key guardrail for the broker <-> agent link.
-- An agent's clients.broker_id must reference a real client row; if that broker
-- is deleted, the agent's link auto-clears (ON DELETE SET NULL) instead of
-- dangling. Prevents the orphaned / deleted-broker tangle that manual account
-- churn produced (agents pointing at brokers that no longer exist).
-- ============================================================

-- 1) Null out any existing dangling broker_ids so the constraint can attach.
update public.clients
set broker_id = null
where broker_id is not null
  and broker_id not in (select id from public.clients);

-- 2) Self-referential FK: agent.broker_id -> clients.id, cleared on broker delete.
alter table public.clients
  drop constraint if exists clients_broker_id_fkey;
alter table public.clients
  add constraint clients_broker_id_fkey
    foreign key (broker_id) references public.clients(id)
    on delete set null;
