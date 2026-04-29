-- Tier B: vanity URL slug for galleries.
-- Token stays as the random-looking secret link. Slug is the human-readable
-- alternative — both resolve to the same gallery via api/delivery-public.

ALTER TABLE public.deliveries
  ADD COLUMN IF NOT EXISTS slug text;

-- Unique when set; multiple NULLs allowed (one constraint per project).
CREATE UNIQUE INDEX IF NOT EXISTS deliveries_slug_idx
  ON public.deliveries (slug)
  WHERE slug IS NOT NULL;
