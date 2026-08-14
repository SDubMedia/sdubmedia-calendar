// ============================================================
// Vercel Serverless — S3 multipart uploads for large gallery files.
//
// WHY THIS EXISTS: a presigned PUT is one HTTP request. It cannot resume, and
// its URL expires. A 3-5GB wedding film over a domestic upstream takes long
// enough that a single blip loses the whole transfer, and a slow connection can
// outlive the URL. Raising the size cap without this would turn "fails
// instantly" into "fails 35 minutes in", which is worse for the person waiting.
//
// Multipart does NOT split the file. The client slices the *transfer* into
// parts, uploads them in parallel with per-part retry, and R2 reassembles them
// into a single object. The client downloads one intact file. This is the same
// mechanism Pixieset, Dropbox and WeTransfer use for multi-gigabyte uploads.
//
// FLOW  (body.action)
//   create   { deliveryId, fileName, contentType, sizeBytes } -> { uploadId, storagePath, partSize, partCount }
//   sign     { storagePath, uploadId, partNumbers[] }         -> { urls: {partNumber, url}[] }
//   complete { storagePath, uploadId, parts[] }               -> { ok }
//   abort    { storagePath, uploadId }                        -> { ok }
//
// The client must call abort (or complete) — an abandoned multipart upload
// leaves parts in the bucket that still cost money. R2 does not expire them
// on its own without a lifecycle rule.
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { verifyAuth, getUserOrgId, errorMessage } from "./_auth.js";
import { r2BuildKey, r2Configured, r2PresignedUrl, r2SignedRequest } from "./_r2.js";

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLL_KEY || ""
);

// 5GB is S3's ceiling for a single PUT and a sane ceiling for a finished film.
const MAX_MULTIPART_BYTES = 5 * 1024 * 1024 * 1024;
// S3 requires every part except the last to be >= 5MB, and allows at most
// 10,000 parts. 32MB keeps a 5GB file to ~160 parts: few enough that the
// per-part overhead is negligible, small enough that a failed part is cheap
// to retry.
const PART_SIZE = 32 * 1024 * 1024;
const MAX_PARTS = 10000;

const PRO_STORAGE_CAP_BYTES = 200 * 1024 * 1024 * 1024;
const FREE_STORAGE_CAP_BYTES = 10 * 1024 * 1024 * 1024;

/** Pull a single XML tag's text. R2's responses are small and flat, so this
 *  avoids adding an XML parser dependency for two fields. */
function xmlTag(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return m ? m[1].trim() : "";
}

function xmlEscape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

/** Every part R2 currently holds for this upload, with the ETags it recorded.
 *  Pages through the listing: S3 caps ListParts at 1,000 per response, and a
 *  5GB file is only ~160 parts, but a smaller PART_SIZE later would silently
 *  truncate the list and complete a partial file. Returns null on any failure
 *  rather than a short list, so the caller can never mistake "the request
 *  broke" for "these are all the parts". */
async function listAllParts(
  key: string, uploadId: string,
): Promise<{ partNumber: number; etag: string }[] | null> {
  const all: { partNumber: number; etag: string }[] = [];
  let marker = "";
  for (let page = 0; page < 20; page++) {
    const query: Record<string, string> = { uploadId, "max-parts": "1000" };
    if (marker) query["part-number-marker"] = marker;
    const r = await r2SignedRequest({ method: "GET", key, query });
    if (r.status >= 300) {
      console.error("R2 ListParts failed:", r.status, r.text);
      return null;
    }
    for (const block of r.text.match(/<Part>[\s\S]*?<\/Part>/g) || []) {
      const n = block.match(/<PartNumber>(\d+)<\/PartNumber>/);
      const e = block.match(/<ETag>([\s\S]*?)<\/ETag>/);
      if (n && e) all.push({ partNumber: Number(n[1]), etag: e[1].trim() });
    }
    if (!/<IsTruncated>true<\/IsTruncated>/.test(r.text)) return all;
    const next = r.text.match(/<NextPartNumberMarker>(\d+)<\/NextPartNumberMarker>/);
    if (!next) return all;
    marker = next[1];
  }
  console.error("R2 ListParts did not terminate after 20 pages:", key);
  return null;
}

/** The delivery must exist and belong to the caller's org. */
async function ownsDelivery(deliveryId: string, orgId: string): Promise<boolean> {
  const { data } = await supabase
    .from("deliveries").select("id, org_id").eq("id", deliveryId).maybeSingle();
  return !!data && data.org_id === orgId;
}

/** A storagePath is only ours to touch if it sits under this org's prefix.
 *  Without this check, sign/complete/abort would accept any key in the bucket. */
function pathBelongsToOrg(storagePath: string, orgId: string): boolean {
  return typeof storagePath === "string" && storagePath.startsWith(`${orgId}/`);
}

async function orgUsedBytes(orgId: string): Promise<number> {
  const [files, docs] = await Promise.all([
    supabase.from("delivery_files").select("size_bytes").eq("org_id", orgId),
    supabase.from("project_documents").select("size_bytes").eq("org_id", orgId),
  ]);
  const sum = (rows: { size_bytes: number | null }[] | null) =>
    (rows || []).reduce((t, r) => t + (r.size_bytes || 0), 0);
  return sum(files.data) + sum(docs.data);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST required" });
  if (!r2Configured()) return res.status(503).json({ error: "Storage not configured. R2 env vars missing." });

  const user = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  const orgId = await getUserOrgId(user.userId);
  if (!orgId) return res.status(403).json({ error: "No org" });

  const body = (req.body || {}) as Record<string, unknown>;
  const action = body.action;

  try {
    // ---- create -------------------------------------------------------
    if (action === "create") {
      const deliveryId = typeof body.deliveryId === "string" ? body.deliveryId : "";
      const fileName = typeof body.fileName === "string" ? body.fileName : "";
      const contentType = typeof body.contentType === "string" ? body.contentType : "application/octet-stream";
      const sizeBytes = typeof body.sizeBytes === "number" ? body.sizeBytes : 0;

      if (!deliveryId || !fileName || sizeBytes <= 0) {
        return res.status(400).json({ error: "Missing deliveryId, fileName or sizeBytes" });
      }
      if (!(await ownsDelivery(deliveryId, orgId))) {
        return res.status(403).json({ error: "Not your gallery" });
      }
      if (sizeBytes > MAX_MULTIPART_BYTES) {
        return res.status(413).json({ error: `File too large (max ${MAX_MULTIPART_BYTES / 1024 / 1024 / 1024}GB)` });
      }
      const partCount = Math.ceil(sizeBytes / PART_SIZE);
      if (partCount > MAX_PARTS) {
        return res.status(413).json({ error: "File needs too many parts — contact support" });
      }

      // Same storage cap the single-shot path enforces. Geoff's own org is
      // exempt there, so it is exempt here too; diverging would mean a 4GB
      // film uploads via one route and not the other.
      if (orgId !== "org_sdubmedia") {
        const { data: org } = await supabase.from("organizations").select("plan").eq("id", orgId).single();
        const cap = org?.plan === "pro" ? PRO_STORAGE_CAP_BYTES : FREE_STORAGE_CAP_BYTES;
        const used = await orgUsedBytes(orgId);
        if (used + sizeBytes > cap) {
          return res.status(413).json({
            error: `You're at your ${Math.floor(cap / 1024 / 1024 / 1024)} GB storage cap. Delete an old gallery to free up space.`,
            usedBytes: used, capBytes: cap,
          });
        }
      }

      const storagePath = r2BuildKey(orgId, deliveryId, fileName);
      const r = await r2SignedRequest({
        method: "POST", key: storagePath, query: { uploads: "" }, contentType,
      });
      if (r.status >= 300) {
        console.error("R2 CreateMultipartUpload failed:", r.status, r.text);
        return res.status(502).json({ error: "Couldn't start the upload" });
      }
      const uploadId = xmlTag(r.text, "UploadId");
      if (!uploadId) {
        console.error("R2 CreateMultipartUpload returned no UploadId:", r.text);
        return res.status(502).json({ error: "Couldn't start the upload" });
      }
      return res.status(200).json({ ok: true, uploadId, storagePath, partSize: PART_SIZE, partCount });
    }

    // ---- sign ---------------------------------------------------------
    // Signed in batches rather than one request per part: a 5GB file is ~160
    // parts, and 160 round trips just to get URLs would dominate the upload.
    if (action === "sign") {
      const storagePath = typeof body.storagePath === "string" ? body.storagePath : "";
      const uploadId = typeof body.uploadId === "string" ? body.uploadId : "";
      const partNumbers = Array.isArray(body.partNumbers) ? body.partNumbers : [];
      if (!storagePath || !uploadId || partNumbers.length === 0) {
        return res.status(400).json({ error: "Missing storagePath, uploadId or partNumbers" });
      }
      if (!pathBelongsToOrg(storagePath, orgId)) return res.status(403).json({ error: "Not your file" });
      if (partNumbers.length > 200) return res.status(400).json({ error: "Too many parts in one request" });

      const urls = partNumbers.map((raw) => {
        const partNumber = Number(raw);
        if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > MAX_PARTS) {
          throw new Error(`Bad part number: ${raw}`);
        }
        return {
          partNumber,
          // Long expiry: these are handed out up front and a slow connection
          // may not reach the last part for a long time.
          url: r2PresignedUrl({
            method: "PUT", key: storagePath, expiresIn: 6 * 3600,
            query: { partNumber: String(partNumber), uploadId },
          }),
        };
      });
      return res.status(200).json({ ok: true, urls });
    }

    // ---- complete -----------------------------------------------------
    if (action === "complete") {
      const storagePath = typeof body.storagePath === "string" ? body.storagePath : "";
      const uploadId = typeof body.uploadId === "string" ? body.uploadId : "";
      const expectedParts = typeof body.expectedParts === "number" ? body.expectedParts : 0;
      if (!storagePath || !uploadId || expectedParts <= 0) {
        return res.status(400).json({ error: "Missing storagePath, uploadId or expectedParts" });
      }
      if (!pathBelongsToOrg(storagePath, orgId)) return res.status(403).json({ error: "Not your file" });

      // The ETags come from ListParts here, NOT from the browser.
      //
      // A cross-origin PUT only exposes the headers named in the bucket's CORS
      // ExposeHeaders, and this bucket does not name ETag — so R2 sends it on
      // the wire and the browser hides it from JS. Every part read as "no
      // ETag", failed, retried and died. Asking R2 what it already holds sinks
      // the whole problem, and cannot drift from what was actually stored.
      const listed = await listAllParts(storagePath, uploadId);
      if (!listed) return res.status(502).json({ error: "Couldn't read the uploaded parts" });

      // R2 assembles whatever parts it has. If one never arrived, completing
      // anyway would produce a short file that looks perfectly fine — a
      // truncated wedding video is worse than a failed upload, because nobody
      // finds out until the client presses play.
      if (listed.length !== expectedParts) {
        console.error(`R2 multipart part mismatch on ${storagePath}: have ${listed.length}, expected ${expectedParts}`);
        return res.status(502).json({ error: `Upload incomplete — ${listed.length} of ${expectedParts} pieces arrived. Try again.` });
      }

      // S3 requires parts in ascending order; an out-of-order list is rejected
      // with a confusing InvalidPartOrder rather than being sorted for you.
      const ordered = [...listed].sort((a, b) => a.partNumber - b.partNumber);
      const xml = "<CompleteMultipartUpload>"
        + ordered.map(p =>
            `<Part><PartNumber>${p.partNumber}</PartNumber><ETag>${xmlEscape(p.etag)}</ETag></Part>`
          ).join("")
        + "</CompleteMultipartUpload>";

      const r = await r2SignedRequest({
        method: "POST", key: storagePath, query: { uploadId }, body: xml, contentType: "application/xml",
      });
      // S3 can return 200 with an <Error> body on completion — checking only
      // the status code would report success on a failed assembly.
      if (r.status >= 300 || r.text.includes("<Error>")) {
        console.error("R2 CompleteMultipartUpload failed:", r.status, r.text);
        return res.status(502).json({ error: "Couldn't finish the upload" });
      }
      return res.status(200).json({ ok: true });
    }

    // ---- abort --------------------------------------------------------
    if (action === "abort") {
      const storagePath = typeof body.storagePath === "string" ? body.storagePath : "";
      const uploadId = typeof body.uploadId === "string" ? body.uploadId : "";
      if (!storagePath || !uploadId) return res.status(400).json({ error: "Missing storagePath or uploadId" });
      if (!pathBelongsToOrg(storagePath, orgId)) return res.status(403).json({ error: "Not your file" });

      const r = await r2SignedRequest({ method: "DELETE", key: storagePath, query: { uploadId } });
      if (r.status >= 300 && r.status !== 404) {
        console.error("R2 AbortMultipartUpload failed:", r.status, r.text);
      }
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: "Unknown action" });
  } catch (err) {
    return res.status(500).json({ error: errorMessage(err, "Multipart upload failed") });
  }
}
