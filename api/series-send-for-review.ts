// ============================================================
// Owner-only — generates a public review token for a series and
// flips its review_status to "sent". Returns the token so the
// client can build the public review URL.
// Requires auth; checks the caller is the owner of the series.
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { verifyAuth, errorMessage } from "./_auth.js";
import { randomBytes } from "crypto";

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLL_KEY || ""
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST required" });

  const user = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const { seriesId } = req.body || {};
  if (!seriesId) return res.status(400).json({ error: "Missing seriesId" });

  // Caller must be the owner of the org that owns this series.
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("org_id, role")
    .eq("id", user.userId)
    .single();
  if (!profile || profile.role !== "owner") return res.status(403).json({ error: "Owner only" });

  const { data: series, error: seriesErr } = await supabase
    .from("series")
    .select("id, org_id, review_token, name, client_id")
    .eq("id", seriesId)
    .single();
  if (seriesErr || !series) return res.status(404).json({ error: "Series not found" });
  if (series.org_id !== profile.org_id) return res.status(403).json({ error: "Wrong org" });

  // Reuse existing token if there is one (client may have bookmarked
  // the link from a prior review round). Just refresh the status +
  // sent_at so the client sees a current send.
  const token = series.review_token || randomBytes(24).toString("hex");

  try {
    const { error: updErr } = await supabase
      .from("series")
      .update({
        review_token: token,
        review_status: "sent",
        sent_for_review_at: new Date().toISOString(),
      })
      .eq("id", seriesId);
    if (updErr) throw new Error(updErr.message);

    // Reset all episodes' approval_status back to pending so the
    // client gets a fresh ask on each round.
    await supabase
      .from("series_episodes")
      .update({ approval_status: "pending", client_comment: "" })
      .eq("series_id", seriesId);

    return res.status(200).json({ token });
  } catch (err) {
    return res.status(500).json({ error: errorMessage(err, "Failed to generate review link") });
  }
}
