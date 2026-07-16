// ============================================================
// Invoice building helpers
// ============================================================

import type { Client, Project, ProjectType, Location, Invoice, InvoiceLineItem, Organization } from "./types";
import { getProjectBillableHours, getProjectSubtotal, getProjectDiscountValue, getProjectPayerId } from "./data";

export function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  if (digits.length === 11 && digits[0] === "1") return `${digits.slice(1, 4)}-${digits.slice(4, 7)}-${digits.slice(7)}`;
  return phone;
}

/** SDub Media company info (placeholder — update with real details) */
export function getCompanyInfo(): Record<string, string> {
  return {
    name: "SDub Media",
    address: "123 Main Street",
    city: "Nolensville",
    state: "TN",
    zip: "37135",
    phone: "661-916-9468",
    email: "Geoff@SDubMedia.com",
    website: "sdubmedia.com",
  };
}

/** Generate next invoice number from existing invoices: INV-YYYY-NNNN */
export function generateInvoiceNumber(existingInvoices: { invoiceNumber: string }[]): string {
  const year = new Date().getFullYear();
  const prefix = `INV-${year}-`;
  let maxNum = 0;
  for (const inv of existingInvoices) {
    if (inv.invoiceNumber.startsWith(prefix)) {
      const num = parseInt(inv.invoiceNumber.slice(prefix.length), 10);
      if (num > maxNum) maxNum = num;
    }
  }
  // Add timestamp suffix to avoid collisions with soft-deleted invoices
  const next = maxNum + 1;
  return `${prefix}${String(next).padStart(4, "0")}`;
}

/** Generate next invoice number including deleted invoices */
export async function generateInvoiceNumberFromDB(supabase: any): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `INV-${year}-`;
  const { data } = await supabase
    .from("invoices")
    .select("invoice_number")
    .like("invoice_number", `${prefix}%`)
    .order("invoice_number", { ascending: false })
    .limit(1);
  let maxNum = 0;
  if (data?.[0]?.invoice_number) {
    maxNum = parseInt(data[0].invoice_number.slice(prefix.length), 10) || 0;
  }
  return `${prefix}${String(maxNum + 1).padStart(4, "0")}`;
}

/**
 * Build line items from projects in a date range for a client.
 *
 * When `allClients` is provided, projects are grouped by their RESOLVED PAYER
 * (getProjectPayerId) rather than their raw clientId — so a broker invoice
 * gathers every house its agents had billed up to it. Each house is still
 * priced with its own client's (the agent's) settings, and broker lines are
 * labeled with the agent's name. When `allClients` is omitted, behavior is
 * unchanged (match by clientId, price with `client`).
 */
export function buildLineItems(
  projects: Project[],
  client: Client,
  projectTypes: ProjectType[],
  locations: Location[],
  periodStart: string,
  periodEnd: string,
  existingInvoices?: { lineItems: { projectId: string }[] }[],
  allClients?: Client[],
): InvoiceLineItem[] {
  const clientsById = allClients
    ? Object.fromEntries(allClients.map(c => [c.id, c]))
    : null;
  const payerOf = (p: Project): string =>
    clientsById ? getProjectPayerId(p, clientsById) : p.clientId;
  // Collect already-invoiced project IDs to prevent double-billing
  const invoicedProjectIds = new Set<string>();
  if (existingInvoices) {
    for (const inv of existingInvoices) {
      for (const li of inv.lineItems) {
        if (li.projectId) invoicedProjectIds.add(li.projectId);
      }
    }
  }

  const filtered = projects.filter(p => {
    if (payerOf(p) !== client.id) return false;
    if (p.date < periodStart || p.date > periodEnd) return false;
    // Don't invoice upcoming or tentative projects (no work done yet)
    if (p.status === "upcoming" || p.status === "tentative") return false;
    // Don't invoice cancelled projects — they bill nothing and shouldn't
    // appear as a line item at all.
    if (p.status === "cancelled") return false;
    // Don't double-bill projects already on another invoice
    if (invoicedProjectIds.has(p.id)) return false;
    return true;
  });

  const items: InvoiceLineItem[] = [];

  for (const p of filtered) {
    // Price each house with its OWN client (the agent), not necessarily the
    // invoice recipient (which may be the broker).
    const pricingClient = (clientsById && clientsById[p.clientId]) || client;
    const typeName = projectTypes.find(t => t.id === p.projectTypeId)?.name ?? "Project";
    const loc = locations.find(l => l.id === p.locationId);
    const locName = loc?.name;
    const baseLabel = locName ? `${typeName} — ${locName}` : typeName;
    // On a broker invoice, each line names the AGENT and the PROPERTY (street
    // address if we have it, else the location name) so the broker can match
    // every charge to a specific listing.
    const billedForAgent = (clientsById && p.clientId !== client.id) ? clientsById[p.clientId] : null;
    const propLabel = loc
      ? (loc.address?.trim() ? `${loc.address.trim()}${loc.city ? `, ${loc.city}` : ""}` : (loc.name || ""))
      : "";
    const brokerPrefix = billedForAgent
      ? `${billedForAgent.company}${propLabel ? ` · ${propLabel}` : ""}`
      : null;
    const projectLabel = brokerPrefix || baseLabel;

    const effectiveModel = p.billingModel ?? pricingClient.billingModel;

    // Real-estate / flat bundles (per-project billing): the selected services
    // define the whole price and labor isn't billed to the client. Each service
    // is its own line item. Hourly projects fall through and bill labor + these
    // services as add-ons instead (handled in the hourly branch below).
    if (p.services && p.services.length > 0 && effectiveModel === "per_project") {
      // On a broker invoice, lead with a header row naming the agent + property,
      // then list each service (Photography, Videography, Drone…) on its own
      // indented line beneath it so the broker can read the breakdown at a
      // glance. Regular invoices keep one flat line per service.
      if (brokerPrefix) {
        items.push({
          projectId: p.id,
          date: p.date,
          description: brokerPrefix,
          quantity: 0,
          unitPrice: 0,
          amount: 0,
          isHeader: true,
        });
      }
      for (const svc of p.services) {
        const svcLabel = svc.label || projectLabel;
        items.push({
          projectId: p.id,
          // The header carries the shoot date; sub-rows don't repeat it.
          date: brokerPrefix ? "" : p.date,
          description: svcLabel,
          quantity: 1,
          unitPrice: Number(svc.price || 0),
          amount: Number(svc.price || 0),
          isSubItem: !!brokerPrefix,
        });
      }
      // Skip the per_project/hourly branches — services define the price.
      // Discount logic below still applies to the project's total.
      const projectSubtotal = p.services.reduce((s, x) => s + Number(x.price || 0), 0);
      const discountValue = getProjectDiscountValue(p, projectSubtotal);
      if (discountValue > 0) {
        const discountLabel = p.discountType === "percent"
          ? `Discount (${Number(p.discountAmount)}% off)`
          : "Discount";
        items.push({
          projectId: p.id,
          date: brokerPrefix ? "" : p.date,
          description: brokerPrefix ? discountLabel : `${projectLabel} — ${discountLabel}`,
          quantity: 1,
          unitPrice: -discountValue,
          amount: -discountValue,
          isSubItem: !!brokerPrefix,
        });
      }
      continue;
    }

    const projectSubtotal = getProjectSubtotal(p, pricingClient);
    if (effectiveModel === "per_project") {
      // Flat-rate projects show a single line item with the flat amount
      // — clients booked a flat rate, so they shouldn't see a synthetic
      // Production/Editing split. Discount (below) still renders as a
      // separate negative line.
      const amount = projectSubtotal;
      items.push({ projectId: p.id, date: p.date, description: projectLabel, quantity: 1, unitPrice: amount, amount });
    } else {
      // Hourly billing — use getProjectBillableHours to apply role multipliers + editorBilling
      const rate = Number(p.billingRate ?? pricingClient.billingRatePerHour ?? 0);
      const { crewBillable, postBillable } = getProjectBillableHours(p, pricingClient);

      if (p.crew.length > 0 && crewBillable > 0) {
        items.push({
          projectId: p.id, date: p.date,
          description: `${projectLabel} — Production`,
          quantity: crewBillable,
          unitPrice: rate, amount: crewBillable * rate,
        });
      }

      if (p.postProduction.length > 0 && postBillable > 0) {
        items.push({
          projectId: p.id, date: p.date,
          description: `${projectLabel} — Editing`,
          quantity: postBillable,
          unitPrice: rate, amount: postBillable * rate,
        });
      }

      // Fallback if no crew/post data
      if (p.crew.length === 0 && p.postProduction.length === 0) {
        const { totalBillable } = getProjectBillableHours(p, pricingClient);
        items.push({
          projectId: p.id, date: p.date,
          description: projectLabel,
          quantity: totalBillable, unitPrice: rate, amount: totalBillable * rate,
        });
      }

      // À-la-carte services on an hourly project bill on top of the labor,
      // each as its own line (e.g. a logo added to an hourly video shoot).
      for (const svc of (p.services || [])) {
        items.push({
          projectId: p.id, date: p.date,
          description: svc.label || projectLabel,
          quantity: 1,
          unitPrice: Number(svc.price || 0),
          amount: Number(svc.price || 0),
        });
      }
    }

    // Apply per-project discount as its own negative line item so the
    // client sees the markdown explicitly on the invoice. Computed off
    // the project's pre-discount subtotal (same as the project view).
    const discountValue = getProjectDiscountValue(p, projectSubtotal);
    if (discountValue > 0) {
      const discountLabel = p.discountType === "percent"
        ? `Discount (${Number(p.discountAmount)}% off)`
        : "Discount";
      items.push({
        projectId: p.id,
        date: p.date,
        description: `${projectLabel} — ${discountLabel}`,
        quantity: 1,
        unitPrice: -discountValue,
        amount: -discountValue,
      });
    }
  }

  return items;
}

/** Build a full invoice object (not yet saved) */
export function buildInvoice(
  client: Client,
  projects: Project[],
  projectTypes: ProjectType[],
  locations: Location[],
  existingInvoices: { invoiceNumber: string }[],
  periodStart: string,
  periodEnd: string,
  org?: Organization | null,
  allClients?: Client[],
): Omit<Invoice, "id" | "createdAt" | "updatedAt"> {
  const lineItems = buildLineItems(projects, client, projectTypes, locations, periodStart, periodEnd, existingInvoices as any, allClients);
  const subtotal = lineItems.reduce((s, li) => s + li.amount, 0);
  const taxRate = 0;
  const taxAmount = subtotal * taxRate;
  const total = subtotal + taxAmount;
  const today = new Date().toISOString().slice(0, 10);

  // Broker invoices get a one-line billing summary (month · homes · total) so
  // the brokerage sees the bottom line at a glance above the itemization.
  let notes = "";
  if (allClients && client.clientType === "broker") {
    const homes = new Set(lineItems.map(li => li.projectId)).size;
    const monthLabel = new Date(periodStart + "T00:00:00")
      .toLocaleDateString("en-US", { month: "long", year: "numeric" });
    const totalStr = "$" + total.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    notes = `${monthLabel} — ${homes} home${homes !== 1 ? "s" : ""} shot — total ${totalStr}`;
  }

  return {
    invoiceNumber: generateInvoiceNumber(existingInvoices),
    clientId: client.id,
    periodStart,
    periodEnd,
    subtotal,
    taxRate,
    taxAmount,
    total,
    status: "draft",
    issueDate: today,
    dueDate: today, // Due on receipt
    paidDate: null,
    lineItems,
    companyInfo: org?.businessInfo ? {
      name: org.name || "",
      address: org.businessInfo.address || "",
      city: org.businessInfo.city || "",
      state: org.businessInfo.state || "",
      zip: org.businessInfo.zip || "",
      phone: formatPhone(org.businessInfo.phone || ""),
      email: org.businessInfo.email || "",
      website: org.businessInfo.website || "",
    } : getCompanyInfo(),
    clientInfo: {
      company: client.company,
      contactName: client.contactName,
      email: client.email,
      phone: client.phone,
    },
    notes,
    paymentMethods: ["stripe"],
    viewToken: "",
  };
}
