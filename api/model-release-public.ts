// ============================================================
// Model releases — PUBLIC endpoint. No auth: the token is the gate, exactly
// like api/mini-public.ts and api/proposal-accept.ts. Runs under the service
// role, so THIS FILE is the authorization boundary — every query is scoped
// by the token, never by anything the caller can pick.
//
// One model_release_links row per project (created lazily — see
// getOrCreateModelReleaseLink in AppContext.tsx for the owner-side path, and
// getOrCreateModelReleaseLinkServer in proposal-accept.ts for the
// accept-flow path). Every person who opens the link and signs gets their
// OWN model_release_signatures row — this file never requires the owner to
// have set up a signer ahead of time.
//
// Actions:
//   get    ?token=<public_token>  project/org name + rendered release text
//   sign   POST                   { token, name, email, phone, signatureName }
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { nanoid } from "nanoid";
import { errorMessage, escapeHtml } from "./_auth.js";
import { sendPushToOwner } from "./_apns.js";

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLL_KEY || ""
);
const resend = new Resend(process.env.RESEND_API_KEY);
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";

const clean = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");

// Adult Model Release only for now (CLAUDE.md: no minor-release variant yet).
const TEMPLATE_NAME = "Model Release";

/** Fills the template's {{merge fields}} and [BRACKETED] placeholders.
 *  Not a general-purpose renderer (see api/_contractGenerator.ts for that,
 *  which is proposal-shaped) — this one only knows the handful of fields the
 *  Model Release template actually uses. `clientName` is the visible "who
 *  signed this" line: a bracketed placeholder for the preview shown before
 *  they've typed their name, their real typed name for the final snapshot
 *  stored at signing. */
function renderRelease(content: string, vars: { clientName: string; companyName: string; projectDate: string; projectType: string }): string {
  return content
    .replace(/\{\{client_name\}\}/g, vars.clientName)
    .replace(/\{\{company_name\}\}/g, vars.companyName)
    .replace(/\{\{project_date\}\}/g, vars.projectDate)
    .replace(/\{\{project_type\}\}/g, vars.projectType)
    // These two brackets exist so an owner can customize per-shoot when
    // filling a contract by hand; the self-serve flow has no such step, so
    // they're filled with the template's own suggested wording instead of
    // being left as raw placeholders in front of a model who never met
    // Geoff. The usage-scope wording already covers the studio's own
    // marketing/advertising use of the footage, not just the client's.
    .replace(/\[COMPENSATION[^\]]*\]/g, "their appearance and participation in the production described above")
    .replace(/\[USAGE SCOPE[^\]]*\]/g, "advertising, promotional, editorial, commercial, and educational use in any and all media, worldwide, in perpetuity")
    // No address is collected on the public form — drop the clause instead
    // of leaving a dangling "[MODEL ADDRESS]".
    .replace(/,?\s*whose address is \[MODEL ADDRESS\]/g, "");
}

async function loadLink(publicToken: string) {
  const { data } = await supabase.from("model_release_links").select("*").eq("public_token", publicToken).maybeSingle();
  return data;
}

async function loadRenderVars(link: { org_id: string; project_id: string }) {
  const [{ data: org }, { data: project }] = await Promise.all([
    supabase.from("organizations").select("name").eq("id", link.org_id).single(),
    supabase.from("projects").select("date, project_type_id").eq("id", link.project_id).maybeSingle(),
  ]);
  let projectType = "";
  if (project?.project_type_id) {
    const { data: pt } = await supabase.from("project_types").select("name").eq("id", project.project_type_id).maybeSingle();
    projectType = pt?.name || "";
  }
  return {
    companyName: org?.name || "",
    projectDate: project?.date || "",
    projectType: projectType || "video/photo production",
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { action, token } = req.query;
  try {
    switch (action) {
      case "get": return await getRelease(clean(token, 64), res);
      case "sign": return await signRelease(req, res);
      default: return res.status(400).json({ error: "Unknown action" });
    }
  } catch (err) {
    return res.status(500).json({ error: errorMessage(err) });
  }
}

async function getRelease(publicToken: string, res: VercelResponse) {
  if (!publicToken) return res.status(400).json({ error: "Missing token" });
  const link = await loadLink(publicToken);
  if (!link) return res.status(404).json({ error: "This link isn't valid." });

  const { data: tpl } = await supabase.from("contract_templates").select("content").eq("name", TEMPLATE_NAME).is("deleted_at", null).maybeSingle();
  if (!tpl?.content) return res.status(500).json({ error: "This studio hasn't set up a model release template yet." });

  const vars = await loadRenderVars(link);
  const previewHtml = renderRelease(tpl.content, { ...vars, clientName: "[Your Name]" });

  return res.status(200).json({
    orgName: vars.companyName,
    releaseText: previewHtml,
  });
}

async function signRelease(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST required" });
  const { token, name, email, phone, signatureName } = req.body || {};
  const publicToken = clean(token, 64);
  if (!publicToken) return res.status(400).json({ error: "Missing token" });

  const nm = clean(name);
  const em = clean(email);
  const ph = clean(phone, 40);
  const signed = clean(signatureName);
  if (!nm) return res.status(400).json({ error: "Name is required" });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) return res.status(400).json({ error: "A valid email is required" });
  if (!signed) return res.status(400).json({ error: "Please sign the release" });

  const link = await loadLink(publicToken);
  if (!link) return res.status(404).json({ error: "This link isn't valid." });

  const { data: tpl } = await supabase.from("contract_templates").select("content").eq("name", TEMPLATE_NAME).is("deleted_at", null).maybeSingle();
  if (!tpl?.content) return res.status(500).json({ error: "This studio hasn't set up a model release template yet." });

  const vars = await loadRenderVars(link);
  const contentHtml = renderRelease(tpl.content, { ...vars, clientName: nm });

  const { error: insErr } = await supabase.from("model_release_signatures").insert({
    id: nanoid(10),
    org_id: link.org_id,
    release_link_id: link.id,
    project_id: link.project_id,
    name: nm,
    email: em,
    phone: ph,
    signature: signed,
    content_html: contentHtml,
  });
  if (insErr) return res.status(500).json({ error: insErr.message });

  // Owner heads-up — best-effort, never blocks the signer's success response.
  const notify = async () => {
    const { data: profiles } = await supabase.from("user_profiles").select("email").eq("org_id", link.org_id).eq("role", "owner");
    const ownerEmail = profiles?.[0]?.email;
    const results = await Promise.allSettled([
      sendPushToOwner(link.org_id, {
        title: "Model release signed",
        body: `${nm} signed a model release${vars.companyName ? ` for ${vars.companyName}` : ""}`,
      }),
      ownerEmail
        ? resend.emails.send({
            from: FROM_EMAIL,
            to: ownerEmail,
            subject: `Model release signed — ${nm}`,
            html: `<p style="font-family:sans-serif;font-size:14px;">${escapeHtml(nm)} (${escapeHtml(em)}${ph ? `, ${escapeHtml(ph)}` : ""}) just signed a model release. It's attached to the project now.</p>`,
          })
        : Promise.resolve(),
    ]);
    results.forEach(r => { if (r.status === "rejected") console.error(`[model-release-public] owner notify failed: ${errorMessage(r.reason)}`); });
  };
  await notify();

  return res.status(200).json({ ok: true });
}
