import { describe, it, expect } from "vitest";
import {
  isMultiDay, projectDays, projectOccursOn, projectFirstDate, projectLastDate,
  dayCrewFor, dayIndexInfo, normalizeDaySchedules,
} from "../projectDays";
import type { ProjectCrewEntry, ProjectDaySchedule } from "../types";

const crew = (id: string): ProjectCrewEntry =>
  ({ crewMemberId: id, role: "Photographer", hoursWorked: 4, payRatePerHour: 50 });

const single = { date: "2026-10-09", startTime: "08:30", endTime: "17:00", daySchedules: [] as ProjectDaySchedule[] };
const multi = {
  date: "2026-10-09", startTime: "08:30", endTime: "17:00",
  daySchedules: [
    { date: "2026-10-10", startTime: "09:00", endTime: "14:00", crewMemberIds: ["cm_b"] },
    { date: "2026-10-09", startTime: "08:30", endTime: "17:00" },
  ],
  crew: [crew("cm_a"), crew("cm_b")],
};

describe("projectDays basics", () => {
  it("single-day fallback yields the project's own date and times", () => {
    expect(isMultiDay(single)).toBe(false);
    expect(projectDays(single)).toEqual([{ date: "2026-10-09", startTime: "08:30", endTime: "17:00" }]);
  });

  it("multi-day yields sorted rows and first/last dates", () => {
    expect(isMultiDay(multi)).toBe(true);
    expect(projectDays(multi).map(d => d.date)).toEqual(["2026-10-09", "2026-10-10"]);
    expect(projectFirstDate(multi)).toBe("2026-10-09");
    expect(projectLastDate(multi)).toBe("2026-10-10");
  });

  it("occurrence returns the day row with its own times, or null", () => {
    expect(projectOccursOn(multi, "2026-10-10")?.startTime).toBe("09:00");
    expect(projectOccursOn(multi, "2026-10-11")).toBeNull();
    expect(projectOccursOn(single, "2026-10-09")?.endTime).toBe("17:00");
  });

  it("dayIndexInfo powers Day n/N chips", () => {
    expect(dayIndexInfo(multi, "2026-10-10")).toEqual({ index: 2, count: 2 });
    expect(dayIndexInfo(multi, "2026-10-08")).toBeNull();
  });
});

describe("dayCrewFor", () => {
  it("no subset means the whole roster works the day", () => {
    const day = projectOccursOn(multi, "2026-10-09")!;
    expect(dayCrewFor(multi, day).map(c => c.crewMemberId)).toEqual(["cm_a", "cm_b"]);
  });

  it("a subset filters the roster", () => {
    const day = projectOccursOn(multi, "2026-10-10")!;
    expect(dayCrewFor(multi, day).map(c => c.crewMemberId)).toEqual(["cm_b"]);
  });

  it("stale ids drop out instead of crashing", () => {
    const p = { ...multi, crew: [crew("cm_a")] };
    const day = projectOccursOn(p, "2026-10-10")!;
    expect(dayCrewFor(p, day)).toEqual([]);
  });
});

describe("normalizeDaySchedules", () => {
  it("sorts, dedupes dates (first wins), keeps >= 2 rows", () => {
    const out = normalizeDaySchedules([
      { date: "2026-10-10", startTime: "09:00", endTime: "14:00" },
      { date: "2026-10-09", startTime: "08:30", endTime: "17:00" },
      { date: "2026-10-09", startTime: "99:99", endTime: "99:99" },
    ]);
    expect(out.map(d => d.date)).toEqual(["2026-10-09", "2026-10-10"]);
    expect(out[0].startTime).toBe("08:30");
  });

  it("collapses fewer than 2 surviving rows to empty (single-day semantics)", () => {
    expect(normalizeDaySchedules([{ date: "2026-10-09", startTime: "08:30", endTime: "17:00" }])).toEqual([]);
    expect(normalizeDaySchedules([{ date: "", startTime: "", endTime: "" } as ProjectDaySchedule])).toEqual([]);
    expect(normalizeDaySchedules(undefined)).toEqual([]);
  });

  it("prunes crewMemberIds to the roster; full-roster or emptied subsets store as undefined", () => {
    const out = normalizeDaySchedules([
      { date: "2026-10-09", startTime: "", endTime: "", crewMemberIds: ["cm_a", "cm_gone"] },
      { date: "2026-10-10", startTime: "", endTime: "", crewMemberIds: ["cm_gone"] },
      { date: "2026-10-11", startTime: "", endTime: "", crewMemberIds: ["cm_a", "cm_b"] },
    ], ["cm_a", "cm_b"]);
    expect(out[0].crewMemberIds).toEqual(["cm_a"]);
    expect(out[1].crewMemberIds).toBeUndefined(); // emptied by pruning = whole crew
    expect(out[2].crewMemberIds).toBeUndefined(); // equals full roster = whole crew
  });
});
