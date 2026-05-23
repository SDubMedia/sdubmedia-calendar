-- Saves the org's preferred wording for the "send series for review"
-- copy-message. The first time the owner sends for review they edit
-- the default; we save it; every send after that pre-fills with the
-- saved version. Placeholders {first_name} / {company} / {url} get
-- substituted at copy time so the template stays generic.

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS series_review_message_template text DEFAULT '';
