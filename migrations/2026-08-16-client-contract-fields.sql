-- What the client typed into the contract's blanks.
--
-- WHY: an agreement asks for the event date, the venue, and the signer's name,
-- email and address. Those were placeholders that nobody could fill, so a
-- signed contract had empty blanks — which is worth very little. Captured at
-- signing and kept with the proposal, so the generated contract carries them.

ALTER TABLE proposals
  ADD COLUMN IF NOT EXISTS client_field_values jsonb NOT NULL DEFAULT '{}'::jsonb;
