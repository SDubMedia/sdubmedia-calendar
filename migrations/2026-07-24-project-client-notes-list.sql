-- Convert the single client_note into a LIST of client notes. Each note is
-- {id, text, createdAt}. Owner manages the list from the project detail (add /
-- save / edit / delete); the client report lists them.

ALTER TABLE projects ADD COLUMN IF NOT EXISTS client_notes jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Migrate any existing single note into the new list (one entry). Only rows
-- that actually have a note and don't already have a list.
UPDATE projects
SET client_notes = jsonb_build_array(jsonb_build_object(
  'id', 'note_' || id,
  'text', client_note,
  'createdAt', to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
))
WHERE COALESCE(client_note, '') <> ''
  AND (client_notes IS NULL OR client_notes = '[]'::jsonb);

-- Rebuild projects_client so client logins can read client_notes. The view
-- enumerates columns from information_schema at build time. client_notes is
-- client-facing by design, so it passes through unscrubbed. (The old scalar
-- client_note column is harmless; left in place.)
DO $$
DECLARE cols text;
BEGIN
  SELECT string_agg(
    CASE column_name
      WHEN 'crew' THEN $f$COALESCE((SELECT jsonb_agg(e - 'payRatePerHour' - 'flatAmount' - 'payType') FROM jsonb_array_elements(COALESCE(p.crew,'[]'::jsonb)) e), '[]'::jsonb) AS crew$f$
      WHEN 'post_production' THEN $f$COALESCE((SELECT jsonb_agg(e - 'payRatePerHour' - 'flatAmount' - 'payType') FROM jsonb_array_elements(COALESCE(p.post_production,'[]'::jsonb)) e), '[]'::jsonb) AS post_production$f$
      WHEN 'services' THEN $f$COALESCE((SELECT jsonb_agg(e - 'cost') FROM jsonb_array_elements(COALESCE(p.services,'[]'::jsonb)) e), '[]'::jsonb) AS services$f$
      WHEN 'products' THEN $f$'[]'::jsonb AS products$f$
      ELSE 'p.' || quote_ident(column_name)
    END, ', ' ORDER BY ordinal_position)
  INTO cols FROM information_schema.columns WHERE table_schema='public' AND table_name='projects';
  EXECUTE format(
    'CREATE OR REPLACE VIEW public.projects_client AS SELECT %s FROM public.projects p '
    'WHERE p.org_id = public.user_org_id() AND public.user_role() = ''client'' AND ('
    '  p.client_id = ANY(public.user_client_ids()) '
    '  OR p.client_id IN (SELECT id FROM public.clients WHERE broker_id = ANY(public.user_client_ids())) '
    '  OR p.bill_to_id = ANY(public.user_client_ids())'
    ')', cols);
END $$;
GRANT SELECT ON public.projects_client TO anon, authenticated;
