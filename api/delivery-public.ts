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
import { errorMessage, escapeHtml, publicBusinessInfo, verifyAuth, getUserOrgId } from "./_auth.js";
import { verifyPassword } from "./_password.js";
import { sendPushToOwner, sendPushToUser } from "./_apns.js";
import { randomUUID } from "crypto";
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
  selection_minimum: number;
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
  media_type?: string | null;
  thumbnail_storage_path?: string | null;
  original_storage_path?: string | null;
  duration_seconds?: number | null;
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
        return await getDelivery(token, undefined, email, res, req);
      }
      case "verify-password": {
        const body = (req.body || {}) as Record<string, unknown>;
        const email = typeof body.email === "string" ? body.email : undefined;
        return await getDelivery(token, typeof body.password === "string" ? body.password : "", email, res, req);
      }
      case "register-email": return await registerEmail(req, res, token);
      case "request-prints": return await requestPrints(req, res, token);
      case "submit": return await submitSelections(req, res, token);
      case "request-change": return await requestChange(req, res, token);
      case "track-download": return await trackDownload(req, res, token);
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

async function getDelivery(token: string, password: string | undefined, email: string | undefined, res: VercelResponse, req?: VercelRequest) {
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

  // Count the view — unless it's the team looking at their own gallery.
  //
  // This page is public and sits on the same domain as the app, so an owner
  // previewing their own delivery was indistinguishable from a client and got
  // counted every time. Color War read 17 views having been seen by nobody but
  // Geoff. If the browser had a Slate session it comes through as a bearer
  // token; anyone in the gallery's own org is checking their own work, not
  // viewing it. A client with a login still counts — they're a real visitor.
  let countThisView = true;
  const authHeader = req?.headers?.authorization;
  if (authHeader) {
    try {
      const viewer = await verifyAuth(req as VercelRequest);
      if (viewer) {
        const viewerOrg = await getUserOrgId(viewer.userId);
        if (viewerOrg && viewerOrg === delivery.org_id) {
          const { data: prof } = await supabase.from("user_profiles").select("role").eq("id", viewer.userId).maybeSingle();
          // Only the people who MAKE the work are excluded. A client or family
          // login opening the gallery they were sent is a genuine view.
          if (prof && ["owner", "partner", "staff"].includes(prof.role)) countThisView = false;
        }
      }
    } catch {
      // A bad or expired token just means we treat them as anonymous.
    }
  }
  if (countThisView) {
    // Fire-and-forget; a failed counter must not fail the gallery.
    supabase.from("deliveries").update({ view_count: delivery.view_count + 1 }).eq("id", delivery.id).then(() => {});
  }

  // Load files
  const { data: files } = await supabase
    .from("delivery_files")
    .select("*")
    .eq("delivery_id", delivery.id)
    .order("position");
  const allRows = (files || []) as FileRow[];

  // A client sees ONE half of the job, never both.
  //
  // Proofing splits a gallery in two: the shots she picks from, and the
  // finished files she receives. Serving the whole table would put 198 rejects
  // next to the 15 she's paying for, which is the thing the stage column
  // exists to prevent.
  //
  // Delivered with finals present → the finals, and only those. Otherwise the
  // proofs, so a returning client still sees what she chose. A gallery with no
  // proofs at all — every real-estate delivery, and everything uploaded before
  // this existed — falls through unchanged.
  const proofRows = allRows.filter(f => (f as unknown as { stage?: string }).stage === "proof");
  const finalRows = allRows.filter(f => (f as unknown as { stage?: string }).stage !== "proof");
  const fileRows: FileRow[] =
    delivery.status === "delivered" && finalRows.length > 0 ? finalRows
      : proofRows.length > 0 ? proofRows
        : allRows;

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
  const filesWithUrls = fileRows.map((f) => {
    const isVideo = f.media_type === "video";
    const isProof = (f as unknown as { stage?: string }).stage === "proof";
    // A download link that tells R2 to serve the file as an attachment. The
    // browser streams it straight to disk — critical for videos, which are far
    // too large to fetch into memory and ZIP client-side like photos.
    const safeName = (f.original_name || "download").replace(/["\\\r\n]/g, "");
    return {
      id: f.id,
      originalName: f.original_name,
      sizeBytes: f.size_bytes,
      width: f.width,
      height: f.height,
      mimeType: f.mime_type,
      position: f.position,
      mediaType: isVideo ? "video" : "image",
      durationSeconds: f.duration_seconds ?? null,
      // So the page can stop offering downloads rather than offering one that
      // 404s. The server is what enforces it; this is just honesty in the UI.
      isProof,
      url: r2Configured() ? r2PresignedUrl({ method: "GET", key: f.storage_path, expiresIn: 3600 }) : "",
      // Download serves the untouched original when the gallery kept one
      // (portrait work); otherwise the single stored file, exactly as before.
      // `url` above always stays the compressed copy so the grid loads fast —
      // browsing a folder of 30MB originals would crawl on a phone.
      // A PROOF IS NEVER DOWNLOADABLE. It's the client's choosing sheet, not
      // something she's bought — and on a raw shoot the download key resolves
      // to original_storage_path, which IS the .NEF. Handing that over would
      // give away the negatives to pick from. A VIEW-ONLY gallery (portfolio
      // mode) withholds downloads the same way, for every file.
      //
      // Withheld here, on the server, rather than by hiding a button: the URL
      // is in the JSON either way, and anyone can open the network tab.
      downloadUrl: isProof || (delivery as unknown as { view_only?: boolean }).view_only === true || !r2Configured()
        ? ""
        : r2PresignedUrl({
            method: "GET",
            key: f.original_storage_path || f.storage_path,
            expiresIn: 3600,
            responseHeaders: { "Content-Disposition": `attachment; filename="${safeName}"` },
          }),
      thumbnailUrl: isVideo && f.thumbnail_storage_path && r2Configured()
        ? r2PresignedUrl({ method: "GET", key: f.thumbnail_storage_path, expiresIn: 3600 })
        : "",
    };
  });

  return res.status(200).json({
    ok: true,
    delivery: {
      id: delivery.id,
      title: delivery.title,
      coverFileId: delivery.cover_file_id,
      // A cover uploaded for this gallery specifically. Signed inline (no
      // attachment disposition) because it is displayed, not downloaded, and
      // it takes precedence over coverFileId on the page.
      coverUrl: (() => {
        const p = (delivery as unknown as { cover_storage_path?: string }).cover_storage_path || "";
        return p && r2Configured() ? r2PresignedUrl({ method: "GET", key: p, expiresIn: 3600 }) : "";
      })(),
      coverFocal: (delivery as unknown as { cover_focal?: string }).cover_focal || "point",
      coverFocalX: (delivery as unknown as { cover_focal_x?: number }).cover_focal_x ?? 50,
      coverFocalY: (delivery as unknown as { cover_focal_y?: number }).cover_focal_y ?? 50,
      coverWidth: (delivery as unknown as { cover_width?: number }).cover_width || 0,
      coverHeight: (delivery as unknown as { cover_height?: number }).cover_height || 0,
      coverLayout: (delivery as unknown as { cover_layout?: string }).cover_layout || "center",
      coverFont: (delivery as unknown as { cover_font?: string }).cover_font || "",
      coverSubtitle: (delivery as unknown as { cover_subtitle?: string }).cover_subtitle || null,
      coverDate: (delivery as unknown as { cover_date?: string }).cover_date || null,
      watermarkText: (delivery as unknown as { watermark_text?: string }).watermark_text || null,
      watermarkUseLogo: (delivery as unknown as { watermark_use_logo?: boolean }).watermark_use_logo === true,
      printsEnabled: (delivery as unknown as { prints_enabled?: boolean }).prints_enabled === true,
      status: delivery.status,
      selectionLimit: delivery.selection_limit,
      selectionMinimum: (delivery as unknown as { selection_minimum?: number }).selection_minimum ?? 0,
      downloadOnly: (delivery as unknown as { download_only?: boolean }).download_only === true,
      viewOnly: (delivery as unknown as { view_only?: boolean }).view_only === true,
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
    org: org ? { name: org.name, logoUrl: org.logo_url, businessInfo: publicBusinessInfo(org.business_info) } : null,
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

  // Validate file IDs belong to this delivery.
  //
  // Proofs only where a proofing round exists: a submitted pick has to be
  // something she was choosing FROM, not a finished file that happens to share
  // the gallery. Galleries with no proofs (every real-estate delivery) keep
  // validating against the whole set.
  const { count: proofCount } = await supabase
    .from("delivery_files")
    .select("id", { count: "exact", head: true })
    .eq("delivery_id", delivery.id)
    .eq("stage", "proof");
  let validQuery = supabase
    .from("delivery_files")
    .select("id")
    .eq("delivery_id", delivery.id)
    .in("id", fileIds);
  if ((proofCount ?? 0) > 0) validQuery = validQuery.eq("stage", "proof");
  const { data: validFiles } = await validQuery;
  const validIds = new Set((validFiles || []).map((f: { id: string }) => f.id));
  const filteredIds = fileIds.filter((id) => validIds.has(id));
  if (filteredIds.length !== fileIds.length) {
    return res.status(400).json({ error: "Some picked photos no longer exist" });
  }

  // Already-submitted picks are counted, not overwritten. A top-up round
  // ("send five now, five later") otherwise looks like a fresh submission of
  // five and the first five vanish from the count.
  const { data: already } = await supabase
    .from("delivery_selections").select("file_id").eq("delivery_id", delivery.id);
  const alreadyIds = new Set((already || []).map((r: { file_id: string }) => r.file_id));
  const combined = new Set([...alreadyIds, ...filteredIds]);
  const overage = Math.max(0, combined.size - delivery.selection_limit);

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

/** Record a download, and tell the owner — once, not forty times.
 *
 *  deliveries.download_count existed from the start and nothing ever wrote to
 *  it, so "did the client actually collect their photos" could not be
 *  answered. Called by the gallery whenever files leave: one file, a zip, or a
 *  video streamed straight to disk.
 *
 *  Deliberately best-effort and never fails the download — if this endpoint is
 *  down, the client still gets their photos. */
async function trackDownload(req: VercelRequest, res: VercelResponse, token: string) {
  const body = (req.body || {}) as Record<string, unknown>;
  const fileId = typeof body.fileId === "string" ? body.fileId : null;
  const rawCount = typeof body.fileCount === "number" ? Math.floor(body.fileCount) : 1;
  // Clamp: this is an unauthenticated endpoint, and the count feeds a running
  // total. 10,000 is far above any real gallery.
  const fileCount = Math.max(1, Math.min(rawCount, 10000));

  const { data: delivery } = await supabase
    .from("deliveries")
    .select("id, org_id, title, download_count, download_notified_at, require_email, client_name")
    .eq("token", token).maybeSingle();
  if (!delivery) return res.status(404).json({ error: "Not found" });

  // A name only when the gallery asked for one. Otherwise this is honestly
  // "someone with the link" — no IP, no fingerprinting.
  let visitorEmail = "";
  if (delivery.require_email) {
    const claimed = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (claimed) {
      const { data: visitor } = await supabase.from("gallery_visitors")
        .select("email").eq("delivery_id", delivery.id).eq("email", claimed).maybeSingle();
      if (visitor) visitorEmail = visitor.email;
    }
  }

  await supabase.from("delivery_downloads").insert({
    id: `dl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    delivery_id: delivery.id,
    org_id: delivery.org_id,
    file_id: fileId,
    visitor_email: visitorEmail,
    file_count: fileCount,
  });

  await supabase.from("deliveries")
    .update({ download_count: (delivery.download_count || 0) + fileCount })
    .eq("id", delivery.id);

  // One email per gallery per half hour. Someone saving 40 photos one at a
  // time is one visit, not forty notifications.
  const DEBOUNCE_MS = 30 * 60 * 1000;
  const last = delivery.download_notified_at ? Date.parse(delivery.download_notified_at) : 0;
  if (Date.now() - last > DEBOUNCE_MS) {
    await supabase.from("deliveries").update({ download_notified_at: new Date().toISOString() }).eq("id", delivery.id);

    const { data: org } = await supabase.from("organizations").select("name").eq("id", delivery.org_id).single();
    const { data: profile } = await supabase.from("user_profiles")
      .select("email").eq("org_id", delivery.org_id).eq("role", "owner").single();
    if (profile?.email) {
      const who = visitorEmail || (delivery.client_name ? `${delivery.client_name} (or whoever has the link)` : "Someone with the link");
      await resend.emails.send({
        from: `${(org?.name as string) || "Slate"} <${FROM_EMAIL}>`,
        to: profile.email,
        subject: `Downloaded — ${delivery.title}`,
        html: `<p><strong>${escapeHtml(who)}</strong> started downloading from <em>${escapeHtml(delivery.title)}</em>.</p>`
          + `<p style="color:#555;font-size:14px">Further downloads in the next half hour won't send another email.</p>`
          + (delivery.require_email ? "" : `<p style="color:#777;font-size:13px">Turn on <strong>Require email</strong> in the gallery's Privacy tab to see who it was.</p>`),
      }).catch(() => { /* never fail a download over a notification */ });
    }

    // Inside the debounce, so a client saving 40 photos buzzes once.
    await sendPushToOwner(delivery.org_id, {
      title: "Gallery downloaded",
      body: `${visitorEmail || "Someone with the link"} — ${delivery.title}`,
      data: { url: `/deliveries/${delivery.id}` },
    }).catch(() => { /* never fail a download over a notification */ });
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

  // Push as well as email. Every other event that matters — a lead, a signed
  // contract, a payment — buzzes the phone; a client finishing their picks is
  // the moment editing can start, and it only sent an email.
  //
  // Owner only, via the role-scoped sender: device_tokens holds staff and
  // CLIENT devices too, and "Felicia picked 15 photos" on another client's
  // phone is a leak, not a notification.
  await sendPushToOwner(orgId, {
    title: `${clientName || "Your client"} finished picking`,
    body: `${fileIds.length} photo${fileIds.length === 1 ? "" : "s"} on ${delivery.title}`,
    data: { url: `/deliveries/${delivery.id}` },
  }).catch(() => { /* best effort — the email already went */ });

  // And whoever is editing this job. They're the person the picks are FOR:
  // until now the owner had to relay it, which is the manual step the whole
  // proofing flow exists to remove.
  await notifyAssignedEditors(delivery, fileIds.length, clientName).catch(() => { /* never fail a submission over a notification */ });
}

/**
 * Push + bell the photo editors on this gallery's project.
 *
 * Addressed per user, not by role: "staff" here would hit every contractor in
 * the business, and a shoot they're not on is not their notification.
 */
async function notifyAssignedEditors(delivery: DeliveryRow, pickCount: number, clientName: string) {
  const projectId = (delivery as unknown as { project_id?: string }).project_id;
  if (!projectId) return;   // nothing to scope by

  const { data: project } = await supabase
    .from("projects").select("post_production").eq("id", projectId).maybeSingle();
  const post = Array.isArray(project?.post_production) ? project!.post_production : [];
  const crewIds = [...new Set(
    (post as Record<string, unknown>[])
      .map(e => String(e?.crewMemberId ?? e?.crew_member_id ?? ""))
      .filter(Boolean),
  )];
  if (crewIds.length === 0) return;

  const { data: profiles } = await supabase
    .from("user_profiles").select("id").eq("org_id", delivery.org_id).in("crew_member_id", crewIds);
  const userIds = (profiles as { id: string }[] | null)?.map(p => p.id) ?? [];
  if (userIds.length === 0) return;

  const title = "Photos picked — ready to edit";
  const body = `${clientName || "The client"} chose ${pickCount} on ${delivery.title}`;
  await Promise.allSettled([
    // The bell survives a push that never arrives (no device, notifications
    // off), so the job is still waiting for her when she next opens Slate.
    supabase.from("notifications").insert(userIds.map(uid => ({
      id: randomUUID(),
      user_id: uid,
      type: "picks_ready",
      title,
      message: body,
      link: `/deliveries/${delivery.id}`,
    }))),
    ...userIds.map(uid => sendPushToUser(uid, { title, body, data: { url: `/deliveries/${delivery.id}` } })),
  ]);
}
