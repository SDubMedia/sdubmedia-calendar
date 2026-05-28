// ============================================================
// /api/register-push-token — the app sends its APNs device token here
// after the user grants push permission. Upserts by token so a device
// that re-registers (or moves accounts) updates in place.
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { verifyAuth, getUserOrgId, errorMessage } from "./_auth.js";

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLL_KEY || ""
);

function nanoid(): string {
  return Math.random().toString(36).slice(2, 14);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST required" });

  const user = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const { token, platform } = req.body || {};
  if (!token || typeof token !== "string") return res.status(400).json({ error: "Missing token" });

  const orgId = await getUserOrgId(user.userId);
  if (!orgId) return res.status(404).json({ error: "Org not found" });

  try {
    const { error } = await supabase
      .from("device_tokens")
      .upsert({
        id: `dt_${nanoid()}`,
        org_id: orgId,
        user_id: user.userId,
        token: token.trim(),
        platform: (platform === "android" ? "android" : "ios"),
        updated_at: new Date().toISOString(),
      }, { onConflict: "token" });
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: errorMessage(err, "Failed to register token") });
  }
}
