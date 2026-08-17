// Tests for the wording a payment_schedule block turns into — the sentence
// the owner sees in the builder and, with real dollars attached, the one the
// client reads in the agreement they sign. Shared between both surfaces so
// they can't say different things.
//
// The milestone conversion that feeds contract generation lives next door in
// paymentSchedule.test.ts.

import { describe, it, expect } from "vitest";
import {
  formatMoney,
  depositAmount,
  balanceAmount,
  summarizeMilestone,
  summarizeBalance,
} from "../paymentSchedule";

const HALF_AT_SIGNING = { kind: "percent", value: 50, dueType: "at_signing" } as const;
const FLAT_500 = { kind: "fixed", value: 500, dueType: "at_signing" } as const;
const DAY_BEFORE = { dueType: "relative_days", dueDays: 1 } as const;

describe("formatMoney", () => {
  it("drops cents on whole dollars and keeps them otherwise", () => {
    expect(formatMoney(1200)).toBe("$1,200");
    expect(formatMoney(1234.5)).toBe("$1,234.50");
  });
});

describe("amounts", () => {
  it("splits a percentage deposit against the total", () => {
    expect(depositAmount(HALF_AT_SIGNING, 3000)).toBe(1500);
    expect(balanceAmount(HALF_AT_SIGNING, 3000)).toBe(1500);
  });

  it("takes a fixed deposit off the top", () => {
    expect(depositAmount(FLAT_500, 3000)).toBe(500);
    expect(balanceAmount(FLAT_500, 3000)).toBe(2500);
  });

  // Half of nothing is "$0", which reads as free in a contract.
  it("gives no figure when the client hasn't chosen anything yet", () => {
    expect(depositAmount(HALF_AT_SIGNING, 0)).toBeNull();
    expect(depositAmount(HALF_AT_SIGNING, undefined)).toBeNull();
    expect(balanceAmount(HALF_AT_SIGNING, undefined)).toBeNull();
  });

  it("still knows a fixed deposit with no total — it's a stated number", () => {
    expect(depositAmount(FLAT_500, undefined)).toBe(500);
  });
});

describe("wording", () => {
  it("states real dollars once a total exists", () => {
    expect(summarizeMilestone(HALF_AT_SIGNING, "Deposit", 3000))
      .toBe("Deposit: 50% ($1,500) due at signing");
    expect(summarizeBalance(DAY_BEFORE, HALF_AT_SIGNING, 3000))
      .toBe("Balance: 50% ($1,500) due 1 day before the event");
  });

  it("falls back to the bare terms in the builder", () => {
    expect(summarizeMilestone(HALF_AT_SIGNING, "Deposit"))
      .toBe("Deposit: 50% due at signing");
    expect(summarizeBalance(DAY_BEFORE, HALF_AT_SIGNING))
      .toBe("Balance: 50% due 1 day before the event");
  });

  // "$500 ($500)" reads as two charges.
  it("doesn't repeat a fixed deposit's own figure", () => {
    expect(summarizeMilestone(FLAT_500, "Deposit", 3000))
      .toBe("Deposit: $500 due at signing");
    expect(summarizeBalance(DAY_BEFORE, FLAT_500, 3000))
      .toBe("Balance: Remaining balance ($2,500) due 1 day before the event");
  });

  it("honours a custom label", () => {
    expect(summarizeMilestone({ ...HALF_AT_SIGNING, label: "Retainer" }, "Deposit"))
      .toBe("Retainer: 50% due at signing");
  });
});
