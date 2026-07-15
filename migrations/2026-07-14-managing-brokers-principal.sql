-- ============================================================
-- Managing brokers + principal owner
--
-- A brokerage (clients.client_type = 'broker') can now have MULTIPLE managing
-- broker logins. Each is a normal client-role user_profile whose client_ids
-- includes the brokerage id — the existing broker view + RLS already scope by
-- that, so no policy changes are needed to give them all the same view.
--
-- We only need one new bit of state: which of those logins is the "principal"
-- (the brokerage's admin). Stored as a pointer on the brokerage's client row.
-- ============================================================

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS principal_broker_user_id text;

COMMENT ON COLUMN clients.principal_broker_user_id IS
  'For client_type=broker: the user_profiles.id of the managing broker designated as principal (brokerage admin). Null until assigned.';
