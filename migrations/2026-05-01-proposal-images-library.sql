-- Proposal image library — uploaded images saved org-wide so they can be
-- re-picked across templates without re-uploading. Used by hero / image /
-- package_row blocks.
--
-- Data URLs in v1 (≤500KB enforced client-side). R2 migration is a separate
-- task per the Sub-Phase 1A scope decisions.

CREATE TABLE IF NOT EXISTS proposal_images (
  id text PRIMARY KEY,
  org_id text NOT NULL DEFAULT '',
  name text NOT NULL DEFAULT '',
  image_data_url text NOT NULL DEFAULT '',
  width integer NOT NULL DEFAULT 0,
  height integer NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0,    -- typically Date.now() — newest first
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS proposal_images_org_idx ON proposal_images (org_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS proposal_images_org_sort_idx ON proposal_images (org_id, sort_order DESC) WHERE deleted_at IS NULL;

ALTER TABLE proposal_images ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner_all_proposal_images" ON proposal_images;
CREATE POLICY "owner_all_proposal_images" ON proposal_images
  FOR ALL
  USING (public.user_role() = 'owner' AND org_id = public.user_org_id())
  WITH CHECK (public.user_role() = 'owner' AND org_id = public.user_org_id());
