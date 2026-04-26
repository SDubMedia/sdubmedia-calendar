// ============================================================
// Vercel Serverless Function — Send invoice PDF via email
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Resend } from "resend";
import { createClient } from "@supabase/supabase-js";
import { verifyAuth, getUserOrgId, escapeHtml, errorMessage } from "./_auth.js";

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLL_KEY || ""
);

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Verify authentication
  const user = await verifyAuth(req);
  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const callerOrgId = await getUserOrgId(user.userId);

  try {
    // Parse multipart form data — Vercel auto-parses with formidable
    // For simplicity, accept JSON with base64 PDF or multipart
    const contentType = req.headers["content-type"] || "";

    let recipientEmail: string;
    let subject: string;
    let message: string;
    let invoiceNumber: string;
    let total: string;
    let clientName: string;
    let pdfBuffer: Buffer;

    if (contentType.includes("multipart/form-data")) {
      // Vercel parses multipart — fields in req.body, files in req.body
      // Actually Vercel doesn't auto-parse multipart for serverless functions
      // We need to handle this differently — use raw body parsing
      const { Readable } = await import("stream");
      const Busboy = (await import("busboy")).default;

      const fields: Record<string, string> = {};
      let fileBuffer: Buffer | null = null;

      await new Promise<void>((resolve, reject) => {
        const busboy = Busboy({ headers: req.headers });
        const chunks: Buffer[] = [];

        busboy.on("field", (name: string, val: string) => {
          fields[name] = val;
        });

        busboy.on("file", (_name: string, file: NodeJS.ReadableStream) => {
          file.on("data", (chunk: Buffer) => chunks.push(chunk));
          file.on("end", () => { fileBuffer = Buffer.concat(chunks); });
        });

        busboy.on("finish", resolve);
        busboy.on("error", reject);

        // Pipe the request body
        if (req.body instanceof Buffer) {
          const readable = new Readable();
          readable.push(req.body);
          readable.push(null);
          readable.pipe(busboy);
        } else if (typeof req.body === "string") {
          const readable = new Readable();
          readable.push(Buffer.from(req.body));
          readable.push(null);
          readable.pipe(busboy);
        } else {
          // req is already a readable stream — VercelRequest extends IncomingMessage which is a Readable
          (req as unknown as Readable).pipe(busboy);
        }
      });

      recipientEmail = fields.recipientEmail || "";
      subject = fields.subject || "";
      message = fields.message || "";
      invoiceNumber = fields.invoiceNumber || "";
      total = fields.total || "0";
      clientName = fields.clientName || "";
      pdfBuffer = fileBuffer!;
    } else {
      // JSON body with base64 PDF
      const body = req.body;
      recipientEmail = body.recipientEmail;
      subject = body.subject;
      message = body.message || "";
      invoiceNumber = body.invoiceNumber || "";
      total = body.total || "0";
      clientName = body.clientName || "";
      pdfBuffer = Buffer.from(body.pdf, "base64");
    }

    if (!recipientEmail || !pdfBuffer) {
      return res.status(400).json({ error: "Missing recipientEmail or PDF attachment" });
    }

    // Validate recipient is a known client in this org — prevents email relay abuse
    if (callerOrgId) {
      const { data: clients } = await supabase
        .from("clients")
        .select("email")
        .eq("org_id", callerOrgId);
      const knownEmails = ((clients as { email: string | null }[] | null) || []).map(c => (c.email || "").toLowerCase()).filter(Boolean);
      if (knownEmails.length > 0 && !knownEmails.includes(recipientEmail.toLowerCase())) {
        return res.status(403).json({ error: "Recipient is not a known client for this organization" });
      }
    }

    const totalFormatted = `$${Number(total).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    const emailHtml = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; color: #1e293b; background: #ffffff;">
        <div style="background: linear-gradient(135deg, #0a1628, #112240); padding: 32px 24px; border-radius: 8px 8px 0 0;">
          <h1 style="margin: 0; font-size: 28px; font-weight: 700; letter-spacing: 0.15em; background: linear-gradient(135deg, #00d4ff, #0066ff); -webkit-background-clip: text; -webkit-text-fill-color: transparent; text-transform: uppercase;">SLATE</h1>
          <p style="margin: 6px 0 0; font-size: 12px; color: #64748b;">by SDub Media</p>
        </div>
        <div style="padding: 32px 24px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 8px 8px;">
          <p style="margin: 0 0 16px; color: #334155;">Hi${clientName ? ` ${escapeHtml(clientName)}` : ""},</p>
          <p style="margin: 0 0 16px; color: #334155;">Please find attached invoice <strong>${escapeHtml(invoiceNumber)}</strong> for services rendered.</p>
          <div style="background: linear-gradient(135deg, #00d4ff10, #0066ff10); border: 1px solid #0088ff30; border-radius: 8px; padding: 16px; margin: 20px 0; text-align: center;">
            <p style="margin: 0; font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: 0.1em;">Amount Due</p>
            <p style="margin: 4px 0 0; font-size: 28px; font-weight: 700; color: #0088ff;">${totalFormatted}</p>
          </div>
          <p style="margin: 0 0 16px; color: #334155;"><strong>Payment terms:</strong> Due on receipt</p>
          ${message ? `<div style="margin: 20px 0; padding: 16px; background: #f8fafc; border-left: 3px solid #0088ff; border-radius: 0 6px 6px 0;"><p style="margin: 0; color: #475569; font-size: 14px;">${escapeHtml(message)}</p></div>` : ""}
          <p style="margin: 24px 0 0; color: #334155;">Thank you for your business!</p>
          <p style="margin: 4px 0 0; color: #64748b; font-size: 13px;">— The SDub Media Team</p>
        </div>
        <p style="text-align: center; margin: 16px 0 0; font-size: 11px; color: #94a3b8;">Sent via Slate by SDub Media</p>
      </div>
    `;

    const { error } = await resend.emails.send({
      from: `Slate by SDub Media <${FROM_EMAIL}>`,
      to: recipientEmail,
      subject: subject || `Invoice ${invoiceNumber} from SDub Media`,
      html: emailHtml,
      attachments: [
        {
          filename: `${invoiceNumber || "invoice"}.pdf`,
          content: pdfBuffer,
        },
      ],
    });

    if (error) {
      console.error("Resend error:", error);
      return res.status(500).json({ error: error.message || "Failed to send email" });
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("Send invoice error:", err);
    return res.status(500).json({ error: errorMessage(err, "Internal server error") });
  }
}
