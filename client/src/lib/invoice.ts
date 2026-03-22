// ============================================================
// Invoice building helpers
// ============================================================

import type { Client, Project, ProjectType, Location, Invoice, InvoiceLineItem } from "./types";
import { getProjectBillableHours, getProjectInvoiceAmount } from "./data";

/** SDub Media company info (placeholder — update with real details) */
export function getCompanyInfo(): Record<string, string> {
  return {
    name: "SDub Media",
    address: "123 Main Street",
    city: "Nolensville",
    state: "TN",
    zip: "37135",
    phone: "(629) 206-1799",
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
  return `${prefix}${String(maxNum + 1).padStart(4, "0")}`;
}

/** Build line items from projects in a date range for a client */
export function buildLineItems(
  projects: Project[],
  client: Client,
  projectTypes: ProjectType[],
  locations: Location[],
  periodStart: string,
  periodEnd: string,
  existingInvoices?: { lineItems: { projectId: string }[] }[],
): InvoiceLineItem[] {
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
    if (p.clientId !== client.id) return false;
    if (p.date < periodStart || p.date > periodEnd) return false;
    // Don't invoice upcoming projects (no work done yet)
    if (p.status === "upcoming") return false;
    // Don't double-bill projects already on another invoice
    if (invoicedProjectIds.has(p.id)) return false;
    return true;
  });

  return filtered.map(p => {
    const typeName = projectTypes.find(t => t.id === p.projectTypeId)?.name ?? "Project";
    const locName = locations.find(l => l.id === p.locationId)?.name;
    const description = locName ? `${typeName} — ${locName}` : typeName;

    if (client.billingModel === "per_project") {
      const amount = getProjectInvoiceAmount(p, client);
      return {
        projectId: p.id,
        date: p.date,
        description,
        quantity: 1,
        unitPrice: amount,
        amount,
      };
    }

    const { totalBillable } = getProjectBillableHours(p, client);
    const rate = Number(client.billingRatePerHour ?? 0);
    return {
      projectId: p.id,
      date: p.date,
      description,
      quantity: totalBillable,
      unitPrice: rate,
      amount: totalBillable * rate,
    };
  });
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
): Omit<Invoice, "id" | "createdAt" | "updatedAt"> {
  const lineItems = buildLineItems(projects, client, projectTypes, locations, periodStart, periodEnd, existingInvoices as any);
  const subtotal = lineItems.reduce((s, li) => s + li.amount, 0);
  const taxRate = 0;
  const taxAmount = subtotal * taxRate;
  const total = subtotal + taxAmount;
  const today = new Date().toISOString().slice(0, 10);

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
    companyInfo: getCompanyInfo(),
    clientInfo: {
      company: client.company,
      contactName: client.contactName,
      email: client.email,
      phone: client.phone,
    },
    notes: "",
  };
}
