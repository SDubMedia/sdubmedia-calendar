-- Agents save a card on file (not charged) before they can request shoots — a
-- fallback if a broker doesn't pay. Stored on the agent's client record; the
-- card itself lives on the org's connected Stripe account (charged manually).
ALTER TABLE clients ADD COLUMN IF NOT EXISTS stripe_customer_id text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS card_on_file boolean NOT NULL DEFAULT false;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS card_brand text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS card_last4 text;
