// ============================================================
// Proposal View Tracking — Records when client first opens link
// Public endpoint, no auth required
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLL_KEY || ""
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { token } = req.query;
  if (!token) return res.status(400).json({ error: "Missing token" });

  // Only record first view
  const { data: proposal } = await supabase
    .from("proposals")
    .select("id, viewed_at")
    .eq("view_token", token as string)
    .single();

  if (!proposal) return res.status(404).json({ error: "Not found" });

  if (!proposal.viewed_at) {
    await supabase.from("proposals").update({
      viewed_at: new Date().toISOString(),
    }).eq("id", proposal.id);
  }

  return res.status(200).json({ viewed: true });
}
