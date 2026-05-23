// ============================================================
// Public — client submits a review action. No auth (token-gated).
//
// Actions:
//   - "approve_episode" / "request_changes_episode" / "comment_episode"
//     with episodeId + optional comment text
//   - "approve_series" — marks series approved + every pending episode approved
//
// On any action, stamps client_reviewed_at on the series and creates
// a notification for the owner.
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { errorMessage } from "./_auth.js";

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLL_KEY || ""
);

type Action =
  | { type: "approve_episode"; episodeId: string }
  | { type: "request_changes_episode"; episodeId: string; comment: string }
  | { type: "comment_episode"; episodeId: string; comment: string }
  | { type: "approve_series" };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST required" });

  const { token, action } = req.body || {};
  if (!token || typeof token !== "string" || token.length < 20) {
    return res.status(400).json({ error: "Invalid token" });
  }
  if (!action || typeof action !== "object" || !action.type) {
    return res.status(400).json({ error: "Missing action" });
  }

  // Look up series via token (this is the auth gate — only someone
  // with the token can hit this endpoint).
  const { data: series, error: seriesErr } = await supabase
    .from("series")
    .select("id, name, org_id")
    .eq("review_token", token)
    .single();
  if (seriesErr || !series) return res.status(404).json({ error: "Series not found" });

  try {
    const a = action as Action;
    let summary = "";

    if (a.type === "approve_episode") {
      const { error } = await supabase
        .from("series_episodes")
        .update({ approval_status: "approved" })
        .eq("id", a.episodeId)
        .eq("series_id", series.id);
      if (error) throw new Error(error.message);
      summary = "approved an episode";
    } else if (a.type === "request_changes_episode") {
      const { error } = await supabase
        .from("series_episodes")
        .update({ approval_status: "changes_requested", client_comment: (a.comment || "").slice(0, 4000) })
        .eq("id", a.episodeId)
        .eq("series_id", series.id);
      if (error) throw new Error(error.message);
      summary = "requested changes on an episode";
    } else if (a.type === "comment_episode") {
      const { error } = await supabase
        .from("series_episodes")
        .update({ client_comment: (a.comment || "").slice(0, 4000) })
        .eq("id", a.episodeId)
        .eq("series_id", series.id);
      if (error) throw new Error(error.message);
      summary = "left a comment on an episode";
    } else if (a.type === "approve_series") {
      // Approve the whole series + flip any pending episodes to approved.
      const { error: e1 } = await supabase
        .from("series")
        .update({ review_status: "approved", client_reviewed_at: new Date().toISOString() })
        .eq("id", series.id);
      if (e1) throw new Error(e1.message);
      const { error: e2 } = await supabase
        .from("series_episodes")
        .update({ approval_status: "approved" })
        .eq("series_id", series.id)
        .eq("approval_status", "pending");
      if (e2) throw new Error(e2.message);
      summary = "approved the entire series";
    } else {
      return res.status(400).json({ error: "Unknown action type" });
    }

    // Stamp client_reviewed_at + flip status to changes_requested if
    // any episode has changes_requested. Whole-series approvals
    // already set review_status="approved" above.
    if (a.type !== "approve_series") {
      const { data: anyChanges } = await supabase
        .from("series_episodes")
        .select("id")
        .eq("series_id", series.id)
        .eq("approval_status", "changes_requested")
        .limit(1);
      const newStatus = (anyChanges && anyChanges.length > 0) ? "changes_requested" : null;
      const patch: Record<string, unknown> = { client_reviewed_at: new Date().toISOString() };
      if (newStatus) patch.review_status = newStatus;
      await supabase.from("series").update(patch).eq("id", series.id);
    }

    // Notify owners + partners of the series's org.
    try {
      const { data: recipients } = await supabase
        .from("user_profiles")
        .select("id")
        .eq("org_id", series.org_id)
        .in("role", ["owner", "partner"]);
      const rows = (recipients || []).map(r => ({
        id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${r.id.slice(0, 6)}`,
        user_id: r.id,
        type: "series_review",
        title: `Client review on ${series.name}`,
        message: `Client ${summary}.`,
        link: `/series/${series.id}`,
        read: false,
      }));
      if (rows.length > 0) {
        await supabase.from("notifications").insert(rows);
      }
    } catch (err) {
      console.warn("[series-public-action] notify owners failed:", err);
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: errorMessage(err, "Failed to record action") });
  }
}
