// ============================================================
// Shared ops-alert helper. Lets any server endpoint surface a critical
// internal failure (email send error, cron breakage, integration issue)
// to a real human inbox instead of letting it die in console.error.
//
// FEEDBACK_TO_EMAIL env var = where alerts go (default geoff@sdubmedia.com).
// Best-effort send — never throws, never blocks the caller.
// ============================================================

import { Resend } from "resend";
import { errorMessage } from "./_auth.js";

const resend = new Resend(process.env.RESEND_API_KEY);
const OPS_ALERT_TO = process.env.FEEDBACK_TO_EMAIL || "geoff@sdubmedia.com";
const OPS_ALERT_FROM = process.env.RESEND_FROM_EMAIL || "noreply@sdubmedia.com";

export async function sendOpsAlert(subject: string, body: string): Promise<void> {
  try {
    if (!process.env.RESEND_API_KEY) return;
    await resend.emails.send({
      from: `Slate Ops <${OPS_ALERT_FROM}>`,
      to: OPS_ALERT_TO,
      subject: `[Slate] ${subject}`,
      text: body,
    });
  } catch (err) {
    console.error(`[ops-alert] send failed: ${errorMessage(err)}`);
  }
}
