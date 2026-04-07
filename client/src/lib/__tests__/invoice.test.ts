// ============================================================
// Tests for invoice generation functions
// ============================================================

import { describe, it, expect } from "vitest";
import { generateInvoiceNumber, buildLineItems, buildInvoice } from "../invoice";
import type { Client, Project, ProjectType, Location, Organization } from "../types";

// ---- Factory helpers ----

function makeClient(overrides: Partial<Client> = {}): Client {
  return {
    id: "client-1",
    company: "Acme Co",
    contactName: "Jane Smith",
    phone: "6619169468",
    email: "jane@acme.com",
    billingModel: "hourly",
    billingRatePerHour: 200,
    perProjectRate: 0,
    projectTypeRates: [],
    allowedProjectTypeIds: [],
    defaultProjectTypeId: "",
    roleBillingMultipliers: [],
    createdAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: "proj-1",
    clientId: "client-1",
    projectTypeId: "pt-podcast",
    locationId: "loc-1",
    date: "2026-04-01",
    startTime: "10:00",
    endTime: "14:00",
    status: "completed",
    crew: [{ crewMemberId: "c1", role: "Main Videographer", hoursWorked: 3, payRatePerHour: 100 }],
    postProduction: [{ crewMemberId: "c1", role: "Video Editor", hoursWorked: 2, payRatePerHour: 80 }],
    editTypes: [],
    notes: "",
    deliverableUrl: "",
    createdAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

const projectTypes: ProjectType[] = [
  { id: "pt-podcast", name: "Podcast" },
  { id: "pt-headshot", name: "Headshot Photography" },
];

const locations: Location[] = [
  { id: "loc-1", name: "CBSR Nashville", address: "915 Rep John Lewis Way", city: "Nashville", state: "TN", zip: "37203" },
];

// ---- generateInvoiceNumber ----

describe("generateInvoiceNumber", () => {
  it("generates INV-YYYY-0001 with no existing invoices", () => {
    const num = generateInvoiceNumber([]);
    expect(num).toMatch(/^INV-\d{4}-0001$/);
  });

  it("increments from existing invoices", () => {
    const year = new Date().getFullYear();
    const existing = [
      { invoiceNumber: `INV-${year}-0001` },
      { invoiceNumber: `INV-${year}-0003` },
      { invoiceNumber: `INV-${year}-0002` },
    ];
    const num = generateInvoiceNumber(existing);
    expect(num).toBe(`INV-${year}-0004`);
  });

  it("ignores invoices from other years", () => {
    const year = new Date().getFullYear();
    const existing = [
      { invoiceNumber: "INV-2024-0050" },
      { invoiceNumber: `INV-${year}-0002` },
    ];
    const num = generateInvoiceNumber(existing);
    expect(num).toBe(`INV-${year}-0003`);
  });

  it("pads to 4 digits", () => {
    const num = generateInvoiceNumber([]);
    expect(num).toMatch(/-\d{4}$/);
  });
});

// ---- buildLineItems ----

describe("buildLineItems", () => {
  it("creates line items from projects in date range", () => {
    const projects = [
      makeProject({ id: "p1", date: "2026-04-01", status: "completed" }),
      makeProject({ id: "p2", date: "2026-04-15", status: "filming_done" }),
    ];
    const items = buildLineItems(projects, makeClient(), projectTypes, locations, "2026-04-01", "2026-04-30");
    expect(items.length).toBeGreaterThanOrEqual(2); // At least one per project (may be more with production/editing split)
  });

  it("excludes upcoming projects", () => {
    const projects = [
      makeProject({ id: "p1", status: "upcoming" }),
    ];
    const items = buildLineItems(projects, makeClient(), projectTypes, locations, "2026-04-01", "2026-04-30");
    expect(items.length).toBe(0);
  });

  it("excludes projects outside date range", () => {
    const projects = [
      makeProject({ id: "p1", date: "2026-03-15", status: "completed" }),
    ];
    const items = buildLineItems(projects, makeClient(), projectTypes, locations, "2026-04-01", "2026-04-30");
    expect(items.length).toBe(0);
  });

  it("excludes projects from other clients", () => {
    const projects = [
      makeProject({ id: "p1", clientId: "other-client", status: "completed" }),
    ];
    const items = buildLineItems(projects, makeClient(), projectTypes, locations, "2026-04-01", "2026-04-30");
    expect(items.length).toBe(0);
  });

  it("prevents double-billing already-invoiced projects", () => {
    const projects = [makeProject({ id: "p1", status: "completed" })];
    const existing = [{ lineItems: [{ projectId: "p1" }] }] as any;
    const items = buildLineItems(projects, makeClient(), projectTypes, locations, "2026-04-01", "2026-04-30", existing);
    expect(items.length).toBe(0);
  });

  it("breaks down into Production and Editing for hourly billing", () => {
    const projects = [makeProject({
      id: "p1", status: "completed",
      crew: [{ crewMemberId: "c1", role: "Main Videographer", hoursWorked: 3, payRatePerHour: 100 }],
      postProduction: [{ crewMemberId: "c2", role: "Video Editor", hoursWorked: 2, payRatePerHour: 80 }],
    })];
    const items = buildLineItems(projects, makeClient({ billingModel: "hourly", billingRatePerHour: 200 }), projectTypes, locations, "2026-04-01", "2026-04-30");
    const productionItem = items.find(i => i.description.includes("Production"));
    const editingItem = items.find(i => i.description.includes("Editing"));
    expect(productionItem).toBeDefined();
    expect(editingItem).toBeDefined();
    expect(productionItem!.quantity).toBe(3);
    expect(editingItem!.quantity).toBe(2);
  });

  it("falls back to single line item when no crew data", () => {
    const projects = [makeProject({
      id: "p1", status: "completed",
      crew: [],
      postProduction: [],
    })];
    const items = buildLineItems(projects, makeClient({ billingModel: "hourly" }), projectTypes, locations, "2026-04-01", "2026-04-30");
    expect(items.length).toBe(1);
    expect(items[0].description).toBe("Podcast — CBSR Nashville");
  });
});

// ---- buildInvoice ----

describe("buildInvoice", () => {
  it("creates a complete invoice object", () => {
    const projects = [makeProject({ status: "completed" })];
    const client = makeClient({ billingModel: "hourly", billingRatePerHour: 200 });
    const invoice = buildInvoice(client, projects, projectTypes, locations, [], "2026-04-01", "2026-04-30");

    expect(invoice.clientId).toBe("client-1");
    expect(invoice.status).toBe("draft");
    expect(invoice.invoiceNumber).toMatch(/^INV-\d{4}-\d{4}$/);
    expect(invoice.lineItems.length).toBeGreaterThan(0);
    expect(invoice.total).toBeGreaterThan(0);
    expect(invoice.subtotal).toBe(invoice.total); // no tax
    expect(invoice.taxRate).toBe(0);
  });

  it("uses org business info when provided", () => {
    const org = {
      name: "SDub Media",
      businessInfo: {
        address: "945 Tynan Way",
        city: "Nolensville",
        state: "TN",
        zip: "37135",
        phone: "6619169468",
        email: "geoff@sdubmedia.com",
        website: "sdubmedia.com",
      },
    } as any as Organization;

    const invoice = buildInvoice(makeClient(), [makeProject({ status: "completed" })], projectTypes, locations, [], "2026-04-01", "2026-04-30", org);

    expect(invoice.companyInfo.name).toBe("SDub Media");
    expect(invoice.companyInfo.city).toBe("Nolensville");
    expect(invoice.companyInfo.phone).toBe("661-916-9468"); // formatted
  });

  it("falls back to default company info without org", () => {
    const invoice = buildInvoice(makeClient(), [makeProject({ status: "completed" })], projectTypes, locations, [], "2026-04-01", "2026-04-30");
    expect(invoice.companyInfo.name).toBe("SDub Media");
  });

  it("includes client info", () => {
    const invoice = buildInvoice(makeClient({ company: "Test Corp", email: "test@corp.com" }), [makeProject({ status: "completed" })], projectTypes, locations, [], "2026-04-01", "2026-04-30");
    expect(invoice.clientInfo.company).toBe("Test Corp");
    expect(invoice.clientInfo.email).toBe("test@corp.com");
  });
});
