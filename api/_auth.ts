// ============================================================
// Shared auth helper for Vercel serverless functions
// Validates Supabase JWT from Authorization header
// ============================================================

import { createClient } from "@supabase/supabase-js";
import type { VercelRequest } from "@vercel/node";
import { timingSafeEqual } from "crypto";

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLL_KEY || "";

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

/** Get the caller's org_id from their user profile */
export async function getUserOrgId(userId: string): Promise<string | null> {
  if (!supabaseUrl || !supabaseServiceKey) return null;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const { data } = await supabase.from("user_profiles").select("org_id").eq("id", userId).single();
  return data?.org_id || null;
}

/** Validate that a URL belongs to an allowed domain */
const ALLOWED_DOMAINS = ["slate.sdubmedia.com", "localhost", "127.0.0.1"];
export function isAllowedUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ALLOWED_DOMAINS.some(d => parsed.hostname === d || parsed.hostname.endsWith(`.${d}`));
  } catch {
    return false;
  }
}

/** Timing-safe API key comparison */
export function verifyApiKeyTimingSafe(key: string | undefined, expected: string | undefined): boolean {
  if (!key || !expected) return false;
  if (key.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(key), Buffer.from(expected));
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

/**
 * Safely extract a human-readable message from a thrown value.
 * Mirrors `err.message || fallback` for callers migrating off `catch (err: any)`.
 */
export function errorMessage(err: unknown, fallback = "Unknown error"): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "string" && err) return err;
  return fallback;
}
