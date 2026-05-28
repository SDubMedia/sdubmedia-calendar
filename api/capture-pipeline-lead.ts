// ============================================================
// /api/capture-pipeline-lead — PUBLIC inbound lead capture.
//
// Any org's website (their own site, a Pixieset/HoneyBook/Squarespace
// embed, etc.) POSTs a contact-form submission here. We look the org up
// by its public `slug`, drop the lead into pipeline_leads at the
// "inquiry" stage, and best-effort email the owner. The lead then shows
// up in the Slate pipeline on iOS + desktop, no manual re-typing.
//
// Public + cross-origin by design: a contact form lives on the open web,
// so the slug is not a secret (it's visible in the embed source anyway).
// Abuse is contained by: a honeypot field, a short per-(org,email) dedupe
// window, length caps, and leads landing in "inquiry" for manual review
// rather than touching anything financial.
//
// No auth header — uses the service-role client to bypass the owner-only
// RLS on pipeline_leads, exactly like the other public endpoints
// (submit-testimonial, *-public).
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { escapeHtml, errorMessage } from "./_auth.js";

// The Vercel project's service-role key env var is the (historically
// misspelled) SUPABASE_SERVICE_ROLL_KEY; every other endpoint reads both
// spellings, so we do too.
function serviceKey(): string {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLL_KEY || "";
}

// Lazy-init so importing the pure helpers in tests doesn't trip the
// "supabaseKey is required" check at module load.
function getSupabase() {
  return createClient(
    process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "",
    serviceKey()
  );
}

let _resend: Resend | null = null;
function getResend(): Resend {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY || "re_test_key");
  return _resend;
}

function nanoid(): string {
  return Math.random().toString(36).slice(2, 12);
}

// Allowed values for the "what are you planning" dropdown. Anything else
// is coerced so a tampered field can't inject junk into the pipeline.
const KNOWN_PROJECT_TYPES = new Set([
  "Recurring content",
  "Event coverage",
  "Brand video",
  "Wedding",
  "Other",
]);

export function clean(v: unknown, max = 500): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

export function isEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

// Keep a known dropdown value as-is; coerce any other non-empty input to
// "Other"; an empty field becomes a generic "Inquiry".
export function coerceProjectType(raw: string): string {
  if (KNOWN_PROJECT_TYPES.has(raw)) return raw;
  return raw ? "Other" : "Inquiry";
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS: this is called from arbitrary customer domains.
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST required" });

  const body = (req.body || {}) as Record<string, unknown>;

  // Honeypot: real people leave "company" empty; bots fill every field.
  // Silently accept and drop so the bot sees success and moves on.
  if (clean(body.company)) return res.status(200).json({ ok: true });

  const slug = clean(body.slug, 80).toLowerCase();
  const name = clean(body.name, 120);
  const email = clean(body.email, 200).toLowerCase();
  const phone = clean(body.phone, 40);
  const projectType = coerceProjectType(clean(body.projectType, 80));
  const eventDateTime = clean(body.eventDateTime, 40);
  const message = clean(body.message, 2000);

  if (!slug) return res.status(400).json({ error: "Missing slug" });
  if (!name) return res.status(400).json({ error: "Please include your name." });
  if (!email || !isEmail(email)) return res.status(400).json({ error: "Please include a valid email." });

  if (!serviceKey()) {
    console.error("[capture-pipeline-lead] service-role key not set");
    return res.status(500).json({ error: "Lead capture is not configured." });
  }

  const supabase = getSupabase();
  try {
    // Resolve the org from its public slug.
    const { data: org, error: orgErr } = await supabase
      .from("organizations")
      .select("id, name, business_info")
      .eq("slug", slug)
      .single();
    if (orgErr || !org) return res.status(404).json({ error: "Unknown site." });
    const orgId = org.id as string;

    // Dedupe: ignore a repeat from the same email to the same org within
    // 2 minutes (double-click / bot flood). Treat as success.
    const since = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    const { data: dupes } = await supabase
      .from("pipeline_leads")
      .select("id")
      .eq("org_id", orgId)
      .eq("email", email)
      .gte("created_at", since)
      .limit(1);
    if (dupes && dupes.length > 0) return res.status(200).json({ ok: true, deduped: true });

    // Fold the date/time and any extra message into the description so
    // nothing the visitor typed is lost, regardless of column shapes.
    const descParts: string[] = [];
    if (eventDateTime) descParts.push(`Event date/time: ${eventDateTime}`);
    if (message) descParts.push(message);
    const description = descParts.join("\n\n");

    const now = new Date().toISOString();
    const id = `lead_${nanoid()}`;
    const { error: insErr } = await supabase.from("pipeline_leads").insert({
      id,
      org_id: orgId,
      name,
      email,
      phone,
      project_type: projectType,
      event_date: eventDateTime || null,
      location: "",
      description,
      lead_source: "Website",
      pipeline_stage: "inquiry",
      recent_activity: "New inquiry from website contact form",
      recent_activity_at: now,
      updated_at: now,
    });
    if (insErr) {
      console.error(`[capture-pipeline-lead] insert failed: ${insErr.message}`);
      return res.status(500).json({ error: "Could not save your message. Please try again." });
    }

    // Best-effort: email the owner so they get the ping immediately, and
    // auto-acknowledge the visitor so they know the message landed. Neither
    // failing ever fails the capture (the lead is already saved).
    notifyOwner(org, { name, email, phone, projectType, eventDateTime, message }).catch(err =>
      console.warn(`[capture-pipeline-lead] owner notify failed: ${errorMessage(err)}`)
    );
    ackVisitor(org, { name, email }).catch(err =>
      console.warn(`[capture-pipeline-lead] visitor ack failed: ${errorMessage(err)}`)
    );

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error(`[capture-pipeline-lead] handler failed: ${errorMessage(err)}`);
    return res.status(500).json({ error: "Something went wrong. Please try again." });
  }
}

async function notifyOwner(
  org: { name?: unknown; business_info?: unknown },
  lead: { name: string; email: string; phone: string; projectType: string; eventDateTime: string; message: string }
): Promise<void> {
  const businessInfo = (org.business_info as { email?: string } | null) || {};
  const to = businessInfo.email?.trim();
  if (!to) return; // No owner email on file — the in-app pipeline still has it.

  const verifiedFrom = process.env.RESEND_FROM_EMAIL || "noreply@slate.sdubmedia.com";
  const orgName = (org.name as string) || "your business";

  const rows = [
    ["Name", lead.name],
    ["Email", lead.email],
    ["Phone", lead.phone],
    ["Planning", lead.projectType],
    ["Event date/time", lead.eventDateTime],
    ["Details", lead.message],
  ]
    .filter(([, v]) => v)
    .map(([k, v]) => `<tr><td style="padding:6px 12px;font-weight:600;vertical-align:top">${escapeHtml(k)}</td><td style="padding:6px 12px">${escapeHtml(v).replace(/\n/g, "<br>")}</td></tr>`)
    .join("");

  const html = `<!DOCTYPE html><html><body style="font-family:-apple-system,sans-serif;color:#1e293b;">
    <h2 style="font-size:18px;">New inquiry for ${escapeHtml(orgName)}</h2>
    <table style="font-size:15px;border-collapse:collapse;">${rows}</table>
    <p style="color:#94a3b8;font-size:13px;">It's already in your Slate pipeline under <b>Inquiry</b>. Reply to this email to reach ${escapeHtml(lead.name)}.</p>
  </body></html>`;

  await getResend().emails.send({
    from: `${orgName} <${verifiedFrom}>`,
    to,
    subject: `New website inquiry: ${lead.name}${lead.projectType ? ` — ${lead.projectType}` : ""}`,
    html,
    replyTo: lead.email,
  });
}

// Auto-acknowledge the visitor who submitted the form, so they know the
// message got through and who they'll hear back from. Sent from the org's
// verified sender with reply-to set to the org's business email, so any
// reply the visitor sends reaches the contractor directly.
async function ackVisitor(
  org: { name?: unknown; business_info?: unknown },
  lead: { name: string; email: string }
): Promise<void> {
  const businessInfo = (org.business_info as { email?: string } | null) || {};
  const verifiedFrom = process.env.RESEND_FROM_EMAIL || "noreply@slate.sdubmedia.com";
  const orgName = (org.name as string) || "the team";
  const replyTo = businessInfo.email?.trim() || verifiedFrom;
  const firstName = lead.name.split(/\s+/)[0] || lead.name;

  const html = `<!DOCTYPE html><html><body style="font-family:-apple-system,sans-serif;color:#1e293b;line-height:1.6;">
    <p style="font-size:15px;">Hi ${escapeHtml(firstName)},</p>
    <p style="font-size:15px;">Thanks for reaching out to ${escapeHtml(orgName)} — we got your message and we'll be in touch within 24 hours.</p>
    <p style="font-size:15px;">If anything comes up in the meantime, just reply to this email.</p>
    <p style="font-size:15px;margin-top:24px;">— ${escapeHtml(orgName)}</p>
  </body></html>`;

  await getResend().emails.send({
    from: `${orgName} <${verifiedFrom}>`,
    to: lead.email,
    subject: `Thanks for reaching out to ${orgName}`,
    html,
    replyTo,
  });
}
