// ============================================================
// Google redirects the owner's browser here after they grant access. We verify
// the signed state, exchange the code for a refresh token, store it (encrypted)
// + the connected account email on the org, then bounce back to Settings.
// No Bearer auth — the signed state identifies the org that started the flow.
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { verifyState, exchangeCode, encryptToken } from "./_google.js";

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLL_KEY || ""
);
const APP_URL = process.env.APP_URL || "https://slate.sdubmedia.com";
const settingsUrl = (status: string) => `${APP_URL}/manage?tab=settings&drive=${status}`;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const code = String(req.query.code || "");
    const state = String(req.query.state || "");
    if (req.query.error) return res.redirect(302, settingsUrl("denied"));
    if (!code || !state) return res.redirect(302, settingsUrl("error"));

    const orgId = verifyState(state);
    if (!orgId) return res.redirect(302, settingsUrl("error"));

    const { refreshToken, email } = await exchangeCode(code);
    if (!refreshToken) return res.redirect(302, settingsUrl("error"));

    const { error } = await supabase.from("organizations").update({
      google_drive_refresh_token: encryptToken(refreshToken),
      google_drive_email: email,
    }).eq("id", orgId);
    if (error) return res.redirect(302, settingsUrl("error"));

    return res.redirect(302, settingsUrl("connected"));
  } catch (err) {
    console.error("google-drive-callback error:", err);
    return res.redirect(302, settingsUrl("error"));
  }
}
