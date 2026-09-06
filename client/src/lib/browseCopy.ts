// ============================================================
// The browse copy: a resized JPEG the gallery grid and hero load instead
// of the full-resolution file.
//
// Every photo used to be browsed at full size — an 8MB frame for a tile
// 400px wide, times fifty tiles: a real estate gallery pulled 170MB on
// first open (2026-09-06). The deliverable is untouched; this is only what
// the page draws. Stored in delivery_files.thumbnail_storage_path, the
// same slot a video's poster frame uses. The lightbox still opens the full
// file.
// ============================================================

/** Long edge of the browse copy. 2048 stays sharp on a retina laptop and
 *  runs 300–700KB for a typical frame. */
export const BROWSE_MAX_EDGE = 2048;
const BROWSE_QUALITY = 0.8;

/** Returns null when the image is already no larger than the cap (nothing
 *  to gain) or when the browser can't decode it — callers fall back to the
 *  full file, which is exactly what happened before this existed. */
export async function makeBrowseCopy(file: Blob, maxEdge = BROWSE_MAX_EDGE): Promise<Blob | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const { width, height } = bitmap;
    if (Math.max(width, height) <= maxEdge) { bitmap.close?.(); return null; }
    const scale = maxEdge / Math.max(width, height);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) { bitmap.close?.(); return null; }
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", BROWSE_QUALITY));
  } catch (err) {
    console.warn("Browse copy skipped — full file will be browsed instead:", err);
    return null;
  }
}
