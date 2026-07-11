// ============================================================
// Owner countersigns a staff member's already-signed 1099 agreement.
// Owner-only. Gated on the staff having signed first (staff_signed_at), same
// rule as contract countersign. Stamps owner_signature + owner_signed_at and
// sets status='completed'.
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { verifyAuth, errorMessage } from "./_auth.js";

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLL_KEY || ""
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const caller = await verifyAuth(req);
  if (!caller) return res.status(401).json({ error: "Unauthorized" });

  try {
    const { agreementId, signature } = req.body || {};
    if (!agreementId) return res.status(400).json({ error: "agreementId required" });
    if (!signature || typeof signature !== "object" || !signature.signatureData || !signature.name) {
      return res.status(400).json({ error: "Signature is required" });
    }

    const { data: profile } = await supabase
      .from("user_profiles").select("role, org_id, email").eq("id", caller.userId).single();
    if (!profile || profile.role !== "owner") return res.status(403).json({ error: "Only owners can countersign" });
    const orgId = profile.org_id;

    const { data: agreement } = await supabase
      .from("staff_agreements").select("id, org_id, staff_signed_at").eq("id", agreementId).single();
    if (!agreement || agreement.org_id !== orgId) return res.status(404).json({ error: "Agreement not found" });
    if (!agreement.staff_signed_at) return res.status(400).json({ error: "The staff member hasn't signed yet" });

    const ip = (req.headers["x-forwarded-for"] as string || "").split(",")[0].trim() || "unknown";
    const sig = {
      name: String(signature.name),
      email: String(signature.email || profile.email || ""),
      ip,
      timestamp: new Date().toISOString(),
      signatureData: String(signature.signatureData),
      signatureType: signature.signatureType === "typed" ? "typed" : "drawn",
    };

    const { error } = await supabase.from("staff_agreements").update({
      owner_signature: sig, owner_signed_at: sig.timestamp, status: "completed",
    }).eq("id", agreement.id);
    if (error) return res.status(500).json({ error: errorMessage(error, "Couldn't record your countersignature") });

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("owner-countersign-agreement error:", err);
    return res.status(500).json({ error: errorMessage(err, "Failed to countersign") });
  }
}
