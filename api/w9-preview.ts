// ============================================================
// Owner-only: fill the org's blank W-9 template with SAMPLE data and return it,
// so the owner can see exactly where every value (and the signature/date) will
// land on the real form before any staff member submits one. Uses the same
// fillW9 helper as api/w9-submit.ts — no storage or DB writes.
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { verifyAuth, errorMessage } from "./_auth.js";
import { fillW9 } from "./_w9fill.js";

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLL_KEY || ""
);

const BUCKET = "w9-documents";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const caller = await verifyAuth(req);
  if (!caller) return res.status(401).json({ error: "Unauthorized" });

  try {
    const { data: profile } = await supabase
      .from("user_profiles").select("role, org_id").eq("id", caller.userId).single();
    if (!profile || profile.role !== "owner") return res.status(403).json({ error: "Only owners can preview the W-9" });

    const { data: org } = await supabase
      .from("organizations").select("w9_template_path, w9_field_map").eq("id", profile.org_id).single();
    if (!org?.w9_template_path) return res.status(400).json({ error: "Upload a W-9 template first" });

    const { data: blob, error: dlErr } = await supabase.storage.from(BUCKET).download(org.w9_template_path);
    if (dlErr || !blob) return res.status(500).json({ error: errorMessage(dlErr, "Couldn't load the template") });
    const templateBytes = Buffer.from(await blob.arrayBuffer());

    const bytes = await fillW9(
      templateBytes,
      {
        name: "SAMPLE — Taxpayer Name",
        businessName: "Sample Business LLC",
        taxClassification: "Individual / sole proprietor",
        address: "123 Sample St",
        cityStateZip: "Nashville, TN 37000",
        ssn: "123456789",
      },
      { signatureData: "SAMPLE SIGNATURE", name: "SAMPLE SIGNATURE", signatureType: "typed" },
      org.w9_field_map as Record<string, unknown> | undefined,
    );

    return res.status(200).json({ pdfBase64: Buffer.from(bytes).toString("base64") });
  } catch (err) {
    console.error("w9-preview error:", err);
    return res.status(500).json({ error: errorMessage(err, "Failed to build the preview") });
  }
}
