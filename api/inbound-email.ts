// ============================================================
// inbound-email — webhook for client replies to proposal/contract emails.
//
// When a client hits "Reply" in their email app, the message lands on the
// org's inbound address (e.g., replies@slate.sdubmedia.com configured in
// Resend Inbound or Postmark). The provider POSTs the parsed email here.
// We extract the proposal/contract reference from the In-Reply-To /
// References / Message-ID chain and append the reply text as a note on
// the matching record. Owner sees the thread inside Slate instead of in
// their personal inbox.
//
// Provider-agnostic: accepts a normalized payload that providers can map
// to. Add provider adapters at the top of `parseInbound()` as needed.
//
// Auth: shared secret in `Authorization: Bearer <INBOUND_EMAIL_SECRET>`
// (set the same value on the provider's webhook config).
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { errorMessage } from "./_auth.js";

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLL_KEY || "";

interface InboundPayload {
  from: string;            // sender address
  to: string;              // org's inbound address (e.g., replies@slate.sdubmedia.com)
  subject: string;
  text: string;            // plain-text body (preferred for parsing)
  html?: string;
  inReplyTo?: string;      // Message-ID this reply is responding to
  references?: string[];   // full reference chain
  // Provider-specific raw payload, kept for debugging / replay.
  raw?: unknown;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST required" });

  const expected = process.env.INBOUND_EMAIL_SECRET;
  if (!expected) return res.status(500).json({ error: "INBOUND_EMAIL_SECRET not configured" });
  const auth = req.headers.authorization;
  if (auth !== `Bearer ${expected}`) return res.status(401).json({ error: "Unauthorized" });

  if (!supabaseUrl || !supabaseServiceKey) return res.status(500).json({ error: "Supabase not configured" });
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const payload = parseInbound(req.body);
    if (!payload) return res.status(400).json({ error: "Could not parse inbound payload" });

    // Strip quoted prior content so the note is just the new reply text.
    const cleanReply = stripQuotedReply(payload.text);

    // Resolve the target record from In-Reply-To / References. If none of
    // the headers reference a known proposal/contract Message-ID, fall
    // back to subject-line matching ("Re: Wedding Proposal — Sarah").
    const target = await resolveTarget(supabase, payload);
    if (!target) {
      // Unmatched replies still get logged so the owner can see something
      // came in. They'd see this in a future "unmatched replies" view.
      console.warn(`[inbound-email] unmatched reply from=${payload.from} subject=${payload.subject}`);
      return res.status(200).json({ ok: true, matched: false });
    }

    // Append the reply as a thread entry on the target record. Storing in
    // a JSONB `inbound_replies` field keeps the schema simple — versioning
    // / migration to a dedicated `messages` table is a future concern.
    const newEntry = {
      receivedAt: new Date().toISOString(),
      from: payload.from,
      subject: payload.subject,
      body: cleanReply,
    };

    if (target.kind === "proposal") {
      const { data: cur } = await supabase
        .from("proposals")
        .select("inbound_replies")
        .eq("id", target.id)
        .single();
      const existing = Array.isArray((cur as { inbound_replies?: unknown[] } | null)?.inbound_replies)
        ? ((cur as { inbound_replies: unknown[] }).inbound_replies as Array<Record<string, unknown>>)
        : [];
      existing.push(newEntry);
      await supabase.from("proposals").update({ inbound_replies: existing }).eq("id", target.id);
    } else if (target.kind === "contract") {
      const { data: cur } = await supabase
        .from("contracts")
        .select("inbound_replies")
        .eq("id", target.id)
        .single();
      const existing = Array.isArray((cur as { inbound_replies?: unknown[] } | null)?.inbound_replies)
        ? ((cur as { inbound_replies: unknown[] }).inbound_replies as Array<Record<string, unknown>>)
        : [];
      existing.push(newEntry);
      await supabase.from("contracts").update({ inbound_replies: existing }).eq("id", target.id);
    }

    return res.status(200).json({ ok: true, matched: true, target });
  } catch (err) {
    console.error(`[inbound-email] handler failed: ${errorMessage(err)}`);
    return res.status(500).json({ error: errorMessage(err, "Failed to process inbound email") });
  }
}

/**
 * Provider-agnostic payload parsing. Extend as you add providers.
 */
function parseInbound(body: unknown): InboundPayload | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;

  // Resend Inbound / Postmark normalized shape
  if (typeof b.from === "string" && typeof b.to === "string" && typeof b.subject === "string") {
    return {
      from: b.from,
      to: b.to,
      subject: b.subject,
      text: typeof b.text === "string" ? b.text : (typeof b.body === "string" ? b.body : ""),
      html: typeof b.html === "string" ? b.html : undefined,
      inReplyTo: typeof b.inReplyTo === "string" ? b.inReplyTo : (typeof b.in_reply_to === "string" ? b.in_reply_to : undefined),
      references: Array.isArray(b.references) ? b.references as string[] : undefined,
      raw: b,
    };
  }

  return null;
}

/**
 * Find the proposal or contract this reply targets. Strategy:
 *   1. Match In-Reply-To against any proposal/contract Message-ID we've sent.
 *      (Requires storing message_id at send-time — not yet implemented;
 *      this branch is a hook for when that lands.)
 *   2. Subject-line heuristic: extract a token / id from the subject.
 *   3. Sender-email match: find a recent open proposal/contract whose
 *      client_email matches the From address.
 */
async function resolveTarget(
  supabase: ReturnType<typeof createClient>,
  payload: InboundPayload,
): Promise<{ kind: "proposal" | "contract"; id: string } | null> {
  const fromEmail = extractEmail(payload.from);
  if (!fromEmail) return null;

  // Step 3 (the only one wired today): find the most recent proposal sent
  // to this client_email that's still open (not voided / not archived).
  const { data: proposals } = await supabase
    .from("proposals")
    .select("id, sent_at")
    .ilike("client_email", fromEmail)
    .neq("status", "void")
    .is("deleted_at", null)
    .order("sent_at", { ascending: false })
    .limit(1);
  const matchedProposal = (proposals as Array<{ id: string }> | null)?.[0];
  if (matchedProposal) return { kind: "proposal", id: matchedProposal.id };

  const { data: contracts } = await supabase
    .from("contracts")
    .select("id, sent_at")
    .ilike("client_email", fromEmail)
    .neq("status", "void")
    .is("deleted_at", null)
    .order("sent_at", { ascending: false })
    .limit(1);
  const matchedContract = (contracts as Array<{ id: string }> | null)?.[0];
  if (matchedContract) return { kind: "contract", id: matchedContract.id };

  return null;
}

function extractEmail(raw: string): string | null {
  // Handles "Sarah Adams <sarah@example.com>" → "sarah@example.com"
  const m = raw.match(/<([^>]+)>/);
  if (m) return m[1].trim().toLowerCase();
  return raw.trim().toLowerCase() || null;
}

/**
 * Drop everything from the first quoted-reply marker onward. Heuristic —
 * different mail clients use different markers. Conservative: if no
 * marker found, return the whole body.
 */
function stripQuotedReply(text: string): string {
  if (!text) return "";
  const markers = [
    /\nOn .* wrote:/i,                    // "On Mon, May 5, 2026 at 2:14 PM Sarah wrote:"
    /\n-{2,} ?Original Message ?-{2,}/i,  // Outlook
    /\nFrom: .* <.*@.*>/i,                // forwarded
    /\n>{1,} /,                           // quote-prefix lines
  ];
  let cutAt = text.length;
  for (const m of markers) {
    const idx = text.search(m);
    if (idx >= 0 && idx < cutAt) cutAt = idx;
  }
  return text.slice(0, cutAt).trim();
}
