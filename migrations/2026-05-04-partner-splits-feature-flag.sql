-- Auto-enable the partner_splits feature flag for any org that already
-- has at least one client with a partner_split configured. New orgs
-- start with the flag false (per DEFAULT_FEATURES in types.ts) so they
-- never see the partner UI unless they opt in.
--
-- features is a JSONB column on organizations. We jsonb_set the
-- partnerSplits key to true. Idempotent — if the key is already true
-- the row just stays true.

UPDATE organizations o
SET features = COALESCE(o.features, '{}'::jsonb) || jsonb_build_object('partnerSplits', true)
WHERE EXISTS (
  SELECT 1 FROM clients c
  WHERE c.org_id = o.id
    AND c.partner_split IS NOT NULL
    AND c.partner_split <> 'null'::jsonb
);
