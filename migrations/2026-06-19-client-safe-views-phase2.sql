-- ============================================================
-- Client-safe views — STEP 2 (the final lock).
--
-- Run this ONLY after the updated iOS app (which reads the *_client views) is
-- live in the App Store. It removes the client role's access to the RAW tables,
-- so cost/pay can no longer be reached even by hitting the data API directly.
--
-- Before this runs, a client on a NON-updated app would lose access to their
-- projects/services. Owner/staff/partner are unaffected (their policies remain).
-- ============================================================

DROP POLICY IF EXISTS "client_read_projects" ON public.projects;
DROP POLICY IF EXISTS "client_read_services" ON public.services;
DROP POLICY IF EXISTS "client_read_service_variants" ON public.service_variants;
