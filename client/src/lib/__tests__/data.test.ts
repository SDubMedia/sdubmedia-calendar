// ============================================================
// Tests for billing math functions in data.ts
// ============================================================

import { describe, it, expect } from "vitest";
import {
  getProjectWorkedHours,
  getProjectCrewCost,
  getCrewMemberProjectPay,
  getProjectTravelCost,
  getRoleBillingMultiplier,
  getBillableHours,
  getProjectBillableHours,
  getProjectInvoiceAmount,
  getProjectPayerId,
  getProjectProductCost,
  getProjectServiceCost,
  getProjectProfit,
  getProjectServicePayByRole,
  getCrewMemberServicePay,
  calcHoursWorked,
} from "../data";
import type { Client, Project, ProjectCrewEntry } from "../types";

// ---- Factory helpers ----

function makeClient(overrides: Partial<Client> = {}): Client {
  return {
    id: "test-client",
    company: "Test Co",
    contactName: "John Doe",
    phone: "555-1234",
    email: "john@test.com",
    address: "", city: "", state: "", zip: "",
    billingModel: "hourly",
    billingRatePerHour: 200,
    perProjectRate: 500,
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
    id: "test-project",
    clientId: "test-client",
    projectTypeId: "pt-1",
    locationId: "loc-1",
    date: "2026-04-01",
    startTime: "10:00",
    endTime: "14:00",
    status: "editing_done",
    crew: [],
    postProduction: [],
    editTypes: [],
    notes: "",
    deliverableUrl: "",
    cancellationReason: "",
    cancelledAt: null,
    createdAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

// ---- getProjectWorkedHours ----

describe("getProjectWorkedHours", () => {
  it("returns zeros for empty crew and post", () => {
    const p = makeProject();
    const result = getProjectWorkedHours(p);
    expect(result).toEqual({ crewHours: 0, postHours: 0, totalHours: 0 });
  });

  it("sums crew hours", () => {
    const p = makeProject({
      crew: [
        { crewMemberId: "c1", role: "Videographer", hoursWorked: 3, payRatePerHour: 50 },
        { crewMemberId: "c2", role: "Photographer", hoursWorked: 2, payRatePerHour: 40 },
      ],
    });
    const result = getProjectWorkedHours(p);
    expect(result.crewHours).toBe(5);
    expect(result.totalHours).toBe(5);
  });

  it("sums post-production hours", () => {
    const p = makeProject({
      postProduction: [
        { crewMemberId: "c1", role: "Video Editor", hoursWorked: 4, payRatePerHour: 30 },
      ],
    });
    const result = getProjectWorkedHours(p);
    expect(result.postHours).toBe(4);
    expect(result.totalHours).toBe(4);
  });

  it("combines crew and post hours", () => {
    const p = makeProject({
      crew: [{ crewMemberId: "c1", role: "Videographer", hoursWorked: 2, payRatePerHour: 50 }],
      postProduction: [{ crewMemberId: "c1", role: "Video Editor", hoursWorked: 3, payRatePerHour: 30 }],
    });
    const result = getProjectWorkedHours(p);
    expect(result).toEqual({ crewHours: 2, postHours: 3, totalHours: 5 });
  });

  it("uses editorBilling.finalHours for Photo Editor role", () => {
    const p = makeProject({
      postProduction: [{ crewMemberId: "c1", role: "Photo Editor", hoursWorked: 10, payRatePerHour: 20 }],
      editorBilling: { imageCount: 50, perImageRate: 6, finalHours: 3.5 } as any,
    });
    const result = getProjectWorkedHours(p);
    expect(result.postHours).toBe(3.5); // uses finalHours, not hoursWorked
  });
});

// ---- getProjectCrewCost ----

describe("getProjectCrewCost", () => {
  it("returns 0 for empty crew", () => {
    expect(getProjectCrewCost(makeProject())).toBe(0);
  });

  it("calculates crew cost (hours × rate)", () => {
    const p = makeProject({
      crew: [
        { crewMemberId: "c1", role: "Videographer", hoursWorked: 3, payRatePerHour: 100 },
        { crewMemberId: "c2", role: "Photographer", hoursWorked: 2, payRatePerHour: 75 },
      ],
    });
    expect(getProjectCrewCost(p)).toBe(300 + 150);
  });

  it("excludes Travel role from crew cost", () => {
    const p = makeProject({
      crew: [
        { crewMemberId: "c1", role: "Videographer", hoursWorked: 3, payRatePerHour: 100 },
        { crewMemberId: "c1", role: "Travel", hoursWorked: 1, payRatePerHour: 50 },
      ],
    });
    expect(getProjectCrewCost(p)).toBe(300); // Travel excluded
  });

  it("uses editorBilling for Photo Editor cost", () => {
    const p = makeProject({
      postProduction: [{ crewMemberId: "c1", role: "Photo Editor", hoursWorked: 5, payRatePerHour: 20 }],
      editorBilling: { imageCount: 40, perImageRate: 6 } as any,
    });
    expect(getProjectCrewCost(p)).toBe(40 * 6); // imageCount × perImageRate
  });
});

// ---- getCrewMemberProjectPay ----

describe("getCrewMemberProjectPay", () => {
  it("returns 0 when the member isn't on the project", () => {
    const p = makeProject({
      crew: [{ crewMemberId: "c1", role: "Videographer", hoursWorked: 3, payRatePerHour: 100 }],
    });
    expect(getCrewMemberProjectPay(p, "c2")).toBe(0);
  });

  it("sums only that member's crew + post entries (hourly)", () => {
    const p = makeProject({
      crew: [
        { crewMemberId: "c1", role: "Main Videographer", hoursWorked: 3, payRatePerHour: 100 },
        { crewMemberId: "c2", role: "2nd Videographer", hoursWorked: 2, payRatePerHour: 50 },
      ],
      postProduction: [
        { crewMemberId: "c1", role: "Video Editor", hoursWorked: 4, payRatePerHour: 25 },
      ],
    });
    expect(getCrewMemberProjectPay(p, "c1")).toBe(300 + 100); // 3×100 + 4×25
    expect(getCrewMemberProjectPay(p, "c2")).toBe(100);       // 2×50
  });

  it("honors per-entry flat pay (ignores hours × rate)", () => {
    const p = makeProject({
      crew: [
        { crewMemberId: "c2", role: "2nd Videographer", hoursWorked: 200, payRatePerHour: 50, payType: "flat", flatAmount: 200 },
      ],
    });
    expect(getCrewMemberProjectPay(p, "c2")).toBe(200); // flat, NOT 200×50
  });

  it("uses editorBilling for a Photo Editor", () => {
    const p = makeProject({
      postProduction: [{ crewMemberId: "c1", role: "Photo Editor", hoursWorked: 5, payRatePerHour: 20 }],
      editorBilling: { imageCount: 40, perImageRate: 6 } as any,
    });
    expect(getCrewMemberProjectPay(p, "c1")).toBe(240); // 40 × 6
  });

  it("excludes Travel entries", () => {
    const p = makeProject({
      crew: [
        { crewMemberId: "c1", role: "Main Videographer", hoursWorked: 3, payRatePerHour: 100 },
        { crewMemberId: "c1", role: "Travel", hoursWorked: 1, payRatePerHour: 50 },
      ],
    });
    expect(getCrewMemberProjectPay(p, "c1")).toBe(300);
  });

  it("returns 0 for cancelled projects", () => {
    const p = makeProject({
      status: "cancelled",
      crew: [{ crewMemberId: "c1", role: "Main Videographer", hoursWorked: 3, payRatePerHour: 100 }],
    });
    expect(getCrewMemberProjectPay(p, "c1")).toBe(0);
  });
});

// ---- Real-estate flat per-piece crew payouts (auto by role) ----

describe("flat per-piece crew payouts", () => {
  const reServices = [
    { serviceId: "photo", variantId: null, label: "RE — Photography", price: 200, cost: 70, crewRole: "shoot" as const },
    { serviceId: "vshoot", variantId: null, label: "RE — Video shoot", price: 200, cost: 70, crewRole: "shoot" as const },
    { serviceId: "vedit", variantId: null, label: "RE — Video edit", price: 150, cost: 70, crewRole: "edit" as const },
  ];

  it("groups piece payouts by role", () => {
    const p = makeProject({ services: reServices });
    expect(getProjectServicePayByRole(p)).toEqual({ shoot: 140, edit: 70 });
  });

  it("pays the shooter the shoot pieces and the editor the edit pieces", () => {
    const p = makeProject({
      services: reServices,
      crew: [{ crewMemberId: "shooter", role: "Photographer", hoursWorked: 0, payRatePerHour: 0 }],
      postProduction: [{ crewMemberId: "editor", role: "Video Editor", hoursWorked: 0, payRatePerHour: 0 }],
    });
    expect(getCrewMemberServicePay(p, "shooter")).toBe(140); // photo $70 + video shoot $70
    expect(getCrewMemberServicePay(p, "editor")).toBe(70);   // video edit $70
  });

  it("splits a role's payout evenly across multiple assigned people", () => {
    const p = makeProject({
      services: reServices,
      crew: [
        { crewMemberId: "a", role: "Photographer", hoursWorked: 0, payRatePerHour: 0 },
        { crewMemberId: "b", role: "Photographer", hoursWorked: 0, payRatePerHour: 0 },
      ],
    });
    expect(getCrewMemberServicePay(p, "a")).toBe(70); // 140 / 2 shooters
    expect(getCrewMemberServicePay(p, "b")).toBe(70);
  });

  it("project pay reads the crew row once the flat rate is auto-filled", () => {
    // The flat service rate is auto-filled into the crew row in the dialog;
    // getCrewMemberProjectPay then pays whatever the row says.
    const p = makeProject({
      services: reServices,
      crew: [{ crewMemberId: "shooter", role: "Photographer", hoursWorked: 0, payRatePerHour: 0, payType: "flat", flatAmount: 140 }],
    });
    expect(getCrewMemberProjectPay(p, "shooter")).toBe(140);
  });

  it("leaves non-real-estate (untagged) shoots on the hourly model", () => {
    const p = makeProject({
      services: [{ serviceId: "x", variantId: null, label: "Untagged", price: 100, cost: 40 }],
      crew: [{ crewMemberId: "c1", role: "Videographer", hoursWorked: 3, payRatePerHour: 100 }],
    });
    expect(getCrewMemberServicePay(p, "c1")).toBe(0);     // no crewRole pieces
    expect(getCrewMemberProjectPay(p, "c1")).toBe(300);   // 3×100, unchanged
  });

  it("returns 0 for cancelled projects", () => {
    const p = makeProject({
      status: "cancelled",
      services: reServices,
      crew: [{ crewMemberId: "shooter", role: "Photographer", hoursWorked: 0, payRatePerHour: 0 }],
    });
    expect(getCrewMemberProjectPay(p, "shooter")).toBe(0);
  });
});

// ---- getProjectTravelCost ----

describe("getProjectTravelCost", () => {
  it("returns 0 when no Travel entries", () => {
    const p = makeProject({
      crew: [{ crewMemberId: "c1", role: "Videographer", hoursWorked: 3, payRatePerHour: 100 }],
    });
    expect(getProjectTravelCost(p)).toBe(0);
  });

  it("sums Travel entries only", () => {
    const p = makeProject({
      crew: [
        { crewMemberId: "c1", role: "Videographer", hoursWorked: 3, payRatePerHour: 100 },
        { crewMemberId: "c1", role: "Travel", hoursWorked: 2, payRatePerHour: 30 },
      ],
    });
    expect(getProjectTravelCost(p)).toBe(60);
  });
});

// ---- getRoleBillingMultiplier ----

describe("getRoleBillingMultiplier", () => {
  it("returns 1.0 when no multipliers set", () => {
    expect(getRoleBillingMultiplier(makeClient(), "Videographer")).toBe(1.0);
  });

  it("returns configured multiplier for a role", () => {
    const client = makeClient({
      roleBillingMultipliers: [
        { role: "2nd Videographer", multiplier: 0.5 },
        { role: "Videographer", multiplier: 1.0 },
      ],
    });
    expect(getRoleBillingMultiplier(client, "2nd Videographer")).toBe(0.5);
    expect(getRoleBillingMultiplier(client, "Videographer")).toBe(1.0);
  });

  it("returns 1.0 for unmatched role", () => {
    const client = makeClient({
      roleBillingMultipliers: [{ role: "Videographer", multiplier: 1.5 }],
    });
    expect(getRoleBillingMultiplier(client, "Photographer")).toBe(1.0);
  });
});

// ---- getBillableHours ----

describe("getBillableHours", () => {
  it("applies multiplier to hours", () => {
    const client = makeClient({
      roleBillingMultipliers: [{ role: "2nd Videographer", multiplier: 0.5 }],
    });
    const entry: ProjectCrewEntry = { crewMemberId: "c1", role: "2nd Videographer", hoursWorked: 6, payRatePerHour: 50 };
    expect(getBillableHours(entry, client)).toBe(3); // 6 * 0.5
  });

  it("defaults to 1.0 multiplier", () => {
    const entry: ProjectCrewEntry = { crewMemberId: "c1", role: "Videographer", hoursWorked: 4, payRatePerHour: 50 };
    expect(getBillableHours(entry, makeClient())).toBe(4);
  });
});

// ---- getProjectBillableHours ----

describe("getProjectBillableHours", () => {
  it("returns zeros for empty project", () => {
    const result = getProjectBillableHours(makeProject(), makeClient());
    expect(result).toEqual({ crewBillable: 0, postBillable: 0, totalBillable: 0 });
  });

  it("sums billable hours with multipliers", () => {
    const client = makeClient({
      roleBillingMultipliers: [{ role: "Crew", multiplier: 0.5 }],
    });
    const p = makeProject({
      crew: [
        { crewMemberId: "c1", role: "Main Videographer", hoursWorked: 3, payRatePerHour: 0 },
        { crewMemberId: "c2", role: "Crew", hoursWorked: 3, payRatePerHour: 0 },
      ],
      postProduction: [{ crewMemberId: "c3", role: "Video Editor", hoursWorked: 2, payRatePerHour: 0 }],
    });
    const result = getProjectBillableHours(p, client);
    expect(result.crewBillable).toBe(3 + 1.5); // 3×1.0 + 3×0.5
    expect(result.postBillable).toBe(2);
    expect(result.totalBillable).toBe(6.5);
  });
});

// ---- getProjectInvoiceAmount ----

describe("getProjectInvoiceAmount", () => {
  it("calculates hourly billing: billable hours × rate", () => {
    const client = makeClient({ billingModel: "hourly", billingRatePerHour: 200 });
    const p = makeProject({
      crew: [{ crewMemberId: "c1", role: "Videographer", hoursWorked: 3, payRatePerHour: 50 }],
      postProduction: [{ crewMemberId: "c1", role: "Editor", hoursWorked: 2, payRatePerHour: 30 }],
    });
    const amount = getProjectInvoiceAmount(p, client);
    expect(amount).toBe(5 * 200); // 5 total billable hours × $200
  });

  it("uses per-project rate from client default", () => {
    const client = makeClient({ billingModel: "per_project", perProjectRate: 500 });
    const amount = getProjectInvoiceAmount(makeProject(), client);
    expect(amount).toBe(500);
  });

  it("uses project-type-specific rate over default", () => {
    const client = makeClient({
      billingModel: "per_project",
      perProjectRate: 500,
      projectTypeRates: [{ projectTypeId: "pt-1", rate: 750 }],
    });
    const amount = getProjectInvoiceAmount(makeProject({ projectTypeId: "pt-1" }), client);
    expect(amount).toBe(750);
  });

  it("uses project-level override over type rate", () => {
    const client = makeClient({
      billingModel: "per_project",
      perProjectRate: 500,
      projectTypeRates: [{ projectTypeId: "pt-1", rate: 750 }],
    });
    const p = makeProject({ projectTypeId: "pt-1", projectRate: 1000 });
    expect(getProjectInvoiceAmount(p, client)).toBe(1000);
  });
});

// ---- calcHoursWorked ----

describe("calcHoursWorked", () => {
  it("filters by client and month", () => {
    const projects = [
      makeProject({ id: "p1", clientId: "c1", date: "2026-04-05", crew: [{ crewMemberId: "x", role: "V", hoursWorked: 3, payRatePerHour: 0 }] }),
      makeProject({ id: "p2", clientId: "c1", date: "2026-04-15", crew: [{ crewMemberId: "x", role: "V", hoursWorked: 2, payRatePerHour: 0 }] }),
      makeProject({ id: "p3", clientId: "c2", date: "2026-04-05", crew: [{ crewMemberId: "x", role: "V", hoursWorked: 5, payRatePerHour: 0 }] }),
      makeProject({ id: "p4", clientId: "c1", date: "2026-03-15", crew: [{ crewMemberId: "x", role: "V", hoursWorked: 4, payRatePerHour: 0 }] }),
    ];
    expect(calcHoursWorked(projects, "c1", 2026, 3)).toBe(5); // April = month 3 (0-indexed)
  });

  it("returns 0 for no matching projects", () => {
    expect(calcHoursWorked([], "c1", 2026, 3)).toBe(0);
  });
});

// ============================================================
// Additional edge case tests
// ============================================================

describe("getProjectWorkedHours edge cases", () => {
  it("handles null crew/postProduction arrays", () => {
    const p = makeProject({ crew: null as any, postProduction: null as any });
    const result = getProjectWorkedHours(p);
    expect(result).toEqual({ crewHours: 0, postHours: 0, totalHours: 0 });
  });

  it("handles editorBilling.finalHours = 0 (counts as 0, not fallthrough)", () => {
    const p = makeProject({
      postProduction: [{ crewMemberId: "c1", role: "Photo Editor", hoursWorked: 10, payRatePerHour: 20 }],
      editorBilling: { imageCount: 50, perImageRate: 6, finalHours: 0 } as any,
    });
    const result = getProjectWorkedHours(p);
    expect(result.postHours).toBe(0);
  });

  it("handles mixed Photo Editor + Video Editor in post-production", () => {
    const p = makeProject({
      postProduction: [
        { crewMemberId: "c1", role: "Photo Editor", hoursWorked: 10, payRatePerHour: 20 },
        { crewMemberId: "c2", role: "Video Editor", hoursWorked: 3, payRatePerHour: 30 },
      ],
      editorBilling: { imageCount: 50, perImageRate: 6, finalHours: 2 } as any,
    });
    const result = getProjectWorkedHours(p);
    expect(result.postHours).toBe(5); // 2 (finalHours) + 3 (video editor)
  });
});

describe("getProjectCrewCost edge cases", () => {
  it("calculates regular post-production cost", () => {
    const p = makeProject({
      postProduction: [{ crewMemberId: "c1", role: "Video Editor", hoursWorked: 4, payRatePerHour: 30 }],
    });
    expect(getProjectCrewCost(p)).toBe(120);
  });

  it("combines crew + post-production costs", () => {
    const p = makeProject({
      crew: [{ crewMemberId: "c1", role: "Videographer", hoursWorked: 2, payRatePerHour: 100 }],
      postProduction: [{ crewMemberId: "c2", role: "Video Editor", hoursWorked: 3, payRatePerHour: 30 }],
    });
    expect(getProjectCrewCost(p)).toBe(290);
  });

  it("defaults editorBilling.perImageRate to 6", () => {
    const p = makeProject({
      postProduction: [{ crewMemberId: "c1", role: "Photo Editor", hoursWorked: 5, payRatePerHour: 20 }],
      editorBilling: { imageCount: 10 } as any,
    });
    expect(getProjectCrewCost(p)).toBe(60);
  });
});

describe("getProjectBillableHours edge cases", () => {
  it("uses editorBilling.finalHours and excludes Photo Editor from normal calc", () => {
    const client = makeClient();
    const p = makeProject({
      crew: [{ crewMemberId: "c1", role: "Videographer", hoursWorked: 3, payRatePerHour: 0 }],
      postProduction: [
        { crewMemberId: "c2", role: "Photo Editor", hoursWorked: 10, payRatePerHour: 20 },
        { crewMemberId: "c3", role: "Video Editor", hoursWorked: 2, payRatePerHour: 0 },
      ],
      editorBilling: { imageCount: 50, perImageRate: 6, finalHours: 1.5 } as any,
    });
    const result = getProjectBillableHours(p, client);
    expect(result.crewBillable).toBe(3);
    expect(result.postBillable).toBe(3.5); // 2 (video editor) + 1.5 (editorBilling)
    expect(result.totalBillable).toBe(6.5);
  });

  it("handles editorBilling.finalHours = 0", () => {
    const client = makeClient();
    const p = makeProject({
      postProduction: [{ crewMemberId: "c1", role: "Photo Editor", hoursWorked: 10, payRatePerHour: 20 }],
      editorBilling: { imageCount: 0, perImageRate: 6, finalHours: 0 } as any,
    });
    const result = getProjectBillableHours(p, client);
    expect(result.postBillable).toBe(0);
  });

  it("applies multipliers to post-production entries", () => {
    const client = makeClient({
      roleBillingMultipliers: [{ role: "Video Editor", multiplier: 0.75 }],
    });
    const p = makeProject({
      postProduction: [{ crewMemberId: "c1", role: "Video Editor", hoursWorked: 4, payRatePerHour: 0 }],
    });
    const result = getProjectBillableHours(p, client);
    expect(result.postBillable).toBe(3);
  });
});

describe("getProjectInvoiceAmount edge cases", () => {
  it("returns 0 for hourly billing with 0 rate", () => {
    const client = makeClient({ billingModel: "hourly", billingRatePerHour: 0 });
    const p = makeProject({
      crew: [{ crewMemberId: "c1", role: "Videographer", hoursWorked: 3, payRatePerHour: 50 }],
    });
    expect(getProjectInvoiceAmount(p, client)).toBe(0);
  });

  it("returns 0 for per-project with no rates configured", () => {
    const client = makeClient({ billingModel: "per_project", perProjectRate: 0, projectTypeRates: [] });
    expect(getProjectInvoiceAmount(makeProject({ projectRate: undefined }), client)).toBe(0);
  });

  it("applies role billing multipliers in hourly mode", () => {
    const client = makeClient({
      billingModel: "hourly",
      billingRatePerHour: 100,
      roleBillingMultipliers: [{ role: "2nd Videographer", multiplier: 0.5 }],
    });
    const p = makeProject({
      crew: [
        { crewMemberId: "c1", role: "Videographer", hoursWorked: 2, payRatePerHour: 0 },
        { crewMemberId: "c2", role: "2nd Videographer", hoursWorked: 4, payRatePerHour: 0 },
      ],
    });
    expect(getProjectInvoiceAmount(p, client)).toBe(400); // (2*1.0 + 4*0.5) * $100
  });
});

// ---- Cancelled-project exclusions ----

describe("cancellation: getProjectInvoiceAmount", () => {
  it("returns 0 for cancelled hourly project even with billable hours", () => {
    const client = makeClient({ billingRatePerHour: 200 });
    const p = makeProject({
      status: "cancelled",
      crew: [{ crewMemberId: "c1", role: "Videographer", hoursWorked: 5, payRatePerHour: 50 }],
    });
    expect(getProjectInvoiceAmount(p, client)).toBe(0);
  });

  it("returns 0 for cancelled per-project flat-rate project", () => {
    const client = makeClient({ billingModel: "per_project", perProjectRate: 1500 });
    const p = makeProject({ status: "cancelled" });
    expect(getProjectInvoiceAmount(p, client)).toBe(0);
  });

  it("returns 0 for cancelled project with project-level billing override", () => {
    const client = makeClient({ billingModel: "per_project", perProjectRate: 1500 });
    const p = makeProject({ status: "cancelled", billingRate: 999 });
    expect(getProjectInvoiceAmount(p, client)).toBe(0);
  });
});

describe("cancellation: getProjectBillableHours", () => {
  it("returns all zeros for cancelled project even with crew", () => {
    const client = makeClient({ billingRatePerHour: 200 });
    const p = makeProject({
      status: "cancelled",
      crew: [{ crewMemberId: "c1", role: "Videographer", hoursWorked: 4, payRatePerHour: 50 }],
      postProduction: [{ crewMemberId: "c2", role: "Editor", hoursWorked: 2, payRatePerHour: 40 }],
    });
    expect(getProjectBillableHours(p, client)).toEqual({
      crewBillable: 0, postBillable: 0, totalBillable: 0,
    });
  });

  it("non-cancelled project still bills normally", () => {
    const client = makeClient({ billingRatePerHour: 200 });
    const p = makeProject({
      status: "editing_done",
      crew: [{ crewMemberId: "c1", role: "Videographer", hoursWorked: 4, payRatePerHour: 50 }],
    });
    const result = getProjectBillableHours(p, client);
    expect(result.totalBillable).toBeGreaterThan(0);
  });
});

// ---- Broker billing: payer resolution, product cost, profit ----

describe("getProjectPayerId", () => {
  const broker = makeClient({ id: "broker1", company: "Realty ONE", clientType: "broker" });
  const agent = makeClient({ id: "agent1", company: "Sarah", clientType: "agent", brokerId: "broker1" });
  const standard = makeClient({ id: "std1", company: "Acme", clientType: "standard" });
  const byId: Record<string, Client> = { broker1: broker, agent1: agent, std1: standard };

  it("standard client → bills itself", () => {
    expect(getProjectPayerId(makeProject({ clientId: "std1" }), byId)).toBe("std1");
  });

  it("agent → bills up to their broker", () => {
    expect(getProjectPayerId(makeProject({ clientId: "agent1" }), byId)).toBe("broker1");
  });

  it("explicit billToId overrides everything", () => {
    expect(getProjectPayerId(makeProject({ clientId: "agent1", billToId: "std1" }), byId)).toBe("std1");
  });

  it("agent with no broker set falls back to itself", () => {
    const orphan = makeClient({ id: "agent2", clientType: "agent", brokerId: null });
    expect(getProjectPayerId(makeProject({ clientId: "agent2" }), { agent2: orphan })).toBe("agent2");
  });
});

describe("getProjectProductCost", () => {
  it("sums product costs", () => {
    const p = makeProject({ products: [{ productId: "f", name: "Fotello", cost: 25 }, { productId: "x", name: "X", cost: 10 }] });
    expect(getProjectProductCost(p)).toBe(35);
  });
  it("is 0 with no products", () => {
    expect(getProjectProductCost(makeProject())).toBe(0);
  });
});

describe("getProjectServiceCost", () => {
  it("sums the cost on each selected service piece", () => {
    const p = makeProject({ services: [
      { serviceId: "a", variantId: null, label: "Photos", price: 200, cost: 70 },
      { serviceId: "b", variantId: null, label: "Video", price: 500, cost: 150 },
    ] });
    expect(getProjectServiceCost(p)).toBe(220);
  });
  it("is 0 when pieces carry no cost", () => {
    const p = makeProject({ services: [{ serviceId: "a", variantId: null, label: "Photos", price: 200 }] });
    expect(getProjectServiceCost(p)).toBe(0);
  });
});

describe("getProjectProfit", () => {
  it("profit = revenue − staff pay − product cost (crew-based)", () => {
    const client = makeClient({ billingModel: "per_project", perProjectRate: 250 });
    const p = makeProject({
      status: "editing_done",
      crew: [{ crewMemberId: "c1", role: "Photographer", hoursWorked: 0, payRatePerHour: 0, payType: "flat", flatAmount: 75 }],
      products: [{ productId: "f", name: "Fotello", cost: 25 }],
    });
    // 250 revenue − 75 staff − 25 product = 150
    expect(getProjectProfit(p, client)).toBe(150);
  });

  it("uses the crew row for labor, not the service-piece cost", () => {
    const client = makeClient();
    const p = makeProject({
      status: "editing_done",
      // Crew is paid the (auto-filled) flat rate; the piece's `cost` is only the
      // default SOURCE for that rate and is not subtracted again.
      crew: [{ crewMemberId: "c1", role: "Photographer", hoursWorked: 0, payRatePerHour: 0, payType: "flat", flatAmount: 70 }],
      services: [{ serviceId: "a", variantId: null, label: "Photos", price: 200, cost: 70 }],
      products: [{ productId: "f", name: "Fotello", cost: 30 }],
    });
    // revenue − 70 crew − 30 Fotello
    expect(getProjectProfit(p, client)).toBe(getProjectInvoiceAmount(p, client) - 70 - 30);
  });
});
