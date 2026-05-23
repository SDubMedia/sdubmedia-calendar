-- Tier B: optional email-registration before viewing.
-- When deliveries.require_email = true, the public gallery shows an email
-- gate before content. Each registered visitor goes into gallery_visitors.

ALTER TABLE public.deliveries
  ADD COLUMN IF NOT EXISTS require_email boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.gallery_visitors (
  id text PRIMARY KEY,
  delivery_id text NOT NULL REFERENCES public.deliveries(id) ON DELETE CASCADE,
  org_id text NOT NULL DEFAULT '',
  email text NOT NULL,
  ip text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS gallery_visitors_delivery_email_idx
  ON public.gallery_visitors (delivery_id, email);
CREATE INDEX IF NOT EXISTS gallery_visitors_org_idx
  ON public.gallery_visitors (org_id);

ALTER TABLE public.gallery_visitors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_all_gallery_visitors" ON public.gallery_visitors
  FOR ALL USING (public.user_role() = 'owner' AND org_id = public.user_org_id());

CREATE POLICY "partner_read_gallery_visitors" ON public.gallery_visitors
  FOR SELECT USING (
    public.user_role() = 'partner'
    AND org_id = public.user_org_id()
    AND delivery_id IN (
      SELECT d.id FROM public.deliveries d
      WHERE d.project_id IS NOT NULL
        AND d.project_id IN (
          SELECT id FROM public.projects WHERE client_id = ANY(public.user_client_ids())
        )
    )
  );
