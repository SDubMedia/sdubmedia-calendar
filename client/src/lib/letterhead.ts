// ============================================================
// Which business details a document should display.
//
// A sent document carries a stamp of the business as it was that day. An
// unsent one — a draft still being edited — has no stamp and shows the live
// org, which is correct: a draft should reflect the business as it is now.
//
// Documents created before this existed also have no stamp and keep rendering
// live. That is deliberate. See migrations/2026-08-27-letterhead-snapshot.sql.
// ============================================================

import type { OrgBusinessInfo } from "@/lib/types";

export interface LetterheadSnapshot {
  orgName: string;
  ownerName: string;
  logoUrl: string;
  businessInfo: OrgBusinessInfo | null;
  /** When the stamp was taken — the moment the document was sent. */
  stampedAt: string;
}

export interface LiveOrg {
  name?: string | null;
  logoUrl?: string | null;
  businessInfo?: OrgBusinessInfo | null;
}

export interface Letterhead {
  orgName: string;
  ownerName: string;
  orgLogo: string;
  businessInfo: OrgBusinessInfo | null;
  /** True when these came off a stamp rather than the live org. */
  frozen: boolean;
}

/**
 * Build the stamp. Called once, when a document is sent.
 *
 * Takes a plain object rather than the org row so the API side can call it with
 * whatever shape it has.
 */
export function captureLetterhead(
  org: LiveOrg,
  ownerName: string,
  stampedAt: string,
): LetterheadSnapshot {
  return {
    orgName: org.name || "",
    ownerName: ownerName || "",
    logoUrl: org.logoUrl || "",
    businessInfo: org.businessInfo || null,
    stampedAt,
  };
}

/**
 * What to render. Prefers the stamp; falls back to the live org.
 *
 * The fallback is not a safety net — it is the correct behaviour for drafts and
 * for everything sent before the freeze existed.
 */
export function letterheadFor(
  snapshot: LetterheadSnapshot | null | undefined,
  org: LiveOrg | null | undefined,
  liveOwnerName = "",
): Letterhead {
  if (snapshot) {
    return {
      orgName: snapshot.orgName,
      ownerName: snapshot.ownerName,
      orgLogo: snapshot.logoUrl,
      businessInfo: snapshot.businessInfo,
      frozen: true,
    };
  }
  return {
    orgName: org?.name || "",
    ownerName: liveOwnerName,
    orgLogo: org?.logoUrl || "",
    businessInfo: org?.businessInfo || null,
    frozen: false,
  };
}

/**
 * A stamp is taken once and never replaced.
 *
 * Re-sending a contract must not re-stamp it: the client already holds a copy
 * showing the original header, and quietly swapping it for a newer one is the
 * exact problem this whole mechanism exists to prevent.
 */
export function shouldCaptureLetterhead(
  existing: LetterheadSnapshot | null | undefined,
  nextStatus: string | undefined,
): boolean {
  if (existing) return false;
  return nextStatus === "sent";
}
