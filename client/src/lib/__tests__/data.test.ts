// ============================================================
// Tests for billing math functions in data.ts
// ============================================================

import { describe, it, expect } from "vitest";
import {
  getProjectWorkedHours,
  getProjectCrewCost,
  getProjectTravelCost,
  getRoleBillingMultiplier,
  getBillableHours,
  getProjectBillableHours,
  getProjectInvoiceAmount,
  calcHoursWorked,
} from "../data";
import type { Client, Project, ProjectCrewEntry, ProjectPostEntry } from "../types";

// ---- Factory helpers ----

function makeClient(overrides: Partial<Client> = {}): Client {
  return {
    id: "test-client",
    company: "Test Co",
    contactName: "John Doe",
    phone: "555-1234",
    email: "john@test.com",
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
    status: "completed",
    crew: [],
    postProduction: [],
    editTypes: [],
    notes: "",
    deliverableUrl: "",
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
