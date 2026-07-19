// Tests for the expense-import de-duplication that prevents double-counting
// money when the same statement is uploaded twice.

import { describe, it, expect } from "vitest";
import { expenseKey, markDuplicateRows, type DedupRow } from "../expenseDedup";

function row(date: string, amount: number, description: string): DedupRow {
  return { date, amount, description, selected: true };
}

describe("expenseKey", () => {
  it("is identical for the same date, amount, and description", () => {
    expect(expenseKey("2026-05-10", 12.34, "SHELL OIL")).toBe(expenseKey("2026-05-10", 12.34, "SHELL OIL"));
  });

  it("ignores case and extra whitespace in the description", () => {
    expect(expenseKey("2026-05-10", 12.34, "  shell   oil  ")).toBe(expenseKey("2026-05-10", 12.34, "SHELL OIL"));
  });

  it("differs when the amount differs by a cent", () => {
    expect(expenseKey("2026-05-10", 12.34, "X")).not.toBe(expenseKey("2026-05-10", 12.35, "X"));
  });

  it("differs when the date differs", () => {
    expect(expenseKey("2026-05-10", 12.34, "X")).not.toBe(expenseKey("2026-05-11", 12.34, "X"));
  });

  it("treats floating-point cents consistently", () => {
    // 0.1 + 0.2 style drift must not create a phantom mismatch.
    expect(expenseKey("2026-05-10", 0.3, "X")).toBe(expenseKey("2026-05-10", 0.1 + 0.2, "X"));
  });
});

describe("markDuplicateRows", () => {
  it("flags and unchecks rows already in the ledger", () => {
    const existing = new Set([expenseKey("2026-05-10", 12.34, "SHELL OIL")]);
    const { rows, dupCount } = markDuplicateRows([row("2026-05-10", 12.34, "SHELL OIL")], existing);
    expect(dupCount).toBe(1);
    expect(rows[0].duplicate).toBe(true);
    expect(rows[0].selected).toBe(false);
  });

  it("keeps genuinely new rows checked", () => {
    const { rows, dupCount } = markDuplicateRows([row("2026-05-10", 99.99, "NEW MERCHANT")], new Set());
    expect(dupCount).toBe(0);
    expect(rows[0].duplicate).toBe(false);
    expect(rows[0].selected).toBe(true);
  });

  it("dedupes exact repeats within the same batch (keeps the first)", () => {
    const { rows, dupCount } = markDuplicateRows(
      [row("2026-05-10", 5, "COFFEE"), row("2026-05-10", 5, "COFFEE")],
      new Set(),
    );
    expect(dupCount).toBe(1);
    expect(rows[0].duplicate).toBe(false);
    expect(rows[0].selected).toBe(true);
    expect(rows[1].duplicate).toBe(true);
    expect(rows[1].selected).toBe(false);
  });

  it("allows same-day same-merchant charges of different amounts", () => {
    const { dupCount } = markDuplicateRows(
      [row("2026-05-10", 5, "COFFEE"), row("2026-05-10", 6.5, "COFFEE")],
      new Set(),
    );
    expect(dupCount).toBe(0);
  });

  it("does not mutate the input rows", () => {
    const input = [row("2026-05-10", 12.34, "SHELL OIL")];
    const existing = new Set([expenseKey("2026-05-10", 12.34, "SHELL OIL")]);
    markDuplicateRows(input, existing);
    expect(input[0].duplicate).toBeUndefined();
    expect(input[0].selected).toBe(true);
  });
});
