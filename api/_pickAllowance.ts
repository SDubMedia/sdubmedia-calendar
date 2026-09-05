// ============================================================
// How many picks a proofing client has left.
//
// The free allowance (selection_limit) is spent by two things:
//   1. photos ALREADY EDITED — finals in the gallery, videos excluded.
//      A pick whose proof was replaced by the finished file lives here now
//      (the row flipped to stage 'final'), as does any extra the editor
//      finished that was never picked. Geoff, 2026-09-05: reopening a round
//      with 14 finished photos on a 25 limit must offer 11 more, not 25.
//   2. picks still PENDING — selection rows whose file is still a proof.
// A pick is never in both buckets, so nothing double-counts.
//
// Galleries with no proofs at all (real estate, everything before proofing)
// have no "edited" concept: every file is a deliverable, and the old rule —
// picks vs. limit — is preserved exactly. Pure so it can be tested.
// ============================================================

export interface AllowanceFile {
  id: string;
  stage?: string | null;
  media_type?: string | null;
}

const hasProofs = (files: AllowanceFile[]) => files.some(f => f.stage === "proof");

/** Finished photos in a proofing gallery. 0 for a gallery with no proofs. */
export function countEditedPhotos(files: AllowanceFile[]): number {
  if (!hasProofs(files)) return 0;
  return files.filter(f => f.stage !== "proof" && f.media_type !== "video").length;
}

/** The subset of existing pick file-ids still waiting on an edit. In a
 *  gallery with no proofs every pick is "pending" in the old sense. */
export function pendingPickIds(selectionFileIds: string[], files: AllowanceFile[]): string[] {
  if (!hasProofs(files)) return selectionFileIds;
  const proofIds = new Set(files.filter(f => f.stage === "proof").map(f => f.id));
  return selectionFileIds.filter(id => proofIds.has(id));
}

/** Picks over the free limit once edited photos and pending picks are
 *  counted. `alreadyPendingIds` and `newIds` are unioned, so re-sending a
 *  heart that is already on file costs nothing extra. */
export function pickOverage(
  limit: number,
  editedPhotos: number,
  alreadyPendingIds: Iterable<string>,
  newIds: Iterable<string>,
): number {
  const combined = new Set([...alreadyPendingIds, ...newIds]);
  return Math.max(0, editedPhotos + combined.size - limit);
}

/** Free picks she can still make. */
export function picksRemaining(limit: number, editedPhotos: number, pendingCount: number): number {
  return Math.max(0, limit - editedPhotos - pendingCount);
}
