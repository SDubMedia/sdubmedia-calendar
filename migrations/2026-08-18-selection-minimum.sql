-- How FEW a client may send, as distinct from how many they get.
--
-- WHY: selection_limit was only a ceiling, so a gallery offering 15 edits
-- could be submitted with one — and the gallery locked, taking the other
-- fourteen with it. Requiring all 15 fixes that but breaks the honest case:
-- a client who wants five now and the rest once they've shown their partner.
--
-- So the two numbers are separate. selection_minimum is the floor they must
-- reach to send at all; selection_limit stays the total they're entitled to.
-- Between the two, they can send and come back for the rest.
--
-- DEFAULT 0 means "no separate floor — they must use the whole allowance",
-- which is the behaviour every existing gallery has and the safest thing for
-- one created before this column existed.

ALTER TABLE public.deliveries
  ADD COLUMN IF NOT EXISTS selection_minimum integer NOT NULL DEFAULT 0;

-- A floor above the ceiling would be unsatisfiable — the client could never
-- send at all, and nothing else in the flow would say why.
ALTER TABLE public.deliveries
  DROP CONSTRAINT IF EXISTS deliveries_selection_minimum_check;
ALTER TABLE public.deliveries
  ADD CONSTRAINT deliveries_selection_minimum_check
  CHECK (selection_minimum >= 0 AND (selection_limit = 0 OR selection_minimum <= selection_limit));
