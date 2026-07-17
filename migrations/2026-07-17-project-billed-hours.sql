-- ============================================================
-- Project-level "billed hours" — separates the CLIENT BILL from crew pay.
--
-- When set, the hourly client bill = billed_hours × client rate (+ services),
-- INDEPENDENT of the crew roster. Adding crew or paying them differently no
-- longer moves the client's bill. Null = legacy behavior (sum the crew's
-- worked hours), so existing projects are unaffected.
-- ============================================================

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS billed_hours numeric;

COMMENT ON COLUMN projects.billed_hours IS
  'Client-billed hours for hourly billing, set at the project level and independent of crew. Null = derive from summed crew hours (legacy).';
