-- Named folders within a single delivery (e.g. "Final Videos" / "B Roll"),
-- so a client sees organized sections instead of one flat file grid.
--
-- WHY: delivery_collections (2026-04-29-tier-c-finish.sql) groups multiple
-- whole DELIVERIES under one shared landing page — it has no relationship
-- to delivery_files at all. There was no way to group files WITHIN one
-- delivery until now.

CREATE TABLE public.delivery_folders (
  id text PRIMARY KEY DEFAULT ('folder_' || replace(gen_random_uuid()::text, '-', '')),
  delivery_id text NOT NULL REFERENCES public.deliveries(id) ON DELETE CASCADE,
  org_id text NOT NULL DEFAULT '',
  name text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.delivery_folders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_all_delivery_folders" ON public.delivery_folders FOR ALL USING (
  public.user_role() = 'owner' AND org_id = public.user_org_id()
);

-- Mirrors staff_read_assigned_delivery_files exactly (migrations/2026-08-18
-- -staff-assigned-galleries.sql) — staff already sees these files, so she
-- needs to resolve folder names too, not raw ids.
CREATE POLICY "staff_read_assigned_delivery_folders" ON public.delivery_folders FOR SELECT USING (
  public.user_role() = 'staff' AND org_id = public.user_org_id()
  AND delivery_id IN (SELECT d.id FROM public.deliveries d
    WHERE d.project_id IS NOT NULL AND d.project_id IN (SELECT sap.id FROM public.staff_assigned_projects() sap))
);

ALTER TABLE public.delivery_files
  ADD COLUMN IF NOT EXISTS folder_id text REFERENCES public.delivery_folders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS delivery_files_folder_idx ON public.delivery_files (folder_id);

-- No RLS change needed on delivery_files itself — RLS is row-level, and
-- existing policies (owner_all_delivery_files, staff_read_assigned_delivery_files)
-- already cover this new column on rows already readable/writable.
-- delivery-public.ts reads everything under service role anyway.
