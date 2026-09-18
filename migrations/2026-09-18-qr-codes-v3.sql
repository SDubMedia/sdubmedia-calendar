-- QR Codes round three (Geoff, 2026-09-18): contact-card codes, scheduled
-- switch-over, and an optional caption on the printed sheet.
ALTER TABLE public.qr_codes
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'link',            -- link | contact
  ADD COLUMN IF NOT EXISTS contact jsonb,                                  -- vCard fields for kind = contact
  ADD COLUMN IF NOT EXISTS next_target_url text NOT NULL DEFAULT '',      -- where it goes after switch_at
  ADD COLUMN IF NOT EXISTS switch_at timestamptz,
  ADD COLUMN IF NOT EXISTS caption text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS caption_enabled boolean NOT NULL DEFAULT false;

-- The lock now freezes everything a scan depends on: the link, the code, the
-- contact details and the scheduled switch. Name, tagging and caption stay
-- editable while locked.
CREATE OR REPLACE FUNCTION public.qr_codes_enforce_lock() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.locked THEN
      RAISE EXCEPTION 'This QR code is locked. Unlock it before deleting.';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.locked AND NEW.locked AND (
       NEW.target_url IS DISTINCT FROM OLD.target_url
    OR NEW.code IS DISTINCT FROM OLD.code
    OR NEW.contact IS DISTINCT FROM OLD.contact
    OR NEW.next_target_url IS DISTINCT FROM OLD.next_target_url
    OR NEW.switch_at IS DISTINCT FROM OLD.switch_at
  ) THEN
    RAISE EXCEPTION 'This QR code is locked. Unlock it before changing where it goes.';
  END IF;
  RETURN NEW;
END $$;
