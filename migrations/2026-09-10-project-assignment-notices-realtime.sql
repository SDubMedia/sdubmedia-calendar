-- Owner sees "Notified" land on the project sheet the moment the route
-- inserts, without a refresh. Same treatment shoot_confirmations got.
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE project_assignment_notices;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_object THEN NULL; END $$;
