// ============================================================
// Scout sync — fire-and-forget POST to Scout's conversions
// ingest endpoint. Called from stripe-webhook + revenuecat-webhook
// AFTER the customer's plan has already been granted.
//
// Five guardrails:
//   1. Kill switch: SCOUT_SYNC_ENABLED env var must be 'true'
//   2. Customer-first: caller must update org plan BEFORE calling this
//   3. Idempotent: dedupe_key UNIQUE on Scout side absorbs duplicate fires
//   4. Never throws: all failures logged + Cronitor pinged, never bubbled
//   5. Bounded: 5-second timeout via AbortSignal
//
// A Scout outage or bad token can never harm a paying customer's signup.
// ============================================================

import { errorMessage } from "./_auth.js";
import { pingCronitor } from "./_cronitor.js";

const SCOUT_MONITOR = "slate-scout-sync";

export interface ScoutConversionPayload {
  email: string;
  source: "web" | "ios";
  event_type: "initial_purchase" | "renewal" | "upgrade" | "downgrade" | "cancellation" | "reactivation";
  tier: "basic" | "pro" | "free";
  billing_interval?: "month" | "year" | null;
  amount_gross_cents?: number | null;
  amount_net_cents?: number | null;
  currency?: string;
  provider_subscription_id?: string | null;
  provider_customer_id?: string | null;
  dedupe_key: string;
  raw_payload?: Record<string, unknown>;
}

export async function syncConversionToScout(payload: ScoutConversionPayload): Promise<void> {
  if (process.env.SCOUT_SYNC_ENABLED !== "true") return;

  const url = process.env.SCOUT_API_URL;
  const token = process.env.SCOUT_INGEST_TOKEN;
  if (!url || !token) {
    console.error("[scout-sync] missing SCOUT_API_URL or SCOUT_INGEST_TOKEN — skipping");
    return;
  }

  try {
    const res = await fetch(`${url.replace(/\/$/, "")}/api/conversions/ingest`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(`[scout-sync] ${res.status} for ${payload.dedupe_key}: ${text.slice(0, 500)}`);
      await pingCronitor(SCOUT_MONITOR, "fail", {
        message: `${res.status} ${payload.event_type} ${payload.dedupe_key}`,
      });
      return;
    }

    await pingCronitor(SCOUT_MONITOR, "complete", {
      message: `${payload.event_type} ${payload.source} ${payload.tier}`,
    });
  } catch (err) {
    console.error(`[scout-sync] ${payload.dedupe_key}: ${errorMessage(err)}`);
    await pingCronitor(SCOUT_MONITOR, "fail", {
      message: `${errorMessage(err)} (${payload.dedupe_key})`,
    });
  }
}
