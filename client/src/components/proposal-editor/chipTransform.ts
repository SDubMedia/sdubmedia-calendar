// ============================================================
// chipTransform — bidirectional conversion between merge-field tokens
// (`{{event_date}}`) and visual chip spans inside prose HTML.
//
// Tokens are the canonical, persisted form. The contract generator
// substitutes `{{field}}` to actual values at signing time, and any
// surface that doesn't know about chips (PDF rendering, plain HTML
// templates) sees the same plain-text tokens.
//
// Chips are the editor representation. When the prose editor opens, we
// convert tokens → chip spans so the user sees colored pills, not raw
// braces. On commit we convert chip spans back to tokens before saving.
// ============================================================

const FIELD_LABELS: Record<string, string> = {
  client_name: "Client Name",
  client_email: "Client Email",
  client_address: "Client Address",
  client_phone: "Client Phone",
  vendor_name: "Vendor Name",
  vendor_signer_name: "Owner Name",
  vendor_email: "Vendor Email",
  vendor_address: "Vendor Address",
  vendor_phone: "Vendor Phone",
  event_date: "Event Date",
  event_location: "Event Location",
  contract_signed_date: "Date Signed",
  total_due_date: "Total Due Date",
  deposit_due_date: "Deposit Due Date",
  balance_due_date: "Balance Due Date",
  project_title: "Project Title",
};

/**
 * Replace `{{field}}` tokens in HTML with chip-styled span elements.
 * Chips are `contenteditable="false"` so the browser treats them as
 * atomic units (backspace deletes the whole chip, arrow keys jump over).
 */
export function tokensToChips(html: string): string {
  return html.replace(/\{\{([a-z_]+)\}\}/g, (match, field: string) => {
    const label = FIELD_LABELS[field];
    if (!label) return match; // unknown field — leave the token alone
    return `<span class="merge-chip merge-chip-placeholder" contenteditable="false" data-field="${field}">${escapeHtml(label)}</span>`;
  });
}

/**
 * Inverse of tokensToChips — replace chip spans (anywhere in the HTML,
 * with any attribute order) with their `{{field}}` token. Runs at commit
 * time so the persisted HTML never contains chip markup.
 */
export function chipsToTokens(html: string): string {
  // Match any <span ...> with data-field="..." and arbitrary inner content.
  // Single regex over the serialized HTML — DOMParser would be more rigorous
  // but is ~10× slower for the typical paragraph length here.
  return html.replace(
    /<span\b[^>]*\bdata-field="([a-z_]+)"[^>]*>[\s\S]*?<\/span>/gi,
    (_match, field: string) => `{{${field}}}`,
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
