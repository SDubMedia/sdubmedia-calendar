// ============================================================
// Vercel Serverless Function — Admin email update
// Owner can change a user's login email
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { verifyAuth, getUserOrgId, errorMessage } from "./_auth.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const caller = await verifyAuth(req);
  if (!caller) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

  if (!serviceKey) {
    return res.status(500).json({ error: "Service role key not configured" });
  }

  try {
    const { userId, newEmail } = req.body;

    if (!userId || !newEmail) {
      return res.status(400).json({ error: "userId and newEmail are required" });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
      return res.status(400).json({ error: "Invalid email format" });
    }

    // Verify the caller is an owner
    const supabase = createClient(supabaseUrl, serviceKey);
    const { data: callerProfile } = await supabase
      .from("user_profiles")
      .select("role")
      .eq("id", caller.userId)
      .single();

    if (!callerProfile || callerProfile.role !== "owner") {
      return res.status(403).json({ error: "Only owners can update emails" });
    }

    // Verify the target user belongs to the same org
    const callerOrgId = await getUserOrgId(caller.userId);
    const targetOrgId = await getUserOrgId(userId);
    if (!callerOrgId || callerOrgId !== targetOrgId) {
      return res.status(403).json({ error: "Cannot update email for users outside your organization" });
    }

    // Update the auth email via admin API
    const { error: authError } = await supabase.auth.admin.updateUserById(userId, {
      email: newEmail,
      email_confirm: true,
    });

    if (authError) {
      return res.status(500).json({ error: authError.message });
    }

    // Update the profile email to match
    const { error: profileError } = await supabase
      .from("user_profiles")
      .update({ email: newEmail })
      .eq("id", userId);

    if (profileError) {
      return res.status(500).json({ error: profileError.message });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Update email error:", err);
    return res.status(500).json({ error: errorMessage(err, "Failed to update email") });
  }
}
