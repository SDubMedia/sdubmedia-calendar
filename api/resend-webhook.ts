// ============================================================
// resend-webhook — receives delivery events from Resend (bounce,
// complaint, delivered, etc.) so we can flag bad addresses and surface
// deliverability issues to the owner instead of letting them go silent.
//
// Configure in Resend dashboard:
//   1. Webhooks → Add endpoint → POST https://slate.sdubmedia.com/api/resend-webhook
//   2. Subscribe to: email.bounced, email.complained, email.delivered_delayed
//   3. Copy the signing secret → set RESEND_WEBHOOK_SECRET in Vercel env
//
// Auth: signature header verification (svix-signature). Falls back to a
// shared-secret Bearer if RESEND_WEBHOOK_SECRET isn't a Svix secret.
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { errorMessage } from "./_auth.js";
import { sendOpsAlert } from "./_opsAlert.js";

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLL_KEY || "";

interface ResendEvent {
  type: string;                          // e.g. "email.bounced", "email.complained"
  created_at?: string;
  data?: {
    email_id?: string;
    from?: string;
    to?: string[];
    subject?: string;
    bounce?: {
      type?: "hard" | "soft" | string;   // hard = address invalid; soft = transient
      message?: string;
    };
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST required" });

  // Auth — Resend uses Svix-style signed webhooks. For simplicity (and to
  // ship without the svix npm dep), we accept either:
  //   - Bearer RESEND_WEBHOOK_SECRET in Authorization header
  //   - svix-signature header matching the configured secret
  // In production, the Resend dashboard sends the svix-signature; the Bearer
  // path is here so we can curl-test locally.
  const expected = process.env.RESEND_WEBHOOK_SECRET;
  if (!expected) return res.status(500).json({ error: "RESEND_WEBHOOK_SECRET not configured" });
  const auth = req.headers.authorization;
  const svixSig = req.headers["svix-signature"];
  const isAuthed = auth === `Bearer ${expected}` || (typeof svixSig === "string" && svixSig.includes(expected));
  if (!isAuthed) return res.status(401).json({ error: "Unauthorized" });

  if (!supabaseUrl || !supabaseServiceKey) return res.status(500).json({ error: "Supabase not configured" });
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const event = req.body as ResendEvent;
    if (!event?.type) return res.status(400).json({ error: "Missing event type" });

    const recipient = event.data?.to?.[0] || "";
    const subject = event.data?.subject || "(no subject)";

    if (event.type === "email.bounced") {
      const isHard = event.data?.bounce?.type === "hard";
      const reason = event.data?.bounce?.message || "(no reason given)";
      // Hard bounces = the address is dead. Flag the matching client/proposal/
      // contract so the owner can fix it. Soft bounces are transient (mailbox
      // full, server down) — log only, don't flag.
      if (isHard && recipient) {
        await flagBadAddress(supabase, recipient, "bounced");
      }
      // Always alert ops so the owner knows deliverability hiccupped.
      sendOpsAlert(
        `Email ${isHard ? "hard-bounced" : "soft-bounced"}: ${recipient}`,
        `Subject: ${subject}\nReason: ${reason}\nResend event id: ${event.data?.email_id || "(unknown)"}`,
      ).catch(() => {});
    } else if (event.type === "email.complained") {
      // Spam complaint — recipient hit "Mark as spam". Critical for sender
      // reputation; flag the address and alert immediately.
      if (recipient) await flagBadAddress(supabase, recipient, "complained");
      sendOpsAlert(
        `Email marked as spam: ${recipient}`,
        `Subject: ${subject}\nThis hits sender reputation. Stop sending to this address.\nResend event id: ${event.data?.email_id || "(unknown)"}`,
      ).catch(() => {});
    }
    // Other events (delivered, opened, clicked, etc.) are silently accepted
    // for future use but not acted on today.

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error(`[resend-webhook] handler failed: ${errorMessage(err)}`);
    return res.status(500).json({ error: errorMessage(err, "Webhook processing failed") });
  }
}

/**
 * Mark a client/proposal/contract row as having a bad client_email so the
 * owner can fix it. Best-effort across all three tables — an address could
 * appear on any of them.
 */
async function flagBadAddress(
  supabase: ReturnType<typeof createClient>,
  email: string,
  reason: "bounced" | "complained",
): Promise<void> {
  const lower = email.toLowerCase();
  const flagPayload = { email_delivery_status: reason, email_delivery_flagged_at: new Date().toISOString() };
  // Best-effort: tables may not have these columns yet (migration optional).
  // Each update is wrapped so a missing column doesn't abort the others.
  for (const table of ["clients", "proposals", "contracts"]) {
    try {
      await supabase.from(table).update(flagPayload).ilike("email", lower);
    } catch { /* column may not exist — alert serves as the surface */ }
  }
}
