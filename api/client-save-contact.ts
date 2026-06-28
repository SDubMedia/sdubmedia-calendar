// ============================================================
// A client saves their own contact info (address + phone) — used by the
// photography client's required first-run setup. Clients are read-only on the
// clients table (RLS), so this runs with the service role after verifying the
// caller owns the client record (and it's an agent/photography client).
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

  const { address, phone } = req.body ?? {};
  if (typeof address !== "string" || !address.trim()) return res.status(400).json({ error: "Address is required" });
  if (typeof phone !== "string" || !phone.trim()) return res.status(400).json({ error: "Phone is required" });

  try {
    const { data: profile } = await supabase.from("user_profiles").select("role, client_ids").eq("id", caller.userId).single();
    if (!profile || profile.role !== "client") return res.status(403).json({ error: "Only a client can do this" });
    const orgId = await getUserOrgId(caller.userId);
    const clientIds: string[] = Array.isArray(profile.client_ids) ? profile.client_ids : [];

    const { data: clientRec } = await supabase
      .from("clients").select("id")
      .in("id", clientIds).eq("org_id", orgId).in("client_type", ["agent", "photography"]).maybeSingle();
    if (!clientRec) return res.status(403).json({ error: "No client record to update" });

    const { error } = await supabase.from("clients")
      .update({ address: address.trim(), phone: phone.trim() }).eq("id", clientRec.id);
    if (error) throw new Error(error.message);

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("client-save-contact error:", err);
    return res.status(500).json({ error: errorMessage(err, "Couldn't save your info") });
  }
}
