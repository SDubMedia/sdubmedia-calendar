// Default payment milestones for a brand-new blank proposal.
//
// If the org has set a default deposit percent (Settings → Default Billing),
// every new blank proposal starts with that deposit as an at-signing
// milestone, so a retainer is never forgotten. The owner can still edit or
// remove it before sending, and the existing at-signing collection flow
// (proposal-accept / contract-sign) takes it from there.
//
// Returns [] when no default is set, preserving the prior empty behavior.

import { nanoid } from "nanoid";
import type { Organization, PaymentMilestone } from "./types";

export function defaultDepositMilestones(org?: Organization | null): PaymentMilestone[] {
  const pct = org?.businessInfo?.defaultDepositPercent ?? 0;
  if (!pct || pct <= 0) return [];
  return [
    {
      id: nanoid(6),
      label: `${pct}% Deposit`,
      type: "percent",
      percent: pct,
      dueType: "at_signing",
      status: "pending",
    },
  ];
}
