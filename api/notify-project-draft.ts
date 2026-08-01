// ============================================================
// Vercel Serverless Function — tell the owner an editor posted a draft cut.
//
// Called by assigned crew right after a draft finishes uploading. Runs
// service-role because staff can't write notifications for owners under RLS.
// Only assigned crew can fire it (verifyCrewOnProject), so it can't be used to
// spam the owner from an unrelated login.
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { randomUUID } from "crypto";
import { verifyAuth, errorMessage } from "./_auth.js";
import { supabaseService, verifyCrewOnProject } from "./_crewAccess.js";
import { sendPushToOrg } from "./_apns.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST required" });

  const user = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const body = (req.body || {}) as Record<string, unknown>;
  const projectId = typeof body.projectId === "string" ? body.projectId : "";
  const fileName = typeof body.fileName === "string" ? body.fileName : "";
  const version = Number(body.version ?? 0);
  if (!projectId) return res.status(400).json({ error: "projectId required" });

  try {
    const access = await verifyCrewOnProject(user.userId, projectId);
    if (!access.ok) return res.status(access.status).json({ error: access.error });

    // Who uploaded it, and which job it's for.
    const [{ data: uploader }, { data: client }] = await Promise.all([
      supabaseService.from("crew_members").select("name").eq("id", access.crewMemberId).maybeSingle(),
      access.project.client_id
        ? supabaseService.from("clients").select("company, contact_name").eq("id", access.project.client_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    const who = uploader?.name || "An editor";
    const job = client?.company || client?.contact_name || "a project";
    const label = version > 0 ? `Draft v${version}` : "A draft";

    const { data: recipients } = await supabaseService
      .from("user_profiles").select("id").eq("org_id", access.orgId).in("role", ["owner", "partner"]);
    const owners = recipients || [];

    // Bell notification per owner/partner. The link opens the job straight up.
    const rows = owners.map(o => ({
      id: randomUUID(),
      user_id: o.id,
      type: "project_draft",
      title: `${who} uploaded ${label.toLowerCase()}`,
      message: `${job}${fileName ? ` · ${fileName}` : ""}`,
      link: `/calendar?project=${projectId}`,
    }));

    // Best-effort side effects, awaited — a Vercel handler that returns first
    // kills anything still in flight.
    // PromiseLike, not Promise: Supabase's query builder is a thenable without
    // .catch/.finally. allSettled takes it fine; the type has to say so.
    const sideEffects: [string, PromiseLike<unknown>][] = [];
    if (rows.length > 0) sideEffects.push(["bell", supabaseService.from("notifications").insert(rows)]);
    sideEffects.push(["push", sendPushToOrg(access.orgId, {
      title: `${label} ready`,
      body: `${who} · ${job}`,
      data: { url: `/calendar?project=${projectId}` },
    })]);

    const settled = await Promise.allSettled(sideEffects.map(([, p]) => p));
    settled.forEach((r, i) => {
      if (r.status === "rejected") console.warn(`[notify-project-draft] ${sideEffects[i][0]} failed: ${errorMessage(r.reason)}`);
    });

    return res.status(200).json({ ok: true, notified: owners.length });
  } catch (err) {
    console.error("notify-project-draft error:", err);
    return res.status(500).json({ error: errorMessage(err, "Couldn't send the notification") });
  }
}
