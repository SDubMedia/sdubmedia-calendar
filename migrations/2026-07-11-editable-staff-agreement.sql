-- ============================================================
-- Make the 1099 staff agreement an editable, per-org document.
--
-- Each org gets their own copy: empty staff_agreement_text = use the built-in
-- default (rendered with the org's company name). When the owner edits it, we
-- store their text and bump staff_agreement_version so staff re-sign the new
-- version. staff_agreements already records which version each person signed.
-- ============================================================

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS staff_agreement_text text DEFAULT '';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS staff_agreement_version text DEFAULT '';
