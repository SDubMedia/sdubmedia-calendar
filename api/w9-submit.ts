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
import { PDFDocument } from "pdf-lib";
import { verifyAuth, errorMessage } from "./_auth.js";

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLL_KEY || ""
);

const BUCKET = "w9-documents";
const ENCRYPTION_KEY = process.env.TAX_ENCRYPTION_KEY || "";

// Calibrated AcroForm field names for the official IRS W-9 (Rev. 3-2024),
// read directly from the real form. Text fields can be overridden per-org via
// organizations.w9_field_map (e.g. if a future revision renames a field).
const P1 = "topmostSubform[0].Page1[0]";
const W9_TEXT: Record<string, string> = {
  name: `${P1}.f1_01[0]`,
  businessName: `${P1}.f1_02[0]`,
  address: `${P1}.Address_ReadOrder[0].f1_07[0]`,
  cityStateZip: `${P1}.Address_ReadOrder[0].f1_08[0]`,
  ssn1: `${P1}.f1_11[0]`, ssn2: `${P1}.f1_12[0]`, ssn3: `${P1}.f1_13[0]`, // SSN 3-2-4
  ein1: `${P1}.f1_14[0]`, ein2: `${P1}.f1_15[0]`,                          // EIN 2-7
};
// Line 3a federal tax classification — 7 separate checkboxes (labels match the
// StaffOnboarding dropdown). We check the one the staff member picked.
const W9_CLASS: Record<string, string> = {
  "Individual / sole proprietor": `${P1}.Boxes3a-b_ReadOrder[0].c1_1[0]`,
  "C corporation": `${P1}.Boxes3a-b_ReadOrder[0].c1_1[1]`,
  "S corporation": `${P1}.Boxes3a-b_ReadOrder[0].c1_1[2]`,
  "Partnership": `${P1}.Boxes3a-b_ReadOrder[0].c1_1[3]`,
  "Trust / estate": `${P1}.Boxes3a-b_ReadOrder[0].c1_1[4]`,
  "Limited liability company (LLC)": `${P1}.Boxes3a-b_ReadOrder[0].c1_1[5]`,
  "Other": `${P1}.Boxes3a-b_ReadOrder[0].c1_1[6]`,
};

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

    const pdfDoc = await PDFDocument.load(templateBytes);
    const form = pdfDoc.getForm();
    const textMap: Record<string, string> = { ...W9_TEXT, ...(org.w9_field_map && typeof org.w9_field_map === "object" ? org.w9_field_map : {}) };

    // Fill text fields — per-field try/catch so an unmatched name is skipped, not fatal.
    const setText = (semanticKey: string, value: string) => {
      const fieldName = textMap[semanticKey];
      if (!fieldName || !value) return;
      try { form.getTextField(fieldName).setText(value); } catch (e) { console.warn(`w9 field '${semanticKey}' (${fieldName}) not filled:`, (e as Error).message); }
    };
    setText("name", String(fields.name || ""));
    setText("businessName", String(fields.businessName || ""));
    setText("address", String(fields.address || ""));
    setText("cityStateZip", String(fields.cityStateZip || ""));

    // TIN — Part I. SSN goes in the 3-2-4 boxes, EIN in the 2-7 boxes.
    const digits = (s: string) => s.replace(/\D/g, "");
    if (ssn) {
      const d = digits(ssn).padEnd(9, " ").slice(0, 9);
      setText("ssn1", d.slice(0, 3).trim()); setText("ssn2", d.slice(3, 5).trim()); setText("ssn3", d.slice(5, 9).trim());
    } else if (ein) {
      const d = digits(ein).padEnd(9, " ").slice(0, 9);
      setText("ein1", d.slice(0, 2).trim()); setText("ein2", d.slice(2, 9).trim());
    }

    // Line 3a federal tax classification — check the matching box.
    const clsField = W9_CLASS[String(fields.taxClassification || "")];
    if (clsField) {
      try { form.getCheckBox(clsField).check(); } catch (e) { console.warn("w9 taxClassification not set:", (e as Error).message); }
    }

    // Stamp the drawn signature + date on the Part II "Sign Here" line (no
    // AcroForm field there). Positions calibrated to the Rev. 3-2024 form;
    // override via organizations.w9_field_map._sig = {x,y,w,h,dateX,dateY}.
    try {
      const pngBytes = Buffer.from(String(signature.signatureData).replace(/^data:image\/png;base64,/, ""), "base64");
      const page = pdfDoc.getPages()[0];
      const fm = org.w9_field_map as Record<string, unknown> | undefined;
      const cfg = (fm?._sig as { x?: number; y?: number; w?: number; h?: number; dateX?: number; dateY?: number }) || {};
      if (String(signature.signatureType) === "drawn") {
        const png = await pdfDoc.embedPng(pngBytes);
        page.drawImage(png, { x: cfg.x ?? 120, y: cfg.y ?? 200, width: cfg.w ?? 150, height: cfg.h ?? 22 });
      } else {
        page.drawText(String(signature.name || ""), { x: cfg.x ?? 120, y: cfg.y ?? 205, size: 12 });
      }
      const dateStr = new Date().toLocaleDateString("en-US");
      page.drawText(dateStr, { x: cfg.dateX ?? 470, y: cfg.dateY ?? 205, size: 11 });
    } catch (e) {
      console.warn("w9 signature stamp failed:", (e as Error).message);
    }

    form.flatten();
    const outBytes = await pdfDoc.save();

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
