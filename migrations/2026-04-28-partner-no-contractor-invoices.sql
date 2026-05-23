-- Remove partner read access to contractor_invoices entirely.
-- Contractor invoices are owner/finance-only data — partners don't need
-- visibility into what crew is being paid.

DROP POLICY IF EXISTS "partner_read_contractor_invoices" ON contractor_invoices;
