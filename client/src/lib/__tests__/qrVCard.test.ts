import { describe, expect, it } from "vitest";
import { buildVCard, effectiveTarget } from "../../../../api/_qr";

describe("buildVCard", () => {
  it("writes a vCard a phone can import", () => {
    const v = buildVCard({ firstName: "Geoff", lastName: "Southworth", org: "SDub Media", phone: "615-555-0100", email: "geoff@sdubmedia.com", website: "https://sdubmedia.com", city: "Nashville", state: "TN" });
    expect(v.startsWith("BEGIN:VCARD\r\nVERSION:3.0\r\n")).toBe(true);
    expect(v).toContain("N:Southworth;Geoff;;;");
    expect(v).toContain("FN:Geoff Southworth");
    expect(v).toContain("ORG:SDub Media");
    expect(v).toContain("TEL;TYPE=CELL,VOICE:615-555-0100");
    expect(v).toContain("ADR;TYPE=WORK:;;;Nashville;TN;;");
    expect(v.endsWith("END:VCARD\r\n")).toBe(true);
  });
  it("escapes commas and semicolons and falls back to the company name", () => {
    const v = buildVCard({ org: "Smith, Jones; LLC" });
    expect(v).toContain("FN:Smith\\, Jones\\; LLC");
  });
});

describe("effectiveTarget (server)", () => {
  it("switches over on schedule", () => {
    const row = { target_url: "https://a.com/", next_target_url: "https://b.com/", switch_at: "2026-10-01T00:00:00Z" };
    expect(effectiveTarget(row, new Date("2026-09-01T00:00:00Z"))).toBe("https://a.com/");
    expect(effectiveTarget(row, new Date("2026-10-02T00:00:00Z"))).toBe("https://b.com/");
  });
});
