-- Add payment_milestones to contracts so the payment-reminders cron can
-- query them directly + stamp paidAt per-milestone via the Stripe webhook.
-- Same shape as proposals.payment_milestones plus per-milestone tracking
-- fields (id, lastReminderSentAt, paidAt) populated in proposal-accept.

ALTER TABLE contracts
  ADD COLUMN IF NOT EXISTS payment_milestones jsonb NOT NULL DEFAULT '[]';
