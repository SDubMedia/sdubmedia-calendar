-- Multi-day projects: one project (one client, one status, one cost, ONE
-- invoice) spanning N calendar days with per-day times and an optional
-- per-day crew subset.
--
-- Shape of day_schedules:
--   [{"date":"YYYY-MM-DD","startTime":"HH:MM","endTime":"HH:MM","crewMemberIds":["cm_x"]}]
--
-- Semantics (enforced by the app's writers, tolerated defensively here):
--   * Empty array = legacy single-day project — date/start_time/end_time stay
--     authoritative and NOTHING changes behavior.
--   * Non-empty = multi-day. Always >= 2 rows, sorted by date; the app keeps
--     projects.date/start_time/end_time synced to the FIRST day on every save
--     so un-migrated surfaces (iOS, reports) degrade to "shows on day 1".
--   * crewMemberIds is an optional SUBSET of the top-level crew roster (by
--     crewMemberId). Absent/empty = the whole crew works that day. Pay and
--     hours stay on the top-level crew entries — NEVER in day_schedules,
--     because projects_client passes this column through to client logins
--     unscrubbed.

ALTER TABLE projects ADD COLUMN IF NOT EXISTS day_schedules jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Rebuild projects_client (mandatory after ANY projects column add — the view
-- enumerates columns at build time; without this, day_schedules reads as
-- undefined for agent/broker logins). day_schedules carries no pay data, so it
-- passes through the ELSE branch unscrubbed.
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

-- Rebuild shooter_busy so the agent open-slot search sees EVERY day of a
-- multi-day booking, and only marks a member busy on days they actually work:
-- a day's crewMemberIds decides membership; absent/empty/malformed = the whole
-- crew is busy that day (safe default). Single-day projects fall back to the
-- project's own date/times exactly as before. All three time fields are text
-- in both sources, so no casts. The jsonb ? operator matches string elements
-- of a jsonb array.
CREATE OR REPLACE VIEW public.shooter_busy AS
SELECT (c->>'crewMemberId') AS crew_member_id, d.date, d.start_time, d.end_time, p.org_id
FROM public.projects p
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(p.crew, '[]'::jsonb)) AS c
CROSS JOIN LATERAL (
  SELECT p.date AS date, p.start_time AS start_time, p.end_time AS end_time, NULL::jsonb AS day_crew
  WHERE jsonb_array_length(COALESCE(p.day_schedules, '[]'::jsonb)) = 0
  UNION ALL
  SELECT e->>'date', COALESCE(e->>'startTime',''), COALESCE(e->>'endTime',''), e->'crewMemberIds'
  FROM jsonb_array_elements(COALESCE(p.day_schedules, '[]'::jsonb)) e
) d
WHERE COALESCE(p.status, '') <> 'cancelled'
  AND p.org_id = public.user_org_id()
  AND d.date IS NOT NULL
  AND (
    d.day_crew IS NULL
    OR jsonb_typeof(d.day_crew) <> 'array'
    OR jsonb_array_length(d.day_crew) = 0
    OR d.day_crew ? (c->>'crewMemberId')
  );

GRANT SELECT ON public.shooter_busy TO anon, authenticated;
