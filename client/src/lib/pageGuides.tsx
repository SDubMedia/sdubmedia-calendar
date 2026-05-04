// ============================================================
// Per-page first-visit guide content + page-id resolution.
// Each guide opens once per user as a modal on first visit
// and is reachable afterwards via the floating ? help button.
//
// Scope: only pages that aren't self-evident from their name +
// empty state get a guide. Calendar, Clients, Locations, Staff,
// Proposals, Invoices, Reports, Settings don't need a popup —
// the empty state explains itself, and the setup checklist on
// Dashboard already points users to where they need to go.
// ============================================================

import type { ReactNode } from "react";

export interface PageGuideContent {
  pageId: string;
  title: string;
  intro: string;
  bullets: { heading: string; body: string }[];
  primaryCta?: { label: string; href: string };
}

// Maps a route path to a guide. Sub-routes inherit the parent
// guide unless they have their own entry. Use lowercase paths
// without trailing slashes.
const GUIDES: Record<string, PageGuideContent> = {
  "/pipeline": {
    pageId: "pipeline",
    title: "Pipeline — your sales board",
    intro: "Pipeline is where new leads live before they become paying projects. Think of each card as a deal you're working.",
    bullets: [
      { heading: "Add a lead", body: "Click + Add Lead to capture a name, project type, and rough budget. No client record needed yet." },
      { heading: "Move it through your stages", body: "Drag cards between the columns to track each deal's status. You can rename or reorder the stages in Settings to match how you actually sell." },
      { heading: "Convert to a real project", body: "When a deal lands, convert the lead into a client + project. That's where contracts and invoices pick up the rest of the flow." },
    ],
    primaryCta: { label: "View Proposals →", href: "/proposals" },
  },
  "/contracts": {
    pageId: "contracts",
    title: "Contracts — the legal piece",
    intro: "Contracts are what your client e-signs. They include your terms, deposit milestones, and (optionally) an auto-rendered invoice page.",
    bullets: [
      { heading: "Multi-page contracts", body: "A contract can have multiple pages: Agreement (the legal text), Invoice (auto-rendered from milestones), Payment Schedule, and Custom pages. Reorder them with the arrows on the left." },
      { heading: "Deposit milestones", body: "Set up a deposit (at-signing milestone) to collect money the moment the client signs. Stripe Connect handles the payment — funds go straight to your account." },
      { heading: "Status flow", body: "Draft → Sent → Client Signed → Owner Countersigned → Completed. The linked project flips to Tentative when sent and to Upcoming when the deposit pays." },
    ],
    primaryCta: { label: "View Contracts →", href: "/contracts" },
  },
  "/deliveries": {
    pageId: "deliveries",
    title: "Galleries — delivering finished work",
    intro: "Galleries are how clients receive their photos and videos. Each gallery has a custom URL, cover layout, and (optional) password.",
    bullets: [
      { heading: "Cover + slug", body: "Pick from 8 cover layouts (center, vintage, minimal, left, stripe, frame, divider, stamp) and a custom URL slug. The gallery URL becomes slate.sdubmedia.com/g/<slug>." },
      { heading: "Proofing & selections", body: "Clients can favorite/select images. You see their picks back on the delivery page. Useful when narrowing down a shoot." },
      { heading: "Watermark & print orders", body: "Toggle watermark on/off per gallery. Print orders are request-only for now — clients submit requests through the gallery." },
    ],
    primaryCta: { label: "View Galleries →", href: "/deliveries" },
  },
};

// Resolves the active route to a guide. Falls back to a fuzzy
// prefix match so /pipeline/123 still surfaces the /pipeline guide.
export function getGuideForPath(path: string): PageGuideContent | null {
  const normalized = path.replace(/\/+$/, "") || "/";
  if (GUIDES[normalized]) return GUIDES[normalized];
  for (const key of Object.keys(GUIDES)) {
    if (key !== "/" && normalized.startsWith(key)) return GUIDES[key];
  }
  return null;
}

// Used to pre-populate the seenGuides map for users who completed
// onboarding before this system shipped — they don't need to re-see
// the same content. Keep this in sync with the SQL backfill
// migration.
export const ALL_PAGE_IDS = Object.values(GUIDES).map(g => g.pageId);

// Wraps the bullets in JSX for the modal. Kept here so guide
// authors don't need to know the modal structure to add content.
export function renderGuideBody(guide: PageGuideContent): ReactNode {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground leading-relaxed">{guide.intro}</p>
      <ul className="space-y-3">
        {guide.bullets.map((b, i) => (
          <li key={i} className="space-y-0.5">
            <div className="text-sm font-semibold text-foreground">{b.heading}</div>
            <div className="text-sm text-muted-foreground leading-relaxed">{b.body}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}
