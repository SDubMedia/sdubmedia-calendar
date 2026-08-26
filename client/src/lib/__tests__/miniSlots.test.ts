import { describe, it, expect } from "vitest";
import {
  generateSlots, slotAvailability, openSlots, formatSlot,
  pendingExpired, slotForTime, PENDING_HOLD_MINUTES, depositDueCents, reservationsLeft } from "../miniSlots";

const spec = { startTime: "13:00", endTime: "16:00", slotMinutes: 15, breakMinutes: 5 };

describe("generateSlots", () => {
  it("steps by slot + break and never runs past the window", () => {
    const slots = generateSlots(spec);
    expect(slots[0]).toBe("13:00");
    expect(slots[1]).toBe("13:20");
    expect(slots[slots.length - 1] <= "15:45").toBe(true);
    // every slot fits entirely inside 13:00–16:00
    for (const s of slots) expect(s >= "13:00" && s <= "15:45").toBe(true);
  });

  it("with no break, slots are back to back", () => {
    expect(generateSlots({ startTime: "09:00", endTime: "10:00", slotMinutes: 20 }))
      .toEqual(["09:00", "09:20", "09:40"]);
  });

  it("drops a trailing slot that wouldn't fit", () => {
    // 09:00–09:50 at 20 min = 09:00, 09:20 (09:40 would end 10:00 > window)
    expect(generateSlots({ startTime: "09:00", endTime: "09:50", slotMinutes: 20 }))
      .toEqual(["09:00", "09:20"]);
  });

  it("returns nothing for nonsense specs instead of hanging", () => {
    expect(generateSlots({ startTime: "16:00", endTime: "13:00", slotMinutes: 15 })).toEqual([]);
    expect(generateSlots({ startTime: "13:00", endTime: "16:00", slotMinutes: 0 })).toEqual([]);
    expect(generateSlots({ startTime: "", endTime: "", slotMinutes: 15 })).toEqual([]);
  });
});

describe("availability", () => {
  it("marks taken and blocked slots closed, leaves the rest open", () => {
    const rows = slotAvailability(spec, ["13:20"], ["13:40"]);
    expect(rows.find(r => r.time === "13:00")?.open).toBe(true);
    expect(rows.find(r => r.time === "13:20")).toMatchObject({ taken: true, open: false });
    expect(rows.find(r => r.time === "13:40")).toMatchObject({ blocked: true, open: false });
  });

  it("openSlots excludes both", () => {
    const open = openSlots(spec, ["13:00"], ["13:20"]);
    expect(open).not.toContain("13:00");
    expect(open).not.toContain("13:20");
    expect(open).toContain("13:40");
  });
});

describe("pendingExpired", () => {
  it("holds a fresh pending booking, releases a stale one", () => {
    const now = Date.now();
    expect(pendingExpired(new Date(now - 60_000).toISOString(), now)).toBe(false);
    expect(pendingExpired(new Date(now - (PENDING_HOLD_MINUTES + 1) * 60_000).toISOString(), now)).toBe(true);
  });

  it("treats an unparseable timestamp as expired rather than holding forever", () => {
    expect(pendingExpired("not-a-date")).toBe(true);
  });
});

describe("slotForTime (missing-QR fallback)", () => {
  it("maps a capture time to the session that was happening", () => {
    expect(slotForTime(spec, "13:07")).toBe("13:00");
    expect(slotForTime(spec, "13:22")).toBe("13:20");
  });

  it("photos taken during the break still belong to the session before it", () => {
    expect(slotForTime(spec, "13:17")).toBe("13:00"); // 13:15–13:20 is the break
  });

  it("returns null outside the event", () => {
    expect(slotForTime(spec, "12:00")).toBeNull();
    expect(slotForTime(spec, "17:00")).toBeNull();
  });
});

describe("formatSlot", () => {
  it("renders 12-hour labels", () => {
    expect(formatSlot("13:05")).toBe("1:05 PM");
    expect(formatSlot("00:30")).toBe("12:30 AM");
    expect(formatSlot("12:00")).toBe("12:00 PM");
  });
});

// ---- Reservations (added 2026-08-26) ----
describe("depositDueCents", () => {
  it("charges the flat deposit when set, not a percentage of the price", () => {
    // $50 of $150 is what the page promises. 33% would be $49.50.
    expect(depositDueCents({ priceCents: 15000, paymentMode: "deposit", depositFlatCents: 5000 })).toBe(5000);
  });

  it("falls back to the percentage when there is no flat amount", () => {
    expect(depositDueCents({ priceCents: 15000, paymentMode: "deposit", depositPercent: 50 })).toBe(7500);
  });

  it("defaults to half when neither is usable", () => {
    expect(depositDueCents({ priceCents: 15000, paymentMode: "deposit" })).toBe(7500);
    expect(depositDueCents({ priceCents: 15000, paymentMode: "deposit", depositPercent: 0 })).toBe(7500);
  });

  it("never asks for more than the price", () => {
    expect(depositDueCents({ priceCents: 4000, paymentMode: "deposit", depositFlatCents: 5000 })).toBe(4000);
  });

  it("takes the whole price when not a deposit event", () => {
    expect(depositDueCents({ priceCents: 15000, paymentMode: "full", depositFlatCents: 5000 })).toBe(15000);
  });
});

describe("reservationsLeft", () => {
  const rows = (...statuses: string[]) => statuses.map(status => ({ status }));

  it("returns null when uncapped, so 'unlimited' isn't mistaken for 'sold out'", () => {
    expect(reservationsLeft(0, rows("waitlist"))).toBeNull();
  });

  it("counts reservations against the cap", () => {
    expect(reservationsLeft(12, rows("waitlist", "waitlist"))).toBe(10);
  });

  it("counts people already converted to a slot — they hold a place too", () => {
    expect(reservationsLeft(3, rows("waitlist", "booked", "pending"))).toBe(0);
  });

  it("counts a no-show — they bought a place and used it", () => {
    expect(reservationsLeft(2, rows("no_show"))).toBe(1);
  });

  it("frees the place when someone cancels", () => {
    expect(reservationsLeft(2, rows("waitlist", "cancelled"))).toBe(1);
  });

  it("never goes negative if the cap is lowered after selling", () => {
    expect(reservationsLeft(1, rows("waitlist", "waitlist", "waitlist"))).toBe(0);
  });
});
