// ============================================================
// The rules confirmMiniBooking applies when a Stripe payment lands.
//
// Extracted here as pure functions mirroring api/_miniBooking.ts, because the
// two defects these cover both cost a customer real money and neither showed
// up in typechecking, linting or a build:
//   - a claim payment was treated as a replay and silently ignored
//   - the claim's balance overwrote the deposit instead of adding to it
// ============================================================

import { describe, it, expect } from "vitest";

interface Row { status: string; payment_status: string; deposit_paid_cents: number; total_cents: number }

/** Mirrors the replay guard in confirmMiniBooking. */
function isReplay(b: Row): boolean {
  return b.status !== "pending" && (b.payment_status === "paid" || b.payment_status === "deposit_paid");
}

/** Mirrors the amount bookkeeping in confirmMiniBooking. */
function settle(b: Row, thisPayment: number) {
  const paid = Number(b.deposit_paid_cents || 0) + thisPayment;
  return { paid, fullyPaid: paid >= Number(b.total_cents || 0) };
}

describe("confirmMiniBooking — replay guard", () => {
  it("ignores a genuine webhook replay of a settled booking", () => {
    expect(isReplay({ status: "booked", payment_status: "deposit_paid", deposit_paid_cents: 7500, total_cents: 15000 })).toBe(true);
    expect(isReplay({ status: "booked", payment_status: "paid", deposit_paid_cents: 15000, total_cents: 15000 })).toBe(true);
  });

  it("settles a pre-sale holder paying the balance when they claim a time", () => {
    // The bug: deposit_paid alone looked like a replay, so the payment did
    // nothing and the booking stayed pending until the sweep freed the slot.
    expect(isReplay({ status: "pending", payment_status: "deposit_paid", deposit_paid_cents: 5000, total_cents: 15000 })).toBe(false);
  });

  it("still registers payment on an owner-added booking that is already booked", () => {
    expect(isReplay({ status: "booked", payment_status: "pending", deposit_paid_cents: 0, total_cents: 15000 })).toBe(false);
  });
});

describe("confirmMiniBooking — amounts", () => {
  it("adds the claim balance to the deposit instead of replacing it", () => {
    const r = settle({ status: "pending", payment_status: "deposit_paid", deposit_paid_cents: 5000, total_cents: 15000 }, 10000);
    expect(r.paid).toBe(15000);
    expect(r.fullyPaid).toBe(true);
  });

  it("a first deposit still reads correctly (nothing to add to)", () => {
    const r = settle({ status: "pending", payment_status: "pending", deposit_paid_cents: 0, total_cents: 15000 }, 5000);
    expect(r.paid).toBe(5000);
    expect(r.fullyPaid).toBe(false);
  });

  it("paying in full up front marks it paid", () => {
    const r = settle({ status: "pending", payment_status: "pending", deposit_paid_cents: 0, total_cents: 15000 }, 15000);
    expect(r.fullyPaid).toBe(true);
  });
});
