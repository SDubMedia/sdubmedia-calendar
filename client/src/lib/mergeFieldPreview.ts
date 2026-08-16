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
  partner_name: "Second Person's Full Name",
  partner_email: "Second Person's Email",
  partner_phone: "Second Person's Phone",
  contract_signed_date: "Date Signed (today)",
  total_due_date: "Total Due Date",
  project_title: "Project Title",
  parties_block: "Parties Header",
  packages_block: "Selected Packages",
  payment_schedule_block: "Payment Schedule",
};

/** Who supplies each field.
 *
 *  "client" fields are filled in by whoever signs — the event details and
 *  their own contact information. Everything else is either resolved from
 *  Settings or generated. Getting this right is what lets a contract show a
 *  client exactly which boxes are theirs, instead of a wall of identical
 *  placeholders. */
const CLIENT_FILLED = new Set([
  "client_name", "client_email", "client_address", "client_phone",
  "event_date", "event_location",
  // A wedding usually has two people on the hook, and it isn't always a
  // couple — sometimes it's a parent paying. Kept generic for that reason.
  "partner_name", "partner_email", "partner_phone",
]);

export function fieldFilledBy(field: string): "client" | "auto" {
  return CLIENT_FILLED.has(field) ? "client" : "auto";
}

/** Every client field a piece of contract text asks for, in the order it
 *  appears. Drives the "before you sign" form and what must be completed. */
export function clientFieldsIn(html: string): { field: string; label: string }[] {
  const seen = new Set<string>();
  const out: { field: string; label: string }[] = [];
  for (const m of html.matchAll(/\{\{([a-z_]+)\}\}/g)) {
    const field = m[1];
    if (!CLIENT_FILLED.has(field) || seen.has(field)) continue;
    seen.add(field);
    out.push({ field, label: FIELD_LABELS[field] || field });
  }
  return out;
}

/**
 * Replace {{field}} tokens with what the reader should actually see.
 *
 * A resolved value renders as plain text with a soft underline — a client
 * reading a contract should see "S-Dub Media", not a green pill and certainly
 * not {{vendor_name}}. Raw braces are code leaking into a legal document, and
 * a new owner has no idea what they mean.
 *
 * Anything still to be filled renders as its plain-English label in a light
 * box with an asterisk, so it reads as "something goes here" — and the two
 * kinds are distinguishable, because a client needs to know which are theirs.
 */
export function renderTemplatePreviewHtml(
  rawHtml: string,
  org?: Organization | null,
  /** Values the signer has typed. A filled field stops looking like a blank
   *  and reads as part of the sentence, which is the whole point. */
  filled?: Record<string, string>,
  /** Make the client's own fields editable where they sit in the text, so a
   *  typo in the venue is fixed by clicking the word rather than scrolling
   *  back to a form. Only the client-facing view turns this on. */
  editable?: boolean,
): string {
  return rawHtml.replace(/\{\{([a-z_]+)\}\}/g, (match, field: string) => {
    const typed = filled?.[field]?.trim();
    const isClient = fieldFilledBy(field) === "client" && !field.endsWith("_block");
    if (typed) {
      if (editable && isClient) {
        return `<span class="merge-chip merge-chip-resolved merge-chip-editable" contenteditable="true" spellcheck="false" data-merge-field="${escapeHtml(field)}">${escapeHtml(typed)}</span>`;
      }
      return `<span class="merge-chip merge-chip-resolved">${escapeHtml(typed)}</span>`;
    }
    // A second person is optional, so an unfilled partner field renders as
    // nothing at all rather than an empty box. A solo booking's contract
    // shouldn't carry blank "Second Person" placeholders through to signing.
    if (field.startsWith("partner_")) return "";

    const resolved = resolveVendorField(field, org);
    if (resolved) {
      return `<span class="merge-chip merge-chip-resolved">${escapeHtml(resolved)}</span>`;
    }
    const label = FIELD_LABELS[field];
    if (!label) return match; // unknown token — leave as-is rather than hide it
    if (field.endsWith("_block")) {
      return `<span class="merge-chip merge-chip-block">${escapeHtml(label)}</span>`;
    }
    const who = fieldFilledBy(field);
    if (editable && isClient) {
      // Empty and clickable: the label is a placeholder attribute rather than
      // text, or the client would have to delete it before typing.
      return `<span class="merge-chip merge-chip-client merge-chip-editable merge-chip-empty" contenteditable="true" spellcheck="false" data-merge-field="${escapeHtml(field)}" data-placeholder="${escapeHtml(label)}"></span>`;
    }
    return `<span class="merge-chip merge-chip-${who}">${escapeHtml(label)}<span class="merge-chip-star">*</span></span>`;
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
