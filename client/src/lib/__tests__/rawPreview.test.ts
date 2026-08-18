// The scanner that finds a camera's embedded JPEG inside a raw file.
//
// Tested on synthesised containers rather than real raws: a .NEF is 30MB of
// binary that can't live in a repo, and the property that matters — "find the
// LARGEST complete JPEG stream, not the first" — is exactly what a synthetic
// container can pin down. Whether a given camera embeds something big enough
// to be worth showing is a question only a real file answers.

import { describe, it, expect } from "vitest";
import { findEmbeddedJpegs, findLargestEmbeddedJpeg, isRawFile } from "../rawPreview";

/** A byte run that looks like a complete JPEG stream of `size` bytes. */
function fakeJpeg(size: number): Uint8Array {
  const out = new Uint8Array(size);
  out[0] = 0xff; out[1] = 0xd8; out[2] = 0xff; out[3] = 0xe0;   // SOI + APP0
  out.fill(0x42, 4, size - 2);
  out[size - 2] = 0xff; out[size - 1] = 0xd9;                    // EOI
  return out;
}

function container(...parts: Uint8Array[]): ArrayBuffer {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out.buffer;
}

const noise = (n: number) => new Uint8Array(n).fill(0x00);

describe("findLargestEmbeddedJpeg", () => {
  // The reason this exists: cameras write a small thumbnail BEFORE the big
  // preview, so taking the first match hands the gallery a postage stamp.
  it("takes the largest stream, not the first", () => {
    const buf = container(noise(64), fakeJpeg(10_000), noise(32), fakeJpeg(400_000), noise(16));
    const found = findLargestEmbeddedJpeg(buf);
    expect(found).not.toBeNull();
    expect(found!.bytes).toBe(400_000);
  });

  it("finds one sitting at the very start", () => {
    expect(findLargestEmbeddedJpeg(container(fakeJpeg(50_000)))!.bytes).toBe(50_000);
  });

  it("reports nothing when there's no JPEG at all", () => {
    expect(findLargestEmbeddedJpeg(container(noise(100_000)))).toBeNull();
  });

  // A 160x120 thumbnail is worse than admitting there's no preview: the client
  // would be picking from tiles they can't see.
  it("rejects a stream too small to be worth showing", () => {
    expect(findLargestEmbeddedJpeg(container(fakeJpeg(2_000)))).toBeNull();
  });

  // A stray start marker pairs with a genuine end marker further on and
  // produces a span LARGER than the real preview, made of garbage. It can't be
  // ruled out by scanning alone — only decoding tells them apart — so it must
  // still appear as a candidate, with the real one ranked behind it.
  it("keeps a real stream as a candidate behind a bogus larger span", () => {
    const truncated = new Uint8Array(5_000);
    truncated[0] = 0xff; truncated[1] = 0xd8; truncated[2] = 0xff;
    const all = findEmbeddedJpegs(container(truncated, fakeJpeg(60_000)));
    expect(all.map(c => c.bytes)).toContain(60_000);
    expect(all[0].bytes).toBeGreaterThan(60_000);   // bogus span ranks first
  });

  it("ranks every candidate largest first", () => {
    const all = findEmbeddedJpegs(container(fakeJpeg(10_000), fakeJpeg(400_000), fakeJpeg(50_000)));
    expect(all.map(c => c.bytes)).toEqual([400_000, 50_000, 10_000]);
  });

  // Raw sensor data is full of 0xFF 0xD8 pairs by chance. Requiring the third
  // byte to be 0xFF, and requiring a matching EOI, is what keeps those out.
  it("isn't fooled by a stray FF D8 in sensor data", () => {
    const decoy = new Uint8Array(200);
    decoy[100] = 0xff; decoy[101] = 0xd8; decoy[102] = 0x00;  // third byte wrong
    expect(findLargestEmbeddedJpeg(container(decoy))).toBeNull();
  });

  it("keeps the offset so a bad extraction can be diagnosed", () => {
    const found = findLargestEmbeddedJpeg(container(noise(512), fakeJpeg(20_000)));
    expect(found!.offset).toBe(512);
  });
});

describe("isRawFile", () => {
  it("knows the formats worth trying", () => {
    for (const n of ["DSC_0001.NEF", "IMG_1234.CR2", "a.CR3", "b.arw", "c.dng", "d.RW2", "e.orf"]) {
      expect(isRawFile(n)).toBe(true);
    }
  });

  it("leaves ordinary images alone", () => {
    for (const n of ["photo.jpg", "photo.JPEG", "shot.png", "clip.mp4", "x.heic"]) {
      expect(isRawFile(n)).toBe(false);
    }
  });

  // "raw" has to be the extension, not a word in the name.
  it("matches on the extension, not the name", () => {
    expect(isRawFile("raw-edit-final.jpg")).toBe(false);
    expect(isRawFile("nef.jpg")).toBe(false);
  });
});
