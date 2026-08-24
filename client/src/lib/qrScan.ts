// ============================================================
// Finds a mini-session booking token in a photo.
//
// On shoot day the photographer shoots each party's QR code before their
// session, so those frames are the dividers that split a memory card into
// per-family galleries. This runs BEFORE upload, on the local File, which
// sidesteps the canvas-tainting problem you'd hit reading pixels back off R2.
// ============================================================

import jsQR from "jsqr";

/** Long edge we downscale to before decoding. A 45-megapixel frame decodes no
 *  better than a 1024px one and costs ~40× the work; a QR that fills a phone
 *  screen in-frame is still ~200px at this size. */
const SCAN_EDGE = 1024;

/** Pull the booking token out of whatever the QR encodes. Accepts a full
 *  booking URL (what we generate) or a bare token, so a re-printed or
 *  hand-made code still resolves. */
export function tokenFromQrText(text: string): string | null {
  const raw = String(text || "").trim();
  if (!raw) return null;
  const m = /\/msb\/([A-Za-z0-9_-]{6,})/.exec(raw);
  if (m) return m[1];
  if (/^[A-Za-z0-9_-]{10,32}$/.test(raw)) return raw;
  return null;
}

async function bitmapFor(file: File): Promise<ImageBitmap | null> {
  try {
    return await createImageBitmap(file);
  } catch {
    return null; // RAW or a format the browser can't decode — caller falls back
  }
}

/**
 * Scan one file. Returns the booking token if this frame IS a QR code,
 * otherwise null (i.e. "this is a real photo").
 */
export async function scanFileForToken(file: File): Promise<string | null> {
  const bitmap = await bitmapFor(file);
  if (!bitmap) return null;
  try {
    const scale = Math.min(1, SCAN_EDGE / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, w, h);
    const { data } = ctx.getImageData(0, 0, w, h);

    // "attemptBoth" also tries inverted — a QR shot off a phone screen at an
    // angle often reads as light-on-dark.
    const found = jsQR(data, w, h, { inversionAttempts: "attemptBoth" });
    return found?.data ? tokenFromQrText(found.data) : null;
  } catch {
    return null;
  } finally {
    bitmap.close?.();
  }
}
