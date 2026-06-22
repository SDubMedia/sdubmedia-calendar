// ============================================================
// Records that the calling agent/broker accepted the current disclosure terms.
// Client-role users can't write their own clients row directly (RLS), so this
// runs server-side with the service role, strictly scoped to the caller's own
// client record. Stamps agreement_accepted_at + agreement_version.
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { verifyAuth, getUserOrgId, errorMessage } from "./_auth.js";

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLL_KEY || ""
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const caller = await verifyAuth(req);
  if (!caller) return res.status(401).json({ error: "Unauthorized" });

  try {
    const { version } = req.body || {};
    if (!version || typeof version !== "string") return res.status(400).json({ error: "Missing agreement version" });

    const { data: profile } = await supabase.from("user_profiles").select("role, client_ids").eq("id", caller.userId).single();
    if (!profile || profile.role !== "client") return res.status(403).json({ error: "Only an agent or broker can accept this" });
    const orgId = await getUserOrgId(caller.userId);
    const clientIds: string[] = Array.isArray(profile.client_ids) ? profile.client_ids : [];

    // The caller's own agent/broker client record, in their org.
    const { data: client } = await supabase
      .from("clients").select("id, client_type")
      .in("id", clientIds).eq("org_id", orgId).in("client_type", ["agent", "broker"]).maybeSingle();
    if (!client) return res.status(403).json({ error: "No agent or broker record for this account" });

    const { error } = await supabase.from("clients").update({
      agreement_accepted_at: new Date().toISOString(),
      agreement_version: version,
    }).eq("id", client.id);
    if (error) return res.status(500).json({ error: errorMessage(error, "Couldn't record your agreement") });

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("accept-agreement error:", err);
    return res.status(500).json({ error: errorMessage(err, "Failed to record agreement") });
  }
}
