-- A gallery file is either a proof or a final, and it says so.
--
-- WHY: proofing turned one gallery into two jobs — the raws a client picks
-- from, and the finished files that get delivered — with nothing telling them
-- apart. Every file went into one pile, so there was no way to see which
-- phase you were in, no way to know whether a drag-and-drop was adding proofs
-- or finals, and no way to show an editor only the frames she's meant to work
-- on.
--
-- DEFAULT 'final' is deliberate: every file that exists today IS a
-- deliverable. Real-estate galleries have no proofing phase at all and must
-- keep behaving exactly as they do now.

ALTER TABLE public.delivery_files
  ADD COLUMN IF NOT EXISTS stage text NOT NULL DEFAULT 'final';

-- Cheap guard against a typo becoming an invisible half-broken gallery.
ALTER TABLE public.delivery_files
  DROP CONSTRAINT IF EXISTS delivery_files_stage_check;
ALTER TABLE public.delivery_files
  ADD CONSTRAINT delivery_files_stage_check CHECK (stage IN ('proof', 'final'));

CREATE INDEX IF NOT EXISTS delivery_files_stage_idx
  ON public.delivery_files (delivery_id, stage);

-- ---- the editor can add finished files, and only finished files ----
--
-- She downloads the raws the client picked, edits them, and puts them back.
-- WITH CHECK pins stage to 'final': an editor can add to the delivery, never
-- to the set of proofs the client chose from. Scoped to her assigned jobs by
-- the same lookup as her read access (2026-08-18-staff-assigned-galleries).
--
-- INSERT only. No UPDATE, no DELETE — she cannot alter or remove a client's
-- photos, or her own once uploaded; that stays the owner's call.
DROP POLICY IF EXISTS "staff_add_finals" ON public.delivery_files;
CREATE POLICY "staff_add_finals" ON public.delivery_files
  FOR INSERT WITH CHECK (
    public.user_role() = 'staff'
    AND org_id = public.user_org_id()
    AND stage = 'final'
    AND delivery_id IN (
      SELECT d.id FROM public.deliveries d
      WHERE d.project_id IS NOT NULL
        AND d.project_id IN (SELECT sap.id FROM public.staff_assigned_projects() sap)
    )
  );

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT policyname, cmd FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'delivery_files'
    ORDER BY policyname
  LOOP
    RAISE NOTICE 'delivery_files | % | %', r.policyname, r.cmd;
  END LOOP;
END $$;
