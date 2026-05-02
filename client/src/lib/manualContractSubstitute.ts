// ============================================================
// manualContractSubstitute — replace plain merge-field tokens in a
// contract template's HTML at the moment a manual (non-proposal-flow)
// contract is created. The proposal-acceptance path runs the full
// server-side `_contractGenerator`; this is the parallel for the
// "New Contract" wizard so clients never see literal `{{tokens}}`.
//
// Only handles plain string tokens (vendor/client/project info).
// Block tokens (parties_block, packages_block, payment_schedule_block)
// are left alone — manual contracts have no proposal context to
// resolve them, so leaving the {{token}} visible is a useful warning
// to the owner that those need to be filled in.
// ============================================================

import type { Client, Organization, Project, Location } from "./types";

interface SubstituteInput {
  client?: Client | null;
  project?: Project | null;
  location?: Location | null;
  org?: Organization | null;
  projectTitle?: string;
}

export function substituteManualContractFields(
  html: string,
  input: SubstituteInput,
): string {
  if (!html) return "";
  const todayIso = new Date().toISOString();
  const bi = input.org?.businessInfo || {} as NonNullable<Organization["businessInfo"]>;

  const vendorAddress = [bi.address, bi.city, bi.state, bi.zip].filter(Boolean).join(", ");
  const clientAddress = input.client
    ? [input.client.address, input.client.city, input.client.state, input.client.zip].filter(Boolean).join(", ")
    : "";

  const replacements: Record<string, string> = {
    client_name: input.client?.contactName || input.client?.company || "",
    client_email: input.client?.email || "",
    client_address: clientAddress,
    client_phone: input.client?.phone || "",
    vendor_name: input.org?.name || "",
    vendor_signer_name: bi.ownerName?.trim() || input.org?.name || "",
    vendor_email: bi.email || "",
    vendor_address: vendorAddress,
    vendor_phone: bi.phone || "",
    event_date: input.project?.date ? formatHumanDate(input.project.date) : "",
    event_location: input.location?.name || "",
    contract_signed_date: formatHumanDate(todayIso),
    project_title: input.projectTitle || "",
    // total_due_date / deposit_due_date / balance_due_date have no source
    // in the manual flow — leave them as visible tokens.
  };

  let out = html;
  for (const [key, value] of Object.entries(replacements)) {
    if (!value) continue; // don't blank-out a field that's missing — leave the token visible
    out = out.split(`{{${key}}}`).join(escapeHtml(value));
  }
  return out;
}

function formatHumanDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso.includes("T") ? iso : iso + "T00:00:00");
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
