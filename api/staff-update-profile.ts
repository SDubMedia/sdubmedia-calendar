// ============================================================
// Staff self-update of their OWN crew_member profile during onboarding.
// crew_members has no staff UPDATE RLS policy (staff can only SELECT their
// own row), so — like accept-agreement.ts for clients — this runs server-side
// with the service role, strictly scoped to the caller's own crew_member and
// to a whitelist of safe columns. It MUST NOT accept tax_id, w9_url, pay
// rates, or role assignments.
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
    const { data: profile } = await supabase
      .from("user_profiles").select("role, crew_member_id, org_id").eq("id", caller.userId).single();
    if (!profile || profile.role !== "staff" || !profile.crew_member_id) {
      return res.status(403).json({ error: "Only a linked staff account can update this" });
    }

    const b = req.body || {};
    const str = (v: unknown) => (typeof v === "string" ? v : "");
    // Whitelist — only safe, self-owned contact/business fields. Anything not
    // listed here (tax_id, w9_url, role_rates, pay rate) is silently ignored.
    const patch: Record<string, unknown> = {
      name: str(b.name),
      phone: str(b.phone),
      email: str(b.email),
      business_name: str(b.businessName),
      business_address: str(b.businessAddress),
      business_city: str(b.businessCity),
      business_state: str(b.businessState),
      business_zip: str(b.businessZip),
    };
    if (b.homeAddress && typeof b.homeAddress === "object") patch.home_address = b.homeAddress;

    if (!patch.name || !patch.email || !patch.phone) {
      return res.status(400).json({ error: "Name, email, and phone are required" });
    }

    const { error } = await supabase
      .from("crew_members").update(patch)
      .eq("id", profile.crew_member_id).eq("org_id", profile.org_id);
    if (error) return res.status(500).json({ error: errorMessage(error, "Couldn't save your info") });

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("staff-update-profile error:", err);
    return res.status(500).json({ error: errorMessage(err, "Failed to save your info") });
  }
}
