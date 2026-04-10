// ============================================================
// Invoice building helpers
// ============================================================

import type { Client, Project, ProjectType, Location, Invoice, InvoiceLineItem, Organization } from "./types";
import { getProjectBillableHours, getProjectInvoiceAmount } from "./data";

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

  const items: InvoiceLineItem[] = [];

  for (const p of filtered) {
    const typeName = projectTypes.find(t => t.id === p.projectTypeId)?.name ?? "Project";
    const locName = locations.find(l => l.id === p.locationId)?.name;
    const projectLabel = locName ? `${typeName} — ${locName}` : typeName;

    if (client.billingModel === "per_project") {
      const amount = getProjectInvoiceAmount(p, client);

      // Break down into production + post-production if we have crew data
      const hasCrew = p.crew.length > 0;
      const hasPost = p.postProduction.length > 0;

      if (hasCrew || hasPost) {
        if (hasCrew) {
          const crewHours = p.crew.reduce((s, c) => s + c.hoursWorked, 0);
          const crewRoles = Array.from(new Set(p.crew.map(c => c.role))).join(", ");
          items.push({
            projectId: p.id, date: p.date,
            description: `${projectLabel} — Production (${crewRoles})`,
            quantity: crewHours || 1,
            unitPrice: hasPost ? Math.round(amount * 0.6 / (crewHours || 1) * 100) / 100 : amount / (crewHours || 1),
            amount: hasPost ? Math.round(amount * 0.6 * 100) / 100 : amount,
          });
        }
        if (hasPost) {
          const postHours = p.postProduction.reduce((s, c) => s + c.hoursWorked, 0);
          const postRoles = Array.from(new Set(p.postProduction.map(c => c.role))).join(", ");
          items.push({
            projectId: p.id, date: p.date,
            description: `${projectLabel} — Editing (${postRoles})`,
            quantity: postHours || 1,
            unitPrice: hasCrew ? Math.round(amount * 0.4 / (postHours || 1) * 100) / 100 : amount / (postHours || 1),
            amount: hasCrew ? Math.round(amount * 0.4 * 100) / 100 : amount,
          });
        }
      } else {
        items.push({ projectId: p.id, date: p.date, description: projectLabel, quantity: 1, unitPrice: amount, amount });
      }
    } else {
      // Hourly billing — use getProjectBillableHours to apply role multipliers + editorBilling
      const rate = Number(client.billingRatePerHour ?? 0);
      const { crewBillable, postBillable } = getProjectBillableHours(p, client);

      if (p.crew.length > 0 && crewBillable > 0) {
        const crewRoles = Array.from(new Set(p.crew.map(c => c.role))).join(", ");
        items.push({
          projectId: p.id, date: p.date,
          description: `${projectLabel} — Production (${crewRoles})`,
          quantity: crewBillable,
          unitPrice: rate, amount: crewBillable * rate,
        });
      }

      if (p.postProduction.length > 0 && postBillable > 0) {
        const postRoles = Array.from(new Set(p.postProduction.map(c => c.role))).join(", ");
        items.push({
          projectId: p.id, date: p.date,
          description: `${projectLabel} — Editing (${postRoles})`,
          quantity: postBillable,
          unitPrice: rate, amount: postBillable * rate,
        });
      }

      // Fallback if no crew/post data
      if (p.crew.length === 0 && p.postProduction.length === 0) {
        const { totalBillable } = getProjectBillableHours(p, client);
        items.push({
          projectId: p.id, date: p.date,
          description: projectLabel,
          quantity: totalBillable, unitPrice: rate, amount: totalBillable * rate,
        });
      }
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
    notes: "",
  };
}
