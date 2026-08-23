// Pins the server-side day expansion used by the .ics feed (same pattern as
// calendarFeedScope.test.ts importing directly from api/).
import { describe, it, expect } from "vitest";
import { projectDaysRow, dayHasCrewMember } from "../../../../api/_projectDays";

describe("projectDaysRow", () => {
  it("single-day rows fall back to the project's own date and times", () => {
    expect(projectDaysRow({ date: "2026-10-09", start_time: "08:30", end_time: "17:00", day_schedules: [] }))
      .toEqual([{ date: "2026-10-09", start_time: "08:30", end_time: "17:00" }]);
  });

  it("multi-day rows expand sorted with camelCase times mapped", () => {
    const days = projectDaysRow({
      date: "2026-10-09", start_time: "08:30", end_time: "17:00",
      day_schedules: [
        { date: "2026-10-10", startTime: "09:00", endTime: "14:00", crewMemberIds: ["cm_b"] },
        { date: "2026-10-09", startTime: "08:30", endTime: "17:00" },
      ],
    });
    expect(days.map(d => d.date)).toEqual(["2026-10-09", "2026-10-10"]);
    expect(days[1].start_time).toBe("09:00");
    expect(days[1].crewMemberIds).toEqual(["cm_b"]);
  });

  it("malformed day_schedules degrade to the single-day fallback, never throw", () => {
    expect(projectDaysRow({ date: "2026-10-09", start_time: "", end_time: "", day_schedules: "junk" })[0].date).toBe("2026-10-09");
    expect(projectDaysRow({ date: "2026-10-09", start_time: "", end_time: "", day_schedules: [{ nope: 1 }] })[0].date).toBe("2026-10-09");
  });
});

describe("dayHasCrewMember (staff feed day filtering)", () => {
  it("a day without a subset includes everyone on the project", () => {
    expect(dayHasCrewMember({ date: "d", start_time: "", end_time: "" }, "cm_a")).toBe(true);
  });

  it("a day with a subset includes only the named members", () => {
    const day = { date: "d", start_time: "", end_time: "", crewMemberIds: ["cm_b"] };
    expect(dayHasCrewMember(day, "cm_b")).toBe(true);
    expect(dayHasCrewMember(day, "cm_a")).toBe(false);
  });
});
