// ============================================================
// Cleanup orphan auth users — Vercel cron, nightly 04:00 UTC
//
// Deletes auth.users rows that have NO matching user_profiles row and
// are older than 7 days. This prevents the "stuck on onboarding"
// bug we hit 2026-04-18 where signed-in users with no profile loop
// forever because the completeOnboarding UPDATE affects 0 rows.
//
// Guards:
// - Only deletes users OLDER than 7 days (lets signup triggers
//   catch up even if they're slow)
// - Only deletes via Supabase Auth Admin API (doesn't touch the
//   auth schema directly — lets Supabase handle cascade/FK properly)
// - CRON_SECRET required to invoke
// - Dry-run friendly: if ?dry=1 set, returns the list without deleting
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLL_KEY || "";

const MIN_AGE_DAYS = 7;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const auth = req.headers.authorization;
  const expected = process.env.CRON_SECRET;
  if (!expected) return res.status(500).json({ error: "CRON_SECRET not configured" });
  if (auth !== `Bearer ${expected}`) return res.status(401).json({ error: "Unauthorized" });
  if (!supabaseUrl || !supabaseServiceKey) return res.status(500).json({ error: "Supabase not configured" });

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const dryRun = req.query.dry === "1";

  // Enumerate all auth users via admin API (paginated).
  const allUsers: Array<{ id: string; email: string | undefined; created_at: string }> = [];
  let page = 1;
  const perPage = 1000;
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) {
      return res.status(500).json({ error: "listUsers failed", detail: error.message });
    }
    for (const u of data.users) allUsers.push({ id: u.id, email: u.email, created_at: u.created_at });
    if (data.users.length < perPage) break;
    page++;
    if (page > 20) break; // sanity bound — 20k users is far beyond our scale
  }

  // Pull profiles from both apps to know who has one.
  const { data: userProfiles } = await supabase.from("user_profiles").select("id");
  const { data: producerProfiles } = await supabase.from("producer_profiles").select("id");
  const hasProfile = new Set<string>([
    ...(userProfiles || []).map(p => p.id),
    ...(producerProfiles || []).map(p => p.id),
  ]);

  const cutoff = Date.now() - MIN_AGE_DAYS * 24 * 60 * 60 * 1000;
  const orphans = allUsers
    .filter(u => !hasProfile.has(u.id))
    .filter(u => new Date(u.created_at).getTime() < cutoff)
    .map(u => ({ id: u.id, email: u.email || "(no email)" }));

  if (dryRun) {
    return res.status(200).json({ ok: true, dry: true, would_delete: orphans });
  }

  const deleted: string[] = [];
  const failed: Array<{ email: string; reason: string }> = [];

  for (const orphan of orphans) {
    try {
      const { error: delErr } = await supabase.auth.admin.deleteUser(orphan.id);
      if (delErr) {
        failed.push({ email: orphan.email, reason: delErr.message });
      } else {
        deleted.push(orphan.email);
      }
    } catch (err: any) {
      failed.push({ email: orphan.email, reason: err?.message || "unknown" });
    }
  }

  return res.status(200).json({ ok: true, deleted_count: deleted.length, deleted, failed });
}
