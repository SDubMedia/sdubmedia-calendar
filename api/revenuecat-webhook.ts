// ============================================================
// Vercel Serverless Function — RevenueCat webhook receiver
//
// RevenueCat normalizes Apple's App Store Server Notifications +
// Google Play Billing into a single event stream and POSTs them
// here. We map those events back onto the same `organizations.plan`
// + features columns the Stripe webhook owns on the web side, so
// an iOS purchase shows up in the web app and vice versa.
//
// Auth: RC sends a configurable Authorization header. We compare
// it (timing-safe) to REVENUECAT_WEBHOOK_AUTH from env. Anything
// without that header is rejected as unauthenticated.
//
// Event mapping:
//   INITIAL_PURCHASE / RENEWAL / PRODUCT_CHANGE / TRANSFER /
//   UNCANCELLATION → grant tier from entitlement_ids
//   CANCELLATION (user opted out, still has access) → keep plan,
//     mark billing_status='ok' (real downgrade happens on EXPIRATION)
//   EXPIRATION → downgrade to 'free'
//   BILLING_ISSUE → keep plan, mark billing_status='past_due'
//   SUBSCRIPTION_PAUSED → keep plan, mark billing_status='past_due'
//   NON_RENEWING_PURCHASE → not used (no consumables)
//   TEST → log + 200 (RC dashboard "Send Test" button uses this)
//
// Notes:
//   - SANDBOX events (TestFlight) are processed the same as PRODUCTION
//     so testers see real entitlement state on their account.
//   - app_user_id is the Supabase user id (set by initRevenueCat()
//     in slate-mobile). We look up that user's org_id and update
//     the org row.
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { timingSafeEqual } from "crypto";
import { errorMessage } from "./_auth.js";
import { syncConversionToScout, type ScoutConversionPayload } from "./_scoutSync.js";

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLL_KEY || "";
const supabase = createClient(supabaseUrl, serviceKey);

// Pro-tier feature unlocks — mirror the Stripe webhook's list so
// iOS-purchased orgs get the same feature set as Stripe-purchased ones.
const PRO_FEATURE_KEYS = ["profitLoss", "partnerSplits", "mileage", "budget", "clientHealth"] as const;

function featureOverridesForPlan(plan: string): Record<string, boolean> {
  const p = (plan || "").toLowerCase();
  if (p === "pro") return Object.fromEntries(PRO_FEATURE_KEYS.map(k => [k, true]));
  return Object.fromEntries(PRO_FEATURE_KEYS.map(k => [k, false]));
}

async function applyPlan(orgId: string, plan: "pro" | "basic" | "free", billingStatus: "ok" | "past_due") {
  const paid = plan !== "free";
  const { data: org } = await supabase
    .from("organizations")
    .select("features")
    .eq("id", orgId)
    .maybeSingle();
  const existingFeatures = (org?.features as Record<string, unknown>) || {};
  const newFeatures = { ...existingFeatures, ...featureOverridesForPlan(plan) };

  await supabase
    .from("organizations")
    .update({
      plan,
      project_limit: paid ? -1 : 10,
      billing_status: billingStatus,
      features: newFeatures,
    })
    .eq("id", orgId);
}

function tierFromEntitlements(entitlements: string[] | undefined): "pro" | "basic" | "free" {
  const set = new Set((entitlements || []).map(e => e.toLowerCase()));
  if (set.has("pro")) return "pro";
  if (set.has("basic")) return "basic";
  return "free";
}

// Derive billing interval from product_id naming convention:
//   slate_{tier}_monthly | slate_{tier}_annual
function intervalFromProductId(productId: string | undefined): "month" | "year" | null {
  if (!productId) return null;
  const p = productId.toLowerCase();
  if (p.includes("annual") || p.includes("yearly") || p.includes("year")) return "year";
  if (p.includes("monthly") || p.includes("month")) return "month";
  return null;
}

// Map RevenueCat event types to Scout conversion event_type. Returns null
// for events Scout doesn't track (e.g. CANCELLATION before EXPIRATION,
// where the user still has access).
function scoutEventTypeFor(rcType: string): ScoutConversionPayload["event_type"] | null {
  switch (rcType) {
    case "INITIAL_PURCHASE":
      return "initial_purchase";
    case "RENEWAL":
      return "renewal";
    case "PRODUCT_CHANGE":
      return "upgrade";
    case "UNCANCELLATION":
      return "reactivation";
    case "EXPIRATION":
      return "cancellation";
    default:
      return null;
  }
}

function verifyAuthHeader(headerValue: string | undefined): boolean {
  const expected = process.env.REVENUECAT_WEBHOOK_AUTH || "";
  if (!expected || !headerValue) return false;
  const a = Buffer.from(headerValue);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Timing-safe shared-secret check. RC sends this header on every
  // webhook, configured in their dashboard. Without it, anyone with
  // the URL could forge subscription state.
  const auth = req.headers.authorization || (req.headers.Authorization as string | undefined);
  if (!verifyAuthHeader(auth)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const body = req.body as { event?: Record<string, unknown>; api_version?: string };
    const event = body?.event;
    if (!event) {
      return res.status(400).json({ error: "Missing event payload" });
    }

    const type = String(event.type || "").toUpperCase();

    // RC "Send Test Event" button — always succeed so the dashboard
    // shows a green checkmark.
    if (type === "TEST") {
      console.log("[revenuecat-webhook] TEST event received");
      return res.status(200).json({ ok: true, test: true });
    }

    const appUserId = String(event.app_user_id || "");
    if (!appUserId) {
      console.warn("[revenuecat-webhook] no app_user_id on event:", type);
      return res.status(200).json({ ok: true, skipped: "no app_user_id" });
    }

    // Map Supabase user → org. RC's appUserID was set to the Supabase
    // user.id by initRevenueCat() in the mobile app. Pull email at the
    // same time — Scout sync needs it to match prospects.
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("org_id, email")
      .eq("id", appUserId)
      .maybeSingle();

    if (!profile?.org_id) {
      console.warn(`[revenuecat-webhook] no org for app_user_id=${appUserId} event=${type}`);
      return res.status(200).json({ ok: true, skipped: "user not in any org" });
    }

    const orgId = profile.org_id as string;
    const userEmail = (profile.email as string) || "";
    const entitlements = Array.isArray(event.entitlement_ids)
      ? (event.entitlement_ids as string[])
      : [];

    switch (type) {
      case "INITIAL_PURCHASE":
      case "RENEWAL":
      case "PRODUCT_CHANGE":
      case "TRANSFER":
      case "UNCANCELLATION": {
        const tier = tierFromEntitlements(entitlements);
        await applyPlan(orgId, tier, "ok");
        break;
      }

      case "CANCELLATION": {
        // User opted out of auto-renew but still has access until
        // expiration. Don't downgrade here — wait for EXPIRATION.
        await supabase
          .from("organizations")
          .update({ billing_status: "ok" })
          .eq("id", orgId);
        break;
      }

      case "EXPIRATION": {
        await applyPlan(orgId, "free", "ok");
        break;
      }

      case "BILLING_ISSUE":
      case "SUBSCRIPTION_PAUSED": {
        // Keep current plan (grace period), flag billing_status so
        // the existing PaymentBanner surfaces the issue.
        await supabase
          .from("organizations")
          .update({ billing_status: "past_due" })
          .eq("id", orgId);
        break;
      }

      case "NON_RENEWING_PURCHASE":
        // No one-time products configured; log and skip.
        console.log(`[revenuecat-webhook] NON_RENEWING_PURCHASE received for ${orgId} — no handler`);
        break;

      default:
        console.log(`[revenuecat-webhook] unhandled event type: ${type}`);
        break;
    }

    // Scout sync (fire-and-forget — never throws, never blocks).
    // Only forward events that represent a real conversion lifecycle moment.
    const scoutEventType = scoutEventTypeFor(type);
    if (scoutEventType && userEmail) {
      const productId = typeof event.product_id === "string" ? event.product_id : "";
      const priceDollars = typeof event.price_in_purchased_currency === "number"
        ? event.price_in_purchased_currency
        : null;
      const grossCents = priceDollars !== null ? Math.round(priceDollars * 100) : null;
      const commissionPct = typeof event.commission_percentage === "number" ? event.commission_percentage : null;
      const netCents = grossCents !== null && commissionPct !== null
        ? Math.round(grossCents * (1 - commissionPct))
        : null;
      const currency = typeof event.currency === "string" ? event.currency.toLowerCase() : "usd";
      const eventId = String(event.id || `${appUserId}_${event.event_timestamp_ms || Date.now()}`);
      const txId = typeof event.original_transaction_id === "string"
        ? event.original_transaction_id
        : typeof event.transaction_id === "string" ? event.transaction_id : null;

      const tier: "pro" | "basic" | "free" =
        scoutEventType === "cancellation"
          ? "free"
          : tierFromEntitlements(entitlements);

      syncConversionToScout({
        email: userEmail,
        source: "ios",
        event_type: scoutEventType,
        tier,
        billing_interval: intervalFromProductId(productId),
        amount_gross_cents: grossCents,
        amount_net_cents: netCents,
        currency,
        provider_subscription_id: txId,
        provider_customer_id: appUserId,
        dedupe_key: `rc_${eventId}`,
        raw_payload: { rc_event_type: type, product_id: productId, entitlements },
      });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("[revenuecat-webhook] error:", err);
    return res.status(500).json({ error: errorMessage(err, "Webhook failed") });
  }
}
