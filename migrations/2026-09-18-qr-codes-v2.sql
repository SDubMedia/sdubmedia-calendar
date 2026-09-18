-- QR Codes round two (Geoff, 2026-09-18): analytics tagging, readable codes,
-- and a scan log so each code can show scans per day, not just a total.

-- Per code: add utm tags to the forward so Google Analytics reports the
-- scan as its own source. On by default; off for links that can't take
-- query parameters.
ALTER TABLE public.qr_codes
  ADD COLUMN IF NOT EXISTS utm_enabled boolean NOT NULL DEFAULT true;

-- One row per scan. The total on qr_codes stays as the fast counter; this
-- is the history behind it.
CREATE TABLE IF NOT EXISTS public.qr_scans (
  id text PRIMARY KEY,
  org_id text NOT NULL DEFAULT '',
  qr_code_id text NOT NULL REFERENCES public.qr_codes(id) ON DELETE CASCADE,
  scanned_at timestamptz NOT NULL DEFAULT now(),
  device text NOT NULL DEFAULT '',          -- phone | tablet | desktop | other
  country text NOT NULL DEFAULT '',
  referer text NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS qr_scans_code_time_idx ON public.qr_scans (qr_code_id, scanned_at DESC);

ALTER TABLE public.qr_scans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner_all_qr_scans" ON public.qr_scans;
CREATE POLICY "owner_all_qr_scans" ON public.qr_scans
  FOR ALL USING (public.user_role() = 'owner' AND org_id = public.user_org_id())
  WITH CHECK (public.user_role() = 'owner' AND org_id = public.user_org_id());
