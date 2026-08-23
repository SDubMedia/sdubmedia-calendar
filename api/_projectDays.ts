// ============================================================
// Server mirror of client/src/lib/projectDays.ts for snake_case project ROWS
// (the ICS feed and anything else reading raw Supabase rows). Same contract:
// day_schedules empty = single-day (date/start_time/end_time rule); non-empty
// = multi-day, sorted, first row mirrored into date/start_time/end_time by
// the writers.
// ============================================================

export interface ProjectDayRow {
  date: string;
  start_time: string;
  end_time: string;
  crewMemberIds?: string[];
}

interface ProjectRowLike {
  date: string;
  start_time?: string | null;
  end_time?: string | null;
  day_schedules?: unknown;
}

/** The row's days, oldest first; single-day rows yield one synthetic entry. */
export function projectDaysRow(p: ProjectRowLike): ProjectDayRow[] {
  const raw = Array.isArray(p.day_schedules) ? p.day_schedules : [];
  const days = raw
    .filter((d): d is Record<string, unknown> => !!d && typeof d === "object" && typeof (d as Record<string, unknown>).date === "string" && !!(d as Record<string, unknown>).date)
    .map(d => ({
      date: String(d.date),
      start_time: typeof d.startTime === "string" ? d.startTime : "",
      end_time: typeof d.endTime === "string" ? d.endTime : "",
      ...(Array.isArray(d.crewMemberIds) && d.crewMemberIds.length > 0
        ? { crewMemberIds: (d.crewMemberIds as unknown[]).filter((x): x is string => typeof x === "string") }
        : {}),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
  if (days.length > 0) return days;
  return [{ date: p.date, start_time: p.start_time || "", end_time: p.end_time || "" }];
}

/** Whether a crew member works the given day: absent/empty crewMemberIds =
 *  the whole crew (defer to the project-level access check). */
export function dayHasCrewMember(day: ProjectDayRow, crewMemberId: string): boolean {
  if (!Array.isArray(day.crewMemberIds) || day.crewMemberIds.length === 0) return true;
  return day.crewMemberIds.includes(crewMemberId);
}
