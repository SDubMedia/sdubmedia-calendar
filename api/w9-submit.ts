// ============================================================
// Staff fills + signs their W-9 during onboarding. We take the org's blank
// official IRS W-9 template, fill its AcroForm fields with the staff-entered
// values, stamp the drawn signature + date, flatten it, and store the completed
// PDF in the private w9-documents bucket (owner + staff-own access via 60s
// signed URLs). We also encrypt the SSN/EIN into crew_members.tax_id (same
// AES-256-GCM scheme as api/tax-info.ts) and mark onboarding complete.
//
// The semantic-key -> real-field-name mapping lives on organizations.w9_field_map
// (calibrated when the owner uploads the template); DEFAULT_MAP is the best-guess
// for the current official form. Per-field try/catch so a name mismatch on one
// field never fails the whole submit — it just leaves that field blank.
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { createCipheriv, randomBytes } from "crypto";
import { verifyAuth, errorMessage } from "./_auth.js";
import { fillW9 } from "./_w9fill.js";

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLL_KEY || ""
);

const BUCKET = "w9-documents";
const ENCRYPTION_KEY = process.env.TAX_ENCRYPTION_KEY || "";

function encryptTaxId(plainText: string): string {
  if (!plainText || !ENCRYPTION_KEY || ENCRYPTION_KEY.length < 32) return plainText;
  const key = Buffer.from(ENCRYPTION_KEY.slice(0, 32), "utf-8");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf-8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("base64")}:${authTag.toString("base64")}:${encrypted.toString("base64")}`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const caller = await verifyAuth(req);
  if (!caller) return res.status(401).json({ error: "Unauthorized" });

  try {
    const { fields, signature } = req.body || {};
    if (!fields || typeof fields !== "object") return res.status(400).json({ error: "W-9 fields required" });
    if (!signature?.signatureData) return res.status(400).json({ error: "Signature is required" });

    // Server-side required-field check — never trust the client's "complete".
    const ssn = String(fields.ssn || "").trim();
    const ein = String(fields.ein || "").trim();
    const missing: string[] = [];
    if (!String(fields.name || "").trim()) missing.push("name");
    if (!String(fields.address || "").trim()) missing.push("address");
    if (!String(fields.cityStateZip || "").trim()) missing.push("city/state/ZIP");
    if (!ssn && !ein) missing.push("SSN or EIN");
    if (missing.length) return res.status(400).json({ error: `Please complete: ${missing.join(", ")}` });

    const { data: profile } = await supabase
      .from("user_profiles").select("role, crew_member_id, org_id").eq("id", caller.userId).single();
    if (!profile || profile.role !== "staff" || !profile.crew_member_id) {
      return res.status(403).json({ error: "Only a linked staff account can submit a W-9" });
    }
    const orgId = profile.org_id;

    const { data: org } = await supabase
      .from("organizations").select("w9_template_path, w9_field_map").eq("id", orgId).single();
    if (!org?.w9_template_path) return res.status(400).json({ error: "No W-9 template on file yet — ask your admin to upload one." });

    // Download the blank official template.
    const { data: blob, error: dlErr } = await supabase.storage.from(BUCKET).download(org.w9_template_path);
    if (dlErr || !blob) return res.status(500).json({ error: errorMessage(dlErr, "Couldn't load the W-9 template") });
    const templateBytes = Buffer.from(await blob.arrayBuffer());

    const outBytes = await fillW9(
      templateBytes,
      { name: fields.name, businessName: fields.businessName, taxClassification: fields.taxClassification, address: fields.address, cityStateZip: fields.cityStateZip, ssn, ein },
      { signatureData: String(signature.signatureData), name: String(signature.name || ""), signatureType: String(signature.signatureType) === "drawn" ? "drawn" : "typed" },
      org.w9_field_map as Record<string, unknown> | undefined,
    );

    const completedPath = `${profile.crew_member_id}/w9-completed.pdf`;
    const { error: upErr } = await supabase.storage.from(BUCKET)
      .upload(completedPath, Buffer.from(outBytes), { upsert: true, contentType: "application/pdf" });
    if (upErr) return res.status(500).json({ error: errorMessage(upErr, "Couldn't store your W-9") });

    const now = new Date().toISOString();
    const crewPatch: Record<string, unknown> = {
      w9_url: completedPath,
      w9_submitted_at: now,
      tax_id: encryptTaxId(ssn || ein),
      tax_id_type: ssn ? "ssn" : "ein",
    };
    const { error: crewErr } = await supabase.from("crew_members").update(crewPatch).eq("id", profile.crew_member_id).eq("org_id", orgId);
    if (crewErr) return res.status(500).json({ error: errorMessage(crewErr, "Saved the W-9 but couldn't update your record") });

    // Mark onboarding complete — the blocking gate reads this.
    await supabase.from("user_profiles").update({ staff_onboarding_completed_at: now }).eq("id", caller.userId);

    return res.status(200).json({ ok: true, completedAt: now });
  } catch (err) {
    console.error("w9-submit error:", err);
    return res.status(500).json({ error: errorMessage(err, "Failed to submit your W-9") });
  }
}
