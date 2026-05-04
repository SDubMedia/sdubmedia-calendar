-- Client review flow for content series. Owner clicks "Send for Review",
-- system generates a public token and (manually-shared for now) URL.
-- Client opens the URL in any browser — no login — and approves/rejects
-- the series episode-by-episode or as a whole.
--
-- Series-level review state:
--   draft (initial), sent (link generated, awaiting client),
--   approved (whole series ok), changes_requested (something needs work).
--
-- Episode-level approval state, parallel to the existing status field:
--   pending (default), approved (client said yes), changes_requested (client wants changes).
-- Client comment is free-text feedback on a single episode.

ALTER TABLE series
  ADD COLUMN IF NOT EXISTS review_token text UNIQUE,
  ADD COLUMN IF NOT EXISTS review_status text DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS sent_for_review_at timestamptz,
  ADD COLUMN IF NOT EXISTS client_reviewed_at timestamptz;

ALTER TABLE series_episodes
  ADD COLUMN IF NOT EXISTS approval_status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS client_comment text DEFAULT '';

-- Index review_token for public-page fetches.
CREATE INDEX IF NOT EXISTS series_review_token_idx ON series(review_token);
