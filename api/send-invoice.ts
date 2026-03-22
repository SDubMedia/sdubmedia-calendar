// ============================================================
// Vercel Serverless Function — Send invoice PDF via email
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Resend } from "resend";
import { verifyAuth, escapeHtml } from "./_auth";

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
          // req is already a readable stream
          (req as any).pipe(busboy);
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

    const totalFormatted = `$${Number(total).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    const emailHtml = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; color: #1e293b;">
        <div style="padding: 24px 0; border-bottom: 2px solid #d97706;">
          <h1 style="margin: 0; font-size: 24px; color: #d97706;">SDub Media</h1>
          <p style="margin: 4px 0 0; font-size: 12px; color: #64748b;">Video When It Matters Most</p>
        </div>
        <div style="padding: 24px 0;">
          <p>Hi${clientName ? ` ${escapeHtml(clientName)}` : ""},</p>
          <p>Please find attached invoice <strong>${escapeHtml(invoiceNumber)}</strong> for services rendered.</p>
          <p style="font-size: 18px; font-weight: bold; color: #1e293b;">Amount due: ${totalFormatted}</p>
          <p><strong>Payment terms:</strong> Due on receipt</p>
          ${message ? `<div style="margin: 16px 0; padding: 12px; background: #f1f5f9; border-radius: 6px;"><p style="margin: 0; color: #475569;">${escapeHtml(message)}</p></div>` : ""}
          <p>Thank you for your business!</p>
          <p style="color: #64748b;">— SDub Media</p>
        </div>
      </div>
    `;

    const { error } = await resend.emails.send({
      from: `SDub Media <${FROM_EMAIL}>`,
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
  } catch (err: any) {
    console.error("Send invoice error:", err);
    return res.status(500).json({ error: err.message || "Internal server error" });
  }
}
