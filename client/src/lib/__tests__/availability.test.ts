import { describe, it, expect } from "vitest";
import { addDaysIso, weekdayOf, getOpenDays, slotTimes } from "../data";
import type { Availability } from "../types";

function avail(partial: Partial<Availability>): Availability {
  return {
    id: Math.random().toString(36).slice(2),
    orgId: "o",
    crewMemberId: "crew1",
    recurring: true,
    weekday: 1,
    specificDate: null,
    startTime: "09:00",
    endTime: "17:00",
    createdAt: "2026-01-01",
    ...partial,
  };
}

describe("addDaysIso / weekdayOf", () => {
  it("adds days across a month boundary", () => {
    expect(addDaysIso("2026-06-29", 3)).toBe("2026-07-02");
  });
  it("weekday is stable for the same date", () => {
    const wd = weekdayOf("2026-06-19");
    expect(wd).toBeGreaterThanOrEqual(0);
    expect(wd).toBeLessThanOrEqual(6);
    expect(weekdayOf("2026-06-26")).toBe(wd); // 7 days later = same weekday
  });
});

describe("slotTimes", () => {
  it("returns half-hour starts within the window, excluding the end", () => {
    expect(slotTimes("09:00", "11:00")).toEqual(["09:00", "09:30", "10:00", "10:30"]);
  });
  it("is empty when end <= start", () => {
    expect(slotTimes("10:00", "10:00")).toEqual([]);
  });
});

describe("getOpenDays", () => {
  const from = "2026-06-19";
  const wd = weekdayOf(from);

  it("includes a recurring block matching the weekday", () => {
    const days = getOpenDays([avail({ recurring: true, weekday: wd })], { fromDate: from, days: 1 });
    expect(days).toHaveLength(1);
    expect(days[0].date).toBe(from);
    expect(days[0].windows[0]).toMatchObject({ start: "09:00", end: "17:00", crewMemberIds: ["crew1"] });
  });

  it("excludes a recurring block on a different weekday", () => {
    const days = getOpenDays([avail({ recurring: true, weekday: (wd + 1) % 7 })], { fromDate: from, days: 1 });
    expect(days).toHaveLength(0);
  });

  it("includes a one-off block on its exact date only", () => {
    const blocks = [avail({ recurring: false, weekday: null, specificDate: addDaysIso(from, 2) })];
    const days = getOpenDays(blocks, { fromDate: from, days: 5 });
    expect(days).toHaveLength(1);
    expect(days[0].date).toBe(addDaysIso(from, 2));
  });

  it("filters to a single shooter when crewMemberId is given", () => {
    const blocks = [
      avail({ crewMemberId: "crew1", weekday: wd }),
      avail({ crewMemberId: "crew2", weekday: wd, startTime: "10:00", endTime: "12:00" }),
    ];
    const days = getOpenDays(blocks, { fromDate: from, days: 1, crewMemberId: "crew2" });
    expect(days).toHaveLength(1);
    expect(days[0].windows).toHaveLength(1);
    expect(days[0].windows[0].crewMemberIds).toEqual(["crew2"]);
  });

  it("merges identical windows from two shooters into one with both ids", () => {
    const blocks = [
      avail({ crewMemberId: "crew1", weekday: wd }),
      avail({ crewMemberId: "crew2", weekday: wd }),
    ];
    const days = getOpenDays(blocks, { fromDate: from, days: 1 });
    expect(days[0].windows).toHaveLength(1);
    expect(days[0].windows[0].crewMemberIds.sort()).toEqual(["crew1", "crew2"]);
  });
});
