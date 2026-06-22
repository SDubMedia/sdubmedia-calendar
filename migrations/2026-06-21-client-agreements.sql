-- One-time disclosure/agreement acceptance for agents and brokers. Agents must
-- accept the service + card-authorization terms before booking; brokers accept a
-- billing agreement. Versioned so updated terms can re-prompt only who needs it.
ALTER TABLE clients ADD COLUMN IF NOT EXISTS agreement_accepted_at timestamptz;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS agreement_version text;
