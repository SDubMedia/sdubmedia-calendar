-- Push notifications: store each device's APNs token so the backend can
-- send pushes to an org's owner/staff devices. Tokens are written via the
-- authed /api/register-push-token endpoint (service role) and read by the
-- push sender (service role); the app never reads this table directly.

CREATE TABLE IF NOT EXISTS device_tokens (
  id text PRIMARY KEY,
  org_id text NOT NULL DEFAULT '',
  user_id text NOT NULL,
  token text NOT NULL,
  platform text NOT NULL DEFAULT 'ios',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (token)
);

ALTER TABLE device_tokens ENABLE ROW LEVEL SECURITY;

-- Owner: full access within their org.
DROP POLICY IF EXISTS "owner_all_device_tokens" ON device_tokens;
CREATE POLICY "owner_all_device_tokens" ON device_tokens
  FOR ALL USING (public.user_role() = 'owner' AND org_id = public.user_org_id());

-- Any signed-in user: manage only their own device rows within their org.
-- (Registration actually runs through the service-role endpoint, but this
-- keeps direct access safe and scoped for every role.)
DROP POLICY IF EXISTS "self_device_tokens" ON device_tokens;
CREATE POLICY "self_device_tokens" ON device_tokens
  FOR ALL USING (user_id = auth.uid()::text AND org_id = public.user_org_id());

CREATE INDEX IF NOT EXISTS device_tokens_org_idx ON device_tokens (org_id);
