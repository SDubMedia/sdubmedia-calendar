// One-off: turn the 57 portrait proofs the right way up.
//
// They were extracted before the fix, so they're stored as sideways pixels
// with no rotation tag. Re-uploading 4GB isn't sane, and rotating pixels in
// Node needs an image library we don't have. So: splice a minimal EXIF block
// carrying the camera's Orientation into each stored JPEG. Browsers have
// honoured EXIF orientation on <img> by default since 2020, so the picture
// turns without a single pixel being re-encoded.
import { createClient } from "@supabase/supabase-js";
import { r2PresignedUrl } from "./_r2.js";

const APPLY = process.argv[2] === "apply";
const s = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_SERVICE_ROLL_KEY!);

function tiffOrientation(buf: Buffer): number {
  const le = buf.toString("ascii", 0, 2) === "II";
  if (!le && buf.toString("ascii", 0, 2) !== "MM") return 1;
  const u16 = (p: number) => le ? buf.readUInt16LE(p) : buf.readUInt16BE(p);
  const u32 = (p: number) => le ? buf.readUInt32LE(p) : buf.readUInt32BE(p);
  if (u16(2) !== 42) return 1;
  const ifd = u32(4);
  if (ifd + 2 > buf.length) return 1;
  const n = u16(ifd);
  for (let i = 0; i < n; i++) { const e = ifd + 2 + i * 12; if (e + 12 > buf.length) break; if (u16(e) === 0x0112) return u16(e + 8); }
  return 1;
}

/** A minimal APP1/Exif segment whose only tag is Orientation. */
function exifSegment(orientation: number): Buffer {
  const tiff = Buffer.alloc(26);
  tiff.write("II", 0, "ascii");           // little-endian
  tiff.writeUInt16LE(42, 2);
  tiff.writeUInt32LE(8, 4);               // IFD0 at offset 8
  tiff.writeUInt16LE(1, 8);               // one entry
  tiff.writeUInt16LE(0x0112, 10);         // Orientation
  tiff.writeUInt16LE(3, 12);              // SHORT
  tiff.writeUInt32LE(1, 14);              // count 1
  tiff.writeUInt16LE(orientation, 18);    // value (padded to 4 bytes)
  tiff.writeUInt32LE(0, 22);              // no next IFD
  const body = Buffer.concat([Buffer.from("Exif\0\0", "ascii"), tiff]);
  const head = Buffer.alloc(4);
  head.writeUInt16BE(0xffe1, 0);
  head.writeUInt16BE(body.length + 2, 2);
  return Buffer.concat([head, body]);
}

/** Insert (or replace) the orientation tag right after the JPEG's SOI. */
function withOrientation(jpeg: Buffer, orientation: number): Buffer | null {
  if (jpeg.readUInt16BE(0) !== 0xffd8) return null;
  // Already carries an APP1? Then it was done before — leave it alone.
  if (jpeg.readUInt16BE(2) === 0xffe1) return null;
  return Buffer.concat([jpeg.subarray(0, 2), exifSegment(orientation), jpeg.subarray(2)]);
}

const { data: dels } = await s.from("deliveries").select("id,title").eq("org_id","org_sdubmedia");
let checked = 0, fixed = 0, skipped = 0, failed = 0;

for (const d of dels as any[]) {
  const { data: files } = await s.from("delivery_files")
    .select("id,original_name,storage_path,original_storage_path,width,height")
    .eq("delivery_id", d.id).eq("stage", "proof").neq("original_storage_path", "");
  if (!files?.length) continue;
  console.log(`\n${d.title} — ${files.length} proof(s) with an original`);

  const queue = [...(files as any[])];
  await Promise.all(Array.from({ length: 6 }, async () => {
    for (;;) {
      const f = queue.shift(); if (!f) return;
      checked++;
      try {
        const rawUrl = r2PresignedUrl({ method: "GET", key: f.original_storage_path, expiresIn: 900 });
        const rawRes = await fetch(rawUrl, { headers: { Range: "bytes=0-65535" } });
        const o = tiffOrientation(Buffer.from(await rawRes.arrayBuffer()));
        if (o <= 1) { skipped++; continue; }

        const jpgUrl = r2PresignedUrl({ method: "GET", key: f.storage_path, expiresIn: 900 });
        const jpg = Buffer.from(await (await fetch(jpgUrl)).arrayBuffer());
        const out = withOrientation(jpg, o);
        if (!out) { skipped++; continue; }

        const swap = o >= 5 && o <= 8;
        const w = swap ? f.height : f.width;
        const h = swap ? f.width : f.height;
        console.log(`  ${String(f.original_name).slice(0,30).padEnd(31)} o=${o}  ${f.width}x${f.height} → ${w}x${h}${APPLY ? "" : "  (dry run)"}`);
        if (!APPLY) { fixed++; continue; }

        const putUrl = r2PresignedUrl({ method: "PUT", key: f.storage_path, expiresIn: 900, contentType: "image/jpeg" });
        const put = await fetch(putUrl, { method: "PUT", body: out, headers: { "Content-Type": "image/jpeg" } });
        if (!put.ok) { failed++; console.log(`     PUT failed ${put.status}`); continue; }
        const { error } = await s.from("delivery_files").update({ width: w, height: h, size_bytes: out.length }).eq("id", f.id);
        if (error) { failed++; console.log(`     db failed: ${error.message}`); continue; }
        fixed++;
      } catch (e) { failed++; console.log(`  ${f.original_name}: ${e instanceof Error ? e.message : e}`); }
    }
  }));
}
console.log(`\n${APPLY ? "APPLIED" : "DRY RUN"} — checked ${checked}, rotated ${fixed}, already upright ${skipped}, failed ${failed}`);
