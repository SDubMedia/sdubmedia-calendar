-- Multi-page contract documents (HoneyBook-style Smart Files). Each contract
-- and contract template can host multiple pages: agreement, invoice, payment,
-- custom. The invoice page auto-renders from payment_milestones at view time.
--
-- When `pages` is empty (default for existing rows), the editor + renderer
-- fall back to the legacy single-page blocks/content. New templates created
-- after this lands will use pages.

ALTER TABLE contracts
  ADD COLUMN IF NOT EXISTS pages jsonb NOT NULL DEFAULT '[]';

ALTER TABLE contract_templates
  ADD COLUMN IF NOT EXISTS pages jsonb NOT NULL DEFAULT '[]';
