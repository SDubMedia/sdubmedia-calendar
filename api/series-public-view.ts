// ============================================================
// Public — fetches a series + episodes by review token. No auth.
// The client opens the review URL (anywhere, any device) and the
// frontend hits this to render the read-only review page.
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLL_KEY || ""
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "GET required" });

  const { token } = req.query;
  if (!token || typeof token !== "string" || token.length < 20) {
    return res.status(400).json({ error: "Invalid token" });
  }

  const { data: series, error } = await supabase
    .from("series")
    .select("id, name, goal, review_status, sent_for_review_at, client_reviewed_at, client_id, org_id")
    .eq("review_token", token)
    .single();
  if (error || !series) return res.status(404).json({ error: "Series not found" });

  const [{ data: episodes }, { data: client }, { data: org }] = await Promise.all([
    supabase
      .from("series_episodes")
      .select("id, episode_number, title, concept, talking_points, approval_status, client_comment, draft_date")
      .eq("series_id", series.id)
      .order("episode_number"),
    supabase.from("clients").select("company, contact_name").eq("id", series.client_id).maybeSingle(),
    supabase.from("organizations").select("name, logo_url, business_info").eq("id", series.org_id).maybeSingle(),
  ]);

  return res.status(200).json({
    series: {
      id: series.id,
      name: series.name,
      goal: series.goal,
      reviewStatus: series.review_status,
      sentForReviewAt: series.sent_for_review_at,
      clientReviewedAt: series.client_reviewed_at,
    },
    client: client ? { company: client.company, contactName: client.contact_name } : null,
    org: org ? { name: org.name, logoUrl: org.logo_url, businessInfo: org.business_info } : null,
    episodes: (episodes || []).map(e => ({
      id: e.id,
      episodeNumber: e.episode_number,
      title: e.title,
      concept: e.concept,
      talkingPoints: e.talking_points,
      approvalStatus: e.approval_status || "pending",
      clientComment: e.client_comment || "",
      draftDate: e.draft_date || "",
    })),
  });
}
