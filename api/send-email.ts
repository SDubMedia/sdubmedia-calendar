// ============================================================
// Vercel Serverless Function — Send email via Gmail SMTP
// Used by Claude AI to send reports, invoices, notifications
// Uses raw net/tls to avoid nodemailer bundling issues on Vercel
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyApiKey } from "./_api-auth";
import * as tls from "node:tls";

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
    await sendViaSMTP({ user, pass, to, subject, body: html || body, isHtml: !!html });
    return res.status(200).json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Failed to send email" });
  }
}

/** Minimal SMTP client using Node tls — no external deps */
function sendViaSMTP(opts: {
  user: string; pass: string; to: string; subject: string; body: string; isHtml: boolean;
}): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = tls.connect(465, "smtp.gmail.com", { rejectUnauthorized: true });
    let buf = "";
    let step = 0;

    const boundary = `----=_Part_${Date.now()}`;
    const contentType = opts.isHtml ? "text/html" : "text/plain";
    const message = [
      `From: SDub Media AI <${opts.user}>`,
      `To: ${opts.to}`,
      `Subject: ${opts.subject}`,
      `MIME-Version: 1.0`,
      `Content-Type: ${contentType}; charset=UTF-8`,
      ``,
      opts.body,
    ].join("\r\n");

    const authPlain = Buffer.from(`\0${opts.user}\0${opts.pass}`).toString("base64");

    const commands = [
      null, // 0: wait for server greeting
      `EHLO slate.sdubmedia.com`,
      `AUTH PLAIN ${authPlain}`,
      `MAIL FROM:<${opts.user}>`,
      `RCPT TO:<${opts.to}>`,
      `DATA`,
      `${message}\r\n.`,
      `QUIT`,
    ];

    socket.on("data", (data) => {
      buf += data.toString();
      const lines = buf.split("\r\n");
      buf = lines.pop() || "";

      for (const line of lines) {
        if (!line) continue;
        const code = parseInt(line.slice(0, 3));

        // Multi-line responses (e.g. 250-SIZE, 250-AUTH) — wait for final line (no dash)
        if (line[3] === "-") continue;

        if (code >= 400) {
          socket.destroy();
          return reject(new Error(`SMTP error: ${line}`));
        }

        step++;
        if (step < commands.length) {
          socket.write(commands[step] + "\r\n");
        } else {
          socket.end();
          resolve();
        }
      }
    });

    socket.on("error", reject);
    socket.on("timeout", () => reject(new Error("SMTP timeout")));
    socket.setTimeout(15000);
  });
}
