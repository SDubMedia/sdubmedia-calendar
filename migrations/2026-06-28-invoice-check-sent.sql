-- Broker "Check Mailed" tracking: the broker taps Check Mailed in their app
-- when they put a check in the mail; the owner sees it's coming and marks the
-- invoice paid when it arrives. Brokers can't write invoices directly (RLS is
-- read-only for the client role), so the tap goes through api/mark-invoice-
-- check-sent.ts with the service role — no RLS change needed here.
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS check_sent_at date;
