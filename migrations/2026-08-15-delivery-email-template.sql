-- Default delivery email, editable per send.
--
-- WHY: the delivery email was hardcoded in api/notify-gallery-ready.ts, so
-- every client got identical text and there was no way to add a line about
-- their own wedding. Geoff wants the default managed in one place and the
-- actual send editable in a composer.
--
-- Body is stored as plain text with {{merge_fields}}; the HTML wrapper stays
-- in the API so branding can't be broken by a stray tag typed into a textarea.

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS delivery_email_subject text NOT NULL DEFAULT '';
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS delivery_email_body text NOT NULL DEFAULT '';

-- Empty means "use the built-in default", which adapts to what's in the
-- gallery (photos / video / photos and video). Storing the generated text
-- would freeze that wording, so blank has to stay meaningful.
--
-- No RLS change: organizations already has policies, and every non-owner role
-- can read the row. These two columns are display copy, not credentials —
-- see the "secrets never live on the organizations row" rule in CLAUDE.md.
