// Tests for the draft quality readout.
//
// This exists because a 60-second cut at 43.7 MB was approved and delivered to
// a client before anyone noticed it was a ~6 Mbps review export. The numbers
// below are that real file.

import { describe, expect, it } from "vitest";
import { draftBitrateMbps, draftQualityLabel, REVIEW_QUALITY_MBPS } from "../data";

const FIREFLY_BYTES = 45_843_910; // the real draft
const FIREFLY_SECONDS = 60;

describe("draftBitrateMbps", () => {
  it("computes the bitrate of the cut that started this", () => {
    const rate = draftBitrateMbps(FIREFLY_BYTES, FIREFLY_SECONDS)!;
    expect(rate).toBeCloseTo(6.11, 1);
  });

  it("flags that cut as review quality", () => {
    expect(draftBitrateMbps(FIREFLY_BYTES, FIREFLY_SECONDS)!).toBeLessThan(REVIEW_QUALITY_MBPS);
  });

  it("does not flag a proper 1080p master", () => {
    // 60s at ~20 Mbps ≈ 150 MB
    expect(draftBitrateMbps(150 * 1024 * 1024, 60)!).toBeGreaterThan(REVIEW_QUALITY_MBPS);
  });

  it("returns null when the runtime is unknown, rather than guessing", () => {
    expect(draftBitrateMbps(FIREFLY_BYTES, null)).toBeNull();
    expect(draftBitrateMbps(FIREFLY_BYTES, 0)).toBeNull();
  });

  it("returns null for an empty file instead of dividing by nothing", () => {
    expect(draftBitrateMbps(0, 60)).toBeNull();
  });
});

describe("draftQualityLabel", () => {
  it("reads size, runtime and bitrate together", () => {
    expect(draftQualityLabel(FIREFLY_BYTES, FIREFLY_SECONDS)).toBe("43.7 MB · 1:00 · 6.1 Mbps");
  });

  it("falls back to size alone when the runtime couldn't be read", () => {
    expect(draftQualityLabel(FIREFLY_BYTES, null)).toBe("43.7 MB");
  });

  it("switches to GB for a large master", () => {
    expect(draftQualityLabel(2 * 1073741824, null)).toBe("2.0 GB");
  });

  it("pads seconds so 3:05 doesn't read as 3:5", () => {
    expect(draftQualityLabel(10_000_000, 185)).toContain("3:05");
  });
});
