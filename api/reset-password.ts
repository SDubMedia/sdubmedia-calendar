// ============================================================
// Vercel Serverless Function — Admin password reset
// Owner can set a new password for any user
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { verifyAuth } from "./_auth";

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
    const { userId, newPassword, forceChange } = req.body;

    if (!userId || !newPassword) {
      return res.status(400).json({ error: "userId and newPassword are required" });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }

    // Verify the caller is an owner
    const supabase = createClient(supabaseUrl, serviceKey);
    const { data: callerProfile } = await supabase
      .from("user_profiles")
      .select("role")
      .eq("id", caller.userId)
      .single();

    if (!callerProfile || callerProfile.role !== "owner") {
      return res.status(403).json({ error: "Only owners can reset passwords" });
    }

    // Update the user's password via admin API
    const { error: updateError } = await supabase.auth.admin.updateUserById(userId, {
      password: newPassword,
    });

    if (updateError) {
      return res.status(500).json({ error: updateError.message });
    }

    // Optionally force password change on next login
    if (forceChange) {
      await supabase.from("user_profiles").update({ must_change_password: true }).eq("id", userId);
    }

    return res.status(200).json({ success: true });
  } catch (err: any) {
    console.error("Reset password error:", err);
    return res.status(500).json({ error: err.message || "Failed to reset password" });
  }
}
