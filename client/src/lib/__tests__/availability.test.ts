import { describe, it, expect } from "vitest";
import { addDaysIso, weekdayOf, getOpenDays, type BusyBlock } from "../data";
import type { Availability } from "../types";

function avail(partial: Partial<Availability>): Availability {
  return {
    id: Math.random().toString(36).slice(2),
    orgId: "o",
    crewMemberId: "crew1",
    recurring: true,
    weekday: 1,
    specificDate: null,
    allDay: false,
    startTime: "09:00",
    endTime: "17:00",
    createdAt: "2026-01-01",
    ...partial,
  };
}

const from = "2026-06-22";
const wd = weekdayOf(from);
const times = (days: ReturnType<typeof getOpenDays>) => (days[0]?.slots ?? []).map(s => s.time);

describe("addDaysIso / weekdayOf", () => {
  it("adds across a month boundary", () => {
    expect(addDaysIso("2026-06-29", 3)).toBe("2026-07-02");
  });
  it("same weekday 7 days later", () => {
    expect(weekdayOf("2026-06-26")).toBe(weekdayOf("2026-06-19"));
  });
});

describe("getOpenDays — availability shapes", () => {
  it("recurring block on the matching weekday yields slots", () => {
    const days = getOpenDays([avail({ weekday: wd, startTime: "09:00", endTime: "11:00" })], { fromDate: from, days: 1 });
    expect(days).toHaveLength(1);
    // default shoot 60 / step 30: 9:00, 9:30, 10:00 (10:00+60=11:00 fits)
    expect(times(days)).toEqual(["09:00", "09:30", "10:00"]);
  });

  it("excludes a different weekday", () => {
    const days = getOpenDays([avail({ weekday: (wd + 1) % 7 })], { fromDate: from, days: 1 });
    expect(days).toHaveLength(0);
  });

  it("one-off block lands on its exact date", () => {
    const blocks = [avail({ recurring: false, weekday: null, specificDate: addDaysIso(from, 2), startTime: "09:00", endTime: "10:00" })];
    const days = getOpenDays(blocks, { fromDate: from, days: 5 });
    expect(days).toHaveLength(1);
    expect(days[0].date).toBe(addDaysIso(from, 2));
  });

  it("all-day block produces a wide span of slots", () => {
    const days = getOpenDays([avail({ weekday: wd, allDay: true })], { fromDate: from, days: 1 });
    expect(times(days)[0]).toBe("07:00");
    expect(times(days).length).toBeGreaterThan(10);
  });
});

describe("getOpenDays — bookings, buffer, cap", () => {
  const pref = { shootMinutes: 60, bufferMinutes: 30, maxPerDay: 0 };

  it("subtracts an existing booking plus travel buffer", () => {
    const busy: BusyBlock[] = [{ crewMemberId: "crew1", date: from, start: "10:00", end: "11:00" }];
    const days = getOpenDays([avail({ weekday: wd, startTime: "09:00", endTime: "13:00" })], {
      fromDate: from, days: 1, crewMemberId: "crew1", busy, prefs: { crew1: pref },
    });
    // booking 10-11 with 30m buffer blocks any shoot overlapping 9:30-11:30.
    // 9:00 shoot ends 10:00; needs 30m clear before 10:00 booking -> 10:00 <= 10:00-? conflict. So 9:00 blocked too.
    expect(times(days)).not.toContain("09:30");
    expect(times(days)).not.toContain("10:00");
    expect(times(days)).not.toContain("10:30");
    // 11:30 start (ends 12:30) is clear of the 11:00 end + 30m buffer.
    expect(times(days)).toContain("11:30");
  });

  it("daily cap hides the day once it's full", () => {
    const busy: BusyBlock[] = [
      { crewMemberId: "crew1", date: from, start: "09:00", end: "10:00" },
      { crewMemberId: "crew1", date: from, start: "14:00", end: "15:00" },
    ];
    const days = getOpenDays([avail({ weekday: wd, allDay: true })], {
      fromDate: from, days: 1, crewMemberId: "crew1", busy, prefs: { crew1: { ...pref, maxPerDay: 2 } },
    });
    expect(days).toHaveLength(0); // already 2 booked, cap is 2
  });

  it("a longer shoot length offers fewer starts", () => {
    const win = [avail({ weekday: wd, startTime: "09:00", endTime: "11:00" })];
    const short = getOpenDays(win, { fromDate: from, days: 1, crewMemberId: "crew1", prefs: { crew1: { shootMinutes: 60, bufferMinutes: 0, maxPerDay: 0 } } });
    const long = getOpenDays(win, { fromDate: from, days: 1, crewMemberId: "crew1", prefs: { crew1: { shootMinutes: 120, bufferMinutes: 0, maxPerDay: 0 } } });
    expect(times(long).length).toBeLessThan(times(short).length);
    expect(times(long)).toEqual(["09:00"]); // only a 2h shoot fits a 2h window
  });

  it("with two shooters, a slot lists both as free", () => {
    const blocks = [avail({ crewMemberId: "crew1", weekday: wd, startTime: "09:00", endTime: "10:00" }), avail({ crewMemberId: "crew2", weekday: wd, startTime: "09:00", endTime: "10:00" })];
    const days = getOpenDays(blocks, { fromDate: from, days: 1 });
    expect(days[0].slots[0].crewMemberIds.sort()).toEqual(["crew1", "crew2"]);
  });
});
