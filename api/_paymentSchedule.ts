// ============================================================
// Pure payment-schedule helpers — extracted from proposal-accept so
// they're independently testable. No supabase / fetch / I/O — only
// shape transformations between the editor's `payment_schedule` block
// and the contract generator's milestone array.
// ============================================================

export interface PartialMilestone {
  label?: string;
  type?: "percent" | "fixed";
  percent?: number;
  fixedAmount?: number;
  amount?: number;
  dueType?: "at_signing" | "relative_days" | "absolute_date";
  dueDays?: number;
  dueDate?: string;
}

interface PaymentScheduleDeposit {
  kind?: "percent" | "fixed";
  value?: number | string;
  dueType?: "at_signing" | "relative_days" | "absolute_date";
  dueDays?: number;
  dueDate?: string;
  label?: string;
}

interface PaymentScheduleBalance {
  dueType?: "at_signing" | "absolute_date" | "relative_days" | "on_event_date";
  dueDays?: number | string;
  dueDate?: string;
  label?: string;
}

/**
 * Extract payment_schedule blocks from a template's structured blocks array
 * and convert them into the MilestoneInput format the contract generator
 * expects. Returns [] if the template has no payment_schedule blocks (caller
 * should fall back to legacy package-based milestones).
 *
 * Handles "on_event_date" and "relative_days before event" by resolving
 * against the proposal's event date. Falls back to "at_signing" if no event
 * date is set so we never produce a milestone with no due date.
 */
export function extractPaymentScheduleMilestones(
  blocks: unknown,
  eventDateIso: string,
  total: number,
): PartialMilestone[] {
  if (!Array.isArray(blocks)) return [];
  const result: PartialMilestone[] = [];
  // Honor only the FIRST payment_schedule block. Multi-page templates can
  // accidentally drop a payment_schedule on the agreement page AND a
  // dedicated Payment page — without dedup we'd produce two deposit + two
  // balance milestones, doubling what the client owes.
  let alreadySeenSchedule = false;
  for (const b of blocks) {
    if (!b || typeof b !== "object") continue;
    const block = b as { type?: string; deposit?: PaymentScheduleDeposit; balance?: PaymentScheduleBalance };
    if (block.type !== "payment_schedule" || !block.deposit || !block.balance) continue;
    if (alreadySeenSchedule) continue;
    alreadySeenSchedule = true;

    const dep = block.deposit;
    const bal = block.balance;

    // Deposit milestone
    const depositLabel = dep.label || "Deposit";
    const depositMs: PartialMilestone = {
      label: depositLabel,
      type: dep.kind === "percent" ? "percent" : "fixed",
      percent: dep.kind === "percent" ? Number(dep.value) || 0 : undefined,
      fixedAmount: dep.kind === "fixed" ? Number(dep.value) || 0 : undefined,
      dueType: dep.dueType || "at_signing",
      dueDays: dep.dueDays,
      dueDate: dep.dueDate,
    };
    result.push(depositMs);

    // Balance milestone — remaining percent (or remaining dollars)
    const balanceLabel = bal.label || "Balance";
    const remainder: PartialMilestone = dep.kind === "percent"
      ? {
          label: balanceLabel,
          type: "percent",
          percent: Math.max(0, 100 - (Number(dep.value) || 0)),
        }
      : {
          label: balanceLabel,
          type: "fixed",
          fixedAmount: Math.max(0, total - (Number(dep.value) || 0)),
        };

    // Resolve balance due date
    if (bal.dueType === "on_event_date") {
      remainder.dueType = "absolute_date";
      remainder.dueDate = eventDateIso || undefined;
      if (!eventDateIso) remainder.dueType = "at_signing";
    } else if (bal.dueType === "relative_days") {
      // "X days before event" — convert to absolute_date if we have eventDateIso
      const days = Number(bal.dueDays) || 0;
      if (eventDateIso && days > 0) {
        const d = new Date(eventDateIso + "T00:00:00");
        d.setDate(d.getDate() - days);
        remainder.dueType = "absolute_date";
        remainder.dueDate = d.toISOString().slice(0, 10);
      } else {
        remainder.dueType = "relative_days";
        remainder.dueDays = days;
      }
    } else if (bal.dueType === "absolute_date") {
      remainder.dueType = "absolute_date";
      remainder.dueDate = bal.dueDate;
    } else {
      remainder.dueType = "at_signing";
    }

    result.push(remainder);
  }
  return result;
}
