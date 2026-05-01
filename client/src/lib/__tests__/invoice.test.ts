// ============================================================
// Tests for invoice generation functions
// ============================================================

import { describe, it, expect } from "vitest";
import { generateInvoiceNumber, buildLineItems, buildInvoice, formatPhone } from "../invoice";
import type { Client, Project, ProjectType, Location, Organization } from "../types";

// ---- Factory helpers ----

function makeClient(overrides: Partial<Client> = {}): Client {
  return {
    id: "client-1",
    company: "Acme Co",
    contactName: "Jane Smith",
    phone: "6619169468",
    email: "jane@acme.com",
    address: "", city: "", state: "", zip: "",
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
    cancellationReason: "",
    cancelledAt: null,
    createdAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

const projectTypes: ProjectType[] = [
  { id: "pt-podcast", name: "Podcast", lightweight: false },
  { id: "pt-headshot", name: "Headshot Photography", lightweight: false },
];

const locations: Location[] = [
  { id: "loc-1", name: "CBSR Nashville", address: "915 Rep John Lewis Way", city: "Nashville", state: "TN", zip: "37203", oneTimeUse: false },
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

// ============================================================
// Additional tests — per-project billing, formatPhone, edge cases
// ============================================================

describe("formatPhone", () => {
  it("formats 10-digit number", () => {
    expect(formatPhone("6619169468")).toBe("661-916-9468");
  });

  it("formats 11-digit number with leading 1", () => {
    expect(formatPhone("16619169468")).toBe("661-916-9468");
  });

  it("passes through already-formatted or short numbers", () => {
    expect(formatPhone("555-1234")).toBe("555-1234");
  });

  it("strips non-digit characters before formatting", () => {
    expect(formatPhone("(661) 916-9468")).toBe("661-916-9468");
  });
});

describe("buildLineItems per-project billing", () => {
  it("creates production + editing breakdown for per-project with crew and post", () => {
    const client = makeClient({ billingModel: "per_project", perProjectRate: 1000 });
    const projects = [makeProject({
      id: "p1", status: "completed",
      crew: [{ crewMemberId: "c1", role: "Main Videographer", hoursWorked: 3, payRatePerHour: 100 }],
      postProduction: [{ crewMemberId: "c2", role: "Video Editor", hoursWorked: 2, payRatePerHour: 80 }],
    })];
    const items = buildLineItems(projects, client, projectTypes, locations, "2026-04-01", "2026-04-30");
    expect(items.length).toBe(2);
    const prodItem = items.find(i => i.description.includes("Production"));
    const editItem = items.find(i => i.description.includes("Editing"));
    expect(prodItem).toBeDefined();
    expect(editItem).toBeDefined();
    // 60/40 split
    expect(prodItem!.amount).toBe(600); // 1000 * 0.6
    expect(editItem!.amount).toBe(400); // 1000 * 0.4
  });

  it("uses full amount for production when no post-production", () => {
    const client = makeClient({ billingModel: "per_project", perProjectRate: 800 });
    const projects = [makeProject({
      id: "p1", status: "completed",
      crew: [{ crewMemberId: "c1", role: "Videographer", hoursWorked: 4, payRatePerHour: 50 }],
      postProduction: [],
    })];
    const items = buildLineItems(projects, client, projectTypes, locations, "2026-04-01", "2026-04-30");
    expect(items.length).toBe(1);
    expect(items[0].amount).toBe(800);
    expect(items[0].description).toContain("Production");
  });

  it("creates single line item when no crew data at all", () => {
    const client = makeClient({ billingModel: "per_project", perProjectRate: 500 });
    const projects = [makeProject({ id: "p1", status: "completed", crew: [], postProduction: [] })];
    const items = buildLineItems(projects, client, projectTypes, locations, "2026-04-01", "2026-04-30");
    expect(items.length).toBe(1);
    expect(items[0].amount).toBe(500);
  });

  it("uses project-type-specific rate for per-project billing", () => {
    const client = makeClient({
      billingModel: "per_project",
      perProjectRate: 500,
      projectTypeRates: [{ projectTypeId: "pt-podcast", rate: 1200 }],
    });
    const projects = [makeProject({ id: "p1", status: "completed", crew: [], postProduction: [] })];
    const items = buildLineItems(projects, client, projectTypes, locations, "2026-04-01", "2026-04-30");
    expect(items[0].amount).toBe(1200);
  });
});

describe("buildLineItems hourly with billing multipliers", () => {
  it("applies role multipliers to hourly line items", () => {
    const client = makeClient({
      billingModel: "hourly",
      billingRatePerHour: 200,
      roleBillingMultipliers: [{ role: "2nd Videographer", multiplier: 0.5 }],
    });
    const projects = [makeProject({
      id: "p1", status: "completed",
      crew: [
        { crewMemberId: "c1", role: "Main Videographer", hoursWorked: 3, payRatePerHour: 100 },
        { crewMemberId: "c2", role: "2nd Videographer", hoursWorked: 6, payRatePerHour: 50 },
      ],
      postProduction: [],
    })];
    const items = buildLineItems(projects, client, projectTypes, locations, "2026-04-01", "2026-04-30");
    // crewBillable = 3*1.0 + 6*0.5 = 6 hours
    const prodItem = items.find(i => i.description.includes("Production"));
    expect(prodItem).toBeDefined();
    expect(prodItem!.quantity).toBe(6); // 3 + 3 (after multiplier)
    expect(prodItem!.amount).toBe(1200); // 6 * $200
  });
});

describe("buildInvoice edge cases", () => {
  it("produces zero total when no projects in range", () => {
    const invoice = buildInvoice(makeClient(), [], projectTypes, locations, [], "2026-04-01", "2026-04-30");
    expect(invoice.lineItems.length).toBe(0);
    expect(invoice.total).toBe(0);
    expect(invoice.subtotal).toBe(0);
  });

  it("subtotal equals sum of line item amounts", () => {
    const projects = [
      makeProject({ id: "p1", date: "2026-04-01", status: "completed" }),
      makeProject({ id: "p2", date: "2026-04-15", status: "filming_done" }),
    ];
    const invoice = buildInvoice(makeClient(), projects, projectTypes, locations, [], "2026-04-01", "2026-04-30");
    const expectedSubtotal = invoice.lineItems.reduce((s, li) => s + li.amount, 0);
    expect(invoice.subtotal).toBe(expectedSubtotal);
    expect(invoice.total).toBe(expectedSubtotal); // no tax
  });
});

describe("buildLineItems — cancellation exclusion", () => {
  it("excludes cancelled projects from line items entirely", () => {
    const projects = [
      makeProject({ id: "p-good", date: "2026-04-10", status: "completed", crew: [{ crewMemberId: "c1", role: "Main Videographer", hoursWorked: 4, payRatePerHour: 50 }] }),
      makeProject({ id: "p-cancelled", date: "2026-04-12", status: "cancelled", crew: [{ crewMemberId: "c1", role: "Main Videographer", hoursWorked: 6, payRatePerHour: 50 }] }),
    ];
    const items = buildLineItems(projects, makeClient(), projectTypes, locations, "2026-04-01", "2026-04-30");
    const ids = items.map(li => li.projectId);
    expect(ids).toContain("p-good");
    expect(ids).not.toContain("p-cancelled");
  });

  it("invoice total ignores cancelled projects even if hours are present", () => {
    const projects = [
      makeProject({ id: "p1", date: "2026-04-05", status: "completed", crew: [{ crewMemberId: "c1", role: "Main Videographer", hoursWorked: 2, payRatePerHour: 50 }], postProduction: [] }),
      makeProject({ id: "p2", date: "2026-04-12", status: "cancelled", crew: [{ crewMemberId: "c1", role: "Main Videographer", hoursWorked: 10, payRatePerHour: 50 }], postProduction: [] }),
    ];
    const inv = buildInvoice(makeClient({ billingRatePerHour: 200 }), projects, projectTypes, locations, [], "2026-04-01", "2026-04-30");
    expect(inv.subtotal).toBe(400); // only p1's 2 hrs * $200
  });

  it("excludes upcoming projects too (existing behavior preserved)", () => {
    const projects = [
      makeProject({ id: "p-upcoming", date: "2026-04-10", status: "upcoming" }),
      makeProject({ id: "p-completed", date: "2026-04-12", status: "completed" }),
    ];
    const items = buildLineItems(projects, makeClient(), projectTypes, locations, "2026-04-01", "2026-04-30");
    const ids = items.map(li => li.projectId);
    expect(ids).toContain("p-completed");
    expect(ids).not.toContain("p-upcoming");
  });
});
