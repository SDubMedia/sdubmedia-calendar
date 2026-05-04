-- Contractor invoice payment tracking. Slate doesn't process the
-- payment itself — Venmo / Zelle / check / etc. happens outside.
-- We record the fact + method + optional reference number so the
-- contractor and admin both see "paid on X via Y."
--
-- Also adds preferred-payment-method to crew_members so the admin
-- sees each contractor's preference when marking paid (and so the
-- pay dropdown defaults sensibly).

ALTER TABLE contractor_invoices
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS payment_method text,
  ADD COLUMN IF NOT EXISTS payment_reference text DEFAULT '';

ALTER TABLE crew_members
  ADD COLUMN IF NOT EXISTS preferred_payment_method text,
  ADD COLUMN IF NOT EXISTS preferred_payment_details text DEFAULT '';
