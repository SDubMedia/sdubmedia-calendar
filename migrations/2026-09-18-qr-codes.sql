-- QR Codes (Geoff, 2026-09-18): owner-managed dynamic QR codes. Each code is
-- printed once and encodes a permanent Slate link (/q/<code>); the link it
-- forwards to can be changed any time. "Locked" freezes the code: its link
-- can't be edited and it can't be deleted until it's unlocked again — the
-- code itself keeps working. Owner-only, no other role sees these.
CREATE TABLE IF NOT EXISTS public.qr_codes (
  id text PRIMARY KEY,
  org_id text NOT NULL DEFAULT '',
  code text NOT NULL,                        -- the short slug baked into the printed QR
  name text NOT NULL DEFAULT '',
  target_url text NOT NULL DEFAULT '',
  locked boolean NOT NULL DEFAULT false,
  scan_count integer NOT NULL DEFAULT 0,
  last_scanned_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS qr_codes_code_idx ON public.qr_codes (code);
CREATE INDEX IF NOT EXISTS qr_codes_org_idx ON public.qr_codes (org_id);

ALTER TABLE public.qr_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner_all_qr_codes" ON public.qr_codes;
CREATE POLICY "owner_all_qr_codes" ON public.qr_codes
  FOR ALL USING (public.user_role() = 'owner' AND org_id = public.user_org_id())
  WITH CHECK (public.user_role() = 'owner' AND org_id = public.user_org_id());

-- The lock is enforced here, not just in the UI: a locked code refuses link
-- edits and deletes no matter which client sends them. Unlocking is a single
-- column change and is always allowed.
CREATE OR REPLACE FUNCTION public.qr_codes_enforce_lock() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.locked THEN
      RAISE EXCEPTION 'This QR code is locked. Unlock it before deleting.';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.locked AND NEW.locked AND (NEW.target_url IS DISTINCT FROM OLD.target_url OR NEW.code IS DISTINCT FROM OLD.code) THEN
    RAISE EXCEPTION 'This QR code is locked. Unlock it before changing its link.';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS qr_codes_enforce_lock ON public.qr_codes;
CREATE TRIGGER qr_codes_enforce_lock
  BEFORE UPDATE OR DELETE ON public.qr_codes
  FOR EACH ROW EXECUTE FUNCTION public.qr_codes_enforce_lock();
