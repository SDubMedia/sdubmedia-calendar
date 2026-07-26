// ============================================================
// Vercel Serverless — signed R2 URLs for project documents.
//
// Two actions (body.action): "upload" | "download". Both verify the caller is
// the OWNER or a crew member assigned to that project (on crew or post-
// production), matching the project_documents RLS. Clients never reach here.
//
// upload:   { action, projectId, fileName, contentType, sizeBytes } -> { uploadUrl, storagePath }
// download: { action, projectId, storagePath, fileName }            -> { downloadUrl }
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { verifyAuth, getUserOrgId, errorMessage } from "./_auth.js";
import { r2BuildKey, r2Configured, r2PresignedUrl } from "./_r2.js";

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLL_KEY || ""
);

const MAX_DOC_BYTES = 50 * 1024 * 1024; // 50 MB per document

// Owner, or a crew member assigned to this project, may touch its documents.
async function canAccessProject(userId: string, orgId: string, projectId: string): Promise<boolean> {
  const { data: prof } = await supabase
    .from("user_profiles")
    .select("role, crew_member_id, org_id")
    .eq("id", userId)
    .maybeSingle<{ role: string; crew_member_id: string | null; org_id: string }>();
  if (!prof || prof.org_id !== orgId) return false;
  if (prof.role === "owner") return true;
  if (prof.role !== "staff" || !prof.crew_member_id) return false;

  type CrewEntry = { crewMemberId?: string };
  const { data: project } = await supabase
    .from("projects")
    .select("org_id, crew, post_production")
    .eq("id", projectId)
    .maybeSingle<{ org_id: string; crew: CrewEntry[] | null; post_production: CrewEntry[] | null }>();
  if (!project || project.org_id !== orgId) return false;
  const onCrew = (arr: CrewEntry[] | null) => Array.isArray(arr) && arr.some(e => e?.crewMemberId === prof.crew_member_id);
  return onCrew(project.crew) || onCrew(project.post_production);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST required" });
  if (!r2Configured()) return res.status(503).json({ error: "Storage not configured. R2 env vars missing." });

  const user = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  const orgId = await getUserOrgId(user.userId);
  if (!orgId) return res.status(403).json({ error: "No org" });

  const body = (req.body || {}) as Record<string, unknown>;
  const action = body.action;
  const projectId = typeof body.projectId === "string" ? body.projectId : "";
  if (!projectId) return res.status(400).json({ error: "projectId required" });

  if (!(await canAccessProject(user.userId, orgId, projectId))) {
    return res.status(403).json({ error: "Not your project" });
  }

  try {
    if (action === "upload") {
      const fileName = typeof body.fileName === "string" ? body.fileName : "";
      const contentType = typeof body.contentType === "string" ? body.contentType : "application/octet-stream";
      const sizeBytes = typeof body.sizeBytes === "number" ? body.sizeBytes : 0;
      if (!fileName || sizeBytes <= 0) return res.status(400).json({ error: "Missing fileName or sizeBytes" });
      if (sizeBytes > MAX_DOC_BYTES) return res.status(413).json({ error: `Document too large (max ${Math.floor(MAX_DOC_BYTES / 1024 / 1024)}MB)` });

      const storagePath = r2BuildKey(orgId, `docs/${projectId}`, fileName);
      const uploadUrl = r2PresignedUrl({ method: "PUT", key: storagePath, expiresIn: 1800, contentType });
      return res.status(200).json({ ok: true, uploadUrl, storagePath });
    }

    if (action === "download") {
      const storagePath = typeof body.storagePath === "string" ? body.storagePath : "";
      const fileName = typeof body.fileName === "string" ? body.fileName : "document";
      if (!storagePath || !storagePath.startsWith(`${orgId}/`)) return res.status(400).json({ error: "Bad storagePath" });
      const safeName = fileName.replace(/[^\w.\- ]+/g, "_");
      const downloadUrl = r2PresignedUrl({
        method: "GET", key: storagePath, expiresIn: 3600,
        responseHeaders: { "Content-Disposition": `attachment; filename="${safeName}"` },
      });
      return res.status(200).json({ ok: true, downloadUrl });
    }

    return res.status(400).json({ error: "Unknown action" });
  } catch (err) {
    return res.status(500).json({ error: errorMessage(err, "Failed to sign document URL") });
  }
}
