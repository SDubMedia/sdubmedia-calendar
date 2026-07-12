// ============================================================
// Shared Google Drive helpers for the gallery-archiving feature.
// OAuth (drive.file scope — the app only sees folders it creates), token
// refresh, signed OAuth state (anti-CSRF), refresh-token encryption at rest,
// and Drive folder/file operations.
// ============================================================

import { createCipheriv, createDecipheriv, createHmac, randomBytes, randomUUID, timingSafeEqual } from "crypto";

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";
const APP_URL = process.env.APP_URL || "https://slate.sdubmedia.com";
export const GOOGLE_REDIRECT_URI = `${APP_URL}/api/google-drive-callback`;
export const GOOGLE_SCOPE = "openid email https://www.googleapis.com/auth/drive.file";
const STATE_SECRET = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLL_KEY || "slate-state";
const ENC_KEY = process.env.TAX_ENCRYPTION_KEY || "";

export function googleConfigured(): boolean {
  return !!(CLIENT_ID && CLIENT_SECRET);
}

// ---- Refresh-token encryption at rest (AES-256-GCM) ----
export function encryptToken(plain: string): string {
  if (!plain || !ENC_KEY || ENC_KEY.length < 32) return plain;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", Buffer.from(ENC_KEY.slice(0, 32), "utf-8"), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf-8"), cipher.final()]);
  return `${iv.toString("base64")}:${cipher.getAuthTag().toString("base64")}:${enc.toString("base64")}`;
}
export function decryptToken(enc: string): string {
  if (!enc || !enc.includes(":")) return enc;
  const parts = enc.split(":");
  if (parts.length !== 3) return enc;
  try {
    const decipher = createDecipheriv("aes-256-gcm", Buffer.from(ENC_KEY.slice(0, 32), "utf-8"), Buffer.from(parts[0], "base64"));
    decipher.setAuthTag(Buffer.from(parts[1], "base64"));
    return Buffer.concat([decipher.update(Buffer.from(parts[2], "base64")), decipher.final()]).toString("utf-8");
  } catch { return enc; }
}

// ---- Signed OAuth state (binds the callback to the org that started it) ----
export function signState(orgId: string): string {
  const payload = Buffer.from(JSON.stringify({ orgId, ts: Date.now() })).toString("base64url");
  const sig = createHmac("sha256", STATE_SECRET).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}
export function verifyState(state: string): string | null {
  const [payload, sig] = String(state || "").split(".");
  if (!payload || !sig) return null;
  const expected = createHmac("sha256", STATE_SECRET).update(payload).digest("base64url");
  const a = Buffer.from(sig), b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const { orgId, ts } = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (Date.now() - ts > 15 * 60 * 1000) return null; // 15-min window
    return orgId || null;
  } catch { return null; }
}

export function consentUrl(orgId: string): string {
  const p = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: GOOGLE_REDIRECT_URI,
    response_type: "code",
    scope: GOOGLE_SCOPE,
    access_type: "offline",
    prompt: "consent",
    state: signState(orgId),
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p.toString()}`;
}

// ---- Token exchange / refresh ----
export async function exchangeCode(code: string): Promise<{ refreshToken: string; accessToken: string; email: string }> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: CLIENT_ID, client_secret: CLIENT_SECRET, redirect_uri: GOOGLE_REDIRECT_URI, grant_type: "authorization_code" }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error_description || body.error || "Token exchange failed");
  const email = await userEmail(body.access_token).catch(() => "");
  return { refreshToken: body.refresh_token || "", accessToken: body.access_token || "", email };
}

export async function accessTokenFromRefresh(refreshToken: string): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ refresh_token: refreshToken, client_id: CLIENT_ID, client_secret: CLIENT_SECRET, grant_type: "refresh_token" }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error_description || body.error || "Token refresh failed");
  return body.access_token;
}

async function userEmail(accessToken: string): Promise<string> {
  const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", { headers: { Authorization: `Bearer ${accessToken}` } });
  const body = await res.json();
  return body.email || "";
}

// ---- Drive folder + file ops ----
export async function ensureFolder(accessToken: string, name: string, parentId?: string): Promise<string> {
  const safe = name.replace(/'/g, "\\'");
  let q = `name='${safe}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  if (parentId) q += ` and '${parentId}' in parents`;
  const findRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)&spaces=drive`, { headers: { Authorization: `Bearer ${accessToken}` } });
  const found = await findRes.json();
  if (findRes.ok && found.files && found.files.length) return found.files[0].id;
  const createRes = await fetch("https://www.googleapis.com/drive/v3/files?fields=id", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder", ...(parentId ? { parents: [parentId] } : {}) }),
  });
  const created = await createRes.json();
  if (!createRes.ok) throw new Error(created.error?.message || "Couldn't create Drive folder");
  return created.id;
}

export async function uploadFile(accessToken: string, folderId: string, name: string, mimeType: string, bytes: Buffer): Promise<void> {
  const boundary = `slate-${randomUUID()}`;
  const meta = JSON.stringify({ name, parents: [folderId] });
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Type: ${mimeType || "application/octet-stream"}\r\n\r\n`),
    bytes,
    Buffer.from(`\r\n--${boundary}--`),
  ]);
  const res = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": `multipart/related; boundary=${boundary}` },
    body,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || "Drive upload failed");
  }
}
