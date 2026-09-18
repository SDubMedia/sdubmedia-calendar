-- Creative → Flyers (Geoff, 2026-09-18): printable flyers built from gallery
-- photos on a template, with one of the dynamic QR codes on them. Owner only.
CREATE TABLE IF NOT EXISTS public.flyers (
  id text PRIMARY KEY,
  org_id text NOT NULL DEFAULT '',
  name text NOT NULL DEFAULT '',
  template text NOT NULL DEFAULT 'wedding-letter',
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS flyers_org_idx ON public.flyers (org_id, updated_at DESC);

ALTER TABLE public.flyers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner_all_flyers" ON public.flyers;
CREATE POLICY "owner_all_flyers" ON public.flyers
  FOR ALL USING (public.user_role() = 'owner' AND org_id = public.user_org_id())
  WITH CHECK (public.user_role() = 'owner' AND org_id = public.user_org_id());
