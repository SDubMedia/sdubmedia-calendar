import { describe, it, expect } from "vitest";
import {
  captureLetterhead, letterheadFor, shouldCaptureLetterhead,
  type LetterheadSnapshot,
} from "../letterhead";

const liveOrg = {
  name: "SDub Media LLC",
  logoUrl: "data:image/png;base64,NEW",
  businessInfo: { address: "1 New St", city: "Nashville", state: "TN", zip: "37201",
    phone: "", email: "", website: "", ein: "" },
};

const stamp: LetterheadSnapshot = {
  orgName: "SDub Media",
  ownerName: "Geoff Southworth",
  logoUrl: "data:image/png;base64,OLD",
  businessInfo: { address: "239 Franklin Rd", city: "Franklin", state: "TN", zip: "37064",
    phone: "", email: "", website: "", ein: "" },
  stampedAt: "2026-03-01T12:00:00.000Z",
};

describe("letterheadFor", () => {
  it("renders the stamp when a document has one, ignoring the live org", () => {
    const l = letterheadFor(stamp, liveOrg, "Someone Else");
    expect(l.orgName).toBe("SDub Media");
    expect(l.ownerName).toBe("Geoff Southworth");
    expect(l.businessInfo?.address).toBe("239 Franklin Rd");
    expect(l.frozen).toBe(true);
  });

  it("renders live for a draft — a draft should show the business as it is now", () => {
    const l = letterheadFor(null, liveOrg, "Geoff Southworth");
    expect(l.orgName).toBe("SDub Media LLC");
    expect(l.businessInfo?.address).toBe("1 New St");
    expect(l.frozen).toBe(false);
  });

  it("renders live for documents that pre-date the freeze", () => {
    // Not a bug: their original header was never recorded, so live is the only
    // honest thing to show.
    expect(letterheadFor(undefined, liveOrg).frozen).toBe(false);
  });

  it("survives a missing org without throwing", () => {
    const l = letterheadFor(null, null);
    expect(l.orgName).toBe("");
    expect(l.businessInfo).toBeNull();
  });
});

describe("shouldCaptureLetterhead", () => {
  it("stamps when a document is first sent", () => {
    expect(shouldCaptureLetterhead(null, "sent")).toBe(true);
  });

  it("never re-stamps a document that already has one", () => {
    // Re-sending must not swap the header the client already holds a copy of.
    expect(shouldCaptureLetterhead(stamp, "sent")).toBe(false);
  });

  it("does not stamp on any other status change", () => {
    expect(shouldCaptureLetterhead(null, "draft")).toBe(false);
    expect(shouldCaptureLetterhead(null, "client_signed")).toBe(false);
    expect(shouldCaptureLetterhead(null, "paid")).toBe(false);
    expect(shouldCaptureLetterhead(null, undefined)).toBe(false);
  });
});

describe("captureLetterhead", () => {
  it("records what the business looked like at that moment", () => {
    const s = captureLetterhead(liveOrg, "Geoff Southworth", "2026-08-27T00:00:00.000Z");
    expect(s).toEqual({
      orgName: "SDub Media LLC",
      ownerName: "Geoff Southworth",
      logoUrl: "data:image/png;base64,NEW",
      businessInfo: liveOrg.businessInfo,
      stampedAt: "2026-08-27T00:00:00.000Z",
    });
  });

  it("stores empty strings rather than undefined for a bare org", () => {
    const s = captureLetterhead({}, "", "2026-08-27T00:00:00.000Z");
    expect(s.orgName).toBe("");
    expect(s.logoUrl).toBe("");
    expect(s.businessInfo).toBeNull();
  });

  it("round-trips through the renderer unchanged", () => {
    const s = captureLetterhead(liveOrg, "Geoff Southworth", "2026-08-27T00:00:00.000Z");
    const l = letterheadFor(s, { name: "Renamed Later", businessInfo: null });
    expect(l.orgName).toBe("SDub Media LLC");
    expect(l.businessInfo?.address).toBe("1 New St");
  });
});
