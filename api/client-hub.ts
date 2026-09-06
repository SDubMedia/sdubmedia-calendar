// ============================================================
// Owner: get (creating if needed) the permanent hub link for a client.
// One row per (org, client); the token never changes once minted, so the
// link a client bookmarked keeps working. Owner-only.
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "crypto";
import { verifyAuth, getUserOrgId, errorMessage } from "./_auth.js";

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLL_KEY || ""
);
const APP_URL = process.env.APP_URL || "https://slate.sdubmedia.com";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST required" });

  const caller = await verifyAuth(req);
  if (!caller) return res.status(401).json({ error: "Unauthorized" });

  const { clientId } = (req.body || {}) as { clientId?: string };
  if (!clientId || typeof clientId !== "string") return res.status(400).json({ error: "clientId required" });

  try {
    const { data: prof } = await supabase.from("user_profiles").select("role").eq("id", caller.userId).maybeSingle();
    if (!prof || prof.role !== "owner") return res.status(403).json({ error: "Only owners can share a client hub" });
    const orgId = await getUserOrgId(caller.userId);
    if (!orgId) return res.status(403).json({ error: "No org" });

    const { data: client } = await supabase.from("clients").select("id, org_id").eq("id", clientId).maybeSingle();
    if (!client || client.org_id !== orgId) return res.status(404).json({ error: "Client not found" });

    const { data: existing } = await supabase
      .from("client_hubs").select("token").eq("org_id", orgId).eq("client_id", clientId).maybeSingle();
    let token = existing?.token as string | undefined;
    if (!token) {
      token = randomBytes(12).toString("base64url");
      const { error } = await supabase.from("client_hubs").insert({ org_id: orgId, client_id: clientId, token });
      if (error) throw new Error(error.message);
    }
    return res.status(200).json({ ok: true, data: { token, url: `${APP_URL}/hub/${token}` } });
  } catch (err) {
    return res.status(500).json({ error: errorMessage(err, "Couldn't create the hub link") });
  }
}
