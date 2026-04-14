import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Resend } from "resend";
import { verifyAuth } from "./_auth.js";

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST required" });

  const user = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const { message, category } = req.body;
  if (!message?.trim()) return res.status(400).json({ error: "Message required" });

  const from = process.env.RESEND_FROM_EMAIL || "noreply@sdubmedia.com";
  const to = process.env.FEEDBACK_TO_EMAIL || "geoff@sdubmedia.com";

  try {
    await resend.emails.send({
      from: `Slate Feedback <${from}>`,
      to,
      subject: `[Feedback] ${category || "General"} — ${user.email}`,
      html: `
        <h3>Feedback from Slate</h3>
        <p><strong>Email:</strong> ${user.email}</p>
        <p><strong>Category:</strong> ${category || "General"}</p>
        <hr />
        <p>${message.trim().replace(/\n/g, "<br />")}</p>
      `,
    });
    return res.status(200).json({ ok: true });
  } catch (err: unknown) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Failed to send" });
  }
}
