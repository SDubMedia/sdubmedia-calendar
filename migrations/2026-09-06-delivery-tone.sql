-- Who the editorial gallery is written for: a person or a business.
--
-- WHY: "thank you for having us … yours to keep" is right for a family and
-- wrong for a school or a brokerage. Empty means automatic — the server
-- decides from the client record (a company name that differs from the
-- contact person = business); 'personal' / 'business' is the owner's
-- override for one gallery. See api/_galleryPresentation.ts.

ALTER TABLE public.deliveries
  ADD COLUMN IF NOT EXISTS tone text NOT NULL DEFAULT '';

ALTER TABLE public.deliveries
  DROP CONSTRAINT IF EXISTS deliveries_tone_check;
ALTER TABLE public.deliveries
  ADD CONSTRAINT deliveries_tone_check CHECK (tone IN ('', 'personal', 'business'));
