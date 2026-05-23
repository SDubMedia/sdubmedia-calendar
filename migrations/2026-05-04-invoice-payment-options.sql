-- Per-invoice payment options + a public view token. The owner picks
-- which methods (stripe / venmo) the client will see on the public
-- payment page. The view_token gates that public page so anyone with
-- the link can pay — no login required (same pattern as proposals,
-- contracts, and deliveries).

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS payment_methods text[] NOT NULL DEFAULT ARRAY['stripe']::text[],
  ADD COLUMN IF NOT EXISTS view_token text;

-- Index the token for fast public-page lookups.
CREATE UNIQUE INDEX IF NOT EXISTS invoices_view_token_idx ON invoices(view_token) WHERE view_token IS NOT NULL;

-- No public read policy — the public-fetch API uses the service-role
-- key and resolves the token in its WHERE clause. Adding a permissive
-- "anyone with the token" policy would expose every tokened invoice
-- via the anon key, since RLS can't see the request's intended token.
