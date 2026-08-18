// ============================================================
// Vercel Serverless Function — tell the owner an editor put finished
// photos in a client gallery.
//
// Called by assigned crew once per upload batch, right after the last file
// registers. Runs service-role because staff can't write notifications for
// owners under RLS. Only assigned crew can fire it (verifyCrewOnProject
// "gallery"), so it can't be used to spam the owner from an unrelated login.
//
// Owner only — deliberately not owner+partner like notify-project-draft:
// partners have no gallery RLS access (2026-04-30-partner-no-galleries), so
// the /deliveries link would open to nothing for them.
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { randomUUID } from "crypto";
import { verifyAuth, errorMessage } from "./_auth.js";
import { supabaseService, verifyCrewOnProject } from "./_crewAccess.js";
import { sendPushToUser } from "./_apns.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST required" });

  const user = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const body = (req.body || {}) as Record<string, unknown>;
  const deliveryId = typeof body.deliveryId === "string" ? body.deliveryId : "";
  const count = Number(body.count ?? 0);
  if (!deliveryId) return res.status(400).json({ error: "deliveryId required" });

  try {
    const { data: delivery } = await supabaseService
      .from("deliveries")
      .select("id, project_id, org_id, title, selection_limit")
      .eq("id", deliveryId).single();
    if (!delivery || !delivery.project_id) return res.status(404).json({ error: "Gallery not found" });

    const access = await verifyCrewOnProject(user.userId, delivery.project_id, "gallery");
    if (!access.ok) return res.status(access.status).json({ error: access.error });
    if (delivery.org_id !== access.orgId) return res.status(403).json({ error: "Not your gallery" });

    // The owner is allowed through verifyCrewOnProject, but shouldn't be
    // notified about their own upload — checked against the real token, not
    // the impersonated view, so it holds either way.
    const { data: caller } = await supabaseService
      .from("user_profiles").select("role").eq("id", user.userId).maybeSingle();
    if (caller?.role === "owner") {
      return res.status(200).json({ ok: true, notified: 0, skipped: "own upload" });
    }

    // Who uploaded, and how far along the job is. Finals vs picks makes the
    // notification say "all 25 are in" rather than just "files arrived".
    const [{ data: uploader }, finalsRes, picksRes] = await Promise.all([
      supabaseService.from("crew_members").select("name").eq("id", access.crewMemberId).maybeSingle(),
      supabaseService.from("delivery_files")
        .select("id", { count: "exact", head: true })
        .eq("delivery_id", deliveryId).neq("stage", "proof"),
      supabaseService.from("delivery_selections")
        .select("id", { count: "exact", head: true })
        .eq("delivery_id", deliveryId),
    ]);
    const who = uploader?.name || "An editor";
    const finals = finalsRes.count ?? 0;
    const picks = picksRes.count ?? 0;

    const link = `/deliveries/${deliveryId}`;
    const batch = count > 0 ? count : finals;
    const title = `${who} uploaded ${batch} finished photo${batch === 1 ? "" : "s"}`;
    const progress = picks > 0
      ? (finals >= picks ? `All ${picks} picks are in` : `${finals} of ${picks} picks in`)
      : `${finals} in the gallery`;
    const message = `${delivery.title} · ${progress} — preview, then deliver.`;

    const { data: recipients } = await supabaseService
      .from("user_profiles").select("id").eq("org_id", access.orgId).eq("role", "owner");
    const owners = recipients || [];

    // One alert per gallery per day. A second batch today updates the existing
    // bell (so it shows the newest totals) and skips the push — same shape as
    // notify-project-draft, and for the same reason: three sessions in an
    // afternoon shouldn't be three pings.
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const { data: alreadyToday } = await supabaseService
      .from("notifications")
      .select("id")
      .eq("type", "gallery_finals")
      .eq("link", link)
      .gte("created_at", startOfDay.toISOString());
    const isRepeat = (alreadyToday?.length ?? 0) > 0;

    if (isRepeat) {
      const ids = (alreadyToday || []).map(n => n.id);
      const { error } = await supabaseService
        .from("notifications")
        .update({ title, message, read: false })
        .in("id", ids);
      if (error) console.warn(`[notify-gallery-finals] refresh failed: ${error.message}`);
      return res.status(200).json({ ok: true, notified: ids.length, batched: true });
    }

    const rows = owners.map(o => ({
      id: randomUUID(),
      user_id: o.id,
      type: "gallery_finals",
      title,
      message,
      link,
    }));

    // Best-effort side effects, awaited — a Vercel handler that returns first
    // kills anything still in flight.
    const sideEffects: [string, PromiseLike<unknown>][] = [];
    if (rows.length > 0) sideEffects.push(["bell", supabaseService.from("notifications").insert(rows)]);
    for (const o of owners) {
      sideEffects.push([`push:${o.id}`, sendPushToUser(o.id, {
        title: "Finals ready to preview",
        body: `${who} · ${delivery.title} · ${progress}`,
        data: { url: link },
      })]);
    }

    const settled = await Promise.allSettled(sideEffects.map(([, p]) => p));
    settled.forEach((r, i) => {
      if (r.status === "rejected") console.warn(`[notify-gallery-finals] ${sideEffects[i][0]} failed: ${errorMessage(r.reason)}`);
    });

    return res.status(200).json({ ok: true, notified: owners.length });
  } catch (err) {
    console.error("notify-gallery-finals error:", err);
    return res.status(500).json({ error: errorMessage(err, "Couldn't send the notification") });
  }
}
