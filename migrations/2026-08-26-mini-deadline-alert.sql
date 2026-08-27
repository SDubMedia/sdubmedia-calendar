-- ============================================================
-- Remember that we've told the owner about a closed claim window.
--
-- Without this the daily cron would alert every morning for the rest of the
-- event's life. The obvious alternative — flipping the booking's status — is
-- wrong: they must still be able to take a leftover time (their deposit still
-- counts toward it), and "no_show" means they didn't turn up on the day, which
-- is a different thing that would also read as red on the roster.
-- ============================================================

ALTER TABLE public.mini_sessions
  ADD COLUMN IF NOT EXISTS deadline_alerted_at timestamptz;

COMMENT ON COLUMN public.mini_sessions.deadline_alerted_at IS
  'When the owner was told the claim window closed with places unclaimed. Stops the daily cron repeating it.';
