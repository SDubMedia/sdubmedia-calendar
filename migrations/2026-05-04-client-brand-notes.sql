-- Per-client brand & voice notes. Long-form text the owner curates
-- describing who the client is, what they sell, who their audience is,
-- their voice/tone, social handles, products, etc. Used as context
-- in the series-chat AI so suggestions are grounded in the client's
-- actual brand instead of generic advice.

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS brand_notes text NOT NULL DEFAULT '';
