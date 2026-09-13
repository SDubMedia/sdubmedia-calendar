import { describe, it, expect } from "vitest";
import { getProjectCrewRoundTripMiles } from "../data";
import type { CrewLocationDistance, CrewMember, Project } from "../types";

const geoff = { id: "crew_geoff", name: "Geoff", homeBases: [{ id: "primary", label: "TN", isPrimary: true }, { id: "ca", label: "CA", type: "travel" }] } as unknown as CrewMember;
const dist = (homeBaseId: string, locationId: string, distanceMiles: number) =>
  ({ crewMemberId: "crew_geoff", homeBaseId, locationId, distanceMiles }) as unknown as CrewLocationDistance;
const project = (overrides: Partial<Project> = {}) =>
  ({ id: "p1", locationId: "loc1", crew: [{ crewMemberId: "crew_geoff", role: "Photographer", hoursWorked: 2, payRatePerHour: 0 }], ...overrides }) as unknown as Project;

describe("getProjectCrewRoundTripMiles", () => {
  it("picks the closest base when the entry doesn't name one", () => {
    expect(getProjectCrewRoundTripMiles(project(), "crew_geoff", [geoff], [dist("ca", "loc1", 2016.6), dist("primary", "loc1", 23)])).toBe(46);
  });
  it("honours the base chosen on the crew entry", () => {
    const p = project({ crew: [{ crewMemberId: "crew_geoff", role: "Photographer", hoursWorked: 2, payRatePerHour: 0, homeBaseId: "ca" }] } as unknown as Partial<Project>);
    expect(getProjectCrewRoundTripMiles(p, "crew_geoff", [geoff], [dist("ca", "loc1", 100), dist("primary", "loc1", 23)])).toBe(200);
  });
  it("a manual round-trip override wins", () => {
    const p = project({ crew: [{ crewMemberId: "crew_geoff", role: "Photographer", hoursWorked: 2, payRatePerHour: 0, roundTripMiles: 12.3 }] } as unknown as Partial<Project>);
    expect(getProjectCrewRoundTripMiles(p, "crew_geoff", [geoff], [dist("primary", "loc1", 23)])).toBe(12.3);
  });
  it("is 0 with no location or no cached distance", () => {
    expect(getProjectCrewRoundTripMiles(project({ locationId: null } as unknown as Partial<Project>), "crew_geoff", [geoff], [dist("primary", "loc1", 23)])).toBe(0);
    expect(getProjectCrewRoundTripMiles(project(), "crew_geoff", [geoff], [])).toBe(0);
  });
});
