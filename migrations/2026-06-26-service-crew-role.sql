-- Flat per-piece crew payouts for real-estate shoots.
--
-- crew_role tags which crew role a service piece's flat cost (default_cost /
-- variant cost) pays out to on a shoot:
--   'shoot' → the shoot's assigned shooter   (project.crew)
--   'edit'  → the shoot's assigned editor     (project.postProduction)
--   NULL    → not a crew payout (e.g. photo editing rides in the Fotello product
--             cost, not crew pay) — this is the default, so existing services and
--             all non-real-estate pieces are unaffected.
--
-- The per-project snapshot rides in the existing projects.services jsonb
-- (ProjectServiceSelection.crewRole) — no column change there.
--
-- Internal-only: like `cost`, crew_role is NOT exposed in the client-safe
-- services_client view, so agents/brokers never see it. No view rebuild needed.

ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS crew_role text;

ALTER TABLE public.services
  DROP CONSTRAINT IF EXISTS services_crew_role_check;

ALTER TABLE public.services
  ADD CONSTRAINT services_crew_role_check
  CHECK (crew_role IS NULL OR crew_role IN ('shoot', 'edit'));
