-- Self-serve model release links. One link per project; every signer who
-- opens it gets their own row, collected on the public page itself, the
-- same shape as mini_sessions/mini_session_bookings (see
-- 2026-08-24-mini-sessions.sql). Models never log in — the tokens are the
-- gate, and the public API runs under the service role, so RLS here only
-- needs to cover the owner's own dashboard access.

CREATE TABLE IF NOT EXISTS model_release_links (
  id text PRIMARY KEY,
  org_id text NOT NULL DEFAULT '',
  project_id text NOT NULL,
  public_token text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE model_release_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_all_model_release_links" ON model_release_links
  FOR ALL USING (public.user_role() = 'owner' AND org_id = public.user_org_id());

CREATE TABLE IF NOT EXISTS model_release_signatures (
  id text PRIMARY KEY,
  org_id text NOT NULL DEFAULT '',
  release_link_id text NOT NULL REFERENCES model_release_links(id),
  project_id text NOT NULL,
  name text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  -- Typed full name, same as mini_session_bookings.signature — no drawn
  -- canvas for this MVP.
  signature text NOT NULL DEFAULT '',
  -- Snapshot of the release text as rendered at signing time, so it reads
  -- back correctly even if the master template changes later.
  content_html text NOT NULL DEFAULT '',
  signed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE model_release_signatures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_all_model_release_signatures" ON model_release_signatures
  FOR ALL USING (public.user_role() = 'owner' AND org_id = public.user_org_id());

CREATE INDEX IF NOT EXISTS idx_model_release_signatures_project
  ON model_release_signatures(project_id);

-- Per-proposal opt-in: only proposals explicitly flagged this way trigger
-- the client-facing "share this with your people" email on acceptance.
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS needs_model_release boolean NOT NULL DEFAULT false;
