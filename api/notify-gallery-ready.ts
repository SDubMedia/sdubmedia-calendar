// ============================================================
// Vercel Serverless Function — notify that a shoot's gallery is ready.
//
// Owner-triggered. recipient="agent" (default) emails + pushes the agent whose
// listing it is; recipient="broker" emails the brokerage (manual, on request).
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Resend } from "resend";
import { createClient } from "@supabase/supabase-js";
import { verifyAuth, getUserOrgId, escapeHtml, isAllowedUrl, errorMessage } from "./_auth.js";
import { sendPushToUser } from "./_apns.js";
import { randomUUID } from "crypto";

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
    const { deliveryId, recipient } = req.body || {};
    if (!deliveryId) return res.status(400).json({ error: "deliveryId required" });
    const who: "agent" | "broker" = recipient === "broker" ? "broker" : "agent";

    // Owner only.
    const { data: callerProfile } = await supabase.from("user_profiles").select("role").eq("id", caller.userId).single();
    if (!callerProfile || callerProfile.role !== "owner") return res.status(403).json({ error: "Only owners can send this" });
    const callerOrgId = await getUserOrgId(caller.userId);

    // Delivery → project → agent (+ broker).
    const { data: delivery } = await supabase.from("deliveries").select("id, project_id, token, slug, title, org_id").eq("id", deliveryId).single();
    if (!delivery) return res.status(404).json({ error: "Gallery not found" });
    if (delivery.org_id !== callerOrgId) return res.status(403).json({ error: "Cross-org" });
    if (!delivery.project_id) return res.status(400).json({ error: "Gallery isn't linked to a shoot" });

    const { data: project } = await supabase.from("projects").select("client_id").eq("id", delivery.project_id).single();
    if (!project) return res.status(404).json({ error: "Shoot not found" });
    const { data: agent } = await supabase.from("clients").select("id, company, contact_name, email, broker_id, client_type").eq("id", project.client_id).single();
    if (!agent) return res.status(404).json({ error: "Client not found" });

    // Gallery link + email body are the same for everyone we notify.
    const galleryUrl = delivery.slug ? `${APP_URL}/g/${delivery.slug}` : `${APP_URL}/deliver/${delivery.token}`;
    const subject = `Your photos are ready — ${delivery.title || "your listing"}`;
    const buildHtml = (firstName: string) => `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;color:#1e293b;">
          <h1 style="font-size:24px;font-weight:700;color:#0088ff;margin:0 0 8px;">Your photos are ready</h1>
          <p style="font-size:15px;line-height:1.6;">Hi ${escapeHtml(firstName)},</p>
          <p style="font-size:15px;line-height:1.6;">The photos for <strong>${escapeHtml(delivery.title || "your listing")}</strong> are ready to view and download.</p>
          <div style="margin:28px 0;"><a href="${galleryUrl}" style="display:inline-block;background:#0088ff;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px;">View &amp; download photos</a></div>
        </div>`;

    // Broker path: fan out to EVERY managing-broker login on the brokerage
    // (plus the brokerage's own record email), so all of them get the same
    // notice. Office shoots book under the broker directly; agent shoots
    // resolve the brokerage via the agent's broker_id.
    if (who === "broker") {
      const brokerId = agent.client_type === "broker" ? agent.id : (agent.broker_id || "");
      if (!brokerId) return res.status(400).json({ error: "This shoot has no brokerage" });
      const { data: broker } = await supabase.from("clients").select("id, company, contact_name, email").eq("id", brokerId).single();

      const { data: profiles } = await supabase.from("user_profiles")
        .select("id, name, email, client_ids").eq("org_id", callerOrgId).eq("role", "client").contains("client_ids", [brokerId]);
      // Dedupe recipients by email (a login's email can match the record email).
      const recipients = new Map<string, { userId?: string; email: string; name: string }>();
      for (const p of (profiles || [])) {
        const em = (p.email || "").trim();
        if (em) recipients.set(em.toLowerCase(), { userId: p.id, email: em, name: p.name || broker?.company || "" });
      }
      const recordEmail = (broker?.email || "").trim();
      if (recordEmail && !recipients.has(recordEmail.toLowerCase())) {
        recipients.set(recordEmail.toLowerCase(), { email: recordEmail, name: broker?.contact_name || broker?.company || "" });
      }

      let emailed = 0, pushed = 0;
      for (const r of recipients.values()) {
        const firstName = (r.name || "there").split(" ")[0];
        if (isAllowedUrl(galleryUrl)) {
          try { await resend.emails.send({ from: `Slate <${FROM_EMAIL}>`, to: r.email, subject, html: buildHtml(firstName) }); emailed++; }
          catch (e) { console.error("Gallery-ready broker email failed:", e); }
        }
        if (r.userId) {
          try { const pr = await sendPushToUser(r.userId, { title: "Photos are ready", body: `${delivery.title || "A listing"} — tap to view & download`, data: { url: galleryUrl } }); pushed += pr.sent; }
          catch (e) { console.error("Gallery-ready broker push failed:", e); }
          try {
            await supabase.from("notifications").insert({
              id: randomUUID(), user_id: r.userId, type: "gallery_ready",
              title: "Photos are ready", message: delivery.title || "A listing", link: galleryUrl,
            });
          } catch (e) { console.error("Gallery-ready broker bell failed:", e); }
        }
      }
      return res.status(200).json({ ok: true, emailed, pushed, recipients: recipients.size });
    }

    // Agent path: notify the single agent whose listing this is.
    const target = agent;
    let toEmail = (target.email || "").trim();
    let targetUserId = "";
    {
      const { data: profiles } = await supabase.from("user_profiles").select("id, email, client_ids").eq("org_id", callerOrgId);
      const attached = (profiles || []).find(p => Array.isArray(p.client_ids) && p.client_ids.includes(target.id));
      if (attached) { targetUserId = attached.id; if (!toEmail) toEmail = (attached.email || "").trim(); }
    }
    const firstName = (target.contact_name || target.company || "there").split(" ")[0];

    let emailed = false;
    if (toEmail && isAllowedUrl(galleryUrl)) {
      try {
        await resend.emails.send({ from: `Slate <${FROM_EMAIL}>`, to: toEmail, subject, html: buildHtml(firstName) });
        emailed = true;
      } catch (e) { console.error("Gallery-ready email failed:", e); }
    }

    let pushed = 0;
    if (targetUserId) {
      try {
        const r = await sendPushToUser(targetUserId, { title: "Your photos are ready", body: `${delivery.title || "Your listing"} — tap to view & download`, data: { url: galleryUrl } });
        pushed = r.sent;
      } catch (e) { console.error("Gallery-ready push failed:", e); }
      try {
        await supabase.from("notifications").insert({
          id: randomUUID(),
          user_id: targetUserId,
          type: "gallery_ready",
          title: "Your photos are ready",
          message: delivery.title || "Your listing",
          link: galleryUrl,
        });
      } catch (e) { console.error("Gallery-ready bell failed:", e); }
    }

    return res.status(200).json({ ok: true, emailed, pushed, toEmail: toEmail || null });
  } catch (err) {
    console.error("notify-gallery-ready error:", err);
    return res.status(500).json({ error: errorMessage(err, "Failed to notify") });
  }
}
