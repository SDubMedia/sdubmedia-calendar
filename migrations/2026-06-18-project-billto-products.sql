-- Broker billing on a shoot: where the invoice goes + per-house product costs.
-- bill_to_id: when set, this project bills to that client (a broker) instead of
--   client_id. When null, the payer is resolved from the client (an agent bills
--   up to their broker).
-- products: snapshot of per-house product/software costs used on the shoot
--   (e.g. [{ "productId": "...", "name": "Fotello", "cost": 25 }]).
-- Existing rows default to null / [] — no behavior change.

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS bill_to_id text;

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS products jsonb NOT NULL DEFAULT '[]';
