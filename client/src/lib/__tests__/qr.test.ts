import { describe, expect, it } from "vitest";
import { contactDisplayName, countSince, displayUrl, effectiveTarget, isValidCode, normalizeCode, normalizeTargetUrl, qrPath, scansPerDay, taggedTarget } from "../qr";

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

describe("codes", () => {
  it("normalizes what Geoff types into a slug", () => {
    expect(normalizeCode("Front Window!")).toBe("front-window");
    expect(normalizeCode("  Weddings 2027 ")).toBe("weddings-2027");
  });
  it("validates length and characters", () => {
    expect(isValidCode("ab")).toBe(false);
    expect(isValidCode("front-window")).toBe(true);
    expect(isValidCode("has space")).toBe(false);
    expect(isValidCode("x".repeat(41))).toBe(false);
  });
});

describe("taggedTarget", () => {
  it("adds analytics tags named after the code", () => {
    const t = taggedTarget("https://sdubmedia.com/weddings", "Front Window", "abc123", true);
    const u = new URL(t);
    expect(u.searchParams.get("utm_source")).toBe("qr");
    expect(u.searchParams.get("utm_medium")).toBe("print");
    expect(u.searchParams.get("utm_campaign")).toBe("front-window");
    expect(u.searchParams.get("utm_content")).toBe("abc123");
  });
  it("leaves a link alone when tagging is off or it already has tags", () => {
    expect(taggedTarget("https://a.com/", "x", "c", false)).toBe("https://a.com/");
    expect(taggedTarget("https://a.com/?utm_source=mine", "x", "c", true)).toBe("https://a.com/?utm_source=mine");
  });
});

describe("scan history", () => {
  const now = new Date(2026, 8, 18, 15, 0, 0);   // Sep 18 2026, 3pm local
  const at = (d: number, h = 10) => new Date(2026, 8, d, h).toISOString();
  it("buckets scans per day, oldest first, today last", () => {
    const s = scansPerDay([at(18), at(18, 1), at(17), at(12), at(1)], 7, now);
    expect(s).toEqual([1, 0, 0, 0, 0, 1, 2]);
  });
  it("counts scans in a window", () => {
    expect(countSince([at(18), at(17), at(1)], 7, now)).toBe(2);
  });
});

describe("scheduled switch-over", () => {
  it("follows the next link only once its time has come", () => {
    const c = { targetUrl: "https://a.com/", nextTargetUrl: "https://b.com/", switchAt: "2026-10-01T00:00:00Z" };
    expect(effectiveTarget(c, new Date("2026-09-30T00:00:00Z"))).toBe("https://a.com/");
    expect(effectiveTarget(c, new Date("2026-10-01T00:00:00Z"))).toBe("https://b.com/");
    expect(effectiveTarget({ ...c, nextTargetUrl: "" }, new Date("2026-12-01T00:00:00Z"))).toBe("https://a.com/");
  });
  it("names a contact card sensibly", () => {
    expect(contactDisplayName({ firstName: "Geoff", lastName: "Southworth" })).toBe("Geoff Southworth");
    expect(contactDisplayName({ org: "SDub Media" })).toBe("SDub Media");
    expect(contactDisplayName(null)).toBe("Contact card");
  });
});
