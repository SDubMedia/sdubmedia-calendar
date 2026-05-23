-- Multi-signer contracts. Default flow stays "owner + client" (which is
-- already encoded by clientSignature + ownerSignature columns). This
-- adds optional extra signers stored inline as JSONB so the existing
-- two-signer columns stay untouched.
--
-- Each entry shape:
--   { id, name, email, role, signToken, signature: ContractSignature|null, signedAt: string|null }
--
-- Plus two settings columns we surface in the new full-page editor's
-- sidebar: a soft expiry that auto-voids drafts past the date, and a
-- reminders toggle for the upcoming nightly cron.

ALTER TABLE contracts
  ADD COLUMN IF NOT EXISTS additional_signers jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS document_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS reminders_enabled boolean NOT NULL DEFAULT false;
