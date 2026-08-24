// ============================================================
// Reads a photo's ORIGINAL capture time out of its EXIF.
//
// This is the spine of mini-session photo sorting: the camera's own clock is
// what tells us the order frames were shot in, and therefore which QR frame
// each photo comes after. Filenames can't be trusted (Lightroom exports get
// renamed) and file.lastModified is the export time, not the shutter time.
//
// Deliberately hand-rolled rather than adding an EXIF dependency: the repo
// already walks TIFF IFDs for orientation in rawPreview.ts, and this only
// needs one more hop — IFD0 → the ExifIFD pointer (0x8769) → DateTimeOriginal
// (0x9003).
//
// MUST run on the ORIGINAL File. toUploadableImage() re-encodes through a
// canvas, which throws EXIF away entirely.
// ============================================================

/** Bytes from the head of the file — EXIF lives near the front, so we never
 *  need to read a 40 MB RAW in full to find a timestamp. */
const HEAD_BYTES = 256 * 1024;

/** "2026:10:11 14:23:07" → ms since epoch (local, like the camera meant it). */
export function parseExifDate(s: string): number | null {
  const m = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(String(s || "").trim());
  if (!m) return null;
  const [, y, mo, d, h, mi, sec] = m;
  const t = new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(sec)).getTime();
  return Number.isFinite(t) ? t : null;
}

/** Read an ASCII tag value out of a TIFF entry. */
function readAscii(dv: DataView, bytes: Uint8Array, entry: number, le: boolean, tiffStart: number): string {
  const count = dv.getUint32(entry + 4, le);
  if (count === 0 || count > 64) return "";
  // Values ≤4 bytes sit inline; longer ones are at an offset from the TIFF header.
  const at = count <= 4 ? entry + 8 : tiffStart + dv.getUint32(entry + 8, le);
  if (at < 0 || at + count > bytes.length) return "";
  let out = "";
  for (let i = 0; i < count; i++) {
    const c = bytes[at + i];
    if (c === 0) break;
    out += String.fromCharCode(c);
  }
  return out;
}

/** Walk one IFD; returns the value of `want`, and (optionally) follows a
 *  sub-IFD pointer tag first. */
function scanIfd(dv: DataView, bytes: Uint8Array, ifdAt: number, le: boolean, tiffStart: number, want: number, followTag?: number): string {
  if (ifdAt + 2 > bytes.length) return "";
  const n = dv.getUint16(ifdAt, le);
  // A corrupt header can claim thousands of entries; cap the walk.
  if (n > 512) return "";
  let subIfd = 0;
  for (let i = 0; i < n; i++) {
    const e = ifdAt + 2 + i * 12;
    if (e + 12 > bytes.length) break;
    const tag = dv.getUint16(e, le);
    if (tag === want) {
      const v = readAscii(dv, bytes, e, le, tiffStart);
      if (v) return v;
    }
    if (followTag && tag === followTag) subIfd = dv.getUint32(e + 8, le);
  }
  if (subIfd) return scanIfd(dv, bytes, tiffStart + subIfd, le, tiffStart, want);
  return "";
}

/** Find the TIFF header inside a JPEG's APP1/Exif segment, or 0 for a bare
 *  TIFF/RAW file (which starts with the header itself). */
function findTiffStart(bytes: Uint8Array): number {
  if ((bytes[0] === 0x49 && bytes[1] === 0x49) || (bytes[0] === 0x4d && bytes[1] === 0x4d)) return 0;
  if (!(bytes[0] === 0xff && bytes[1] === 0xd8)) return -1; // not a JPEG either
  let p = 2;
  while (p + 4 < bytes.length) {
    if (bytes[p] !== 0xff) { p++; continue; }
    const marker = bytes[p + 1];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { p += 2; continue; }
    const size = (bytes[p + 2] << 8) | bytes[p + 3];
    if (marker === 0xe1) {
      // APP1: "Exif\0\0" then the TIFF header.
      const h = p + 4;
      if (bytes[h] === 0x45 && bytes[h + 1] === 0x78 && bytes[h + 2] === 0x69 && bytes[h + 3] === 0x66) return h + 6;
    }
    if (marker === 0xda) break; // start of scan — EXIF would have come first
    if (size < 2) break;
    p += 2 + size;
  }
  return -1;
}

/** DateTimeOriginal in ms, or null when the file carries none. */
export function captureTimeFromBuffer(buffer: ArrayBuffer): number | null {
  const bytes = new Uint8Array(buffer);
  if (bytes.length < 16) return null;
  const tiffStart = findTiffStart(bytes);
  if (tiffStart < 0 || tiffStart + 8 > bytes.length) return null;

  const le = bytes[tiffStart] === 0x49 && bytes[tiffStart + 1] === 0x49;
  const be = bytes[tiffStart] === 0x4d && bytes[tiffStart + 1] === 0x4d;
  if (!le && !be) return null;
  const dv = new DataView(buffer);
  if (dv.getUint16(tiffStart + 2, le) !== 42) return null;

  const ifd0 = tiffStart + dv.getUint32(tiffStart + 4, le);
  // 0x9003 DateTimeOriginal lives in the Exif sub-IFD (pointer tag 0x8769);
  // 0x0132 DateTime in IFD0 is the fallback (some cameras/edits only set it).
  const original = scanIfd(dv, bytes, ifd0, le, tiffStart, 0x9003, 0x8769);
  if (original) return parseExifDate(original);
  const modified = scanIfd(dv, bytes, ifd0, le, tiffStart, 0x0132);
  return modified ? parseExifDate(modified) : null;
}

/**
 * Capture time for a file, falling back to its lastModified stamp so a photo
 * that lost its EXIF still lands somewhere sane in the order rather than
 * dropping out of the sort entirely.
 */
export async function captureTimeOf(file: File): Promise<{ ms: number; fromExif: boolean }> {
  try {
    const head = await file.slice(0, HEAD_BYTES).arrayBuffer();
    const exif = captureTimeFromBuffer(head);
    if (exif != null) return { ms: exif, fromExif: true };
  } catch { /* unreadable header — fall through */ }
  return { ms: file.lastModified || 0, fromExif: false };
}
