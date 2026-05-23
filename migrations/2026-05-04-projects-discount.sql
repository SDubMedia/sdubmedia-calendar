-- Per-project discount applied at invoice time. Owner enters %
-- or $ off in the Edit Project dialog; getProjectInvoiceAmount
-- subtracts it from the computed billable subtotal so anywhere
-- a project's billable amount appears (invoices, P&L, reports)
-- it reflects the discount.

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS discount_type text,
  ADD COLUMN IF NOT EXISTS discount_amount numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_reason text DEFAULT '';
