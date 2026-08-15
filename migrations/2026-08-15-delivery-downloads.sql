-- Who downloaded what, and when.
--
-- WHY: deliveries.download_count has existed since galleries shipped and
-- nothing ever wrote to it, so "did the client actually collect their photos"
-- was unanswerable. That's the single most useful signal a delivery can give.
--
-- IDENTITY: visitor_email is only known when the gallery has require_email on
-- (see gallery_visitors). Otherwise it stays '' and the row honestly means
-- "someone with the link". No IP or fingerprinting — that identifies a device,
-- not a person, and doesn't belong in a client gallery.

CREATE TABLE IF NOT EXISTS public.delivery_downloads (
  id text PRIMARY KEY,
  delivery_id text NOT NULL REFERENCES public.deliveries(id) ON DELETE CASCADE,
  org_id text NOT NULL DEFAULT '',
  -- Null for a whole-gallery download; set when one file was taken.
  file_id text,
  -- '' when the gallery doesn't ask visitors to identify themselves.
  visitor_email text NOT NULL DEFAULT '',
  -- How many files this event covered, so a zip of 40 counts as 40.
  file_count integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS delivery_downloads_delivery_idx
  ON public.delivery_downloads (delivery_id, created_at DESC);
CREATE INDEX IF NOT EXISTS delivery_downloads_org_idx
  ON public.delivery_downloads (org_id, created_at DESC);

ALTER TABLE public.delivery_downloads ENABLE ROW LEVEL SECURITY;

-- Owner-only, scoped to the org. The public gallery writes these through the
-- service role in api/delivery-public.ts, which bypasses RLS, so no insert
-- policy is needed for anon — and deliberately isn't granted.
DROP POLICY IF EXISTS "owner_all_delivery_downloads" ON public.delivery_downloads;
CREATE POLICY "owner_all_delivery_downloads" ON public.delivery_downloads
  FOR ALL USING (public.user_role() = 'owner' AND org_id = public.user_org_id());

-- Debounce for the "someone downloaded" email: a client grabbing 40 photos
-- should produce one notification, not forty.
ALTER TABLE public.deliveries
  ADD COLUMN IF NOT EXISTS download_notified_at timestamptz;
