// ============================================================
// analytics.ts — fire-and-forget conversion funnel events.
// Posts to /api/track. Never blocks the UI.
//
// Attribution: captures utm_* query params on first landing into
// BOTH a cross-subdomain cookie (.sdubmedia.com) AND localStorage.
// The cookie survives cross-subdomain navigation (slate <->
// freelance <-> scout); localStorage is a redundancy layer.
// First-touch wins — we don't overwrite existing attribution.
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
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

function attributionCookieDomain(): string | null {
  if (typeof window === "undefined") return null;
  const host = window.location.hostname;
  if (host.endsWith(".sdubmedia.com") || host === "sdubmedia.com") return ".sdubmedia.com";
  if (host.endsWith(".getslate.net") || host === "getslate.net") return ".getslate.net";
  return null;
}

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const cookies = document.cookie.split(";").map((c) => c.trim());
  for (const c of cookies) {
    const eq = c.indexOf("=");
    if (eq === -1) continue;
    if (c.slice(0, eq) === name) return decodeURIComponent(c.slice(eq + 1));
  }
  return null;
}

function writeCookie(name: string, value: string): void {
  if (typeof document === "undefined") return;
  const domain = attributionCookieDomain();
  const domainPart = domain ? `;domain=${domain}` : "";
  document.cookie = `${name}=${encodeURIComponent(value)};path=/;max-age=${COOKIE_MAX_AGE_SECONDS};samesite=lax${domainPart}`;
}

// Pull utm_* off the URL on first landing. Persists to BOTH the
// cross-subdomain cookie and localStorage. First-touch wins.
export function captureAttribution(): void {
  if (typeof window === "undefined") return;
  try {
    const existing = getAttribution();
    if (Object.keys(existing).length > 0) return;

    const params = new URLSearchParams(window.location.search);
    const captured: Record<string, string> = {};
    for (const k of UTM_FIELDS) {
      const v = params.get(k);
      if (v) captured[k] = v;
    }
    if (Object.keys(captured).length === 0) return;

    const payload = JSON.stringify({ ...captured, captured_at: new Date().toISOString() });
    try { localStorage.setItem(ATTRIBUTION_KEY, payload); } catch { /* private mode */ }
    writeCookie(ATTRIBUTION_KEY, payload);
    void trackEvent("landing_attributed", captured);
  } catch {
    // localStorage / cookies can throw in private mode — don't crash the app
  }
}

export function getAttribution(): Record<string, string> {
  if (typeof window === "undefined") return {};
  // Cookie wins over localStorage because it survives cross-subdomain
  // navigation. localStorage is the fallback for cookie-disabled browsers.
  const raw = readCookie(ATTRIBUTION_KEY) ?? (() => {
    try { return localStorage.getItem(ATTRIBUTION_KEY); } catch { return null; }
  })();
  if (!raw) return {};
  try {
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
