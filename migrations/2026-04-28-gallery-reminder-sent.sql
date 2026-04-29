-- Tier B: track when expiry-reminder email was sent so the daily cron
-- doesn't double-send if its window slides.

ALTER TABLE public.deliveries
  ADD COLUMN IF NOT EXISTS reminder_sent_at timestamptz;
