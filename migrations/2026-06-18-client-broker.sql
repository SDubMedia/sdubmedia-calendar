-- Real-estate broker billing: classify clients and link agents to a broker.
-- "broker" = office that pays for its agents' shoots; "agent" = belongs to a
-- broker (broker_id) and their shoots can bill up to that broker; "standard" =
-- a normal client. Existing rows default to "standard" — no behavior change.

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS client_type text NOT NULL DEFAULT 'standard';

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS broker_id text;

-- Fast lookup of an office's agents.
CREATE INDEX IF NOT EXISTS clients_broker_id_idx ON clients (broker_id);
