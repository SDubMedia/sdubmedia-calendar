// ============================================================
// /api/submit-testimonial — Owner submits a customer testimonial.
// Stored as status='pending'. Manual approval later.
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { verifyAuth, getUserOrgId } from "./_auth.js";

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || ""
);

function nanoid(): string {
  return Math.random().toString(36).slice(2, 14);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST required" });

  const user = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const { content, authorName, authorCompany, trigger } = req.body || {};
  if (!content || typeof content !== "string" || !content.trim()) {
    return res.status(400).json({ error: "content required" });
  }
  if (content.length > 1200) {
    return res.status(400).json({ error: "content too long (max 1200 chars)" });
  }

  const orgId = await getUserOrgId(user.userId);
  if (!orgId) return res.status(400).json({ error: "No org" });

  const id = `tst_${nanoid()}`;
  const { error } = await supabase.from("testimonials").insert({
    id,
    org_id: orgId,
    user_id: user.userId,
    content: content.trim(),
    author_name: (authorName || "").trim(),
    author_company: (authorCompany || "").trim(),
    status: "pending",
    trigger: (trigger || "manual").trim(),
  });
  if (error) return res.status(500).json({ error: error.message });

  // Mark org as prompted so we don't re-ask.
  await supabase
    .from("organizations")
    .update({ testimonial_prompted_at: new Date().toISOString() })
    .eq("id", orgId);

  return res.status(200).json({ ok: true, id });
}
