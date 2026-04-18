// ============================================================
// analytics.ts — fire-and-forget conversion funnel events
// Posts to /api/track (added in Stage 4). Never blocks the UI.
// ============================================================

import { supabase } from "@/lib/supabase";

export type AnalyticsEvent =
  | "upgrade_dialog_viewed"
  | "checkout_started"
  | "checkout_completed"
  | "portal_opened";

export async function trackEvent(event: AnalyticsEvent, metadata: Record<string, unknown> = {}) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    await fetch("/api/track", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      },
      body: JSON.stringify({ event, metadata }),
      keepalive: true,
    });
  } catch {
    // Intentionally swallow — analytics should never break the app.
  }
}
