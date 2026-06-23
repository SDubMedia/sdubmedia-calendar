// ============================================================
// Vercel Serverless Function — notify owners that an agent requested a shoot.
//
// Called by the agent right after creating a shoot_request. Runs service-role
// (a client can't write notifications for owners under RLS): inserts an in-app
// notification per owner/partner in the org, emails them, and pushes the org.
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Resend } from "resend";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import { verifyAuth, getUserOrgId, escapeHtml, errorMessage } from "./_auth.js";
import { sendPushToOrg } from "./_apns.js";

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLL_KEY || ""
);
const resend = new Resend(process.env.RESEND_API_KEY);
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";

function fmtDate(iso: string | null): string {
  if (!iso) return "a date to be confirmed";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}
function fmtTime(t: string | null): string {
  if (!t) return "";
  const [hs, mm] = t.split(":"); const h = Number(hs);
  if (Number.isNaN(h)) return t;
  return `${h % 12 === 0 ? 12 : h % 12}:${mm} ${h >= 12 ? "PM" : "AM"}`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const caller = await verifyAuth(req);
  if (!caller) return res.status(401).json({ error: "Unauthorized" });

  try {
    const { requestId } = req.body || {};
    if (!requestId) return res.status(400).json({ error: "requestId required" });
    const callerOrgId = await getUserOrgId(caller.userId);

    // The request must be in the caller's org.
    const { data: reqRow } = await supabase
      .from("shoot_requests").select("id, org_id, client_id, property_address, preferred_date, preferred_time")
      .eq("id", requestId).maybeSingle();
    if (!reqRow || reqRow.org_id !== callerOrgId) return res.status(404).json({ error: "Request not found" });

    const { data: agent } = await supabase.from("clients").select("company, contact_name").eq("id", reqRow.client_id).maybeSingle();
    const agentName = agent?.company || agent?.contact_name || "An agent";
    const addr = reqRow.property_address || "a property";
    const when = `${fmtDate(reqRow.preferred_date)}${reqRow.preferred_time ? ` · ${fmtTime(reqRow.preferred_time)}` : ""}`;

    // Owners + partners in the org.
    const { data: recipients } = await supabase
      .from("user_profiles").select("id, email").eq("org_id", callerOrgId).in("role", ["owner", "partner"]);
    const owners = recipients || [];

    // In-app bell notification per owner.
    for (const o of owners) {
      await supabase.from("notifications").insert({
        id: randomUUID(),
        user_id: o.id,
        type: "shoot_request",
        title: `${agentName} requested a shoot`,
        message: `${addr} · ${when}`,
        link: "/shoot-requests",
      });
    }

    // Email each owner (best-effort).
    let emailed = 0;
    const subject = `New shoot request — ${addr}`;
    const html = `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;color:#1e293b;">
        <h1 style="font-size:22px;font-weight:700;color:#0088ff;margin:0 0 12px;">New shoot request</h1>
        <p style="font-size:15px;line-height:1.6;"><strong>${escapeHtml(agentName)}</strong> requested a real-estate shoot.</p>
        <div style="background:#f1f5f9;border-radius:8px;padding:16px;margin:16px 0;font-size:14px;">
          <p style="margin:0 0 6px;"><strong>Property:</strong> ${escapeHtml(addr)}</p>
          <p style="margin:0;"><strong>Preferred:</strong> ${escapeHtml(when)}</p>
        </div>
        <p style="font-size:13px;color:#64748b;">Open Slate → Shoot Requests to approve or decline.</p>
      </div>`;
    for (const o of owners) {
      if (!o.email) continue;
      try { await resend.emails.send({ from: `Slate <${FROM_EMAIL}>`, to: o.email, subject, html }); emailed++; }
      catch (e) { console.error("Shoot-request email failed:", e); }
    }

    // Push the org (owners' devices). No-op until APNs is configured.
    let pushed = 0;
    try {
      const r = await sendPushToOrg(callerOrgId || "", { title: "New shoot request", body: `${agentName} — ${addr}`, data: { url: "/shoot-requests" } });
      pushed = r.sent;
    } catch (e) { console.error("Shoot-request push failed:", e); }

    return res.status(200).json({ ok: true, notified: owners.length, emailed, pushed });
  } catch (err) {
    console.error("notify-shoot-request error:", err);
    return res.status(500).json({ error: errorMessage(err, "Failed to notify owners") });
  }
}
