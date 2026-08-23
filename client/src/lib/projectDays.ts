// ============================================================
// Multi-day project helpers — the single source of truth for "which days
// does this project occur on, with what times, worked by whom".
//
// Contract (see migrations/2026-08-23-project-day-schedules.sql):
//   * daySchedules empty  → single-day project; date/startTime/endTime rule.
//   * daySchedules non-empty → multi-day; always >= 2 rows sorted by date,
//     and date/startTime/endTime mirror row 0 (writers keep them synced via
//     normalizeDaySchedules below).
//
// Occurrence vs totals rule: DISPLAY/OCCUPANCY surfaces (calendar cells,
// conflicts, busy blocks, schedules, ICS) use these helpers to become
// occurrence-based. Hours/status/revenue TOTALS stay keyed to p.date (the
// first day) — attributing a project total to every occurrence day would
// double-count.
// ============================================================

import type { ProjectCrewEntry, ProjectDaySchedule } from "./types";

// Every read helper takes this minimal shape so api mirrors and test fixtures
// don't need full Project objects.
export interface ProjectDaysInput {
  date: string;
  startTime: string;
  endTime: string;
  daySchedules?: ProjectDaySchedule[];
  crew?: ProjectCrewEntry[];
}

export function isMultiDay(p: ProjectDaysInput): boolean {
  return Array.isArray(p.daySchedules) && p.daySchedules.length > 0;
}

/** The project's days, oldest first. Single-day projects yield one synthetic
 *  row from their own date/times so callers never branch. */
export function projectDays(p: ProjectDaysInput): ProjectDaySchedule[] {
  if (isMultiDay(p)) {
    return [...(p.daySchedules as ProjectDaySchedule[])]
      .filter(d => typeof d?.date === "string" && d.date)
      .sort((a, b) => a.date.localeCompare(b.date));
  }
  return [{ date: p.date, startTime: p.startTime, endTime: p.endTime }];
}

/** The day row for dateStr, or null when the project doesn't occur that day. */
export function projectOccursOn(p: ProjectDaysInput, dateStr: string): ProjectDaySchedule | null {
  return projectDays(p).find(d => d.date === dateStr) ?? null;
}

export function projectFirstDate(p: ProjectDaysInput): string {
  const days = projectDays(p);
  return days[0]?.date ?? p.date;
}

export function projectLastDate(p: ProjectDaysInput): string {
  const days = projectDays(p);
  return days[days.length - 1]?.date ?? p.date;
}

/** Crew entries working the given day: the whole roster unless the day names
 *  a subset. Intersects at read time, so stale ids (crew member removed after
 *  the day was saved) silently drop out instead of crashing. */
export function dayCrewFor(p: ProjectDaysInput, day: ProjectDaySchedule): ProjectCrewEntry[] {
  const roster = Array.isArray(p.crew) ? p.crew : [];
  const ids = day.crewMemberIds;
  if (!Array.isArray(ids) || ids.length === 0) return roster;
  return roster.filter(c => ids.includes(c.crewMemberId));
}

/** 1-based position of dateStr within the span, for "Day 2/3" chips.
 *  Null when the project doesn't occur that day. */
export function dayIndexInfo(p: ProjectDaysInput, dateStr: string): { index: number; count: number } | null {
  const days = projectDays(p);
  const i = days.findIndex(d => d.date === dateStr);
  return i === -1 ? null : { index: i + 1, count: days.length };
}

/**
 * Canonical form for storage, applied by every writer:
 * sort by date, drop rows without a date, dedupe dates (first wins), prune
 * crewMemberIds to the current roster (a subset equal to the full roster or
 * emptied by pruning stores as undefined = "whole crew"), and COLLAPSE to []
 * when fewer than 2 rows remain — a 1-row schedule is just a single-day
 * project and keeping it would create two sources of truth for one date.
 */
export function normalizeDaySchedules(
  rows: ProjectDaySchedule[] | undefined,
  rosterIds?: string[],
): ProjectDaySchedule[] {
  const seen = new Set<string>();
  const clean: ProjectDaySchedule[] = [];
  for (const r of [...(rows ?? [])].sort((a, b) => String(a?.date || "").localeCompare(String(b?.date || "")))) {
    if (typeof r?.date !== "string" || !r.date || seen.has(r.date)) continue;
    seen.add(r.date);
    let ids = Array.isArray(r.crewMemberIds) ? r.crewMemberIds.filter(id => typeof id === "string" && id) : undefined;
    if (ids && rosterIds) ids = ids.filter(id => rosterIds.includes(id));
    if (ids && (ids.length === 0 || (rosterIds && ids.length === rosterIds.length))) ids = undefined;
    clean.push({
      date: r.date,
      startTime: typeof r.startTime === "string" ? r.startTime : "",
      endTime: typeof r.endTime === "string" ? r.endTime : "",
      ...(ids ? { crewMemberIds: ids } : {}),
    });
  }
  return clean.length < 2 ? [] : clean;
}
