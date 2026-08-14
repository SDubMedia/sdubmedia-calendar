import { describe, it, expect } from "vitest";
import { expectedPartSize, partCountFor, resumablePartNumbers } from "../multipart";

const PART = 32 * 1024 * 1024; // matches PART_SIZE in api/delivery-multipart.ts

describe("expectedPartSize", () => {
  it("gives a full part for every part but the last", () => {
    const size = PART * 3 + 100;
    expect(expectedPartSize(size, PART, 1)).toBe(PART);
    expect(expectedPartSize(size, PART, 3)).toBe(PART);
  });

  it("gives the remainder for the last part", () => {
    expect(expectedPartSize(PART * 3 + 100, PART, 4)).toBe(100);
  });

  it("handles a file smaller than one part", () => {
    expect(expectedPartSize(500, PART, 1)).toBe(500);
  });

  it("handles a file that divides exactly", () => {
    expect(expectedPartSize(PART * 2, PART, 2)).toBe(PART);
    expect(partCountFor(PART * 2, PART)).toBe(2);
  });
});

describe("resumablePartNumbers", () => {
  const fileSize = PART * 3 + 100; // 4 parts: 3 full + 100 bytes
  const count = partCountFor(fileSize, PART);

  it("skips parts R2 reports at the right size", () => {
    const done = resumablePartNumbers(fileSize, PART, count, [
      { partNumber: 1, size: PART },
      { partNumber: 2, size: PART },
    ]);
    expect([...done].sort((a, b) => a - b)).toEqual([1, 2]);
  });

  it("accepts a correctly-sized final part", () => {
    const done = resumablePartNumbers(fileSize, PART, count, [{ partNumber: 4, size: 100 }]);
    expect(done.has(4)).toBe(true);
  });

  // The one that matters: a PUT cut off midway leaves a short part behind.
  // Trusting it would punch a hole in the finished video.
  it("re-sends a part R2 stored short", () => {
    const done = resumablePartNumbers(fileSize, PART, count, [
      { partNumber: 1, size: PART },
      { partNumber: 2, size: PART - 5000 },
    ]);
    expect(done.has(1)).toBe(true);
    expect(done.has(2)).toBe(false);
  });

  it("re-sends a part with an oversized or unknown length", () => {
    const done = resumablePartNumbers(fileSize, PART, count, [
      { partNumber: 1, size: PART + 1 },
      { partNumber: 2, size: -1 },
    ]);
    expect(done.size).toBe(0);
  });

  it("ignores part numbers from a different slicing of the file", () => {
    const done = resumablePartNumbers(fileSize, PART, count, [
      { partNumber: 0, size: PART },
      { partNumber: 99, size: PART },
      { partNumber: -1, size: PART },
      { partNumber: 1.5, size: PART },
    ]);
    expect(done.size).toBe(0);
  });

  it("returns nothing for an empty listing, so a fresh upload sends everything", () => {
    expect(resumablePartNumbers(fileSize, PART, count, []).size).toBe(0);
  });

  it("refuses to resume on nonsense inputs rather than guessing", () => {
    expect(resumablePartNumbers(0, PART, 0, [{ partNumber: 1, size: PART }]).size).toBe(0);
    expect(resumablePartNumbers(fileSize, 0, count, [{ partNumber: 1, size: PART }]).size).toBe(0);
  });

  it("a full listing means nothing is re-sent", () => {
    const all = Array.from({ length: count }, (_, i) => ({
      partNumber: i + 1,
      size: expectedPartSize(fileSize, PART, i + 1),
    }));
    expect(resumablePartNumbers(fileSize, PART, count, all).size).toBe(count);
  });
});
