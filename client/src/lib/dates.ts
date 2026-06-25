// Local-time date helpers. We construct and format in local time so that
// getMonth()/getDay()/getDate() match what the user sees in their timezone.
// Constructing month anchors in UTC shifts them a day for users west of UTC,
// which flips the "in this month" check in a calendar grid.

export function firstDayOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function lastDayOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

/** YYYY-MM-DD in local time. */
export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function addMonths(d: Date, months: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + months, 1);
}

export function formatMonthYear(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

/** Parse a YYYY-MM-DD string (as a local date) into a long, readable label. */
export function formatDayLong(value: string): string {
  const [y, m, day] = value.split("-").map(Number);
  if (!y || !m || !day) return value;
  return new Date(y, m - 1, day).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

/**
 * All dates shown in a month view: the full weeks (Sun–Sat) that contain the
 * 1st through the last day of `anchor`'s month. Leading/trailing days from
 * adjacent months are included so the grid is always complete rectangles.
 */
export function buildMonthGrid(anchor: Date): Date[] {
  const first = firstDayOfMonth(anchor);
  const last = lastDayOfMonth(anchor);

  const gridStart = new Date(first);
  gridStart.setDate(first.getDate() - first.getDay()); // back to Sunday

  const gridEnd = new Date(last);
  gridEnd.setDate(last.getDate() + (6 - last.getDay())); // forward to Saturday

  const cells: Date[] = [];
  const cursor = new Date(gridStart);
  while (cursor <= gridEnd) {
    cells.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return cells;
}
