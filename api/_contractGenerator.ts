// ============================================================
// Contract auto-generation — Phase A.
//
// Substitutes merge fields in a master contract template HTML and renders
// the structured `{{packages_block}}` + `{{payment_schedule_block}}`
// inline. Returns the final HTML for storage on a draft Contract.
//
// Phase B will add conditional clause evaluation (rule-firing log).
// For now, every clause in the master template renders unconditionally.
// ============================================================

import { escapeHtml } from "./_auth.js";

export interface SelectedPackageInput {
  id: string;
  name: string;
  description: string;
  defaultPrice: number;
  discountFromPrice?: number | null;
  // For backward compat with the per-template ProposalPackage[] format.
  // If `lineItems` is set, we render a single line "1 of {name} at ${price}".
  totalPrice?: number;
  quantity?: number;
}

export interface MilestoneInput {
  label: string;
  type: "percent" | "fixed";
  percent?: number;
  fixedAmount?: number;
  amount?: number;
  dueType: "at_signing" | "relative_days" | "absolute_date";
  dueDays?: number;
  dueDate?: string;
}

export interface ContractGenerateInput {
  masterTemplateHtml: string;

  proposalTitle: string;

  // Client info — preferably from the linked client record, fall back to
  // proposal/lead data.
  clientName: string;
  clientEmail: string;
  clientAddress: string;
  clientPhone: string;

  // Vendor info — from organization + business_info.
  vendorName: string;
  vendorEmail: string;
  vendorAddress: string;
  vendorPhone: string;
  // The actual person who signs on the vendor side. Distinct from
  // `vendorName` (the company). Falls back to vendorName if the org's
  // owner name isn't configured.
  vendorSignerName?: string;

  eventDate: string;       // ISO YYYY-MM-DD or empty
  eventLocation: string;   // free-form

  selectedPackages: SelectedPackageInput[];
  totalPrice: number;
  milestones: MilestoneInput[];
}

/**
 * Replace merge fields and structured blocks in the master template HTML.
 * Master template content is assumed to have been DOMPurify-sanitized at
 * save time, so the output here is safe to persist as-is.
 */
export function generateContractContent(input: ContractGenerateInput): string {
  const todayIso = new Date().toISOString();
  const lastDueDate = input.milestones.length > 0
    ? (input.milestones[input.milestones.length - 1].dueDate || "")
    : "";

  // Resolve {{deposit_due_date}} and {{balance_due_date}} from the
  // milestone array. Convention: milestone[0] = deposit, milestone[N-1]
  // = balance (matches how extractPaymentScheduleMilestones builds them).
  // For at_signing milestones, render today's date so the contract reads
  // sensibly even when no calendar date is configured.
  const depositMs = input.milestones[0];
  const balanceMs = input.milestones.length > 1
    ? input.milestones[input.milestones.length - 1]
    : null;
  const depositDueDate = formatMilestoneDate(depositMs, todayIso);
  const balanceDueDate = balanceMs ? formatMilestoneDate(balanceMs, todayIso) : "";

  // ---- Plain merge fields ----
  const plain: Record<string, string> = {
    client_name: escapeHtml(input.clientName),
    client_email: escapeHtml(input.clientEmail),
    client_address: escapeHtml(input.clientAddress),
    client_phone: escapeHtml(input.clientPhone),
    vendor_name: escapeHtml(input.vendorName),
    vendor_signer_name: escapeHtml(input.vendorSignerName?.trim() || input.vendorName),
    vendor_email: escapeHtml(input.vendorEmail),
    vendor_address: escapeHtml(input.vendorAddress),
    vendor_phone: escapeHtml(input.vendorPhone),
    event_date: input.eventDate ? formatHumanDate(input.eventDate) : "",
    event_location: escapeHtml(input.eventLocation),
    contract_signed_date: formatHumanDate(todayIso),
    total_due_date: lastDueDate ? formatHumanDate(lastDueDate) : "",
    deposit_due_date: depositDueDate,
    balance_due_date: balanceDueDate,
    project_title: escapeHtml(input.proposalTitle),
  };

  let html = input.masterTemplateHtml || "";
  for (const [key, value] of Object.entries(plain)) {
    html = replaceAll(html, `{{${key}}}`, value);
  }

  // ---- Structured blocks ----
  html = replaceAll(html, "{{parties_block}}", renderPartiesBlock(input));
  html = replaceAll(html, "{{packages_block}}", renderPackagesBlock(input.selectedPackages));
  html = replaceAll(html, "{{payment_schedule_block}}", renderPaymentBlock(input.milestones, input.totalPrice));

  return html;
}

/**
 * Builds the Parties: header — Vendor block + "and" + Client block + the
 * "Collectively…" footer. Mirrors the format from the Adrianna Webb sample.
 */
function renderPartiesBlock(input: ContractGenerateInput): string {
  const vendorLines = [
    escapeHtml(input.vendorName),
    escapeHtml(input.vendorEmail),
    escapeHtml(input.vendorAddress),
    escapeHtml(input.vendorPhone),
  ].filter(Boolean).map(line => `<p style="margin: 2px 0;">${line}</p>`).join("");

  const clientLines = [
    escapeHtml(input.clientName),
    escapeHtml(input.clientEmail),
    escapeHtml(input.clientAddress),
    escapeHtml(input.clientPhone),
  ].filter(Boolean).map(line => `<p style="margin: 2px 0;">${line}</p>`).join("");

  return `
<div class="parties-block" style="margin: 16px 0;">
  <p style="margin: 0 0 8px;"><strong>Parties:</strong></p>
  <p style="margin: 4px 0;">Known as &quot;Vendor&quot;</p>
  ${vendorLines}
  <p style="margin: 12px 0 4px;">and</p>
  <p style="margin: 4px 0;">Known as &quot;Client&quot;</p>
  ${clientLines}
  <p style="margin: 12px 0 0; font-style: italic; color: #475569;">Collectively, all of the above people or businesses entering this Agreement will be referred to as the &quot;Parties.&quot;</p>
</div>`.trim();
}

/**
 * Builds the rendered selected-packages section. Mirrors the visual format
 * of the Adrianna Webb sample contract:
 *   "1 of Full Coverage Wedding Day at $1,200 for a total of $1,200"
 *   <description paragraph>
 *   "This is a discounted rate from $3,500" (when discountFromPrice set)
 */
function renderPackagesBlock(packages: SelectedPackageInput[]): string {
  if (packages.length === 0) {
    return `<p><em>No packages selected.</em></p>`;
  }
  return packages.map(pkg => {
    const qty = pkg.quantity ?? 1;
    const price = pkg.totalPrice ?? pkg.defaultPrice;
    const discount = pkg.discountFromPrice;
    return `
<div class="package-row" style="margin: 16px 0; padding: 12px 0; border-top: 1px solid #e5e7eb;">
  <p style="font-weight: 600; margin: 0 0 8px;">${qty} of ${escapeHtml(pkg.name)} at ${formatCurrency(pkg.defaultPrice)} for a total of ${formatCurrency(price)}</p>
  <p style="margin: 0 0 8px;">${escapeHtml(pkg.description)}</p>
  ${discount && discount > pkg.defaultPrice
    ? `<p style="margin: 0;">This is a discounted rate from <strong>${formatCurrency(discount)}</strong></p>`
    : ""
  }
</div>`.trim();
  }).join("\n");
}

/**
 * Builds the payment schedule rows. Mirrors:
 *   "50% of the total due on Jan 18, 2026, in the amount of $600"
 */
function renderPaymentBlock(milestones: MilestoneInput[], total: number): string {
  if (milestones.length === 0) {
    return `<p><em>No payment schedule configured.</em></p>`;
  }
  return milestones.map(ms => {
    const amount = ms.type === "percent"
      ? Math.round(total * (ms.percent || 0) / 100 * 100) / 100
      : ms.fixedAmount ?? ms.amount ?? 0;

    let dueLabel: string;
    if (ms.dueType === "at_signing") {
      dueLabel = "at time of signing";
    } else if (ms.dueType === "relative_days") {
      dueLabel = `${ms.dueDays ?? 0} days after signing`;
    } else if (ms.dueType === "absolute_date" && ms.dueDate) {
      dueLabel = `on ${formatHumanDate(ms.dueDate)}`;
    } else {
      dueLabel = "";
    }

    const headLabel = ms.type === "percent"
      ? `${ms.percent ?? 0}% of the total`
      : escapeHtml(ms.label);

    return `<p style="margin: 4px 0;">${headLabel} due ${dueLabel}, in the amount of ${formatCurrency(amount)}</p>`;
  }).join("\n");
}

// ---- helpers ----

/**
 * Resolve a single milestone's due date to human-readable text. Handles
 * "at signing" (uses signing-day date), "absolute_date", and "relative_days"
 * (uses signing-day date + N). Returns "" if the milestone is missing.
 */
function formatMilestoneDate(ms: MilestoneInput | undefined, todayIso: string): string {
  if (!ms) return "";
  if (ms.dueType === "at_signing") return formatHumanDate(todayIso);
  if (ms.dueType === "absolute_date" && ms.dueDate) return formatHumanDate(ms.dueDate);
  if (ms.dueType === "relative_days") {
    const d = new Date(todayIso);
    d.setDate(d.getDate() + (ms.dueDays ?? 0));
    return formatHumanDate(d.toISOString());
  }
  return "";
}

function formatHumanDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso.includes("T") ? iso : iso + "T00:00:00");
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

function formatCurrency(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

function replaceAll(haystack: string, needle: string, replacement: string): string {
  return haystack.split(needle).join(replacement);
}

/**
 * The full set of merge-field tokens recognised by the generator. Surfaced
 * to clients (e.g., the contract template editor's chip picker) so they
 * can be inserted by name without the user typing braces by hand.
 */
export const SUPPORTED_MERGE_FIELDS = [
  { key: "client_name", label: "Client Name" },
  { key: "client_email", label: "Client Email" },
  { key: "client_address", label: "Client Address" },
  { key: "client_phone", label: "Client Phone" },
  { key: "vendor_name", label: "Vendor Name" },
  { key: "vendor_signer_name", label: "Vendor Signer Name (Owner)" },
  { key: "vendor_email", label: "Vendor Email" },
  { key: "vendor_address", label: "Vendor Address" },
  { key: "vendor_phone", label: "Vendor Phone" },
  { key: "event_date", label: "Event Date" },
  { key: "event_location", label: "Event Location" },
  { key: "contract_signed_date", label: "Date Signed (today)" },
  { key: "deposit_due_date", label: "Deposit Due Date" },
  { key: "balance_due_date", label: "Balance Due Date" },
  { key: "total_due_date", label: "Total Due Date" },
  { key: "project_title", label: "Project Title" },
  { key: "parties_block", label: "Parties Header (Vendor + Client) (block)" },
  { key: "packages_block", label: "Selected Packages (block)" },
  { key: "payment_schedule_block", label: "Payment Schedule (block)" },
] as const;
