-- ============================================================
-- Slate + Freelance Admin Queries
--
-- Paste into Supabase SQL Editor (or run with psql via SUPABASE_DB_URL)
-- for daily ops checks. Each section is independent.
-- ============================================================


-- ------------------------------------------------------------
-- 1. Who's paying right now (both apps unified)
-- ------------------------------------------------------------
-- Any org or freelancer currently on a paid tier + their billing state.
-- Copy into SQL Editor any time you want to see your paying customers.
--
-- app            — "slate" or "freelance"
-- identifier     — org name / producer display name
-- tier           — basic / pro / freelance / freelance_pro
-- billing_status — ok / past_due / cancelled
-- since          — first saw the paid tier (approximate — uses created_at)
-- ------------------------------------------------------------

SELECT 'slate' AS app,
       name AS identifier,
       plan AS tier,
       billing_status,
       stripe_subscription_id,
       created_at AS since
FROM organizations
WHERE plan IN ('basic', 'pro')
UNION ALL
SELECT 'freelance' AS app,
       COALESCE(display_name, email) AS identifier,
       subscription_tier AS tier,
       subscription_status AS billing_status,
       stripe_subscription_id,
       created_at AS since
FROM producer_profiles
WHERE subscription_tier IN ('freelance', 'freelance_pro')
  AND subscription_status IN ('active', 'trialing', 'past_due')
ORDER BY app, since DESC;


-- ------------------------------------------------------------
-- 2. Daily conversion funnel (last 30 days)
-- ------------------------------------------------------------
-- Events fired per day per app. Use to spot drops in upgrade_dialog_viewed →
-- checkout_started → checkout_completed.
-- ------------------------------------------------------------

SELECT
  DATE(created_at) AS day,
  metadata->>'app' AS app,
  event_name,
  COUNT(*) AS events
FROM analytics_events
WHERE created_at > now() - interval '30 days'
GROUP BY 1, 2, 3
ORDER BY 1 DESC, 2, 3;


-- ------------------------------------------------------------
-- 3. Funnel conversion rate (last 30 days, rolled up)
-- ------------------------------------------------------------
-- viewed → started → completed. Low numbers mean low traffic; low RATIOS
-- mean a leak in the flow.
-- ------------------------------------------------------------

WITH counts AS (
  SELECT
    metadata->>'app' AS app,
    event_name,
    COUNT(*) AS n
  FROM analytics_events
  WHERE created_at > now() - interval '30 days'
  GROUP BY 1, 2
)
SELECT
  app,
  MAX(CASE WHEN event_name = 'upgrade_dialog_viewed' THEN n END) AS viewed,
  MAX(CASE WHEN event_name = 'checkout_started' THEN n END) AS started,
  MAX(CASE WHEN event_name = 'checkout_completed' THEN n END) AS completed,
  MAX(CASE WHEN event_name = 'portal_opened' THEN n END) AS portal_opens
FROM counts
GROUP BY 1
ORDER BY 1;


-- ------------------------------------------------------------
-- 4. Trials ending soon (next 7 days) — Freelance only
--     (Slate's stripe_subscription_id is on orgs but we don't cache
--     trial_end here — for Slate check Stripe dashboard directly.)
-- ------------------------------------------------------------

SELECT email, display_name, subscription_tier, trial_ends_at
FROM producer_profiles
WHERE subscription_status = 'trialing'
  AND trial_ends_at IS NOT NULL
  AND trial_ends_at < now() + interval '7 days'
ORDER BY trial_ends_at;


-- ------------------------------------------------------------
-- 5. Past-due accounts needing attention
-- ------------------------------------------------------------
-- These users saw PaymentBanner and haven't updated their card yet.
-- Stripe auto-retries ~3 weeks before giving up; this is your warning window.
-- ------------------------------------------------------------

SELECT 'slate' AS app,
       name AS identifier,
       plan AS tier,
       stripe_customer_id
FROM organizations
WHERE billing_status = 'past_due'
UNION ALL
SELECT 'freelance' AS app,
       COALESCE(display_name, email) AS identifier,
       subscription_tier AS tier,
       stripe_customer_id
FROM producer_profiles
WHERE subscription_status = 'past_due';


-- ------------------------------------------------------------
-- 6. Recent cancellations (last 30 days)
-- ------------------------------------------------------------
-- Post-churn review. Compare against active subs — is retention healthy?
-- ------------------------------------------------------------

SELECT 'slate' AS app,
       name AS identifier,
       billing_status,
       stripe_customer_id
FROM organizations
WHERE billing_status = 'cancelled'
  AND stripe_customer_id != ''
UNION ALL
SELECT 'freelance' AS app,
       COALESCE(display_name, email) AS identifier,
       subscription_status AS billing_status,
       stripe_customer_id
FROM producer_profiles
WHERE subscription_status = 'cancelled'
  AND stripe_customer_id != '';


-- ------------------------------------------------------------
-- 7. Lookup a specific user (both apps, by email)
-- ------------------------------------------------------------
-- Replace 'someone@example.com' with the real email. Use when a
-- customer emails support and you need their current billing state.
-- ------------------------------------------------------------

SELECT 'slate org' AS kind,
       o.name, o.plan, o.billing_status, o.stripe_customer_id
FROM organizations o
JOIN user_profiles p ON p.org_id = o.id
JOIN auth.users u ON u.id = p.id
WHERE u.email = 'someone@example.com'
UNION ALL
SELECT 'freelance profile' AS kind,
       COALESCE(display_name, email), subscription_tier, subscription_status, stripe_customer_id
FROM producer_profiles
WHERE email = 'someone@example.com';


-- ------------------------------------------------------------
-- 8. Signup source over time (Slate only — Freelance doesn't track it yet)
-- ------------------------------------------------------------
-- New Slate orgs per week. Set a goal, watch this.
-- ------------------------------------------------------------

SELECT
  date_trunc('week', created_at) AS week,
  COUNT(*) AS new_orgs
FROM organizations
WHERE id != 'org_sdubmedia'
GROUP BY 1
ORDER BY 1 DESC
LIMIT 12;


-- ------------------------------------------------------------
-- 9. Rough MRR (monthly recurring revenue)
-- ------------------------------------------------------------
-- Back-of-envelope — doesn't account for annual subs (divide by 12 for those)
-- or trial/past_due states that aren't technically billing. For real MRR,
-- use Stripe's Revenue Recognition dashboard.
-- ------------------------------------------------------------

SELECT
  SUM(CASE
    WHEN plan = 'basic' THEN 9.99
    WHEN plan = 'pro' THEN 19.99
    ELSE 0
  END) AS slate_mrr_usd
FROM organizations
WHERE plan IN ('basic', 'pro')
  AND billing_status != 'cancelled';

SELECT
  SUM(CASE
    WHEN subscription_tier = 'freelance' THEN 9.99
    WHEN subscription_tier = 'freelance_pro' THEN 19.99
    ELSE 0
  END) AS freelance_mrr_usd
FROM producer_profiles
WHERE subscription_tier IN ('freelance', 'freelance_pro')
  AND subscription_status IN ('active', 'trialing');
