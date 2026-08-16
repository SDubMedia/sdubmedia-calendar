-- A second person named on the agreement, who signed it too.
--
-- WHY: a wedding usually has two people on the contract, and it isn't always
-- a couple — often a parent is paying. Anyone added to the agreement should
-- sign it, or their name appears on a document they never agreed to.
--
-- Signed at the same moment as the first party, on the same document, so no
-- separate signing link is issued. The array leaves room for a third.

ALTER TABLE proposals
  ADD COLUMN IF NOT EXISTS additional_signatures jsonb NOT NULL DEFAULT '[]'::jsonb;
