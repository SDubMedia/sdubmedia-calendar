-- View-only galleries (portfolio mode): visitors browse, nothing downloads.
--
-- Built for sending prospects a work-samples link. Enforced server-side in
-- api/delivery-public.ts (downloadUrl is withheld, same mechanism proofs use)
-- — the gallery page hiding its buttons is just honesty in the UI.
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS view_only boolean NOT NULL DEFAULT false;
