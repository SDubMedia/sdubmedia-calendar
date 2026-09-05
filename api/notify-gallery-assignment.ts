// ============================================================
// Owner sends a specific batch of proofs to an editor for retouching —
// independent of client selections. The photos themselves are already
// marked assigned_crew_member_id client-side before this fires; this just
// notifies (push + email) and reports how many are pending right now.
// Owner-only.
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { verifyAuth, getUserOrgId, escapeHtml, errorMessage } from "./_auth.js";
import { sendPushToUser } from "./_apns.js";

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLL_KEY || ""
);
const resend = new Resend(process.env.RESEND_API_KEY);
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";
const APP_URL = process.env.APP_URL || "https://slate.sdubmedia.com";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST required" });

  const caller = await verifyAuth(req);
  if (!caller) return res.status(401).json({ error: "Unauthorized" });

  try {
    const { deliveryId, crewMemberId } = req.body || {};
    if (!deliveryId || !crewMemberId) return res.status(400).json({ error: "deliveryId + crewMemberId required" });

    const { data: callerProfile } = await supabase.from("user_profiles").select("role").eq("id", caller.userId).single();
    if (!callerProfile || callerProfile.role !== "owner") return res.status(403).json({ error: "Only owners can send this" });
    const orgId = await getUserOrgId(caller.userId);

    const { data: delivery } = await supabase
      .from("deliveries").select("id, title, org_id").eq("id", deliveryId).single();
    if (!delivery || delivery.org_id !== orgId) return res.status(404).json({ error: "Gallery not found" });

    const { data: member } = await supabase
      .from("crew_members").select("id, name, email").eq("id", crewMemberId).eq("org_id", orgId).single();
    if (!member) return res.status(404).json({ error: "Crew member not found" });

    const { data: staffProfile } = await supabase
      .from("user_profiles").select("id").eq("crew_member_id", crewMemberId).eq("org_id", orgId).eq("role", "staff").maybeSingle();
    if (!staffProfile) return res.status(400).json({ error: `${member.name} has no login yet — invite them first.` });

    // Recompute server-side — never trust a client-supplied count.
    const { count } = await supabase
      .from("delivery_files")
      .select("id", { count: "exact", head: true })
      .eq("delivery_id", deliveryId)
      .eq("assigned_crew_member_id", crewMemberId);
    const pending = count ?? 0;
    if (pending === 0) return res.status(400).json({ error: "Nothing is currently assigned to this person on this gallery" });

    const plural = pending === 1 ? "photo" : "photos";
    const pushBody = `${pending} ${plural} assigned to you — ${delivery.title}`;

    // Both notifications are best-effort side effects. Awaited (Vercel
    // freezes the invocation the moment we respond, so a dangling promise
    // delivers only sometimes) and settled independently, so a push hiccup
    // never costs her the email or vice versa. The assignment itself is
    // already saved on the files by the time this route is called.
    const email = (member.email || "").trim();
    const sideEffects: [string, Promise<unknown>][] = [
      ["push", sendPushToUser(staffProfile.id, { title: "Photos ready to edit", body: pushBody, data: { url: `/deliveries/${deliveryId}` } })],
    ];
    if (email) {
      sideEffects.push(["email", resend.emails.send({
        from: `Slate <${FROM_EMAIL}>`, to: email, subject: `${pending} ${plural} ready to edit — ${delivery.title}`,
        html: `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1e293b;">
          <p style="font-size:15px;line-height:1.6;">Hi ${escapeHtml((member.name || "there").split(" ")[0])},</p>
          <p style="font-size:15px;line-height:1.6;">${pending} ${plural} from <strong>${escapeHtml(delivery.title)}</strong> ${pending === 1 ? "is" : "are"} ready for you to edit.</p>
          <p style="margin:20px 0;"><a href="${APP_URL}/deliveries/${deliveryId}" style="background:#0088ff;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px;">Open in Slate</a></p>
        </div>`,
      }).then(r => { if (r.error) throw new Error(r.error.message); return r; })]);
    }
    const settled = await Promise.allSettled(sideEffects.map(([, p]) => p));
    settled.forEach((r, i) => {
      if (r.status === "rejected") console.warn(`[notify-gallery-assignment] ${sideEffects[i][0]} failed: ${errorMessage(r.reason)}`);
    });
    // Report what actually happened — the UI tells the owner "no email on
    // file" vs. sent, and a failed send must not read as sent.
    const emailIdx = sideEffects.findIndex(([k]) => k === "email");
    const emailed = emailIdx >= 0 && settled[emailIdx].status === "fulfilled";

    return res.status(200).json({ ok: true, pending, emailed });
  } catch (err) {
    console.error("notify-gallery-assignment error:", err);
    return res.status(500).json({ error: errorMessage(err, "Couldn't send the notification") });
  }
}
