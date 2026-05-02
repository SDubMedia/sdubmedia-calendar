-- Central Packages library (Sub-Phase 1A expansion / Sub-Phase 1B foundation).
-- Owner-administered org-wide list of services that can be reused across any
-- proposal template or proposal. Each Package becomes a draggable card in the
-- proposal editor's right sidebar and resolves the package_row block.

CREATE TABLE IF NOT EXISTS packages (
  id text PRIMARY KEY,
  org_id text NOT NULL DEFAULT '',
  name text NOT NULL DEFAULT '',
  icon text NOT NULL DEFAULT 'heart',         -- key into the curated Lucide vocabulary
  description text NOT NULL DEFAULT '',
  default_price numeric NOT NULL DEFAULT 0,
  discount_from_price numeric,                -- nullable; renders as strikethrough crossed-out price
  photo_data_url text NOT NULL DEFAULT '',    -- v1 data URL (≤500KB); R2 migration is its own task
  deliverables jsonb NOT NULL DEFAULT '[]',   -- string[] — bullets shown under description
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS packages_org_idx ON packages (org_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS packages_org_sort_idx ON packages (org_id, sort_order) WHERE deleted_at IS NULL;

ALTER TABLE packages ENABLE ROW LEVEL SECURITY;

-- Owner: full CRUD within org. Owner is the sole admin of the Packages library
-- per the Templates & Inquiry Pipeline PRD.
DROP POLICY IF EXISTS "owner_all_packages" ON packages;
CREATE POLICY "owner_all_packages" ON packages
  FOR ALL
  USING (public.user_role() = 'owner' AND org_id = public.user_org_id())
  WITH CHECK (public.user_role() = 'owner' AND org_id = public.user_org_id());

-- Staff read access is added when the per-user toggle UI ships in Phase 2.
-- For MVP the table is owner-only.
