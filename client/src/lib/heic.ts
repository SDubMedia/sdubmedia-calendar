// Convert iPhone HEIC/HEIF photos to JPEG so they display in galleries —
// browsers can't render HEIC. Runs client-side before upload, at maximum
// quality and full resolution (no downscaling), so the photo is visually
// identical to the original. Non-HEIC files (JPEG/PNG/etc.) pass through
// untouched. heic2any (libheif) is loaded only when a HEIC is actually
// encountered, so it never weighs down the normal upload path.
export async function toUploadableImage(file: File): Promise<File> {
  const isHeic = /image\/hei[cf]/i.test(file.type) || /\.(heic|heif)$/i.test(file.name);
  if (!isHeic) return file;
  try {
    const mod: any = await import("heic2any");
    const heic2any = mod.default ?? mod;
    const out = await heic2any({ blob: file, toType: "image/jpeg", quality: 1 });
    const blob: Blob = Array.isArray(out) ? out[0] : out;
    const name = file.name.replace(/\.(heic|heif)$/i, ".jpg");
    return new File([blob], name, { type: "image/jpeg" });
  } catch {
    // If conversion fails, upload the original rather than lose the photo.
    return file;
  }
}
