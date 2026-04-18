// ============================================================
// Slate SaaS tier helpers — thin adapter over organizations.plan + project_limit
// ============================================================
//
// Design notes:
// - Feature gating in Slate is already handled by the OrgFeatures boolean flags
//   (see AppLayout nav `feature:` keys and DashboardPage `isFeatureVisible`).
//   The Stripe webhook is the component that syncs OrgFeatures to the paid plan
//   (enables Pro features when plan='pro', disables them on downgrade). That keeps
//   one source of truth for UI gating: `organization.features`.
//
// - This file adds what OrgFeatures alone can't express:
//   1. `getEffectiveTier(org)` — a string ("free"/"basic"/"pro") used by pricing-page
//      buttons (Upgrade / Downgrade / Manage) and UpgradeDialog copy
//   2. `getProjectLimitState(org, projectCount)` — project cap enforcement,
//      including post-downgrade overflow state where existing projects are
//      preserved but creation is blocked
//
// - Grandfathering: an org can have plan='pro' with project_limit=-1 without
//   a stripe_subscription_id (e.g. SDub Media, set manually). Treat these as Pro.
// ============================================================

import type { Organization } from "./types";

export type SlateTier = "free" | "basic" | "pro";

export function getEffectiveTier(org: Organization | null): SlateTier {
  if (!org) return "free";
  const plan = (org.plan || "").toLowerCase();
  if (plan === "pro") return "pro";
  if (plan === "basic") return "basic";
  return "free";
}

export interface ProjectLimitState {
  limit: number;          // -1 = unlimited
  currentCount: number;
  isOverLimit: boolean;   // current > limit (possible after paid → free downgrade)
  atLimit: boolean;       // current >= limit (creation blocked)
  allowNew: boolean;
}

export function getProjectLimitState(org: Organization | null, currentCount: number): ProjectLimitState {
  const limit = org?.projectLimit ?? 10;
  if (limit === -1) {
    return { limit: -1, currentCount, isOverLimit: false, atLimit: false, allowNew: true };
  }
  return {
    limit,
    currentCount,
    isOverLimit: currentCount > limit,
    atLimit: currentCount >= limit,
    allowNew: currentCount < limit,
  };
}

// Tier label for display (UpgradeDialog, Subscription page).
export function getTierLabel(tier: SlateTier): string {
  if (tier === "pro") return "Pro";
  if (tier === "basic") return "Basic";
  return "Free";
}
