import { describe, expect, it } from "vitest";
import { displayUrl, normalizeTargetUrl, qrPath } from "../qr";

describe("normalizeTargetUrl", () => {
  it("adds https to a bare domain", () => {
    expect(normalizeTargetUrl("sdubmedia.com/weddings")).toBe("https://sdubmedia.com/weddings");
  });
  it("keeps an explicit scheme", () => {
    expect(normalizeTargetUrl("http://example.com/a?b=1")).toBe("http://example.com/a?b=1");
  });
  it("trims whitespace", () => {
    expect(normalizeTargetUrl("  https://example.com  ")).toBe("https://example.com/");
  });
  it("rejects empty, non-web, and dangerous input", () => {
    expect(normalizeTargetUrl("")).toBeNull();
    expect(normalizeTargetUrl("not a url")).toBeNull();
    expect(normalizeTargetUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeTargetUrl("mailto:geoff@sdubmedia.com")).toBeNull();
  });
});

describe("qrPath / displayUrl", () => {
  it("builds the permanent path", () => {
    expect(qrPath("Ab3xYz")).toBe("/q/Ab3xYz");
  });
  it("shows host and path without the scheme", () => {
    expect(displayUrl("https://sdubmedia.com/")).toBe("sdubmedia.com");
    expect(displayUrl("https://sdubmedia.com/family?x=1")).toBe("sdubmedia.com/family?x=1");
    expect(displayUrl("garbage")).toBe("garbage");
  });
});
