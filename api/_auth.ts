// ============================================================
// Shared auth helper for Vercel serverless functions
// Validates Supabase JWT from Authorization header
// ============================================================

import { createClient } from "@supabase/supabase-js";
import type { VercelRequest } from "@vercel/node";

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

export async function verifyAuth(req: VercelRequest): Promise<{ userId: string; email: string } | null> {
  if (!supabaseUrl || !supabaseServiceKey) {
    return null;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return null;

  const token = authHeader.slice(7);
  if (!token) return null;

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) return null;
    return { userId: data.user.id, email: data.user.email || "" };
  } catch {
    return null;
  }
}

/** Escape HTML to prevent XSS */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
