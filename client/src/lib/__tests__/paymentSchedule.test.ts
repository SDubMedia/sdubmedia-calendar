// Tests for extractPaymentScheduleMilestones — the converter from a
// contract template's `payment_schedule` block into the milestone array
// the contract generator + reminder cron consume. Pure, branchy, easy
// to silently break.

import { describe, expect, it } from "vitest";
import { extractPaymentScheduleMilestones } from "../../../../api/_paymentSchedule";

describe("extractPaymentScheduleMilestones", () => {
  it("returns [] for non-array input", () => {
    expect(extractPaymentScheduleMilestones(null, "2026-06-14", 1000)).toEqual([]);
    expect(extractPaymentScheduleMilestones(undefined, "2026-06-14", 1000)).toEqual([]);
    expect(extractPaymentScheduleMilestones("nope", "2026-06-14", 1000)).toEqual([]);
  });

  it("returns [] when blocks contains no payment_schedule", () => {
    const blocks = [{ type: "prose", html: "<p>hi</p>" }, { type: "divider" }];
    expect(extractPaymentScheduleMilestones(blocks, "2026-06-14", 1000)).toEqual([]);
  });

  it("ignores payment_schedule blocks missing deposit/balance", () => {
    const blocks = [{ type: "payment_schedule" }];
    expect(extractPaymentScheduleMilestones(blocks, "2026-06-14", 1000)).toEqual([]);
  });

  it("converts a 50% deposit at signing + balance on event date", () => {
    const blocks = [{
      type: "payment_schedule",
      deposit: { kind: "percent", value: 50, dueType: "at_signing" },
      balance: { dueType: "on_event_date" },
    }];
    const out = extractPaymentScheduleMilestones(blocks, "2026-06-14", 1200);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({
      label: "Deposit",
      type: "percent",
      percent: 50,
      dueType: "at_signing",
    });
    expect(out[1]).toMatchObject({
      label: "Balance",
      type: "percent",
      percent: 50,
      dueType: "absolute_date",
      dueDate: "2026-06-14",
    });
  });

  it("falls back to at_signing for balance when no event date is set", () => {
    const blocks = [{
      type: "payment_schedule",
      deposit: { kind: "percent", value: 50, dueType: "at_signing" },
      balance: { dueType: "on_event_date" },
    }];
    const out = extractPaymentScheduleMilestones(blocks, "", 1200);
    expect(out[1].dueType).toBe("at_signing");
    expect(out[1].dueDate).toBeUndefined();
  });

  it("converts 'X days before event' to an absolute date", () => {
    const blocks = [{
      type: "payment_schedule",
      deposit: { kind: "percent", value: 50, dueType: "at_signing" },
      balance: { dueType: "relative_days", dueDays: 7 },
    }];
    const out = extractPaymentScheduleMilestones(blocks, "2026-06-14", 1200);
    expect(out[1].dueType).toBe("absolute_date");
    expect(out[1].dueDate).toBe("2026-06-07"); // 7 days before
  });

  it("keeps relative_days when no event date is set", () => {
    const blocks = [{
      type: "payment_schedule",
      deposit: { kind: "percent", value: 50, dueType: "at_signing" },
      balance: { dueType: "relative_days", dueDays: 7 },
    }];
    const out = extractPaymentScheduleMilestones(blocks, "", 1200);
    expect(out[1].dueType).toBe("relative_days");
    expect(out[1].dueDays).toBe(7);
  });

  it("handles fixed-amount deposits", () => {
    const blocks = [{
      type: "payment_schedule",
      deposit: { kind: "fixed", value: 600, dueType: "at_signing" },
      balance: { dueType: "on_event_date" },
    }];
    const out = extractPaymentScheduleMilestones(blocks, "2026-06-14", 1200);
    expect(out[0]).toMatchObject({ type: "fixed", fixedAmount: 600 });
    expect(out[1]).toMatchObject({ type: "fixed", fixedAmount: 600 }); // remaining
  });

  it("handles fixed deposit larger than total → balance clamps to 0", () => {
    const blocks = [{
      type: "payment_schedule",
      deposit: { kind: "fixed", value: 5000, dueType: "at_signing" },
      balance: { dueType: "on_event_date" },
    }];
    const out = extractPaymentScheduleMilestones(blocks, "2026-06-14", 1200);
    expect(out[1].fixedAmount).toBe(0);
  });

  it("preserves deposit absolute_date due dates", () => {
    const blocks = [{
      type: "payment_schedule",
      deposit: { kind: "percent", value: 25, dueType: "absolute_date", dueDate: "2026-04-01" },
      balance: { dueType: "absolute_date", dueDate: "2026-06-14" },
    }];
    const out = extractPaymentScheduleMilestones(blocks, "2026-06-14", 1000);
    expect(out[0].dueType).toBe("absolute_date");
    expect(out[0].dueDate).toBe("2026-04-01");
    expect(out[1].dueDate).toBe("2026-06-14");
  });

  it("respects custom labels on deposit and balance", () => {
    const blocks = [{
      type: "payment_schedule",
      deposit: { kind: "percent", value: 30, dueType: "at_signing", label: "Booking Fee" },
      balance: { dueType: "on_event_date", label: "Final Payment" },
    }];
    const out = extractPaymentScheduleMilestones(blocks, "2026-06-14", 1000);
    expect(out[0].label).toBe("Booking Fee");
    expect(out[1].label).toBe("Final Payment");
  });

  it("dedupes multiple payment_schedule blocks — only the first is honored", () => {
    // Multi-page templates can accidentally drop a payment_schedule on
    // both the agreement page AND a dedicated Payment page. Without dedup
    // the client would owe double. We honor the first one and ignore
    // subsequent ones.
    const blocks = [
      {
        type: "payment_schedule",
        deposit: { kind: "percent", value: 50, dueType: "at_signing" },
        balance: { dueType: "on_event_date" },
      },
      { type: "prose", html: "<p>between blocks</p>" },
      {
        type: "payment_schedule",
        deposit: { kind: "fixed", value: 100, dueType: "at_signing", label: "Travel deposit" },
        balance: { dueType: "absolute_date", dueDate: "2026-07-01", label: "Travel balance" },
      },
    ];
    const out = extractPaymentScheduleMilestones(blocks, "2026-06-14", 1000);
    expect(out).toHaveLength(2);
    expect(out[0].label).toBe("Deposit");
    expect(out[1].label).toBe("Balance");
  });
});
