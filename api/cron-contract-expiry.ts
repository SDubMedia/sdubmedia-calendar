// ============================================================
// Daily cron — contract expiry auto-void
// Voids any contract whose document_expires_at has passed AND is still
// in a non-terminal state (draft / sent / client_signed). Completed and
// already-void contracts are left alone.
//
// Schedule: registered in vercel.json
// Auth: Bearer CRON_SECRET
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { errorMessage } from "./_auth.js";

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLL_KEY || "";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const auth = req.headers.authorization;
  const expected = process.env.CRON_SECRET;
  if (!expected) return res.status(500).json({ error: "CRON_SECRET not configured" });
  if (auth !== `Bearer ${expected}`) return res.status(401).json({ error: "Unauthorized" });
  if (!supabaseUrl || !supabaseServiceKey) return res.status(500).json({ error: "Supabase not configured" });

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const now = new Date().toISOString();

  try {
    const { data: expired, error: fetchErr } = await supabase
      .from("contracts")
      .select("id, title, document_expires_at, status")
      .lt("document_expires_at", now)
      .in("status", ["draft", "sent", "client_signed"])
      .is("deleted_at", null);
    if (fetchErr) throw new Error(fetchErr.message);

    const ids = (expired || []).map(c => c.id);
    if (ids.length === 0) {
      return res.status(200).json({ ok: true, voided: 0 });
    }

    const { error: updErr } = await supabase
      .from("contracts")
      .update({ status: "void", updated_at: now })
      .in("id", ids);
    if (updErr) throw new Error(updErr.message);

    return res.status(200).json({ ok: true, voided: ids.length, ids });
  } catch (err) {
    return res.status(500).json({ error: errorMessage(err, "Expiry cron failed") });
  }
}
