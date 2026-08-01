// Tests for the business-info redaction used by every no-login page.
//
// The org's business_info blob used to be returned whole to anyone holding a
// proposal, gallery or series-review link — EIN included. This is a whitelist
// so a field added to business_info later can't quietly join the payload; the
// test exists to keep it that way.

import { describe, expect, it } from "vitest";
import { publicBusinessInfo } from "../../../../api/_auth";

const full = {
  address: "123 Main St",
  city: "Nashville",
  state: "TN",
  zip: "37211",
  phone: "615-555-0100",
  email: "hello@example.com",
  website: "https://example.com",
  ownerName: "Owner Name",
  venmoUsername: "example",
  ein: "12-3456789",
};

describe("publicBusinessInfo", () => {
  it("keeps the fields a public page actually renders", () => {
    const out = publicBusinessInfo(full)!;
    expect(out.address).toBe("123 Main St");
    expect(out.phone).toBe("615-555-0100");
    expect(out.email).toBe("hello@example.com");
    expect(out.website).toBe("https://example.com");
    expect(out.venmoUsername).toBe("example");
  });

  it("drops the EIN", () => {
    expect(publicBusinessInfo(full)).not.toHaveProperty("ein");
  });

  it("drops anything not explicitly allowed, including future additions", () => {
    const out = publicBusinessInfo({ ...full, taxId: "99-9999999", bankAccount: "0001", somethingNew: "x" })!;
    expect(out).not.toHaveProperty("taxId");
    expect(out).not.toHaveProperty("bankAccount");
    expect(out).not.toHaveProperty("somethingNew");
  });

  it("handles missing or malformed input without throwing", () => {
    expect(publicBusinessInfo(null)).toBeNull();
    expect(publicBusinessInfo(undefined)).toBeNull();
    expect(publicBusinessInfo("not an object")).toBeNull();
    expect(publicBusinessInfo({})).toEqual({});
  });

  it("omits absent fields rather than emitting empty strings", () => {
    expect(publicBusinessInfo({ phone: "615-555-0100" })).toEqual({ phone: "615-555-0100" });
  });
});
