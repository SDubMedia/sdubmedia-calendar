-- Stripe Express payouts for crew (staff direct deposit / ACH).
--
-- stripe_account_id      = the crew member's Stripe Express connected account,
--                          created under the SDub *platform* account. Money is
--                          transferred platform-balance → this account, which
--                          Stripe then auto-pays out to their bank by ACH.
-- stripe_payouts_enabled = flips true once the crew member finishes Stripe
--                          onboarding and the transfers capability is active
--                          (set by the account.updated webhook / status endpoint).
--
-- Both are internal columns on crew_members (already org-scoped, owner + staff-own
-- RLS) — never exposed in any client-safe view. Writes happen server-side with the
-- service role, so no RLS change is needed.

ALTER TABLE public.crew_members
  ADD COLUMN IF NOT EXISTS stripe_account_id text;

ALTER TABLE public.crew_members
  ADD COLUMN IF NOT EXISTS stripe_payouts_enabled boolean NOT NULL DEFAULT false;
