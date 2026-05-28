// Tests for the pure helpers in api/parse-pdf.ts: the regex fallback,
// AI-output normalization, and statement-year detection. The AI call
// itself isn't unit-tested (network), but everything that shapes its
// output into clean expense rows is.

import { describe, expect, it } from "vitest";
import { parseTransactionsRegex, normalizeAiTransactions, findStatementYear } from "../../../../api/parse-pdf";

describe("parseTransactionsRegex", () => {
  it("parses MM/DD description amount lines", () => {
    const rows = parseTransactionsRegex(["03/14 COFFEE SHOP NASHVILLE 12.50"], "2026");
    expect(rows).toEqual([{ date: "2026-03-14", description: "COFFEE SHOP NASHVILLE", amount: 12.5 }]);
  });

  it("handles the two-date (trans/post) layout and commas", () => {
    const rows = parseTransactionsRegex(["03/14 03/15 B&H PHOTO 1,299.00"], "2026");
    expect(rows).toEqual([{ date: "2026-03-14", description: "B&H PHOTO", amount: 1299 }]);
  });

  it("skips payment/thank-you lines", () => {
    const rows = parseTransactionsRegex(["03/20 PAYMENT THANK YOU 500.00"], "2026");
    expect(rows).toEqual([]);
  });
});

describe("normalizeAiTransactions", () => {
  it("keeps well-formed rows", () => {
    const rows = normalizeAiTransactions(
      [{ date: "2026-04-02", description: "Adobe", amount: 59.99 }],
      "2026",
    );
    expect(rows).toEqual([{ date: "2026-04-02", description: "Adobe", amount: 59.99 }]);
  });

  it("coerces MM/DD and MM/DD/YY dates using the statement year", () => {
    expect(normalizeAiTransactions([{ date: "4/2", description: "X", amount: 5 }], "2026")[0].date).toBe("2026-04-02");
    expect(normalizeAiTransactions([{ date: "04/02/25", description: "X", amount: 5 }], "2026")[0].date).toBe("2025-04-02");
  });

  it("takes the absolute value of amounts", () => {
    expect(normalizeAiTransactions([{ date: "2026-04-02", description: "X", amount: -8 }], "2026")[0].amount).toBe(8);
  });

  it("drops rows missing a description, a valid date, or an amount", () => {
    const rows = normalizeAiTransactions(
      [
        { date: "2026-04-02", description: "", amount: 5 },
        { date: "not-a-date", description: "X", amount: 5 },
        { date: "2026-04-02", description: "Y", amount: 0 },
        { date: "2026-04-02", description: "Z", amount: 9 },
      ],
      "2026",
    );
    expect(rows).toEqual([{ date: "2026-04-02", description: "Z", amount: 9 }]);
  });

  it("returns [] for non-array input", () => {
    expect(normalizeAiTransactions(null, "2026")).toEqual([]);
    expect(normalizeAiTransactions("nope", "2026")).toEqual([]);
  });
});

describe("findStatementYear", () => {
  it("reads the year from a statement closing date", () => {
    expect(findStatementYear("Statement Closing Date: 04/15/2026")).toBe("2026");
  });

  it("falls back to the current year when none is found", () => {
    expect(findStatementYear("no year here")).toBe(String(new Date().getFullYear()));
  });
});
