-- Products: reusable catalog of per-house software/tool costs (e.g. Fotello).
-- Lets the owner record a fixed per-shoot product cost that counts against
-- per-house profit. Owner-only — financial/cost data, not visible to staff,
-- partners, or clients (silent denial via missing policies).

CREATE TABLE IF NOT EXISTS products (
  id text PRIMARY KEY,
  org_id text NOT NULL DEFAULT '',
  name text NOT NULL DEFAULT '',
  unit_cost numeric NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS products_org_idx ON products (org_id);

ALTER TABLE products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner_all_products" ON products;
CREATE POLICY "owner_all_products" ON products
  FOR ALL USING (
    public.user_role() = 'owner'
    AND org_id = public.user_org_id()
  );
