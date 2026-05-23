// ============================================================
// mergeFieldPreview — client-side rendering of contract template HTML
// for preview surfaces (template detail modal, etc).
//
// Two responsibilities:
//   1. Substitute vendor_* tokens with the org's Settings → Business Info
//      values, wrapped in a green pill so users can see what will print.
//   2. Wrap any remaining unresolved {{tokens}} with a blue pill so they
//      visually read as merge fields, not raw braces.
//
// Output HTML is intended to be passed through DOMPurify by the caller —
// this helper produces span markup with className/style only.
// ============================================================

import type { Organization, OrgBusinessInfo } from "./types";

/**
 * Resolve vendor merge fields against the org's Settings → Business Info.
 * Returns null when no value is configured (so the placeholder pill keeps
 * showing — surfaces a missing setting rather than an empty string).
 */
export function resolveVendorField(field: string, org?: Organization | null): string | null {
  if (!org) return null;
  const bi = (org.businessInfo || {}) as Partial<OrgBusinessInfo>;
  switch (field) {
    case "vendor_name":
      return org.name?.trim() || null;
    case "vendor_email":
      return bi.email?.trim() || null;
    case "vendor_phone":
      return bi.phone?.trim() || null;
    case "vendor_address": {
      const street = bi.address?.trim() || "";
      const cityStateZip = [
        bi.city?.trim(),
        [bi.state?.trim(), bi.zip?.trim()].filter(Boolean).join(" "),
      ].filter(Boolean).join(", ");
      return [street, cityStateZip].filter(Boolean).join(" ").trim() || null;
    }
    default:
      return null;
  }
}

const FIELD_LABELS: Record<string, string> = {
  client_name: "Client Name",
  client_email: "Client Email",
  client_address: "Client Address",
  client_phone: "Client Phone",
  vendor_name: "Vendor Name",
  vendor_email: "Vendor Email",
  vendor_address: "Vendor Address",
  vendor_phone: "Vendor Phone",
  event_date: "Event Date",
  event_location: "Event Location",
  contract_signed_date: "Date Signed (today)",
  total_due_date: "Total Due Date",
  project_title: "Project Title",
  parties_block: "Parties Header",
  packages_block: "Selected Packages",
  payment_schedule_block: "Payment Schedule",
};

/**
 * Replace {{field}} tokens in a contract template HTML with preview chips.
 * Vendor fields with configured values show the resolved value (green chip);
 * everything else shows the human label (blue dashed chip).
 */
export function renderTemplatePreviewHtml(rawHtml: string, org?: Organization | null): string {
  return rawHtml.replace(/\{\{([a-z_]+)\}\}/g, (match, field: string) => {
    const resolved = resolveVendorField(field, org);
    if (resolved) {
      return `<span class="merge-chip merge-chip-resolved">${escapeHtml(resolved)}<span class="merge-chip-marker">*</span></span>`;
    }
    const label = FIELD_LABELS[field];
    if (!label) return match; // unknown token — leave as-is
    const isBlock = field.endsWith("_block");
    const cls = isBlock ? "merge-chip merge-chip-block" : "merge-chip merge-chip-placeholder";
    return `<span class="${cls}">${escapeHtml(label)}</span>`;
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
