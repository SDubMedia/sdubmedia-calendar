// ============================================================
// Vercel Serverless — signed R2 URLs for project documents and draft cuts.
//
// Two actions (body.action): "upload" | "download". Both verify the caller is
// the OWNER or a crew member assigned to that project (on crew or post-
// production), matching the project_documents RLS. Clients never reach here.
//
// `kind` splits what this endpoint carries:
//   "document" — scripts / shot lists / call sheets. 50 MB.
//   "draft"    — a review copy of the edit, usually video. 1 GB, and it counts
//                against the org's storage cap the same way gallery files do.
//   "source"   — RAW/source files handed to the editor. Same 1 GB ceiling and
//                long presign as a draft; separate storage prefix. For a whole
//                session use projects.source_files_url instead — 300 RAW frames
//                is ~9GB, which no browser upload should be asked to carry.
//
// upload:   { action, projectId, kind?, fileName, contentType, sizeBytes } -> { uploadUrl, storagePath }
// download: { action, projectId, storagePath, fileName, inline? }          -> { downloadUrl }
//
// `inline: true` returns a URL the browser will play in place (video review)
// instead of forcing a download of a several-hundred-MB file.
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { verifyAuth, getUserOrgId, errorMessage } from "./_auth.js";
import { r2BuildKey, r2Configured, r2PresignedUrl, r2DeleteObject } from "./_r2.js";

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLL_KEY || ""
);

const MAX_DOC_BYTES = 50 * 1024 * 1024; // 50 MB per document
// 1 GB per draft cut. This used to match the gallery's video cap; galleries
// went to 5 GB in Aug 2026 when they gained multipart uploads, and this path
// did NOT — it is still a single presigned PUT, which cannot resume. Raising it
// without multipart would just move the failure later into the transfer. The
// "1GB per file" wording in ProjectDetailSheet refers to this cap and is
// correct; don't "fix" it to 5 GB.
const MAX_DRAFT_BYTES = 1024 * 1024 * 1024;
// Same ceilings the gallery enforces, so drafts can't quietly blow past them.
// Geoff's own org is exempt there too (see api/delivery-upload.ts).
const PRO_STORAGE_CAP_BYTES = 200 * 1024 * 1024 * 1024; // 200 GB
const FREE_STORAGE_CAP_BYTES = 10 * 1024 * 1024 * 1024; // 10 GB

/** Bytes this org is already holding — gallery files plus project drafts. */
async function orgUsedBytes(orgId: string): Promise<number> {
  const [files, docs] = await Promise.all([
    supabase.from("delivery_files").select("size_bytes").eq("org_id", orgId),
    supabase.from("project_documents").select("size_bytes").eq("org_id", orgId),
  ]);
  const sum = (rows: { size_bytes: number | null }[] | null) =>
    (rows || []).reduce((t, r) => t + (r.size_bytes || 0), 0);
  return sum(files.data) + sum(docs.data);
}

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
      // Drafts and source files share the same ceiling and the same long
      // presign — both are big media. They differ only in where they land, so
      // a RAW handoff isn't filed under "drafts".
      const isDraft = body.kind === "draft" || body.kind === "source";
      const prefixDir = body.kind === "source" ? "source" : body.kind === "draft" ? "drafts" : "docs";
      if (!fileName || sizeBytes <= 0) return res.status(400).json({ error: "Missing fileName or sizeBytes" });

      const cap = isDraft ? MAX_DRAFT_BYTES : MAX_DOC_BYTES;
      if (sizeBytes > cap) {
        const label = body.kind === "source" ? "Source file" : isDraft ? "Draft" : "Document";
        const mb = Math.floor(cap / 1024 / 1024);
        return res.status(413).json({ error: `${label} too large (max ${mb >= 1024 ? `${mb / 1024}GB` : `${mb}MB`})` });
      }

      // Drafts are big enough to matter against the storage cap. Geoff's org is
      // exempt, matching the gallery.
      if (isDraft && orgId !== "org_sdubmedia") {
        const { data: org } = await supabase.from("organizations").select("plan").eq("id", orgId).single();
        const storageCap = org?.plan === "pro" ? PRO_STORAGE_CAP_BYTES : FREE_STORAGE_CAP_BYTES;
        const used = await orgUsedBytes(orgId);
        if (used + sizeBytes > storageCap) {
          return res.status(413).json({
            error: `You're at your ${Math.floor(storageCap / 1024 / 1024 / 1024)} GB storage cap. Delete an old draft or gallery to free up space.`,
            usedBytes: used, capBytes: storageCap,
          });
        }
      }

      const prefix = `${prefixDir}/${projectId}`;
      const storagePath = r2BuildKey(orgId, prefix, fileName);
      // Drafts can be a GB over a slow upstream — give them an hour, like the gallery.
      const uploadUrl = r2PresignedUrl({ method: "PUT", key: storagePath, expiresIn: isDraft ? 3600 : 1800, contentType });
      return res.status(200).json({ ok: true, uploadUrl, storagePath });
    }

    if (action === "download") {
      const storagePath = typeof body.storagePath === "string" ? body.storagePath : "";
      const fileName = typeof body.fileName === "string" ? body.fileName : "document";
      if (!storagePath || !storagePath.startsWith(`${orgId}/`)) return res.status(400).json({ error: "Bad storagePath" });
      const safeName = fileName.replace(/[^\w.\- ]+/g, "_");
      // inline → the browser plays it where it sits (draft review); otherwise
      // it saves to disk like a document should.
      const disposition = body.inline === true ? "inline" : "attachment";
      const downloadUrl = r2PresignedUrl({
        method: "GET", key: storagePath, expiresIn: 3600,
        responseHeaders: { "Content-Disposition": `${disposition}; filename="${safeName}"` },
      });
      return res.status(200).json({ ok: true, downloadUrl });
    }

    if (action === "delete") {
      const storagePath = typeof body.storagePath === "string" ? body.storagePath : "";
      if (!storagePath || !storagePath.startsWith(`${orgId}/`)) return res.status(400).json({ error: "Bad storagePath" });

      // A promoted draft and its gallery file are the SAME stored object (see
      // project-draft-promote). Deleting the draft afterwards must not pull the
      // file out from under the gallery — check before dropping the bytes.
      const { data: inGallery } = await supabase
        .from("delivery_files").select("id").eq("storage_path", storagePath).limit(1).maybeSingle();
      if (inGallery) {
        return res.status(200).json({ ok: true, keptInStorage: true });
      }

      // The metadata row is deleted client-side under RLS; this drops the bytes
      // so a removed draft stops costing storage.
      await r2DeleteObject(storagePath);
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: "Unknown action" });
  } catch (err) {
    return res.status(500).json({ error: errorMessage(err, "Failed to sign document URL") });
  }
}
