// Cloudflare R2 helper — manual AWS SigV4 presigned URLs, no SDK deps.
// R2 is S3-compatible. Endpoint: https://<account_id>.r2.cloudflarestorage.com
//
// Required env vars (set after R2 bucket creation):
//   R2_ACCOUNT_ID
//   R2_ACCESS_KEY_ID
//   R2_SECRET_ACCESS_KEY
//   R2_BUCKET           (default "slate-deliveries")
//   R2_PUBLIC_BASE_URL  (optional — set if you map a custom domain to the bucket)

import { createHmac, createHash } from "crypto";

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || "";
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || "";
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || "";
const R2_BUCKET = process.env.R2_BUCKET || "slate-deliveries";
const R2_REGION = "auto";

function r2Host(): string {
  return `${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
}

export function r2Configured(): boolean {
  return !!(R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY);
}

// URI-encode each path segment but keep "/" separators intact.
function encodePath(key: string): string {
  return key.split("/").map(encodeURIComponent).join("/");
}

interface PresignOpts {
  method: "GET" | "PUT" | "DELETE";
  key: string;
  expiresIn?: number;        // seconds, default 3600 (1h)
  contentType?: string;      // for PUT — included in signed headers if set
  responseHeaders?: Record<string, string>; // X-Amz-* response overrides for GET (e.g. Content-Disposition)
}

export function r2PresignedUrl(opts: PresignOpts): string {
  if (!r2Configured()) throw new Error("R2 not configured — set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY");

  const { method, key, expiresIn = 3600, contentType, responseHeaders } = opts;
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);

  const host = r2Host();
  const credentialScope = `${dateStamp}/${R2_REGION}/s3/aws4_request`;

  // Headers we'll sign. R2 always requires "host"; for PUT with content-type
  // we include it so the URL only works when the client sends that exact type.
  const headersToSign: Record<string, string> = { host };
  if (method === "PUT" && contentType) headersToSign["content-type"] = contentType;

  const signedHeaderList = Object.keys(headersToSign).sort();
  const signedHeaders = signedHeaderList.join(";");

  const queryParams: Record<string, string> = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${R2_ACCESS_KEY_ID}/${credentialScope}`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(expiresIn),
    "X-Amz-SignedHeaders": signedHeaders,
  };

  // Response-header overrides (only valid on GET; e.g. force Content-Disposition for downloads).
  if (method === "GET" && responseHeaders) {
    for (const [k, v] of Object.entries(responseHeaders)) {
      queryParams[`response-${k.toLowerCase()}`] = v;
    }
  }

  const canonicalQueryString = Object.keys(queryParams)
    .sort()
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(queryParams[k])}`)
    .join("&");

  const canonicalHeaders = signedHeaderList.map((h) => `${h}:${headersToSign[h]}\n`).join("");

  const canonicalRequest = [
    method,
    `/${R2_BUCKET}/${encodePath(key)}`,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    "UNSIGNED-PAYLOAD",
  ].join("\n");

  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    createHash("sha256").update(canonicalRequest).digest("hex"),
  ].join("\n");

  const dateKey = createHmac("sha256", `AWS4${R2_SECRET_ACCESS_KEY}`).update(dateStamp).digest();
  const dateRegionKey = createHmac("sha256", dateKey).update(R2_REGION).digest();
  const dateRegionServiceKey = createHmac("sha256", dateRegionKey).update("s3").digest();
  const signingKey = createHmac("sha256", dateRegionServiceKey).update("aws4_request").digest();
  const signature = createHmac("sha256", signingKey).update(stringToSign).digest("hex");

  return `https://${host}/${R2_BUCKET}/${encodePath(key)}?${canonicalQueryString}&X-Amz-Signature=${signature}`;
}

// Deletes an object from R2 by issuing a signed DELETE request.
// Used when files are removed from a delivery to avoid orphan storage.
export async function r2DeleteObject(key: string): Promise<void> {
  if (!r2Configured()) return; // no-op if not configured (dev mode)
  const url = r2PresignedUrl({ method: "DELETE", key, expiresIn: 60 });
  const res = await fetch(url, { method: "DELETE" });
  if (!res.ok && res.status !== 404) {
    const body = await res.text().catch(() => "");
    throw new Error(`R2 delete failed: ${res.status} ${body}`);
  }
}

// Build a key for a delivery file: <org_id>/<delivery_id>/<random>-<sanitized_name>
export function r2BuildKey(orgId: string, deliveryId: string, originalName: string): string {
  const safeName = originalName
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "_")
    .slice(0, 100);
  const random = Math.random().toString(36).slice(2, 10);
  return `${orgId}/${deliveryId}/${random}-${safeName}`;
}
