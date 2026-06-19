-- Shoot Requests: an agent (client-role user, scoped to their own agent client
-- record) requests a real-estate shoot for one of their listings. This is an
-- UNTRUSTED request, not a confirmed booking — it lands in a pending queue the
-- owner reviews, then approves (converting it into a real project with a chosen
-- date/time) or declines. The request never writes the live calendar directly.
--
-- Reuses the existing `client` role + per-client scoping (user_client_ids()).
-- The agent is identified by client_id (their agent client record); the broker
-- is resolved from that client's broker_id at conversion time, so billing still
-- rolls up to the broker exactly like a normally-entered shoot.

CREATE TABLE IF NOT EXISTS shoot_requests (
  id text PRIMARY KEY,
  org_id text NOT NULL DEFAULT '',
  -- The agent's client record (clientType='agent'). Whose listing this is.
  client_id text NOT NULL,
  property_address text NOT NULL DEFAULT '',
  -- Preferred date is the agent's wish; the owner sets the real date on approval.
  preferred_date date,
  notes text NOT NULL DEFAULT '',
  -- Snapshot of the pieces the agent asked for: [{serviceId, variantId, label, price}].
  -- Price is the agent-visible catalog price (broker's rate), not internal cost.
  requested_services jsonb NOT NULL DEFAULT '[]',
  -- pending → scheduled (approved+converted) | declined
  status text NOT NULL DEFAULT 'pending',
  -- Set when the owner approves and a real project is created from this request.
  project_id text,
  -- Optional owner note shown back to the agent (e.g. why it was declined).
  owner_response text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS shoot_requests_org_idx ON shoot_requests (org_id);
CREATE INDEX IF NOT EXISTS shoot_requests_client_idx ON shoot_requests (client_id);
CREATE INDEX IF NOT EXISTS shoot_requests_status_idx ON shoot_requests (status);

ALTER TABLE shoot_requests ENABLE ROW LEVEL SECURITY;

-- Owner: full control over every request in their org.
DROP POLICY IF EXISTS "owner_all_shoot_requests" ON shoot_requests;
CREATE POLICY "owner_all_shoot_requests" ON shoot_requests
  FOR ALL USING (
    public.user_role() = 'owner'
    AND org_id = public.user_org_id()
  );

-- Partner: read-only visibility into requests (same as other production data).
DROP POLICY IF EXISTS "partner_read_shoot_requests" ON shoot_requests;
CREATE POLICY "partner_read_shoot_requests" ON shoot_requests
  FOR SELECT USING (
    public.user_role() = 'partner'
    AND org_id = public.user_org_id()
  );

-- Agent (client role): may CREATE a request only for their OWN agent record,
-- and READ only their own requests. No update/delete — once submitted, only the
-- owner acts on it. This is the only place the client role can INSERT, and it is
-- tightly scoped to their own client_id.
DROP POLICY IF EXISTS "client_insert_own_shoot_requests" ON shoot_requests;
CREATE POLICY "client_insert_own_shoot_requests" ON shoot_requests
  FOR INSERT WITH CHECK (
    public.user_role() = 'client'
    AND org_id = public.user_org_id()
    AND client_id = ANY(public.user_client_ids())
  );

DROP POLICY IF EXISTS "client_read_own_shoot_requests" ON shoot_requests;
CREATE POLICY "client_read_own_shoot_requests" ON shoot_requests
  FOR SELECT USING (
    public.user_role() = 'client'
    AND org_id = public.user_org_id()
    AND client_id = ANY(public.user_client_ids())
  );
