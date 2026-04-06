// ============================================================
// Proposal View Tracking — Records when client first opens link
// Public endpoint, no auth required
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLL_KEY || ""
);
const resend = new Resend(process.env.RESEND_API_KEY);
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { token } = req.query;
  if (!token) return res.status(400).json({ error: "Missing token" });

  const { data: proposal } = await supabase
    .from("proposals")
    .select("id, org_id, title, client_email, viewed_at")
    .eq("view_token", token as string)
    .single();

  if (!proposal) return res.status(404).json({ error: "Not found" });

  // Only record + notify on first view
  if (!proposal.viewed_at) {
    await supabase.from("proposals").update({
      viewed_at: new Date().toISOString(),
    }).eq("id", proposal.id);

    // Notify owner
    if (proposal.org_id) {
      const { data: org } = await supabase.from("organizations").select("id").eq("id", proposal.org_id).single();
      if (org) {
        const { data: profiles } = await supabase.from("user_profiles").select("email").eq("org_id", org.id).eq("role", "owner");
        const ownerEmail = profiles?.[0]?.email;
        if (ownerEmail) {
          resend.emails.send({
            from: FROM_EMAIL, to: ownerEmail,
            subject: `Proposal Viewed: ${proposal.title}`,
            html: `<p style="font-family:sans-serif;color:#1e293b;">Your proposal <strong>${proposal.title}</strong> was just viewed by <strong>${proposal.client_email}</strong>.</p>`,
          }).catch(() => {});
        }
      }
    }
  }

  return res.status(200).json({ viewed: true });
}
