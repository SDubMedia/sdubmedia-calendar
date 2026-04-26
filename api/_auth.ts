// ============================================================
// Shared auth helper for Vercel serverless functions
// Validates Supabase JWT from Authorization header
// ============================================================

import { createClient } from "@supabase/supabase-js";
import type { VercelRequest } from "@vercel/node";
import { timingSafeEqual } from "crypto";
import * as Sentry from "@sentry/node";

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLL_KEY || "";

// Initialize Sentry for serverless functions. Idempotent; safe to call on every
// cold start. Only enabled in production so dev/preview noise stays out.
const SENTRY_DSN = process.env.SENTRY_DSN || "";
if (SENTRY_DSN && process.env.VERCEL_ENV === "production") {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: process.env.VERCEL_ENV,
    tracesSampleRate: 0,
  });
}

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
 * Also reports the error to Sentry so production failures show up in the
 * dashboard alongside their stack traces.
 * Mirrors `err.message || fallback` for callers migrating off `catch (err: any)`.
 */
export function errorMessage(err: unknown, fallback = "Unknown error"): string {
  // Side-effect: report to Sentry. captureException is a no-op if Sentry
  // wasn't initialized (e.g. in dev or when DSN is missing).
  Sentry.captureException(err);
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "string" && err) return err;
  return fallback;
}
