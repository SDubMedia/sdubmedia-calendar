// ============================================================
// Owner starts connecting their Google Drive — returns the Google consent URL
// (the frontend redirects the browser there). Owner-only.
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { verifyAuth, getUserOrgId, errorMessage } from "./_auth.js";
import { consentUrl, googleConfigured } from "./_google.js";

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLL_KEY || ""
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST required" });
  if (!googleConfigured()) return res.status(400).json({ error: "Google Drive isn't configured on the server" });

  const caller = await verifyAuth(req);
  if (!caller) return res.status(401).json({ error: "Unauthorized" });

  try {
    const { data: profile } = await supabase.from("user_profiles").select("role").eq("id", caller.userId).single();
    if (!profile || profile.role !== "owner") return res.status(403).json({ error: "Only owners can connect Google Drive" });
    const orgId = await getUserOrgId(caller.userId);
    return res.status(200).json({ url: consentUrl(orgId) });
  } catch (err) {
    console.error("google-drive-connect error:", err);
    return res.status(500).json({ error: errorMessage(err, "Couldn't start Google Drive connection") });
  }
}
