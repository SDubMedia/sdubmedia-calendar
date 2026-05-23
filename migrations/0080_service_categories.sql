-- ============================================================
-- Service Categories model
--
-- Replaces (alongside, not replacing) flat project_types with a
-- hierarchical pricing model:
--   Category  (e.g. "Real Estate Shoot")
--     Service  (e.g. "Photos", "Video", "Drone")
--       Variant (e.g. "2,000-3,000 sqft" — $350)
--
-- A service with zero variants uses its default_price.
-- A service with N variants requires the user to pick one when
-- adding it to a project.
--
-- Per-client overrides live on clients.service_rates (JSONB):
--   [{ "serviceId": "...", "variantId": "...|null", "rate": 250 }]
-- ============================================================

-- ---- service_categories ----
CREATE TABLE IF NOT EXISTS public.service_categories (
  id         text PRIMARY KEY,
  org_id     text NOT NULL DEFAULT '',
  name       text NOT NULL,
  position   int  NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS service_categories_org_idx ON public.service_categories (org_id) WHERE deleted_at IS NULL;
ALTER TABLE public.service_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner_all_service_categories" ON public.service_categories;
CREATE POLICY "owner_all_service_categories" ON public.service_categories
  FOR ALL USING (public.user_role() = 'owner' AND org_id = public.user_org_id());

DROP POLICY IF EXISTS "staff_read_service_categories" ON public.service_categories;
CREATE POLICY "staff_read_service_categories" ON public.service_categories
  FOR SELECT USING (public.user_role() = 'staff' AND org_id = public.user_org_id());

DROP POLICY IF EXISTS "client_read_service_categories" ON public.service_categories;
CREATE POLICY "client_read_service_categories" ON public.service_categories
  FOR SELECT USING (public.user_role() = 'client' AND org_id = public.user_org_id());

DROP POLICY IF EXISTS "family_read_service_categories" ON public.service_categories;
CREATE POLICY "family_read_service_categories" ON public.service_categories
  FOR SELECT USING (public.user_role() = 'family' AND org_id = public.user_org_id());


-- ---- services ----
CREATE TABLE IF NOT EXISTS public.services (
  id            text PRIMARY KEY,
  org_id        text NOT NULL DEFAULT '',
  category_id   text NOT NULL REFERENCES public.service_categories(id) ON DELETE CASCADE,
  name          text NOT NULL,
  default_price numeric NOT NULL DEFAULT 0,
  position      int  NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz
);
CREATE INDEX IF NOT EXISTS services_org_idx ON public.services (org_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS services_category_idx ON public.services (category_id) WHERE deleted_at IS NULL;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner_all_services" ON public.services;
CREATE POLICY "owner_all_services" ON public.services
  FOR ALL USING (public.user_role() = 'owner' AND org_id = public.user_org_id());

DROP POLICY IF EXISTS "staff_read_services" ON public.services;
CREATE POLICY "staff_read_services" ON public.services
  FOR SELECT USING (public.user_role() = 'staff' AND org_id = public.user_org_id());

DROP POLICY IF EXISTS "client_read_services" ON public.services;
CREATE POLICY "client_read_services" ON public.services
  FOR SELECT USING (public.user_role() = 'client' AND org_id = public.user_org_id());

DROP POLICY IF EXISTS "family_read_services" ON public.services;
CREATE POLICY "family_read_services" ON public.services
  FOR SELECT USING (public.user_role() = 'family' AND org_id = public.user_org_id());


-- ---- service_variants ----
CREATE TABLE IF NOT EXISTS public.service_variants (
  id          text PRIMARY KEY,
  org_id      text NOT NULL DEFAULT '',
  service_id  text NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  label       text NOT NULL,
  price       numeric NOT NULL DEFAULT 0,
  position    int  NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);
CREATE INDEX IF NOT EXISTS service_variants_org_idx ON public.service_variants (org_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS service_variants_service_idx ON public.service_variants (service_id) WHERE deleted_at IS NULL;
ALTER TABLE public.service_variants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner_all_service_variants" ON public.service_variants;
CREATE POLICY "owner_all_service_variants" ON public.service_variants
  FOR ALL USING (public.user_role() = 'owner' AND org_id = public.user_org_id());

DROP POLICY IF EXISTS "staff_read_service_variants" ON public.service_variants;
CREATE POLICY "staff_read_service_variants" ON public.service_variants
  FOR SELECT USING (public.user_role() = 'staff' AND org_id = public.user_org_id());

DROP POLICY IF EXISTS "client_read_service_variants" ON public.service_variants;
CREATE POLICY "client_read_service_variants" ON public.service_variants
  FOR SELECT USING (public.user_role() = 'client' AND org_id = public.user_org_id());

DROP POLICY IF EXISTS "family_read_service_variants" ON public.service_variants;
CREATE POLICY "family_read_service_variants" ON public.service_variants
  FOR SELECT USING (public.user_role() = 'family' AND org_id = public.user_org_id());


-- ---- clients.service_rates (per-client price overrides) ----
-- JSONB: [{ "serviceId": "svc_...", "variantId": "var_...|null", "rate": 250 }]
-- If no row matches (serviceId, variantId), fall back to variant.price
-- or service.default_price.
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS service_rates jsonb NOT NULL DEFAULT '[]';


-- ---- projects.services (selected services on a project) ----
-- JSONB: [{ "serviceId": "svc_...", "variantId": "var_...|null",
--          "label": "Real Estate Shoot — Photos (2k-3k sqft)",
--          "price": 350 }]
-- "label" + "price" are denormalized snapshots so historical invoices
-- stay accurate even if the user later renames a service or changes
-- a variant's price.
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS services jsonb NOT NULL DEFAULT '[]';

-- Also add an optional service_category_id so the Project Dialog
-- knows which category the bundle came from (for editing later).
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS service_category_id text;
