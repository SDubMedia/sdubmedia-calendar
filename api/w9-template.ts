// ============================================================
// Owner uploads the blank official IRS W-9 PDF once; it becomes the org's
// template that every staff member's W-9 is filled from (api/w9-submit.ts).
// On upload we enumerate the PDF's AcroForm field names with pdf-lib and store
// them on organizations.w9_field_map (under "_fields") so the fill can be
// calibrated to the exact revision. Owner-only. The blank + completed W-9s live
// in the private `w9-documents` bucket, served only via 60s signed URLs.
//
// POST { pdfBase64 }  -> stores template, returns { ok, fields }
// GET                 -> returns { templatePath, hasTemplate, signedUrl?, fields }
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { PDFDocument } from "pdf-lib";
import { verifyAuth, errorMessage } from "./_auth.js";

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLL_KEY || ""
);

const BUCKET = "w9-documents";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const caller = await verifyAuth(req);
  if (!caller) return res.status(401).json({ error: "Unauthorized" });

  const { data: profile } = await supabase
    .from("user_profiles").select("role, org_id").eq("id", caller.userId).single();
  if (!profile || profile.role !== "owner") return res.status(403).json({ error: "Only owners can manage the W-9 template" });
  const orgId = profile.org_id;
  const templatePath = `${orgId}/w9-template.pdf`;

  try {
    if (req.method === "GET") {
      const { data: org } = await supabase.from("organizations").select("w9_template_path, w9_field_map").eq("id", orgId).single();
      const hasTemplate = !!org?.w9_template_path;
      let signedUrl: string | null = null;
      if (hasTemplate) {
        const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrl(org!.w9_template_path, 60);
        signedUrl = signed?.signedUrl ?? null;
      }
      const fm = org?.w9_field_map as Record<string, unknown> | undefined;
      const fields = (fm && fm._fields) || [];
      return res.status(200).json({ templatePath: org?.w9_template_path || "", hasTemplate, signedUrl, fields });
    }

    if (req.method === "POST") {
      const { pdfBase64 } = req.body || {};
      if (!pdfBase64 || typeof pdfBase64 !== "string") return res.status(400).json({ error: "pdfBase64 required" });
      const bytes = Buffer.from(pdfBase64.replace(/^data:application\/pdf;base64,/, ""), "base64");

      // Validate it's a real PDF with a fillable form, and read its field names.
      let fields: string[] = [];
      try {
        const doc = await PDFDocument.load(bytes);
        fields = doc.getForm().getFields().map(f => f.getName());
      } catch {
        return res.status(400).json({ error: "That file isn't a readable PDF" });
      }

      const { error: upErr } = await supabase.storage.from(BUCKET)
        .upload(templatePath, bytes, { upsert: true, contentType: "application/pdf" });
      if (upErr) return res.status(500).json({ error: errorMessage(upErr, "Couldn't store the template") });

      // Persist the path + the discovered field names (under _fields) so the
      // semantic fill map can be calibrated to this exact form.
      const { data: org } = await supabase.from("organizations").select("w9_field_map").eq("id", orgId).single();
      const fieldMap = { ...(org?.w9_field_map && typeof org.w9_field_map === "object" ? org.w9_field_map : {}), _fields: fields };
      const { error: orgErr } = await supabase.from("organizations")
        .update({ w9_template_path: templatePath, w9_field_map: fieldMap }).eq("id", orgId);
      if (orgErr) return res.status(500).json({ error: errorMessage(orgErr, "Couldn't save the template") });

      return res.status(200).json({ ok: true, fields });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("w9-template error:", err);
    return res.status(500).json({ error: errorMessage(err, "Failed to handle the W-9 template") });
  }
}
