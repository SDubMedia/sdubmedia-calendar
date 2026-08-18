// ============================================================
// rawPreview — pull the JPEG a camera embeds inside a raw file.
//
// WHY: no browser can decode .NEF/.CR2/.ARW, so a raw uploaded to a gallery
// renders as a grey tile with a filename on it and a client has nothing to
// choose between. But every camera writes at least one JPEG *inside* the raw
// — it's what the camera's own back screen displays — and a JPEG is something
// a browser can show.
//
// HOW: raws are overwhelmingly TIFF containers (NEF, CR2, ARW, DNG, ORF, RW2,
// PEF, SRW, RAF) and the previews sit in them as complete JPEG streams. Rather
// than parse each vendor's IFD layout — a different dialect per manufacturer,
// and they change between camera generations — this scans the bytes for JPEG
// start/end markers and keeps the biggest complete stream it finds. Crude, but
// format-agnostic: it works the same on a CR3's ISO-BMFF container as on a
// TIFF-based NEF, and a new camera model can't break it.
//
// WHAT YOU GET is whatever the camera chose to embed, which varies a lot by
// manufacturer — full-resolution on most Nikon and Canon bodies, around
// 1616×1080 on many Sony ones. Fine for choosing between frames either way;
// this is not a substitute for the real file, which is why the raw itself is
// what gets stored alongside.
// ============================================================

/** JPEG stream found inside a container. */
export interface EmbeddedJpeg {
  blob: Blob;
  /** Byte offset it started at — only useful for diagnostics. */
  offset: number;
  bytes: number;
}

const SOI_0 = 0xff, SOI_1 = 0xd8, SOI_2 = 0xff;   // start of image
const EOI_1 = 0xd9;                                 // end of image (0xFF 0xD9)

/**
 * Every complete-looking JPEG stream in `buffer`, largest first.
 *
 * A list rather than a single answer, because "largest" and "correct" aren't
 * the same thing and only decoding can tell them apart:
 *
 *  - Cameras embed several previews. A 160×120 thumbnail usually comes first,
 *    so taking the first match gets you a postage stamp — hence largest-first.
 *  - A stray FF D8 FF in sensor data pairs with a genuine EOI further on and
 *    produces a span LARGER than the real preview, made of garbage. It looks
 *    like the best candidate and isn't one.
 *  - A real JPEG legitimately contains a nested one (the EXIF thumbnail), so
 *    "stop at the next start marker" would truncate valid streams.
 *
 * So the caller walks this list and keeps the first that actually decodes.
 */
export function findEmbeddedJpegs(buffer: ArrayBuffer): EmbeddedJpeg[] {
  const b = new Uint8Array(buffer);
  const found: EmbeddedJpeg[] = [];

  for (let i = 0; i + 3 < b.length; i++) {
    // FF D8 FF — the SOI plus the first byte of the marker that must follow
    // it. Testing that third byte rejects most coincidental FF D8 pairs.
    if (b[i] !== SOI_0 || b[i + 1] !== SOI_1 || b[i + 2] !== SOI_2) continue;

    // The FIRST end marker after this start. A later one may also be valid
    // (nested thumbnail), but the nearest is the only one guaranteed to
    // belong to this stream.
    for (let j = i + 2; j + 1 < b.length; j++) {
      if (b[j] !== 0xff || b[j + 1] !== EOI_1) continue;
      const end = j + 2;
      const bytes = end - i;
      // A complete stream under 8KB is a thumbnail at best. Showing a client
      // a 160×120 tile to choose from is worse than admitting there's no
      // preview.
      if (bytes >= 8192) found.push({ blob: new Blob([b.subarray(i, end)], { type: "image/jpeg" }), offset: i, bytes });
      break;
    }
  }

  return found.sort((a, z) => z.bytes - a.bytes);
}

/** The biggest candidate. Kept for callers that only want a size estimate —
 *  it does NOT verify the stream decodes. */
export function findLargestEmbeddedJpeg(buffer: ArrayBuffer): EmbeddedJpeg | null {
  return findEmbeddedJpegs(buffer)[0] ?? null;
}

/**
 * The camera's Orientation tag, read from the raw's own TIFF header (IFD0,
 * tag 0x0112).
 *
 * It has to come from the RAW, not from the preview: the JPEG a camera embeds
 * carries no EXIF of its own, so a portrait frame extracts as a landscape
 * image lying on its side with nothing telling a browser to turn it. 57 of
 * one 198-frame shoot were exactly that.
 *
 * 1 = as stored. 6 and 8 are the quarter-turns; 5 and 7 are mirrored
 * quarter-turns. Anything ≥5 means width and height swap on screen.
 */
export function rawOrientation(buffer: ArrayBuffer): number {
  const b = new Uint8Array(buffer);
  if (b.length < 16) return 1;
  const le = b[0] === 0x49 && b[1] === 0x49;          // "II"
  const be = b[0] === 0x4d && b[1] === 0x4d;          // "MM"
  if (!le && !be) return 1;
  const dv = new DataView(buffer);
  if (dv.getUint16(2, le) !== 42) return 1;
  const ifd = dv.getUint32(4, le);
  if (ifd + 2 > b.length) return 1;
  const n = dv.getUint16(ifd, le);
  for (let i = 0; i < n; i++) {
    const e = ifd + 2 + i * 12;
    if (e + 12 > b.length) break;
    if (dv.getUint16(e, le) === 0x0112) return dv.getUint16(e + 8, le);
  }
  return 1;
}

/** Does this orientation put the image on its side? */
export function isQuarterTurn(orientation: number): boolean {
  return orientation >= 5 && orientation <= 8;
}

/**
 * Redraw a preview the right way up.
 *
 * Baked into the pixels rather than left to a CSS transform: the file is then
 * correct everywhere it goes — the client's gallery, the owner's grid, the
 * lightbox, and anything that downloads it — instead of correct only where
 * someone remembered to apply the rotation.
 */
export async function applyOrientation(file: File, orientation: number): Promise<{ file: File; width: number; height: number }> {
  const bitmap = await createImageBitmap(file);
  const turned = isQuarterTurn(orientation);
  const w = turned ? bitmap.height : bitmap.width;
  const h = turned ? bitmap.width : bitmap.height;

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) { bitmap.close?.(); return { file, width: bitmap.width, height: bitmap.height }; }

  // Standard EXIF transform table. Mirrored cases (2/4/5/7) are rare off a
  // camera but cost nothing to handle correctly.
  switch (orientation) {
    case 2: ctx.translate(w, 0); ctx.scale(-1, 1); break;
    case 3: ctx.translate(w, h); ctx.rotate(Math.PI); break;
    case 4: ctx.translate(0, h); ctx.scale(1, -1); break;
    case 5: ctx.rotate(0.5 * Math.PI); ctx.scale(1, -1); break;
    case 6: ctx.rotate(0.5 * Math.PI); ctx.translate(0, -h); break;
    case 7: ctx.rotate(0.5 * Math.PI); ctx.translate(w, -h); ctx.scale(-1, 1); break;
    case 8: ctx.rotate(-0.5 * Math.PI); ctx.translate(-w, 0); break;
    default: break;
  }
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close?.();

  const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
  if (!blob) return { file, width: w, height: h };
  return { file: new File([blob], file.name, { type: "image/jpeg" }), width: w, height: h };
}

/** True for the raw extensions we'd try to extract from. */
export const RAW_EXTENSIONS =
  /\.(nef|nrw|cr2|cr3|crw|arw|srf|sr2|dng|raf|orf|rw2|raw|pef|ptx|srw|x3f|3fr|fff|iiq|mos|mrw|erf|kdc|dcr|rwl)$/i;

export function isRawFile(name: string): boolean {
  return RAW_EXTENSIONS.test(name);
}

export interface RawPreviewResult {
  /** A browsable JPEG standing in for the raw, or null if none was usable. */
  preview: File | null;
  width: number | null;
  height: number | null;
  /** Why it failed, for a message worth reading. */
  reason?: "no-jpeg-found" | "undecodable" | "read-failed";
}

/**
 * Turn a raw file into something a gallery can display.
 *
 * Decodes what it extracts before returning it — a byte pattern that looks
 * like a JPEG isn't proof it is one, and a stand-in image that won't render
 * is worse than admitting there isn't one.
 */
export async function extractRawPreview(file: File): Promise<RawPreviewResult> {
  let buffer: ArrayBuffer;
  try {
    buffer = await file.arrayBuffer();
  } catch {
    return { preview: null, width: null, height: null, reason: "read-failed" };
  }

  const candidates = findEmbeddedJpegs(buffer);
  if (candidates.length === 0) return { preview: null, width: null, height: null, reason: "no-jpeg-found" };

  // Largest first, but proven before it's trusted: a byte pattern that looks
  // like a JPEG isn't one, and handing a gallery a stand-in that won't render
  // is worse than saying there wasn't one.
  let chosen: EmbeddedJpeg | null = null;
  let width: number | null = null;
  let height: number | null = null;
  for (const candidate of candidates) {
    try {
      const bitmap = await createImageBitmap(candidate.blob);
      width = bitmap.width;
      height = bitmap.height;
      bitmap.close?.();
      chosen = candidate;
      break;
    } catch { /* garbage span — try the next */ }
  }
  if (!chosen) return { preview: null, width: null, height: null, reason: "undecodable" };

  // Named after the raw, extension swapped: the filename is what the client
  // reads on the tile and what the editor matches back to the raw on disk, so
  // it has to stay recognisable.
  const previewName = file.name.replace(/\.[^.]+$/, "") + ".jpg";
  let preview = new File([chosen.blob], previewName, { type: "image/jpeg" });

  // Turn it the right way up. The camera recorded the rotation in the raw's
  // own header and the embedded JPEG doesn't carry it, so without this every
  // portrait frame reaches the client lying on its side.
  const orientation = rawOrientation(buffer);
  if (orientation > 1) {
    const fixed = await applyOrientation(preview, orientation);
    preview = new File([fixed.file], previewName, { type: "image/jpeg" });
    width = fixed.width;
    height = fixed.height;
  }

  return { preview, width, height };
}
