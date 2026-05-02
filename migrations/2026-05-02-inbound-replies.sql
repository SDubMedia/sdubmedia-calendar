-- Storage for inbound email replies appended by api/inbound-email. Each
-- entry: { receivedAt, from, subject, body }. Owner sees a thread inside
-- Slate instead of in their personal inbox.

ALTER TABLE proposals
  ADD COLUMN IF NOT EXISTS inbound_replies jsonb NOT NULL DEFAULT '[]';

ALTER TABLE contracts
  ADD COLUMN IF NOT EXISTS inbound_replies jsonb NOT NULL DEFAULT '[]';
