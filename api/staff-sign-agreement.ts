// ============================================================
// Staff signs their 1099 independent-contractor agreement during onboarding.
// Creates (or updates) the staff_agreements row for the caller's crew member
// and the given agreement version, stamps the staff signature (server-captured
// ip + timestamp, same JSONB shape as contracts), sets status='staff_signed',
// and emails the owner that a countersignature is needed. Owner countersigns
// via owner-countersign-agreement.ts.
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import { Resend } from "resend";
import { verifyAuth, escapeHtml, errorMessage } from "./_auth.js";

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLL_KEY || ""
);
const resend = new Resend(process.env.RESEND_API_KEY);
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";
const APP_URL = process.env.APP_URL || "https://slate.sdubmedia.com";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const caller = await verifyAuth(req);
  if (!caller) return res.status(401).json({ error: "Unauthorized" });

  try {
    const { agreementVersion, agreementTitle, agreementText, signature } = req.body || {};
    if (!agreementVersion || typeof agreementVersion !== "string") return res.status(400).json({ error: "Missing agreement version" });
    if (!signature || typeof signature !== "object" || !signature.signatureData || !signature.name) {
      return res.status(400).json({ error: "Signature is required" });
    }

    const { data: profile } = await supabase
      .from("user_profiles").select("role, crew_member_id, org_id, email").eq("id", caller.userId).single();
    if (!profile || profile.role !== "staff" || !profile.crew_member_id) {
      return res.status(403).json({ error: "Only a linked staff account can sign this" });
    }
    const orgId = profile.org_id;

    const { data: member } = await supabase
      .from("crew_members").select("id, name").eq("id", profile.crew_member_id).eq("org_id", orgId).single();
    if (!member) return res.status(404).json({ error: "Crew member not found" });

    const ip = (req.headers["x-forwarded-for"] as string || "").split(",")[0].trim() || "unknown";
    const sig = {
      name: String(signature.name),
      email: String(signature.email || profile.email || ""),
      ip,
      timestamp: new Date().toISOString(),
      signatureData: String(signature.signatureData),
      signatureType: signature.signatureType === "typed" ? "typed" : "drawn",
    };

    // One agreement per crew member per version — update if it exists, else insert.
    const { data: existing } = await supabase
      .from("staff_agreements").select("id")
      .eq("crew_member_id", member.id).eq("org_id", orgId).eq("agreement_version", agreementVersion)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase.from("staff_agreements").update({
        staff_signature: sig, staff_signed_at: sig.timestamp, status: "staff_signed",
        agreement_title: String(agreementTitle || ""), agreement_text: String(agreementText || ""),
      }).eq("id", existing.id);
      if (error) return res.status(500).json({ error: errorMessage(error, "Couldn't record your signature") });
    } else {
      const { error } = await supabase.from("staff_agreements").insert({
        id: randomUUID(), org_id: orgId, crew_member_id: member.id,
        agreement_version: agreementVersion, agreement_title: String(agreementTitle || ""),
        agreement_text: String(agreementText || ""),
        staff_signature: sig, staff_signed_at: sig.timestamp, status: "staff_signed",
      });
      if (error) return res.status(500).json({ error: errorMessage(error, "Couldn't record your signature") });
    }

    // Notify the owner(s) that a countersignature is needed (best-effort).
    try {
      const { data: owners } = await supabase
        .from("user_profiles").select("email").eq("org_id", orgId).eq("role", "owner");
      const to = (owners || []).map(o => o.email).filter(Boolean) as string[];
      if (to.length) {
        await resend.emails.send({
          from: `Slate <${FROM_EMAIL}>`, to,
          subject: `${member.name} signed their 1099 agreement — countersign needed`,
          html: `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1e293b;">
            <p style="font-size:15px;line-height:1.6;"><strong>${escapeHtml(member.name)}</strong> signed their 1099 independent-contractor agreement.</p>
            <p style="font-size:15px;line-height:1.6;">Open Staff in Slate to countersign it.</p>
            <p style="margin-top:20px;"><a href="${APP_URL}/staff" style="background:#0088ff;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px;">Review &amp; countersign</a></p>
          </div>`,
        });
      }
    } catch (e) {
      console.error("staff-sign-agreement owner email failed:", e);
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("staff-sign-agreement error:", err);
    return res.status(500).json({ error: errorMessage(err, "Failed to record your signature") });
  }
}
