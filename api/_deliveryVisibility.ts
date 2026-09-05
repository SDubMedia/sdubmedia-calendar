// ============================================================
// Which half of a proofing gallery the public link serves.
//
// Proofing splits a gallery in two: the shots the client picks from, and
// the finished files she receives. Serving the whole table would put 198
// rejects next to the 15 she's paying for, which is what the stage column
// exists to prevent. The same link is what the owner opens to preview, so
// the decision also depends on WHO is looking. Pure so it can be tested.
// ============================================================

export interface StagedRow {
  stage?: string | null;
}

export interface GalleryVisibility<T> {
  rows: T[];
  /** True only when a team member is seeing finals the client can't yet —
   *  the page shows a banner so the owner knows the client still sees proofs. */
  previewingFinals: boolean;
}

/**
 * - No proofs at all (every real-estate delivery, everything before proofing
 *   existed): every row, regardless of status. Unchanged behavior.
 * - Proofs but no finals yet: the proofs.
 * - Both, and the gallery is delivered: the finals, and only those.
 * - Both, not yet delivered, viewer is on the team (owner/partner/staff of
 *   the org): the finals — this is the owner's Preview before pressing
 *   Deliver — flagged so the page can say the client doesn't see this yet.
 * - Both, not yet delivered, anyone else: the proofs. The client never sees
 *   a finished file until the owner presses Deliver.
 */
export function visibleGalleryRows<T extends StagedRow>(
  rows: T[],
  status: string,
  viewerIsTeam: boolean,
): GalleryVisibility<T> {
  const proofs = rows.filter(r => r.stage === "proof");
  const finals = rows.filter(r => r.stage !== "proof");
  if (proofs.length === 0) return { rows, previewingFinals: false };
  if (finals.length === 0) return { rows: proofs, previewingFinals: false };
  if (status === "delivered") return { rows: finals, previewingFinals: false };
  if (viewerIsTeam) return { rows: finals, previewingFinals: true };
  return { rows: proofs, previewingFinals: false };
}
