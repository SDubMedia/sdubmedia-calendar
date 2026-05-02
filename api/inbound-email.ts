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
import { Resend } from "resend";
import { errorMessage, escapeHtml } from "./_auth.js";

// Lazy-init so tests that import pure helpers don't trip the
// "Missing API key" check at module load. Resend only fails on construct
// when the key is unset; deferring it to first send() keeps both paths happy.
let _resend: Resend | null = null;
function getResend(): Resend {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY || "re_test_key");
  return _resend;
}

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

    // Send the client an auto-acknowledgment so they know the reply was
    // captured (vs. disappearing into the void). Uses the org's business
    // email as both display + reply-to so the conversation continues to
    // route through the actual contractor. Best-effort — a failed ack
    // doesn't undo the thread storage.
    sendInboundAck(supabase, payload, target).catch(err =>
      console.warn(`[inbound-email] auto-ack failed: ${errorMessage(err)}`),
    );

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
// Note: supabase client typed loosely here. The exhaustive generics
// produced by createClient<...> don't unify with the handler's call site
// without runtime cost — the SDK methods are dynamically typed on the
// table name string anyway, so a ReturnType<typeof createClient> would
// over-constrain rather than help.
type SupabaseClientLoose = {
  from: (table: string) => {
    select: (cols: string) => {
      ilike: (col: string, val: string) => {
        neq: (col: string, val: string) => {
          is: (col: string, val: null) => {
            order: (col: string, opts: { ascending: boolean }) => {
              limit: (n: number) => Promise<{ data: Array<{ id: string }> | null }>;
            };
          };
        };
      };
    };
  };
};

async function resolveTarget(
  supabase: unknown,
  payload: InboundPayload,
): Promise<{ kind: "proposal" | "contract"; id: string } | null> {
  const sb = supabase as SupabaseClientLoose;
  const fromEmail = extractEmail(payload.from);
  if (!fromEmail) return null;

  // Step 3 (the only one wired today): find the most recent proposal sent
  // to this client_email that's still open (not voided / not archived).
  const { data: proposals } = await sb
    .from("proposals")
    .select("id, sent_at")
    .ilike("client_email", fromEmail)
    .neq("status", "void")
    .is("deleted_at", null)
    .order("sent_at", { ascending: false })
    .limit(1);
  const matchedProposal = (proposals as Array<{ id: string }> | null)?.[0];
  if (matchedProposal) return { kind: "proposal", id: matchedProposal.id };

  const { data: contracts } = await sb
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

export function extractEmail(raw: string): string | null {
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
export function stripQuotedReply(text: string): string {
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

/**
 * Auto-acknowledge a captured reply so the client knows their message
 * landed somewhere. Uses the org's business email as the from + reply-to
 * so any follow-up the client sends still threads to the actual
 * contractor, not Slate.
 */
async function sendInboundAck(
  supabase: unknown,
  payload: InboundPayload,
  target: { kind: "proposal" | "contract"; id: string },
): Promise<void> {
  if (!payload.from) return;
  const sb = supabase as { from: (t: string) => { select: (c: string) => { eq: (k: string, v: string) => { single: () => Promise<{ data: Record<string, unknown> | null }> } } } };

  // Resolve the org from the matched target.
  const tableName = target.kind === "proposal" ? "proposals" : "contracts";
  const { data: row } = await sb.from(tableName).select("org_id").eq("id", target.id).single();
  if (!row?.org_id) return;

  const { data: org } = await sb.from("organizations").select("name, business_info").eq("id", row.org_id as string).single();
  if (!org) return;

  const businessInfo = (org.business_info as { email?: string } | null) || {};
  const orgEmail = businessInfo.email?.trim() || process.env.RESEND_FROM_EMAIL || "noreply@sdubmedia.com";
  const orgName = (org.name as string) || "Your contractor";

  const recipientEmail = extractEmail(payload.from);
  if (!recipientEmail) return;

  const html = `<!DOCTYPE html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1e293b;">
    <p style="margin:0 0 16px;font-size:14px;">Thanks for your reply — we got it.</p>
    <p style="margin:0 0 16px;font-size:14px;">${escapeHtml(orgName)} will get back to you shortly. No need to follow up unless you don't hear back within a couple of days.</p>
    <p style="margin:24px 0 0;color:#94a3b8;font-size:12px;">This is an automatic acknowledgment. Replies to this email reach ${escapeHtml(orgName)} directly.</p>
  </body></html>`;

  await getResend().emails.send({
    from: `${orgName} <${orgEmail}>`,
    to: recipientEmail,
    subject: `Re: ${payload.subject || "your message"}`,
    html,
    replyTo: orgEmail,
  });
}
