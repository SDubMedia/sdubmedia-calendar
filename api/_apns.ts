// ============================================================
// APNs push sender — zero external dependencies.
//
// Signs the APNs provider JWT with Node's crypto (ES256 via the
// ieee-p1363 signature encoding APNs expects) and delivers over the
// built-in http2 client. Looks up an org's device tokens and pushes to
// each; prunes tokens APNs reports as gone (410).
//
// Stays fully dormant until these env vars are set, so it can ship and
// wait for the credentials:
//   APNS_AUTH_KEY   — contents of the .p8 file (PEM; \n-escaped is fine)
//   APNS_KEY_ID     — 10-char key id
//   APNS_TEAM_ID    — 10-char Apple team id
//   APNS_BUNDLE_ID  — app bundle id (apns-topic)
//   APNS_PRODUCTION — "true" for the production gateway (default), else sandbox
// ============================================================

import http2 from "http2";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
import { errorMessage } from "./_auth.js";

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLL_KEY || "";

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function apnsConfigured(): boolean {
  return !!(process.env.APNS_AUTH_KEY && process.env.APNS_KEY_ID && process.env.APNS_TEAM_ID && process.env.APNS_BUNDLE_ID);
}

// Provider JWT is valid up to 1h; cache and refresh well inside that.
let cachedJwt: { token: string; at: number } | null = null;
function providerToken(): string {
  if (cachedJwt && Date.now() - cachedJwt.at < 50 * 60 * 1000) return cachedJwt.token;
  const keyId = process.env.APNS_KEY_ID as string;
  const teamId = process.env.APNS_TEAM_ID as string;
  const pem = (process.env.APNS_AUTH_KEY as string).replace(/\\n/g, "\n");
  const header = b64url(JSON.stringify({ alg: "ES256", kid: keyId }));
  const payload = b64url(JSON.stringify({ iss: teamId, iat: Math.floor(Date.now() / 1000) }));
  const signingInput = `${header}.${payload}`;
  const privateKey = crypto.createPrivateKey(pem);
  const sig = crypto.sign("sha256", Buffer.from(signingInput), { key: privateKey, dsaEncoding: "ieee-p1363" });
  const token = `${signingInput}.${b64url(sig)}`;
  cachedJwt = { token, at: Date.now() };
  return token;
}

export interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, string>;   // custom keys delivered alongside aps
}

interface SendResult { sent: number; pruned: number; errors: string[] }

// Send a push to every device registered to an org. Best-effort: never
// throws, so a push failure can't break the action that triggered it.
export async function sendPushToOrg(orgId: string, payload: PushPayload): Promise<SendResult> {
  const result: SendResult = { sent: 0, pruned: 0, errors: [] };
  if (!apnsConfigured()) return result;            // dormant until creds exist
  if (!supabaseUrl || !supabaseServiceKey) return result;

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const { data: rows } = await supabase
    .from("device_tokens")
    .select("token")
    .eq("org_id", orgId);
  const tokens = (rows as { token: string }[] | null)?.map(r => r.token).filter(Boolean) ?? [];
  if (tokens.length === 0) return result;

  const host = (process.env.APNS_PRODUCTION ?? "true") === "false"
    ? "https://api.sandbox.push.apple.com"
    : "https://api.push.apple.com";
  const jwt = providerToken();
  const bundleId = process.env.APNS_BUNDLE_ID as string;
  const bodyJson = JSON.stringify({
    aps: { alert: { title: payload.title, body: payload.body }, sound: "default" },
    ...(payload.data || {}),
  });

  const client = http2.connect(host);
  const dead: string[] = [];
  try {
    await new Promise<void>((resolveAll) => {
      let pending = tokens.length;
      const done = () => { if (--pending <= 0) resolveAll(); };
      for (const token of tokens) {
        const req = client.request({
          ":method": "POST",
          ":path": `/3/device/${token}`,
          "authorization": `bearer ${jwt}`,
          "apns-topic": bundleId,
          "apns-push-type": "alert",
          "content-type": "application/json",
        });
        let status = 0;
        let respBody = "";
        req.on("response", h => { status = Number(h[":status"]) || 0; });
        req.setEncoding("utf8");
        req.on("data", d => { respBody += d; });
        req.on("end", () => {
          if (status === 200) result.sent++;
          else if (status === 410 || /BadDeviceToken|Unregistered/.test(respBody)) dead.push(token);
          else result.errors.push(`token=${token.slice(0, 8)}… status=${status} ${respBody.slice(0, 120)}`);
          done();
        });
        req.on("error", err => { result.errors.push(`token=${token.slice(0, 8)}… ${errorMessage(err)}`); done(); });
        req.write(bodyJson);
        req.end();
      }
    });
  } catch (err) {
    result.errors.push(errorMessage(err));
  } finally {
    client.close();
  }

  // Prune tokens APNs says are gone so we stop trying them.
  if (dead.length > 0) {
    try {
      await supabase.from("device_tokens").delete().in("token", dead);
      result.pruned = dead.length;
    } catch { /* best-effort */ }
  }

  return result;
}
