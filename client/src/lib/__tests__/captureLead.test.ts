// Tests for the pure input-sanitizing helpers in api/capture-pipeline-lead.ts.
// The handler itself hits Supabase; these cover the validation logic that
// guards what a public, cross-origin form is allowed to put in the pipeline.

import { describe, expect, it } from "vitest";
import { clean, isEmail, coerceProjectType } from "../../../../api/capture-pipeline-lead";

describe("clean", () => {
  it("trims surrounding whitespace", () => {
    expect(clean("  Geoff  ")).toBe("Geoff");
  });

  it("returns empty string for non-strings", () => {
    expect(clean(undefined)).toBe("");
    expect(clean(null)).toBe("");
    expect(clean(42)).toBe("");
    expect(clean({})).toBe("");
  });

  it("caps length to the max", () => {
    expect(clean("abcdef", 3)).toBe("abc");
  });
});

describe("isEmail", () => {
  it("accepts a normal address", () => {
    expect(isEmail("geoff@sdubmedia.com")).toBe(true);
  });

  it("rejects malformed addresses", () => {
    expect(isEmail("nope")).toBe(false);
    expect(isEmail("a@b")).toBe(false);
    expect(isEmail("a @b.com")).toBe(false);
    expect(isEmail("")).toBe(false);
  });
});

describe("coerceProjectType", () => {
  it("passes a known dropdown value through unchanged", () => {
    expect(coerceProjectType("Event coverage")).toBe("Event coverage");
    expect(coerceProjectType("Wedding")).toBe("Wedding");
  });

  it("coerces an unknown non-empty value to Other", () => {
    expect(coerceProjectType("<script>alert(1)</script>")).toBe("Other");
  });

  it("treats empty input as a generic Inquiry", () => {
    expect(coerceProjectType("")).toBe("Inquiry");
  });
});
