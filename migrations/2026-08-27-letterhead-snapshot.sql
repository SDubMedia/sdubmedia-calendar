-- ============================================================
-- Freeze the letterhead on a document at the moment it is sent.
--
-- Contracts and proposals do NOT store a rendered file. Their terms
-- and signatures are stored, but the header — business name, logo, address,
-- phone — is read live from the `organizations` row every time the document is
-- opened. So renaming the business or moving offices retroactively rewrites the
-- header of every contract already signed, including ones a client has a copy
-- of. Nothing errors; the old document simply starts describing a company that
-- didn't exist when it was signed.
--
-- From here on, the details are stamped onto the document when it is SENT —
-- the version the client actually saw and signed — and the header renders from
-- that stamp forever after.
--
-- DELIBERATELY NOT BACKFILLED. What the letterhead said on the day an existing
-- contract was signed was never recorded, so stamping today's values onto past
-- documents would be inventing history rather than preserving it. Documents
-- with no stamp keep rendering live, exactly as they do now.
--
-- INVOICES ARE NOT INCLUDED. They already freeze themselves: `company_info` is
-- written onto the invoice row when it's created (client/src/lib/invoice.ts),
-- and InvoicePDF renders from that, not from the live org. Adding a second
-- mechanism would give one document two sources of truth.
-- ============================================================

ALTER TABLE contracts ADD COLUMN IF NOT EXISTS letterhead_snapshot jsonb;
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS letterhead_snapshot jsonb;

COMMENT ON COLUMN contracts.letterhead_snapshot IS
  'Business name/logo/address as they were when this contract was sent. Null = pre-dates the freeze; render live. Never backfill: it would fabricate history.';
COMMENT ON COLUMN proposals.letterhead_snapshot IS
  'Business name/logo/address as they were when this proposal was sent. Null = render live.';
