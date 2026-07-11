// ============================================================
// Shared W-9 fill logic — used by api/w9-submit.ts (real staff submission) and
// api/w9-preview.ts (owner preview with sample data), so the preview shows
// EXACTLY where real values will land. Field names + signature-line position
// are calibrated to the official IRS W-9 (Rev. 3-2024).
// ============================================================

import { PDFDocument } from "pdf-lib";

const P1 = "topmostSubform[0].Page1[0]";

export const W9_TEXT: Record<string, string> = {
  name: `${P1}.f1_01[0]`,
  businessName: `${P1}.f1_02[0]`,
  address: `${P1}.Address_ReadOrder[0].f1_07[0]`,
  cityStateZip: `${P1}.Address_ReadOrder[0].f1_08[0]`,
  ssn1: `${P1}.f1_11[0]`, ssn2: `${P1}.f1_12[0]`, ssn3: `${P1}.f1_13[0]`, // SSN 3-2-4
  ein1: `${P1}.f1_14[0]`, ein2: `${P1}.f1_15[0]`,                          // EIN 2-7
};

// Line 3a federal tax classification — 7 separate checkboxes (labels match the
// StaffOnboarding dropdown). We check the one the staff member picked.
export const W9_CLASS: Record<string, string> = {
  "Individual / sole proprietor": `${P1}.Boxes3a-b_ReadOrder[0].c1_1[0]`,
  "C corporation": `${P1}.Boxes3a-b_ReadOrder[0].c1_1[1]`,
  "S corporation": `${P1}.Boxes3a-b_ReadOrder[0].c1_1[2]`,
  "Partnership": `${P1}.Boxes3a-b_ReadOrder[0].c1_1[3]`,
  "Trust / estate": `${P1}.Boxes3a-b_ReadOrder[0].c1_1[4]`,
  "Limited liability company (LLC)": `${P1}.Boxes3a-b_ReadOrder[0].c1_1[5]`,
  "Other": `${P1}.Boxes3a-b_ReadOrder[0].c1_1[6]`,
};

export interface W9Fields {
  name?: string;
  businessName?: string;
  taxClassification?: string;
  address?: string;
  cityStateZip?: string;
  ssn?: string;
  ein?: string;
}
export interface W9Signature {
  signatureData: string; // PNG data URL when drawn; ignored when typed
  name: string;
  signatureType: "typed" | "drawn";
}

// Fill the blank W-9 template and return the flattened PDF bytes. Text field
// names can be overridden per-org via fieldMap; signature position via
// fieldMap._sig = {x,y,w,h,dateX,dateY}. Per-field try/catch so one unmatched
// name never fails the whole fill.
export async function fillW9(
  templateBytes: Buffer,
  fields: W9Fields,
  signature: W9Signature,
  fieldMap?: Record<string, unknown>,
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(templateBytes);
  const form = pdfDoc.getForm();
  const textMap: Record<string, string> = { ...W9_TEXT, ...(fieldMap && typeof fieldMap === "object" ? (fieldMap as Record<string, string>) : {}) };

  const setText = (key: string, value: string) => {
    const fieldName = textMap[key];
    if (!fieldName || !value) return;
    try { form.getTextField(fieldName).setText(value); } catch (e) { console.warn(`w9 field '${key}' (${fieldName}) not filled:`, (e as Error).message); }
  };
  setText("name", String(fields.name || ""));
  setText("businessName", String(fields.businessName || ""));
  setText("address", String(fields.address || ""));
  setText("cityStateZip", String(fields.cityStateZip || ""));

  const digits = (s: string) => s.replace(/\D/g, "");
  const ssn = String(fields.ssn || "").trim();
  const ein = String(fields.ein || "").trim();
  if (ssn) {
    const d = digits(ssn).padEnd(9, " ").slice(0, 9);
    setText("ssn1", d.slice(0, 3).trim()); setText("ssn2", d.slice(3, 5).trim()); setText("ssn3", d.slice(5, 9).trim());
  } else if (ein) {
    const d = digits(ein).padEnd(9, " ").slice(0, 9);
    setText("ein1", d.slice(0, 2).trim()); setText("ein2", d.slice(2, 9).trim());
  }

  const clsField = W9_CLASS[String(fields.taxClassification || "")];
  if (clsField) {
    try { form.getCheckBox(clsField).check(); } catch (e) { console.warn("w9 taxClassification not set:", (e as Error).message); }
  }

  // Stamp the signature + date on the Part II "Sign Here" line (no AcroForm
  // field there). Calibrated to Rev. 3-2024; override via fieldMap._sig.
  try {
    const cfg = (fieldMap?._sig as { x?: number; y?: number; w?: number; h?: number; dateX?: number; dateY?: number }) || {};
    const page = pdfDoc.getPages()[0];
    if (signature.signatureType === "drawn") {
      const pngBytes = Buffer.from(String(signature.signatureData).replace(/^data:image\/png;base64,/, ""), "base64");
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
  return await pdfDoc.save();
}
