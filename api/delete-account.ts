// ============================================================
// Vercel Serverless Function — Self-service account deletion
// Required by Apple App Store guideline 5.1.1(v).
//
// - Non-owner roles (staff, client, partner, family): deletes only
//   their user_profile + auth.users entry. Their host org continues.
// - Owners: cascades the whole org. user_profiles, all org-scoped
//   tables (clients, projects, invoices, etc.) cascade via FK
//   on organizations.id. Active Stripe subscription is cancelled
//   immediately. Their auth.users entry is removed last.
//
// This is irreversible. The client confirms via typed "DELETE" before
// the request fires. The endpoint itself does NOT re-prompt.
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";
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
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLL_KEY || "";

  if (!serviceKey) {
    return res.status(500).json({ error: "Service role key not configured" });
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("id, role")
      .eq("id", caller.userId)
      .single();

    if (!profile) {
      // Profile already gone — still try to wipe the auth row so a
      // half-deleted account doesn't linger.
      await supabase.auth.admin.deleteUser(caller.userId).catch(() => {});
      return res.status(200).json({ ok: true });
    }

    const orgId = await getUserOrgId(caller.userId);

    if (profile.role === "owner" && orgId) {
      // Cancel any active Stripe subscription before tearing down the
      // org row. Doing it after would leave us with a "phantom"
      // subscription on Stripe's side billing a deleted customer.
      const stripeKey = process.env.STRIPE_SECRET_KEY;
      if (stripeKey) {
        try {
          const stripe = new Stripe(stripeKey);
          const { data: org } = await supabase
            .from("organizations")
            .select("stripe_customer_id")
            .eq("id", orgId)
            .single();

          if (org?.stripe_customer_id) {
            const subs = await stripe.subscriptions.list({
              customer: org.stripe_customer_id,
              status: "active",
              limit: 10,
            });
            for (const sub of subs.data) {
              await stripe.subscriptions.cancel(sub.id);
            }
          }
        } catch (err) {
          // Don't fail the deletion if Stripe is unreachable — log and
          // press on. The user explicitly asked to delete their
          // account; we don't want a Stripe outage to block that.
          console.warn("[delete-account] Stripe cancel failed:", errorMessage(err, "unknown"));
        }
      }

      // Cascade delete: removing the org row drops all org-scoped data
      // via FK ON DELETE CASCADE. Includes other user_profiles linked
      // to this org. All of those users' auth.users rows are deleted
      // below in a loop so they can't sign in to a stale account.
      const { data: orgUsers } = await supabase
        .from("user_profiles")
        .select("id")
        .eq("org_id", orgId);

      const { error: orgDeleteError } = await supabase
        .from("organizations")
        .delete()
        .eq("id", orgId);
      if (orgDeleteError) {
        return res.status(500).json({ error: errorMessage(orgDeleteError, "Failed to delete organization") });
      }

      // Wipe every auth.users row that was attached to this org.
      // user_profiles for these users were already removed by the
      // org cascade.
      for (const u of orgUsers || []) {
        if (u.id === caller.userId) continue; // delete self last
        await supabase.auth.admin.deleteUser(u.id).catch((err) => {
          console.warn(`[delete-account] failed to remove sub-user ${u.id}:`, errorMessage(err, "unknown"));
        });
      }
    } else {
      // Non-owner self-deletion — only this user's profile.
      // The host org stays intact for the owner.
      await supabase.from("user_profiles").delete().eq("id", caller.userId);
    }

    // Finally wipe the caller's auth.users row.
    const { error: authError } = await supabase.auth.admin.deleteUser(caller.userId);
    if (authError) {
      return res.status(500).json({ error: errorMessage(authError, "Failed to delete auth user") });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("[delete-account] error:", err);
    return res.status(500).json({ error: errorMessage(err, "Failed to delete account") });
  }
}
