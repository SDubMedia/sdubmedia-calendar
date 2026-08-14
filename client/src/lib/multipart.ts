// Pure maths behind resumable multipart uploads.
//
// Extracted from DeliveriesPage so it can be tested directly. Everything here
// decides which parts of a file R2 already has and therefore which ones get
// skipped — get it wrong and the upload still "succeeds", but the assembled
// video is missing a chunk in the middle. That failure is invisible until a
// client presses play, so it is worth testing properly.

export interface ListedPart {
  partNumber: number;
  /** Bytes R2 says it stored. -1 when the listing omitted a size. */
  size: number;
}

/**
 * How big part `n` of this file should be. Every part is `partSize` except the
 * last, which is the remainder.
 *
 * The `complete` handler in api/delivery-multipart.ts applies this same formula
 * server-side to verify what R2 actually stored. Duplicated deliberately (api/
 * files stay self-contained) — change both together.
 */
export function expectedPartSize(fileSize: number, partSize: number, n: number): number {
  return Math.min(partSize, fileSize - (n - 1) * partSize);
}

/** How many parts a file of this size splits into. */
export function partCountFor(fileSize: number, partSize: number): number {
  return Math.ceil(fileSize / partSize);
}

/**
 * Which part numbers can be skipped on a resume.
 *
 * A part only counts as done when R2 reports it at EXACTLY the size we would
 * have sent. A short part means the connection died mid-PUT and R2 kept the
 * truncated body; trusting it would leave a hole in the finished file. Re-PUT
 * overwrites a part, so re-sending a doubtful one is always safe — the only
 * cost is bandwidth, and the only cost of getting it wrong is a corrupt
 * delivery.
 *
 * Part numbers outside 1..partCount are ignored: they belong to a different
 * slicing of the file (a changed PART_SIZE) and their offsets do not line up.
 */
export function resumablePartNumbers(
  fileSize: number,
  partSize: number,
  partCount: number,
  listed: ListedPart[],
): Set<number> {
  const done = new Set<number>();
  if (fileSize <= 0 || partSize <= 0 || partCount <= 0) return done;
  for (const p of listed) {
    if (!Number.isInteger(p.partNumber) || p.partNumber < 1 || p.partNumber > partCount) continue;
    if (p.size !== expectedPartSize(fileSize, partSize, p.partNumber)) continue;
    done.add(p.partNumber);
  }
  return done;
}
