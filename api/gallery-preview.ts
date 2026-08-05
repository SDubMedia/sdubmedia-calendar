// ============================================================
// Vercel Serverless — rich link previews for a delivered gallery.
//
// Texting a gallery link produced a generic "Slate · slate.sdubmedia.com" card,
// because this is a single-page app: every URL serves the same index.html with
// the same static <head>. iMessage, WhatsApp and the rest build their card by
// fetching the URL and reading Open Graph tags, so they all saw the same thing.
//
// This serves the real app shell with per-gallery tags injected, so the card
// shows the cover photo and the gallery name. It runs for everyone — humans get
// the identical app, crawlers get the tags — rather than sniffing user agents,
// which is fragile and reads as cloaking.
//
// Wired up by the /deliver/:token and /g/:slug rewrites in vercel.json.
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { r2Configured, r2PresignedUrl } from "./_r2.js";

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLL_KEY || ""
);

/** Longest AWS SigV4 allows. Regenerated on every request, so a card refreshed
 *  weeks later still resolves — the tag is never older than this response. */
const PREVIEW_URL_TTL = 7 * 24 * 60 * 60;

function esc(s: string): string {
  return String(s || "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const identifier = typeof req.query.token === "string" ? req.query.token
    : typeof req.query.slug === "string" ? req.query.slug : "";

  // Always serve the app, whatever happens below — a broken preview must never
  // mean a client can't open their gallery.
  const host = req.headers["x-forwarded-host"] || req.headers.host || process.env.VERCEL_URL || "";
  const proto = (req.headers["x-forwarded-proto"] as string) || "https";
  let shell = "";
  try {
    const r = await fetch(`${proto}://${host}/index.html`);
    if (r.ok) shell = await r.text();
  } catch (err) {
    console.error("[gallery-preview] couldn't load the app shell:", err);
  }

  let title = "";
  let orgName = "";
  let imageUrl = "";
  let locked = false;

  try {
    if (identifier) {
      const byToken = await supabase.from("deliveries")
        .select("id, org_id, title, cover_file_id, password_hash").eq("token", identifier).maybeSingle();
      const delivery = byToken.data ?? (await supabase.from("deliveries")
        .select("id, org_id, title, cover_file_id, password_hash").eq("slug", identifier).maybeSingle()).data;

      if (delivery) {
        title = delivery.title || "";
        locked = !!delivery.password_hash;

        const { data: org } = await supabase.from("organizations")
          .select("name").eq("id", delivery.org_id).maybeSingle();
        orgName = org?.name || "";

        // A password-protected gallery must not leak a photo in a link preview
        // — that would hand over exactly what the password is protecting.
        if (!locked && r2Configured()) {
          let coverPath = "";
          if (delivery.cover_file_id) {
            const { data: cover } = await supabase.from("delivery_files")
              .select("storage_path, media_type").eq("id", delivery.cover_file_id).maybeSingle();
            if (cover?.media_type !== "video") coverPath = cover?.storage_path || "";
          }
          if (!coverPath) {
            // No cover chosen — use the first still. Videos can't be a preview.
            const { data: first } = await supabase.from("delivery_files")
              .select("storage_path").eq("delivery_id", delivery.id).neq("media_type", "video")
              .order("position").limit(1).maybeSingle();
            coverPath = first?.storage_path || "";
          }
          if (coverPath) {
            imageUrl = r2PresignedUrl({ method: "GET", key: coverPath, expiresIn: PREVIEW_URL_TTL });
          }
        }
      }
    }
  } catch (err) {
    console.error("[gallery-preview] lookup failed:", err);
  }

  const pageTitle = title ? (orgName ? `${title} · ${orgName}` : title) : "Slate — SDub Media";
  const description = locked
    ? "This gallery is password protected."
    : title
      ? `Your photos are ready to view and download.`
      : "View and download your photos.";

  const tags = [
    `<meta property="og:type" content="website" />`,
    `<meta property="og:title" content="${esc(title || "Your photos")}" />`,
    `<meta property="og:description" content="${esc(description)}" />`,
    orgName ? `<meta property="og:site_name" content="${esc(orgName)}" />` : "",
    imageUrl ? `<meta property="og:image" content="${esc(imageUrl)}" />` : "",
    imageUrl ? `<meta name="twitter:card" content="summary_large_image" />` : `<meta name="twitter:card" content="summary" />`,
    `<meta name="twitter:title" content="${esc(title || "Your photos")}" />`,
    `<meta name="twitter:description" content="${esc(description)}" />`,
    imageUrl ? `<meta name="twitter:image" content="${esc(imageUrl)}" />` : "",
    `<meta name="description" content="${esc(description)}" />`,
  ].filter(Boolean).join("\n    ");

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  // Short cache: the tags carry a signed image URL, and a stale card is worse
  // than a fresh fetch.
  res.setHeader("Cache-Control", "public, max-age=0, s-maxage=300");

  if (!shell) {
    // Couldn't reach the app shell — still give the crawler its card, and give
    // a person a working way in.
    return res.status(200).send(
      `<!doctype html><html><head><meta charset="utf-8" />
    <title>${esc(pageTitle)}</title>
    ${tags}
  </head><body><p><a href="${esc(`${proto}://${host}${req.url || ""}`)}">Open your gallery</a></p></body></html>`
    );
  }

  const withTitle = shell.replace(/<title>[^<]*<\/title>/i, `<title>${esc(pageTitle)}</title>`);
  const html = withTitle.replace(/<\/head>/i, `    ${tags}\n  </head>`);
  return res.status(200).send(html);
}
