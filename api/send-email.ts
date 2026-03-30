// ============================================================
// Vercel Serverless Function — Send email via Gmail SMTP
// Used by Claude AI to send reports, invoices, notifications
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import nodemailer from "nodemailer";
import { verifyApiKey } from "./_api-auth";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!verifyApiKey(req)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { to, subject, body, html } = req.body || {};

  if (!to || !subject || (!body && !html)) {
    return res.status(400).json({ error: "Missing required fields: to, subject, body or html" });
  }

  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;

  if (!user || !pass) {
    return res.status(500).json({ error: "Gmail SMTP not configured" });
  }

  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user, pass },
    });

    const info = await transporter.sendMail({
      from: `SDub Media AI <${user}>`,
      to,
      subject,
      ...(html ? { html } : { text: body }),
    });

    return res.status(200).json({ success: true, messageId: info.messageId });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Failed to send email" });
  }
}
