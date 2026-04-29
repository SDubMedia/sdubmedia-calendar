-- Tier C wrap-up: collections, watermark text, print-orders flag.
-- All additive — safe to run on prod with existing data.

-- 1. Collections — group multiple galleries under a single landing URL
CREATE TABLE IF NOT EXISTS public.delivery_collections (
  id text PRIMARY KEY,
  org_id text NOT NULL DEFAULT '',
  name text NOT NULL DEFAULT '',
  slug text,
  cover_subtitle text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS delivery_collections_slug_idx
  ON public.delivery_collections (slug)
  WHERE slug IS NOT NULL;
CREATE INDEX IF NOT EXISTS delivery_collections_org_idx
  ON public.delivery_collections (org_id);

ALTER TABLE public.delivery_collections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_all_delivery_collections" ON public.delivery_collections
  FOR ALL USING (public.user_role() = 'owner' AND org_id = public.user_org_id());
CREATE POLICY "partner_all_delivery_collections" ON public.delivery_collections
  FOR ALL USING (public.user_role() = 'partner' AND org_id = public.user_org_id());

-- 2. Link deliveries to collections (nullable — galleries can be standalone)
ALTER TABLE public.deliveries
  ADD COLUMN IF NOT EXISTS collection_id text REFERENCES public.delivery_collections(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS deliveries_collection_idx ON public.deliveries (collection_id);

-- 3. Watermark text (CSS overlay, not server-side image processing)
ALTER TABLE public.deliveries
  ADD COLUMN IF NOT EXISTS watermark_text text;

-- 4. Print orders flag — toggles "Order prints" button on public gallery
ALTER TABLE public.deliveries
  ADD COLUMN IF NOT EXISTS prints_enabled boolean NOT NULL DEFAULT false;
