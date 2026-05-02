// ============================================================
// Tests for cleanPastedText — locks the PDF copy-paste artifact
// behavior so we don't regress on Geoff's "o f" complaint.
// ============================================================

import { describe, it, expect } from "vitest";
import { cleanPastedText } from "../cleanPaste";

describe("cleanPastedText", () => {
  it("returns empty for empty input", () => {
    expect(cleanPastedText("")).toBe("");
  });

  it("collapses 'o f' kerning artifact into 'of'", () => {
    expect(cleanPastedText("Experience the joy o f your day")).toBe("Experience the joy of your day");
  });

  it("collapses 'w e' into 'we'", () => {
    expect(cleanPastedText("o f the evening, w e capture every")).toBe("of the evening, we capture every");
  });

  it("preserves real one-letter words 'I' and 'a'", () => {
    expect(cleanPastedText("I am a person")).toBe("I am a person");
    expect(cleanPastedText("I have a plan")).toBe("I have a plan");
  });

  it("collapses chains like 'p h o t o' → 'photo'", () => {
    expect(cleanPastedText("we love p h o t o stuff")).toBe("we love photo stuff");
  });

  it("strips zero-width characters", () => {
    expect(cleanPastedText("hello​world")).toBe("helloworld");
    expect(cleanPastedText("test﻿case")).toBe("testcase");
  });

  it("converts non-breaking spaces to regular spaces", () => {
    expect(cleanPastedText("nbsp here")).toBe("nbsp here");
  });

  it("normalizes smart quotes", () => {
    expect(cleanPastedText("“hello”")).toBe('"hello"');
    expect(cleanPastedText("it’s mine")).toBe("it's mine");
  });

  it("collapses runs of multiple spaces to one", () => {
    expect(cleanPastedText("hello    world")).toBe("hello world");
  });

  it("collapses 3+ consecutive newlines to 2", () => {
    expect(cleanPastedText("para1\n\n\n\npara2")).toBe("para1\n\npara2");
  });

  it("preserves single newlines and double newlines", () => {
    expect(cleanPastedText("line1\nline2")).toBe("line1\nline2");
    expect(cleanPastedText("para1\n\npara2")).toBe("para1\n\npara2");
  });

  it("strips trailing whitespace from each line", () => {
    expect(cleanPastedText("line one   \nline two\t\t")).toBe("line one\nline two");
  });

  it("does not touch text without artifacts", () => {
    const clean = "This is a perfectly fine sentence.";
    expect(cleanPastedText(clean)).toBe(clean);
  });

  it("handles a realistic Canva PDF paste", () => {
    const pasted = "Experience the joy o f your wedding day again and again with our all‐day wedding video coverage. From the early morning preparations to the last dance o f the evening, w e capture every heartfelt moment.";
    const cleaned = cleanPastedText(pasted);
    expect(cleaned).toContain("joy of your wedding");
    expect(cleaned).toContain("dance of the evening");
    expect(cleaned).toContain("we capture every");
  });
});
