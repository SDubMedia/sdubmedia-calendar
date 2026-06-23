// ============================================================
// Vercel Serverless Function — an agent cancels their OWN approved shoot.
//
// Allowed only while the photographer hasn't checked in (on_the_way_at is null).
// Service-role (clients can't update projects under RLS), strictly scoped: the
// project's client_id must be one of the caller's client records — so only the
// agent who ordered it can cancel (a broker can't cancel an agent's shoot).
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import { verifyAuth, getUserOrgId, errorMessage } from "./_auth.js";

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLL_KEY || ""
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const caller = await verifyAuth(req);
  if (!caller) return res.status(401).json({ error: "Unauthorized" });

  try {
    const { projectId } = req.body || {};
    if (!projectId) return res.status(400).json({ error: "projectId required" });

    const { data: profile } = await supabase.from("user_profiles").select("role, client_ids").eq("id", caller.userId).single();
    if (!profile || profile.role !== "client") return res.status(403).json({ error: "Only an agent can cancel here" });
    const callerOrgId = await getUserOrgId(caller.userId);
    const clientIds: string[] = Array.isArray(profile.client_ids) ? profile.client_ids : [];

    const { data: project } = await supabase
      .from("projects").select("id, org_id, client_id, status, on_the_way_at, location_id").eq("id", projectId).maybeSingle();
    if (!project || project.org_id !== callerOrgId) return res.status(404).json({ error: "Shoot not found" });

    // Only the orderer (the project's client) can cancel — not a broker.
    if (!clientIds.includes(project.client_id)) return res.status(403).json({ error: "You can only cancel your own shoots" });
    if (project.on_the_way_at) return res.status(409).json({ error: "Too late — the photographer is already on the way" });
    if (project.status === "cancelled") return res.status(200).json({ ok: true, alreadyCancelled: true });

    const nowIso = new Date().toISOString();
    const { error } = await supabase.from("projects").update({
      status: "cancelled",
      cancelled_at: nowIso,
      cancellation_reason: "Cancelled by agent",
      updated_at: nowIso,
    }).eq("id", projectId);
    if (error) return res.status(500).json({ error: errorMessage(error, "Couldn't cancel") });

    // Bell the owners so they know a booking dropped.
    const { data: owners } = await supabase.from("user_profiles").select("id").eq("org_id", callerOrgId).in("role", ["owner", "partner"]);
    const { data: loc } = project.location_id ? await supabase.from("locations").select("name").eq("id", project.location_id).maybeSingle() : { data: null };
    for (const o of owners || []) {
      await supabase.from("notifications").insert({
        id: randomUUID(), user_id: o.id, type: "shoot_cancelled",
        title: "An agent cancelled a shoot", message: loc?.name || "A scheduled shoot", link: "/calendar",
      });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("agent-cancel-shoot error:", err);
    return res.status(500).json({ error: errorMessage(err, "Failed to cancel") });
  }
}
