// ============================================================
// Pure helpers for the Pipeline CRM: follow-up due classification,
// pipeline value by stage, lost-reason aggregation, win rate.
// No React, no Supabase — everything here is unit-testable.
// ============================================================

import type { PipelineLead, Proposal } from "./types";

/** The fixed close-out reasons. Kept as a clean list (not free text) so the
 *  analytics breakdown can group on them; "Other" pairs with lostReasonNote. */
export const LOST_REASONS = [
  "Price",
  "Date conflict",
  "Went with someone else",
  "Ghosted",
  "Not a fit",
  "Other",
] as const;

export type FollowUpStatus = { kind: "overdue"; daysOverdue: number } | { kind: "due_today" } | { kind: "upcoming" };

/** Classify a lead's follow-up date against today (both YYYY-MM-DD).
 *
 *  String comparison on ISO dates is deliberate — no Date parsing, so no
 *  timezone edge where "2026-08-18" becomes yesterday evening. daysOverdue
 *  uses UTC midnights for the same reason. */
export function classifyFollowUp(followUpDate: string | null | undefined, todayIso: string): FollowUpStatus | null {
  if (!followUpDate) return null;
  if (followUpDate === todayIso) return { kind: "due_today" };
  if (followUpDate > todayIso) return { kind: "upcoming" };
  const days = Math.round((Date.parse(`${todayIso}T00:00:00Z`) - Date.parse(`${followUpDate}T00:00:00Z`)) / 86400000);
  return { kind: "overdue", daysOverdue: Math.max(1, days) };
}

/** A lead still counts toward the pipeline unless it's been closed out or
 *  parked in the archived stage. */
export function isOpenLead(l: Pick<PipelineLead, "closedOutcome" | "pipelineStage">): boolean {
  return l.closedOutcome === "" && l.pipelineStage !== "archived";
}

/** Dollars in play per stage: open leads' expected value, plus the totals of
 *  proposals not linked to any lead (a linked proposal's money is already
 *  represented by its lead — counting both would double it). */
export function pipelineValueByStage(
  leads: Pick<PipelineLead, "pipelineStage" | "expectedValue" | "closedOutcome">[],
  unlinkedProposals: Pick<Proposal, "pipelineStage" | "total">[],
): Map<string, number> {
  const out = new Map<string, number>();
  const add = (stage: string, amount: number) => {
    if (amount > 0) out.set(stage, (out.get(stage) ?? 0) + amount);
  };
  for (const l of leads) {
    if (isOpenLead(l)) add(l.pipelineStage, l.expectedValue);
  }
  for (const p of unlinkedProposals) {
    if (p.pipelineStage !== "archived") add(p.pipelineStage, p.total);
  }
  return out;
}

export function totalPipelineValue(byStage: Map<string, number>): number {
  let sum = 0;
  for (const v of byStage.values()) sum += v;
  return sum;
}

export interface LostReasonRow {
  reason: string;
  count: number;
  expectedValue: number;
}

/** Lost leads grouped by reason, biggest group first. cutoffMs bounds by
 *  closedAt (null = all time). Unset reasons group as "Unspecified". */
export function aggregateLostReasons(
  leads: Pick<PipelineLead, "closedOutcome" | "closedAt" | "lostReason" | "expectedValue">[],
  cutoffMs: number | null,
): LostReasonRow[] {
  const groups = new Map<string, LostReasonRow>();
  for (const l of leads) {
    if (l.closedOutcome !== "lost") continue;
    if (cutoffMs !== null && (!l.closedAt || Date.parse(l.closedAt) < cutoffMs)) continue;
    const reason = l.lostReason || "Unspecified";
    const row = groups.get(reason) ?? { reason, count: 0, expectedValue: 0 };
    row.count += 1;
    row.expectedValue += l.expectedValue;
    groups.set(reason, row);
  }
  return [...groups.values()].sort((a, b) => b.count - a.count);
}

/** Win rate over leads explicitly closed in the window. rate is null when
 *  nothing has been closed — "no data" and "0%" are different claims. */
export function leadWinRate(
  leads: Pick<PipelineLead, "closedOutcome" | "closedAt">[],
  cutoffMs: number | null,
): { won: number; lost: number; rate: number | null } {
  let won = 0, lost = 0;
  for (const l of leads) {
    if (l.closedOutcome === "") continue;
    if (cutoffMs !== null && (!l.closedAt || Date.parse(l.closedAt) < cutoffMs)) continue;
    if (l.closedOutcome === "won") won += 1;
    else lost += 1;
  }
  const closed = won + lost;
  return { won, lost, rate: closed > 0 ? won / closed : null };
}
