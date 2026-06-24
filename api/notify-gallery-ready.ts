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
    const { data: agent } = await supabase.from("clients").select("id, company, contact_name, email, broker_id").eq("id", project.client_id).single();
    if (!agent) return res.status(404).json({ error: "Client not found" });

    // Resolve the target (agent or their broker) + their email + user (for push).
    let target = agent;
    if (who === "broker") {
      if (!agent.broker_id) return res.status(400).json({ error: "This shoot has no broker" });
      const { data: broker } = await supabase.from("clients").select("id, company, contact_name, email, broker_id").eq("id", agent.broker_id).single();
      if (!broker) return res.status(404).json({ error: "Broker not found" });
      target = broker;
    }

    // Email: prefer the client record's email, else a login attached to it.
    let toEmail = (target.email || "").trim();
    let targetUserId = "";
    {
      const { data: profiles } = await supabase.from("user_profiles").select("id, email, client_ids").eq("org_id", callerOrgId);
      const attached = (profiles || []).find(p => Array.isArray(p.client_ids) && p.client_ids.includes(target.id));
      if (attached) { targetUserId = attached.id; if (!toEmail) toEmail = (attached.email || "").trim(); }
    }

    const galleryUrl = delivery.slug ? `${APP_URL}/g/${delivery.slug}` : `${APP_URL}/deliver/${delivery.token}`;
    const firstName = (target.contact_name || target.company || "there").split(" ")[0];

    // Email (best-effort).
    let emailed = false;
    if (toEmail && isAllowedUrl(galleryUrl)) {
      const html = `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;color:#1e293b;">
          <h1 style="font-size:24px;font-weight:700;color:#0088ff;margin:0 0 8px;">Your photos are ready</h1>
          <p style="font-size:15px;line-height:1.6;">Hi ${escapeHtml(firstName)},</p>
          <p style="font-size:15px;line-height:1.6;">The photos for <strong>${escapeHtml(delivery.title || "your listing")}</strong> are ready to view and download.</p>
          <div style="margin:28px 0;"><a href="${galleryUrl}" style="display:inline-block;background:#0088ff;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px;">View &amp; download photos</a></div>
        </div>`;
      try {
        await resend.emails.send({ from: `Slate <${FROM_EMAIL}>`, to: toEmail, subject: `Your photos are ready — ${delivery.title || "your listing"}`, html });
        emailed = true;
      } catch (e) { console.error("Gallery-ready email failed:", e); }
    }

    // Push the AGENT only (brokers are notified by email on request).
    let pushed = 0;
    if (who === "agent" && targetUserId) {
      try {
        const r = await sendPushToUser(targetUserId, { title: "Your photos are ready", body: `${delivery.title || "Your listing"} — tap to view & download`, data: { url: galleryUrl } });
        pushed = r.sent;
      } catch (e) { console.error("Gallery-ready push failed:", e); }
      // In-app bell for the agent too, so it's there even if push is off.
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
