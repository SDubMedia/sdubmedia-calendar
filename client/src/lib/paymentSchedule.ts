// ============================================================
// paymentSchedule — turns a payment_schedule block's structured terms into
// the sentence a human reads.
//
// Shared deliberately. The builder shows the owner a summary of the terms
// they just set; the client-facing agreement has to say the same thing with
// real dollars attached. Two copies of this wording would drift, and the
// version a client signs is the one that matters.
// ============================================================

import type { ProposalBlock } from "./types";

type Schedule = Extract<ProposalBlock, { type: "payment_schedule" }>;
export type DepositTerm = Schedule["deposit"];
export type BalanceTerm = Schedule["balance"];

export function formatMoney(amount: number): string {
  return `$${amount.toLocaleString("en-US", {
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

/** What the deposit works out to, or null when the total isn't known yet
 *  (the builder, where nothing has been sold). A percentage of nothing is
 *  "$0", which reads as free — better to show no figure at all. */
export function depositAmount(d: DepositTerm, total?: number): number | null {
  if (d.kind === "fixed") return d.value;
  if (total == null || total <= 0) return null;
  return Math.round(total * d.value) / 100;
}

export function balanceAmount(d: DepositTerm, total?: number): number | null {
  if (total == null || total <= 0) return null;
  const deposit = depositAmount(d, total);
  if (deposit == null) return null;
  return Math.round((total - deposit) * 100) / 100;
}

/** "1 days before event" is not what you want a client reading in a contract. */
function days(n: number): string {
  return `${n} ${n === 1 ? "day" : "days"}`;
}

export function summarizeMilestone(d: DepositTerm, defaultLabel: string, total?: number): string {
  const share = d.kind === "percent" ? `${d.value}%` : formatMoney(d.value);
  const money = depositAmount(d, total);
  // A fixed deposit already states its dollars — repeating them reads as a
  // second charge.
  const amount = money != null && d.kind === "percent" ? ` (${formatMoney(money)})` : "";
  let due: string;
  if (d.dueType === "at_signing") due = "at signing";
  else if (d.dueType === "relative_days") due = `${days(d.dueDays ?? 0)} after signing`;
  else if (d.dueType === "absolute_date" && d.dueDate) due = `on ${d.dueDate}`;
  else due = "—";
  return `${d.label || defaultLabel}: ${share}${amount} due ${due}`;
}

export function summarizeBalance(b: BalanceTerm, d: DepositTerm, total?: number): string {
  const remainder = d.kind === "percent"
    ? `${Math.max(0, 100 - d.value)}%`
    : "Remaining balance";
  const money = balanceAmount(d, total);
  const amount = money != null ? ` (${formatMoney(money)})` : "";
  let due: string;
  if (b.dueType === "at_signing") due = "at signing";
  else if (b.dueType === "on_event_date") due = "on the event date";
  else if (b.dueType === "relative_days") due = `${days(b.dueDays ?? 0)} before the event`;
  else if (b.dueType === "absolute_date" && b.dueDate) due = `on ${b.dueDate}`;
  else due = "—";
  return `${b.label || "Balance"}: ${remainder}${amount} due ${due}`;
}
