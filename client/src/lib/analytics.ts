// ============================================================
// analytics.ts — fire-and-forget conversion funnel events.
// Posts to /api/track. Never blocks the UI.
//
// Attribution: captures utm_* query params on first landing into
// localStorage so every later event carries the campaign that
// referred the visitor (for Scout ↔ admin attribution).
// ============================================================

import { supabase } from "@/lib/supabase";

export type AnalyticsEvent =
  | "upgrade_dialog_viewed"
  | "checkout_started"
  | "checkout_completed"
  | "portal_opened"
  | "signup_attributed"
  | "landing_attributed";

const ATTRIBUTION_KEY = "sdub_attribution";
const UTM_FIELDS = ["utm_campaign", "utm_source", "utm_medium", "utm_content", "utm_term"] as const;

// Pull utm_* off the URL into localStorage. First-touch wins: once set,
// we don't overwrite until the caller clears it.
export function captureAttribution(): void {
  if (typeof window === "undefined") return;
  try {
    const existing = localStorage.getItem(ATTRIBUTION_KEY);
    if (existing) return;
    const params = new URLSearchParams(window.location.search);
    const captured: Record<string, string> = {};
    for (const k of UTM_FIELDS) {
      const v = params.get(k);
      if (v) captured[k] = v;
    }
    if (Object.keys(captured).length === 0) return;
    localStorage.setItem(
      ATTRIBUTION_KEY,
      JSON.stringify({ ...captured, captured_at: new Date().toISOString() }),
    );
    void trackEvent("landing_attributed", captured);
  } catch {
    // localStorage can throw in private mode — don't crash the app
  }
}

export function getAttribution(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(ATTRIBUTION_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed ? parsed : {};
  } catch {
    return {};
  }
}

export async function trackEvent(event: AnalyticsEvent, metadata: Record<string, unknown> = {}) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const attribution = getAttribution();
    await fetch("/api/track", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      },
      body: JSON.stringify({ event, metadata: { ...attribution, ...metadata } }),
      keepalive: true,
    });
  } catch {
    // Intentionally swallow — analytics should never break the app.
  }
}

// Run once at module import on the client. Safe for SSR (no-op without window).
captureAttribution();
