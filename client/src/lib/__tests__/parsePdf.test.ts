// Tests for the pure helpers in api/parse-pdf.ts: the regex fallback,
// AI-output normalization, and statement-year detection. The AI call
// itself isn't unit-tested (network), but everything that shapes its
// output into clean expense rows is.

import { describe, expect, it } from "vitest";
import { parseTransactionsRegex, normalizeAiTransactions, findStatementYear, findStatementClosingDate, correctYearBoundary } from "../../../../api/parse-pdf";

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

describe("findStatementClosingDate", () => {
  it("reads month + year from a single closing date", () => {
    expect(findStatementClosingDate("Statement Closing Date: 01/15/2026")).toEqual({ month: 1, year: 2026 });
  });

  it("reads the closing (second) date from an opening/closing range, 2-digit year", () => {
    expect(findStatementClosingDate("Opening/Closing Date 12/16/25 - 01/15/26")).toEqual({ month: 1, year: 2026 });
  });

  it("returns null when no closing date is present", () => {
    expect(findStatementClosingDate("no dates here")).toBeNull();
  });
});

describe("correctYearBoundary", () => {
  it("moves December charges on a January statement back to the prior year", () => {
    const fixed = correctYearBoundary(
      [{ date: "2026-12-28", description: "GAS", amount: 40 }],
      { month: 1, year: 2026 },
    );
    expect(fixed[0].date).toBe("2025-12-28");
  });

  it("keeps charges within the closing month in the closing year", () => {
    const fixed = correctYearBoundary(
      [{ date: "2026-01-05", description: "COFFEE", amount: 5 }],
      { month: 1, year: 2026 },
    );
    expect(fixed[0].date).toBe("2026-01-05");
  });

  it("keeps mid-year charges in the closing year", () => {
    const fixed = correctYearBoundary(
      [{ date: "2026-06-10", description: "LUNCH", amount: 12 }],
      { month: 7, year: 2026 }, // July statement
    );
    expect(fixed[0].date).toBe("2026-06-10");
  });

  it("is a no-op when the closing date is unknown", () => {
    const rows = [{ date: "2026-12-28", description: "GAS", amount: 40 }];
    expect(correctYearBoundary(rows, null)).toEqual(rows);
  });

  it("does not push a December charge two years back when the year was mis-stamped", () => {
    // Regression: opening-year mis-stamp (2025) on a Jan-2026-closing statement.
    // The closing DATE (Jan 2026) is the source of truth → Dec belongs to 2025.
    const fixed = correctYearBoundary(
      [{ date: "2025-12-16", description: "GAS", amount: 40 }],
      { month: 1, year: 2026 },
    );
    expect(fixed[0].date).toBe("2025-12-16");
  });
});
