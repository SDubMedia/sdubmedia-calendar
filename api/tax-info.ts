// ============================================================
// Vercel Serverless Function — Encrypt/Decrypt Tax Info (W-9)
// Tax IDs (SSN/EIN) are AES-256-GCM encrypted at rest.
// Only the owner can read/write tax info.
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { verifyAuth } from "./_auth.js";

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLL_KEY || ""
);

const ENCRYPTION_KEY = process.env.TAX_ENCRYPTION_KEY || "";

function getKey(): Buffer {
  if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length < 32) {
    throw new Error("TAX_ENCRYPTION_KEY not configured (must be 32+ chars)");
  }
  // Use first 32 bytes of the key for AES-256
  return Buffer.from(ENCRYPTION_KEY.slice(0, 32), "utf-8");
}

function encrypt(plainText: string): string {
  if (!plainText) return "";
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf-8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // Format: base64(iv):base64(authTag):base64(encrypted)
  return `${iv.toString("base64")}:${authTag.toString("base64")}:${encrypted.toString("base64")}`;
}

function decrypt(encryptedText: string): string {
  if (!encryptedText || !encryptedText.includes(":")) return encryptedText; // not encrypted (legacy plain text)
  const parts = encryptedText.split(":");
  if (parts.length !== 3) return encryptedText; // not encrypted
  try {
    const key = getKey();
    const iv = Buffer.from(parts[0], "base64");
    const authTag = Buffer.from(parts[1], "base64");
    const encrypted = Buffer.from(parts[2], "base64");
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString("utf-8");
  } catch {
    return encryptedText; // decryption failed — return as-is (likely legacy plain text)
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const caller = await verifyAuth(req);
  if (!caller) return res.status(401).json({ error: "Unauthorized" });

  // Only owners can access tax info
  const { data: callerProfile } = await supabase
    .from("user_profiles")
    .select("role, org_id")
    .eq("id", caller.userId)
    .single();
  if (!callerProfile || callerProfile.role !== "owner") {
    return res.status(403).json({ error: "Only owners can access tax info" });
  }

  const callerOrgId = callerProfile.org_id;

  // GET — read decrypted tax info for a crew member
  if (req.method === "GET") {
    const crewMemberId = req.query.crewMemberId as string;
    if (!crewMemberId) return res.status(400).json({ error: "crewMemberId required" });

    const { data: member, error } = await supabase
      .from("crew_members")
      .select("tax_id, tax_id_type, org_id")
      .eq("id", crewMemberId)
      .single();
    if (error) return res.status(500).json({ error: error.message });
    if (!member || member.org_id !== callerOrgId) return res.status(403).json({ error: "Not in your org" });

    return res.status(200).json({
      taxId: decrypt(member.tax_id || ""),
      taxIdType: member.tax_id_type || "",
    });
  }

  // POST — save encrypted tax info
  if (req.method === "POST") {
    const { crewMemberId, taxId, taxIdType } = req.body || {};
    if (!crewMemberId) return res.status(400).json({ error: "crewMemberId required" });

    // Verify crew member is in same org
    const { data: member } = await supabase
      .from("crew_members")
      .select("org_id")
      .eq("id", crewMemberId)
      .single();
    if (!member || member.org_id !== callerOrgId) return res.status(403).json({ error: "Not in your org" });

    const patch: any = {};
    if (taxId !== undefined) patch.tax_id = encrypt(taxId);
    if (taxIdType !== undefined) patch.tax_id_type = taxIdType;

    const { error } = await supabase.from("crew_members").update(patch).eq("id", crewMemberId);
    if (error) return res.status(500).json({ error: error.message });

    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
