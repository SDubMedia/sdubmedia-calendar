// ============================================================
// Analytics event ingestion — lightweight conversion-funnel logger.
// Writes to analytics_events via service role. Anonymous events are
// accepted (unauth) so we can capture pre-signup moments.
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLL_KEY || "";

const ALLOWED_EVENTS = new Set([
  "upgrade_dialog_viewed",
  "checkout_started",
  "checkout_completed",
  "portal_opened",
]);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST required" });

  const { event, metadata } = (req.body || {}) as { event?: string; metadata?: Record<string, unknown> };
  if (!event || !ALLOWED_EVENTS.has(event)) return res.status(400).json({ error: "Unknown event" });

  if (!supabaseUrl || !supabaseServiceKey) {
    // Analytics should never break the app; silently drop if config is missing.
    return res.status(200).json({ ok: true });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Attribute to user + org if a valid Bearer token is present. Optional.
  let userId: string | null = null;
  let orgId: string | null = null;
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    try {
      const { data: userData } = await supabase.auth.getUser(token);
      if (userData?.user) {
        userId = userData.user.id;
        const { data: profile } = await supabase
          .from("user_profiles")
          .select("org_id")
          .eq("id", userId)
          .maybeSingle();
        orgId = profile?.org_id || null;
      }
    } catch {
      // ignore auth errors — treat as anonymous
    }
  }

  await supabase.from("analytics_events").insert({
    event_name: event,
    user_id: userId,
    org_id: orgId,
    metadata: { app: "slate", ...(metadata || {}) },
  });

  return res.status(200).json({ ok: true });
}
