// Prep a photo for upload: convert iPhone HEIC/HEIF to JPEG (browsers can't
// display HEIC) AND re-encode every image to JPEG at 80% quality, full
// resolution. This keeps galleries small (~5MB/photo instead of 30MB+) so they
// load fast and download reliably. Runs client-side before upload. Videos and
// non-images pass straight through, and if re-encoding an already-small file
// would make it bigger, the original is kept. On any failure the original
// uploads, so a photo is never lost.
const QUALITY = 0.8;

export async function toUploadableImage(file: File): Promise<File> {
  const isHeic = /image\/hei[cf]/i.test(file.type) || /\.(heic|heif)$/i.test(file.name);
  const isImage = isHeic || file.type.startsWith("image/") || /\.(jpe?g|png|webp|tiff?|bmp)$/i.test(file.name);
  // Leave videos, animated GIFs, and anything non-image untouched.
  if (!isImage || /gif$/i.test(file.type) || /\.gif$/i.test(file.name)) return file;

  try {
    // HEIC must be decoded by heic2any (canvas can't decode it everywhere).
    if (isHeic) {
      const mod: any = await import("heic2any");
      const heic2any = mod.default ?? mod;
      const out = await heic2any({ blob: file, toType: "image/jpeg", quality: QUALITY });
      const blob: Blob = Array.isArray(out) ? out[0] : out;
      return new File([blob], file.name.replace(/\.(heic|heif)$/i, ".jpg"), { type: "image/jpeg" });
    }

    // Every other image: re-encode to JPEG at 80%, full resolution.
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    // White backing so a transparent PNG doesn't turn black as a JPEG.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close?.();
    const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", QUALITY));
    if (!blob) return file;
    // Don't bloat an already-optimized small file.
    if (blob.size >= file.size) return file;
    const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], name, { type: "image/jpeg" });
  } catch {
    return file;
  }
}
