// ============================================================
// Vercel Serverless Function — Send email via Gmail API (OAuth)
// Falls back to Resend if available
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Resend } from "resend";

function verifyApiKey(req: VercelRequest): boolean {
  const key = req.headers["x-api-key"] as string | undefined;
  const expected = process.env.SLATE_API_KEY;
  console.log("Auth check:", { hasKey: !!key, hasExpected: !!expected, keyLen: key?.length, expectedLen: expected?.length });
  if (!expected) return false;
  return key === expected;
}

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

  // Use Resend (already working in this project)
  const resendKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL || "ai@sdubmedia.com";

  if (!resendKey) {
    return res.status(500).json({ error: "Email service not configured (RESEND_API_KEY missing)" });
  }

  try {
    const resend = new Resend(resendKey);
    const { data, error } = await resend.emails.send({
      from: `SDub Media AI <${fromEmail}>`,
      to: [to],
      subject,
      ...(html ? { html } : { text: body }),
    });

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json({ success: true, messageId: data?.id });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Failed to send email" });
  }
}
