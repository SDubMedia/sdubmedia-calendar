// ============================================================
// Vercel Serverless Function — Admin user deletion
// Owner can fully delete a user (auth + profile)
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { verifyAuth, getUserOrgId } from "./_auth.js";

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
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    // Verify the caller is an owner
    const { data: callerProfile } = await supabase
      .from("user_profiles")
      .select("role")
      .eq("id", caller.userId)
      .single();

    if (!callerProfile || callerProfile.role !== "owner") {
      return res.status(403).json({ error: "Only owners can delete users" });
    }

    // Prevent self-deletion
    if (userId === caller.userId) {
      return res.status(400).json({ error: "Cannot delete your own account" });
    }

    // Verify the target user belongs to the same org
    const callerOrgId = await getUserOrgId(caller.userId);
    const targetOrgId = await getUserOrgId(userId);
    if (!callerOrgId || callerOrgId !== targetOrgId) {
      return res.status(403).json({ error: "Cannot delete users outside your organization" });
    }

    // Delete profile first
    await supabase.from("user_profiles").delete().eq("id", userId);

    // Delete auth user
    const { error: authError } = await supabase.auth.admin.deleteUser(userId);
    if (authError) {
      return res.status(500).json({ error: authError.message });
    }

    return res.status(200).json({ ok: true });
  } catch (err: any) {
    console.error("Delete user error:", err);
    return res.status(500).json({ error: err.message || "Failed to delete user" });
  }
}
