// ============================================================
// Expense import de-duplication — prevents double-counting money when the
// same bank statement (PDF or CSV) is uploaded more than once.
// Pure + exported so the money-safety behavior is locked by tests.
// ============================================================

// A row shape the dedup helpers understand. Real import rows (CsvRow) carry
// more fields; only these matter for detecting a duplicate.
export interface DedupRow {
  date: string;
  amount: number;
  description: string;
  selected: boolean;
  duplicate?: boolean;
}

// Stable identity for a charge: same date + same amount (to the cent) + same
// normalized description = the same expense. Description is trimmed, inner
// whitespace collapsed, and upper-cased so trivial formatting differences
// (e.g. a text-extracted vs. AI-read version of the same statement line)
// still match.
export function expenseKey(date: string, amount: number, description: string): string {
  const normDesc = description.trim().replace(/\s+/g, " ").toUpperCase();
  return `${date}|${Math.round(amount * 100)}|${normDesc}`;
}

// Flag rows that duplicate an expense already in the ledger (`existingKeys`)
// and pre-uncheck them, so an accidental re-upload of a statement imports
// nothing. Deliberately does NOT collapse repeats within the same batch: two
// genuinely-identical charges on one statement (e.g. two identical parking
// fees the same day) are both real and must both import — dropping one would
// silently undercount expenses. Returns new rows (does not mutate) plus how
// many were flagged.
export function markDuplicateRows<T extends DedupRow>(
  rows: T[],
  existingKeys: Set<string>,
): { rows: T[]; dupCount: number } {
  let dupCount = 0;
  const out = rows.map(r => {
    const isDup = existingKeys.has(expenseKey(r.date, r.amount, r.description));
    if (isDup) dupCount++;
    return { ...r, duplicate: isDup, selected: !isDup };
  });
  return { rows: out, dupCount };
}
