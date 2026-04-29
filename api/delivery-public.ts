// Public endpoint for the client gallery experience at /deliver/:token.
// No auth — token in URL is the gate; optional password is a soft second gate.
//
// Actions (passed as ?action= or in body):
//   get             — return delivery + files + signed view URLs (after pw check if set)
//   verify-password — check password, return same shape as get
//   submit          — client submits selections; if over limit and pricing exists,
//                     returns { needsCheckout: true, options } so frontend can
//                     POST to /api/delivery-checkout. Otherwise saves + alerts.
//   request-change  — client requests revision (only valid in "submitted" state, before owner marks "working")

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { errorMessage, escapeHtml } from "./_auth.js";
import { verifyPassword } from "./_password.js";
import { r2Configured, r2PresignedUrl } from "./_r2.js";

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLL_KEY || ""
);

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";

interface DeliveryRow {
  id: string;
  org_id: string;
  project_id: string | null;
  title: string;
  cover_file_id: string | null;
  token: string;
  password_hash: string | null;
  expires_at: string | null;
  selection_limit: number;
  per_extra_photo_cents: number;
  buy_all_flat_cents: number;
  status: string;
  client_name: string | null;
  client_email: string | null;
  submitted_at: string | null;
  working_at: string | null;
  delivered_at: string | null;
  view_count: number;
  download_count: number;
  created_at: string;
  updated_at: string;
}

interface FileRow {
  id: string;
  delivery_id: string;
  storage_path: string;
  original_name: string;
  size_bytes: number;
  width: number | null;
  height: number | null;
  mime_type: string;
  position: number;
}

interface OrgRow {
  name: string;
  logo_url: string;
  business_info: Record<string, unknown> | null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const action = (req.query.action as string) || (req.method === "GET" ? "get" : "");
  const token = (req.query.token as string) || ((req.body || {}) as Record<string, unknown>).token as string;

  if (!token) return res.status(400).json({ error: "Missing token" });

  try {
    switch (action) {
      case "get": {
        const body = (req.body || {}) as Record<string, unknown>;
        const email = typeof body.email === "string" ? body.email : (req.query.email as string) || undefined;
        return await getDelivery(token, undefined, email, res);
      }
      case "verify-password": {
        const body = (req.body || {}) as Record<string, unknown>;
        const email = typeof body.email === "string" ? body.email : undefined;
        return await getDelivery(token, typeof body.password === "string" ? body.password : "", email, res);
      }
      case "register-email": return await registerEmail(req, res, token);
      case "request-prints": return await requestPrints(req, res, token);
      case "submit": return await submitSelections(req, res, token);
      case "request-change": return await requestChange(req, res, token);
      default: return res.status(400).json({ error: "Unknown action" });
    }
  } catch (err) {
    return res.status(500).json({ error: errorMessage(err) });
  }
}

// Resolve a token-or-slug identifier to a delivery row. Tokens are 16-char
// random hex; slugs are human-readable. We accept either string in the same
// `token` API param and try-token-first, then-slug.
async function findDelivery(identifier: string) {
  const byToken = await supabase.from("deliveries").select("*").eq("token", identifier).maybeSingle<DeliveryRow>();
  if (byToken.data) return byToken;
  return await supabase.from("deliveries").select("*").eq("slug", identifier).maybeSingle<DeliveryRow>();
}

async function getDelivery(token: string, password: string | undefined, email: string | undefined, res: VercelResponse) {
  const { data: delivery, error } = await findDelivery(token);
  if (error || !delivery) return res.status(404).json({ error: "Gallery not found" });

  // Expiry check
  if (delivery.expires_at && new Date(delivery.expires_at) < new Date()) {
    return res.status(410).json({ error: "This gallery has expired", expired: true });
  }

  // Password gate
  if (delivery.password_hash) {
    if (!password) {
      return res.status(200).json({
        passwordRequired: true,
        title: delivery.title,
      });
    }
    if (!verifyPassword(password, delivery.password_hash)) {
      return res.status(401).json({ error: "Incorrect password", passwordRequired: true });
    }
  }

  // Email registration gate (when delivery.require_email is true)
  const requireEmail = (delivery as unknown as { require_email?: boolean }).require_email === true;
  if (requireEmail) {
    if (!email) {
      return res.status(200).json({
        emailRequired: true,
        title: delivery.title,
      });
    }
    // Verify the email is registered for this delivery
    const { data: visitor } = await supabase
      .from("gallery_visitors")
      .select("id")
      .eq("delivery_id", delivery.id)
      .eq("email", email.toLowerCase())
      .maybeSingle();
    if (!visitor) {
      return res.status(200).json({
        emailRequired: true,
        title: delivery.title,
      });
    }
  }

  // Increment view count (fire-and-forget; we don't fail the request if this fails)
  supabase.from("deliveries").update({ view_count: delivery.view_count + 1 }).eq("id", delivery.id).then(() => {});

  // Load files
  const { data: files } = await supabase
    .from("delivery_files")
    .select("*")
    .eq("delivery_id", delivery.id)
    .order("position");
  const fileRows = (files || []) as FileRow[];

  // Load existing selections (so client sees their picks if they're returning)
  const { data: selections } = await supabase
    .from("delivery_selections")
    .select("file_id, is_paid")
    .eq("delivery_id", delivery.id);

  // Org branding (logo, name, business info) — same letterhead pattern as contracts
  const { data: org } = await supabase
    .from("organizations")
    .select("name, logo_url, business_info")
    .eq("id", delivery.org_id)
    .single<OrgRow>();

  // Sign GET URLs for each file (1 hour expiry — long enough to browse, short enough not to be hot-linkable)
  const filesWithUrls = fileRows.map((f) => ({
    id: f.id,
    originalName: f.original_name,
    sizeBytes: f.size_bytes,
    width: f.width,
    height: f.height,
    mimeType: f.mime_type,
    position: f.position,
    url: r2Configured() ? r2PresignedUrl({ method: "GET", key: f.storage_path, expiresIn: 3600 }) : "",
  }));

  return res.status(200).json({
    ok: true,
    delivery: {
      id: delivery.id,
      title: delivery.title,
      coverFileId: delivery.cover_file_id,
      coverLayout: (delivery as unknown as { cover_layout?: string }).cover_layout || "center",
      coverSubtitle: (delivery as unknown as { cover_subtitle?: string }).cover_subtitle || null,
      coverDate: (delivery as unknown as { cover_date?: string }).cover_date || null,
      watermarkText: (delivery as unknown as { watermark_text?: string }).watermark_text || null,
      printsEnabled: (delivery as unknown as { prints_enabled?: boolean }).prints_enabled === true,
      status: delivery.status,
      selectionLimit: delivery.selection_limit,
      perExtraPhotoCents: delivery.per_extra_photo_cents,
      buyAllFlatCents: delivery.buy_all_flat_cents,
      submittedAt: delivery.submitted_at,
      clientName: delivery.client_name,
      clientEmail: delivery.client_email,
    },
    files: filesWithUrls,
    selections: (selections || []).map((s: { file_id: string; is_paid: boolean }) => ({
      fileId: s.file_id,
      isPaid: s.is_paid,
    })),
    org: org ? { name: org.name, logoUrl: org.logo_url, businessInfo: org.business_info } : null,
  });
}

async function requestPrints(req: VercelRequest, res: VercelResponse, token: string) {
  const body = (req.body || {}) as Record<string, unknown>;
  const fileId = typeof body.fileId === "string" ? body.fileId : "";
  const size = typeof body.size === "string" ? body.size : "";
  const quantity = typeof body.quantity === "number" ? body.quantity : 1;
  const clientName = typeof body.clientName === "string" ? body.clientName : "";
  const clientEmail = typeof body.clientEmail === "string" ? body.clientEmail : "";
  const note = typeof body.note === "string" ? body.note : "";

  if (!fileId || !size || !clientName || !clientEmail) {
    return res.status(400).json({ error: "fileId, size, clientName, clientEmail required" });
  }

  const { data: delivery } = await findDelivery(token);
  if (!delivery) return res.status(404).json({ error: "Gallery not found" });
  if (!(delivery as unknown as { prints_enabled?: boolean }).prints_enabled) {
    return res.status(400).json({ error: "Prints not enabled for this gallery" });
  }

  // Look up the file to include its name in the email
  const { data: file } = await supabase.from("delivery_files").select("original_name").eq("id", fileId).maybeSingle<{ original_name: string }>();

  // Email the org owner
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("email")
    .eq("org_id", delivery.org_id)
    .eq("role", "owner")
    .single();

  if (profile?.email) {
    const { data: org } = await supabase.from("organizations").select("name").eq("id", delivery.org_id).single();
    const orgName = (org?.name as string) || "Slate";
    await resend.emails.send({
      from: `${orgName} <${FROM_EMAIL}>`,
      to: profile.email,
      replyTo: clientEmail,
      subject: `Print request — ${escapeHtml(delivery.title)}`,
      html: `
        <p><strong>${escapeHtml(clientName)}</strong> (${escapeHtml(clientEmail)}) requested prints from <em>${escapeHtml(delivery.title)}</em>.</p>
        <ul>
          <li><strong>Photo:</strong> ${escapeHtml(file?.original_name || fileId)}</li>
          <li><strong>Size:</strong> ${escapeHtml(size)}</li>
          <li><strong>Quantity:</strong> ${quantity}</li>
          ${note ? `<li><strong>Note:</strong> ${escapeHtml(note)}</li>` : ""}
        </ul>
        <p>Reply directly to this email to arrange payment and fulfillment.</p>
        <p><a href="https://slate.sdubmedia.com/deliveries/${delivery.id}">Open gallery in Slate →</a></p>
      `,
    }).catch(() => { /* fire-and-forget */ });
  }

  return res.status(200).json({ ok: true });
}

async function registerEmail(req: VercelRequest, res: VercelResponse, token: string) {
  const body = (req.body || {}) as Record<string, unknown>;
  const rawEmail = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!rawEmail || !rawEmail.includes("@")) return res.status(400).json({ error: "Valid email required" });

  const { data: delivery } = await findDelivery(token);
  if (!delivery) return res.status(404).json({ error: "Gallery not found" });

  const ipHeader = (req.headers["x-forwarded-for"] as string) || "";
  const ip = ipHeader.split(",")[0].trim() || null;
  const id = `gv_${delivery.id.slice(0, 6)}_${Date.now().toString(36)}`;

  // Idempotent — unique index on (delivery_id, email) prevents dupes
  await supabase.from("gallery_visitors").upsert({
    id,
    delivery_id: delivery.id,
    org_id: delivery.org_id,
    email: rawEmail,
    ip,
  }, { onConflict: "delivery_id,email" });

  return res.status(200).json({ ok: true });
}

async function submitSelections(req: VercelRequest, res: VercelResponse, token: string) {
  const body = (req.body || {}) as Record<string, unknown>;
  const fileIds = Array.isArray(body.fileIds) ? body.fileIds.filter((x): x is string => typeof x === "string") : [];
  const clientName = typeof body.clientName === "string" ? body.clientName.trim() : "";
  const clientEmail = typeof body.clientEmail === "string" ? body.clientEmail.trim() : "";
  const password = typeof body.password === "string" ? body.password : undefined;

  if (!clientName || !clientEmail) return res.status(400).json({ error: "Name and email required" });
  if (fileIds.length === 0) return res.status(400).json({ error: "Pick at least one photo" });

  const { data: delivery, error } = await findDelivery(token);
  if (error || !delivery) return res.status(404).json({ error: "Gallery not found" });

  // Password gate
  if (delivery.password_hash && (!password || !verifyPassword(password, delivery.password_hash))) {
    return res.status(401).json({ error: "Incorrect password" });
  }

  // State check — can't submit when already working/delivered
  if (delivery.status === "working" || delivery.status === "delivered") {
    return res.status(400).json({ error: "This gallery is already in progress. Pay for extras instead." });
  }

  // Validate file IDs belong to this delivery
  const { data: validFiles } = await supabase
    .from("delivery_files")
    .select("id")
    .eq("delivery_id", delivery.id)
    .in("id", fileIds);
  const validIds = new Set((validFiles || []).map((f: { id: string }) => f.id));
  const filteredIds = fileIds.filter((id) => validIds.has(id));
  if (filteredIds.length !== fileIds.length) {
    return res.status(400).json({ error: "Some picked photos no longer exist" });
  }

  const overage = Math.max(0, filteredIds.length - delivery.selection_limit);

  // If selections exceed the free limit, return checkout options instead of saving
  if (overage > 0) {
    const options: Record<string, unknown> = {};
    if (delivery.per_extra_photo_cents > 0) {
      options.perPhoto = {
        extras: overage,
        unitCents: delivery.per_extra_photo_cents,
        totalCents: overage * delivery.per_extra_photo_cents,
      };
    }
    if (delivery.buy_all_flat_cents > 0) {
      options.flat = { totalCents: delivery.buy_all_flat_cents };
    }
    if (Object.keys(options).length === 0) {
      return res.status(400).json({
        error: `You can only pick ${delivery.selection_limit} photo${delivery.selection_limit === 1 ? "" : "s"}.`,
      });
    }
    return res.status(402).json({
      needsCheckout: true,
      freeLimit: delivery.selection_limit,
      pickedCount: filteredIds.length,
      options,
    });
  }

  // Within free limit — save selections + alert immediately
  await saveSelectionsAndAlert(delivery, filteredIds, clientName, clientEmail, false, null);
  return res.status(200).json({ ok: true });
}

async function requestChange(req: VercelRequest, res: VercelResponse, token: string) {
  const body = (req.body || {}) as Record<string, unknown>;
  const message = typeof body.message === "string" ? body.message.trim() : "";

  const { data: delivery, error } = await findDelivery(token);
  if (error || !delivery) return res.status(404).json({ error: "Gallery not found" });

  if (delivery.status !== "submitted") {
    return res.status(400).json({ error: "Changes are no longer accepted on this gallery." });
  }

  // Email the org owner
  const { data: org } = await supabase.from("organizations").select("name, business_info").eq("id", delivery.org_id).single();
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("email")
    .eq("org_id", delivery.org_id)
    .eq("role", "owner")
    .single();

  if (profile?.email) {
    const businessInfo = (org?.business_info || {}) as Record<string, unknown>;
    const orgName = (org?.name as string) || "Slate";
    const replyTo = (businessInfo.email as string) || FROM_EMAIL;
    await resend.emails.send({
      from: `${orgName} <${FROM_EMAIL}>`,
      to: profile.email,
      replyTo,
      subject: `Revision requested — ${escapeHtml(delivery.title)}`,
      html: `<p><strong>${escapeHtml(delivery.client_name || "Your client")}</strong> requested a change on the gallery <em>${escapeHtml(delivery.title)}</em>.</p>${message ? `<blockquote style="border-left:3px solid #ccc;padding-left:12px;color:#555">${escapeHtml(message)}</blockquote>` : ""}<p>Reply directly to this email to follow up.</p>`,
    }).catch(() => { /* fire-and-forget */ });
  }

  return res.status(200).json({ ok: true });
}

// Used by both this file (free submit) and the Stripe webhook (paid submit).
export async function saveSelectionsAndAlert(
  delivery: DeliveryRow,
  fileIds: string[],
  clientName: string,
  clientEmail: string,
  isPaid: boolean,
  stripePaymentIntentId: string | null
) {
  const now = new Date().toISOString();
  const orgId = delivery.org_id;

  // Insert selection rows. Upsert so re-submission doesn't duplicate.
  const rows = fileIds.map((fileId, i) => ({
    id: `sel_${delivery.id.slice(0, 6)}_${fileId.slice(0, 6)}_${i}`,
    delivery_id: delivery.id,
    file_id: fileId,
    org_id: orgId,
    is_paid: isPaid,
    stripe_payment_intent_id: stripePaymentIntentId,
  }));
  await supabase.from("delivery_selections").upsert(rows, { onConflict: "delivery_id,file_id" });

  // Move delivery to "submitted"
  await supabase
    .from("deliveries")
    .update({
      status: "submitted",
      client_name: clientName,
      client_email: clientEmail,
      submitted_at: now,
      updated_at: now,
    })
    .eq("id", delivery.id);

  // Alert the owner
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("email")
    .eq("org_id", orgId)
    .eq("role", "owner")
    .single();

  if (profile?.email) {
    const { data: org } = await supabase.from("organizations").select("name, business_info").eq("id", orgId).single();
    const orgName = (org?.name as string) || "Slate";
    const businessInfo = (org?.business_info || {}) as Record<string, unknown>;
    const replyTo = (businessInfo.email as string) || FROM_EMAIL;
    const paidLine = isPaid ? `<p>Includes paid extras (Stripe payment ${stripePaymentIntentId}).</p>` : "";
    await resend.emails.send({
      from: `${orgName} <${FROM_EMAIL}>`,
      to: profile.email,
      replyTo,
      subject: `${escapeHtml(clientName)} picked ${fileIds.length} photo${fileIds.length === 1 ? "" : "s"} — ${escapeHtml(delivery.title)}`,
      html: `
        <p><strong>${escapeHtml(clientName)}</strong> (${escapeHtml(clientEmail)}) submitted ${fileIds.length} pick${fileIds.length === 1 ? "" : "s"} on <em>${escapeHtml(delivery.title)}</em>.</p>
        ${paidLine}
        <p><a href="https://slate.sdubmedia.com/deliveries/${delivery.id}">View selections in Slate →</a></p>
      `,
    }).catch(() => { /* fire-and-forget */ });
  }
}
