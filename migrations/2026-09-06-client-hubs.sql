-- Client hubs: one permanent public link per client that shows every
-- DELIVERED gallery for that client (Geoff, 2026-09-06 — The Webb School
-- and CBSR have many filming days and want everything in one place).
--
-- Nothing is copied here: the hub is resolved live from the client's
-- projects → deliveries (status = delivered, not view-only). Proofing rounds
-- never appear until delivered. The row only holds the link token.

CREATE TABLE IF NOT EXISTS public.client_hubs (
  id text PRIMARY KEY DEFAULT ('hub_' || replace(gen_random_uuid()::text, '-', '')),
  org_id text NOT NULL DEFAULT '',
  client_id text NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, client_id)
);

ALTER TABLE public.client_hubs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner_all_client_hubs" ON public.client_hubs;
CREATE POLICY "owner_all_client_hubs" ON public.client_hubs FOR ALL USING (
  public.user_role() = 'owner' AND org_id = public.user_org_id()
);

-- Only the owner touches this table from the app (via api/client-hub.ts,
-- service role after an owner check). The public page reads by token
-- through api/hub-public.ts, also service role. No other role needs a policy.
