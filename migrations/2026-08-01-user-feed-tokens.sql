-- Per-person calendar feed tokens.
--
-- The org feed token (org_secrets) covers the whole company, so it can only
-- belong to the owner. Everyone else still needs to subscribe to their own
-- schedule from their phone, which means a token of their own that resolves to
-- a filtered feed — see api/calendar.ics.ts:
--   staff   their assigned shoots/edits + meetings they're assigned to
--   family  the shared personal calendar
--   client  their own projects
--   owner   also has the org-wide feed
--
-- RLS: a row is readable only by the person it belongs to. No owner policy —
-- the owner has no reason to read someone else's subscription URL, and leaving
-- it out means one fewer way for it to leak.

CREATE TABLE IF NOT EXISTS public.user_feed_tokens (
  user_id uuid PRIMARY KEY,
  org_id text NOT NULL DEFAULT '',
  token text NOT NULL UNIQUE DEFAULT ('usr_' || replace(gen_random_uuid()::text, '-', '')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_feed_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own_feed_token" ON public.user_feed_tokens;
CREATE POLICY "own_feed_token" ON public.user_feed_tokens FOR SELECT
  USING (user_id = auth.uid());

-- The lookup in calendar.ics.ts is by token, under the service role.
CREATE INDEX IF NOT EXISTS idx_user_feed_tokens_token ON public.user_feed_tokens(token);

-- Everyone who already has a login gets one.
INSERT INTO public.user_feed_tokens (user_id, org_id)
SELECT id, org_id FROM public.user_profiles
ON CONFLICT (user_id) DO NOTHING;

-- ...and everyone who signs up from here on.
CREATE OR REPLACE FUNCTION public.create_user_feed_token()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.user_feed_tokens (user_id, org_id)
  VALUES (NEW.id, NEW.org_id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS user_feed_token_on_profile_insert ON public.user_profiles;
CREATE TRIGGER user_feed_token_on_profile_insert
  AFTER INSERT ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.create_user_feed_token();
