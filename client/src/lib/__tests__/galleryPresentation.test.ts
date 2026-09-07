import { describe, it, expect } from "vitest";
import { galleryPresentation, isRealEstateGallery, isRealEstateShoot, keepsFullQuality, payerIdFor, defaultTone, resolveTone } from "../../../../api/_galleryPresentation";

const agent = { id: "agent1", client_type: "agent", broker_id: "cbsr" };
const broker = { id: "cbsr", client_type: "broker" };
const school = { id: "school", client_type: "standard" };
const family = { id: "family", client_type: "standard" };

describe("payerIdFor", () => {
  it("prefers an explicit bill-to", () => {
    expect(payerIdFor({ client_id: "school", bill_to_id: "cbsr" }, school)).toBe("cbsr");
  });
  it("bills an agent's shoot to their brokerage", () => {
    expect(payerIdFor({ client_id: "agent1" }, agent)).toBe("cbsr");
  });
  it("otherwise bills the client", () => {
    expect(payerIdFor({ client_id: "family" }, family)).toBe("family");
  });
});

describe("isRealEstateShoot", () => {
  it("is real estate for an agent client", () => {
    expect(isRealEstateShoot(agent, broker)).toBe(true);
  });
  it("is real estate when billed to a brokerage", () => {
    expect(isRealEstateShoot(school, broker)).toBe(true);
  });
  it("is not real estate for a family or school paying themselves", () => {
    expect(isRealEstateShoot(family, family)).toBe(false);
    expect(isRealEstateShoot(school, school)).toBe(false);
  });
  it("is not real estate with nothing known", () => {
    expect(isRealEstateShoot(null, null)).toBe(false);
  });
});

describe("galleryPresentation", () => {
  it("gives real estate the listing look", () => {
    expect(galleryPresentation({ client_id: "agent1" }, agent, broker)).toBe("listing");
  });
  it("gives every other client the editorial look", () => {
    expect(galleryPresentation({ client_id: "family" }, family, family)).toBe("editorial");
  });
  it("gives a gallery with no project the editorial look", () => {
    expect(galleryPresentation(null, null, null)).toBe("editorial");
  });
  it("gives the listing look when the gallery's own switch is on, whoever the client is", () => {
    expect(galleryPresentation({ client_id: "school" }, school, school, { real_estate: true })).toBe("listing");
    expect(galleryPresentation(null, null, null, { real_estate: true })).toBe("listing");
  });
  it("leaves the client rule alone when the switch is off", () => {
    expect(galleryPresentation({ client_id: "family" }, family, family, { real_estate: false })).toBe("editorial");
    expect(galleryPresentation({ client_id: "agent1" }, agent, broker, { real_estate: false })).toBe("listing");
  });
});

describe("isRealEstateGallery / keepsFullQuality (server)", () => {
  it("hands over originals for every non-real-estate gallery", () => {
    expect(keepsFullQuality({ real_estate: false }, { client_id: "family" }, family, family)).toBe(true);
    expect(keepsFullQuality(null, null, null, null)).toBe(true);
  });
  it("hands over the MLS-size copy for real estate, by client or by switch", () => {
    expect(keepsFullQuality({ real_estate: false }, { client_id: "agent1" }, agent, broker)).toBe(false);
    expect(keepsFullQuality({ real_estate: true }, { client_id: "school" }, school, school)).toBe(false);
    expect(isRealEstateGallery({ real_estate: true }, null, null, null)).toBe(true);
  });
  it("hands over originals again when keep_originals is on", () => {
    expect(keepsFullQuality({ real_estate: true, keep_originals: true }, { client_id: "school" }, school, school)).toBe(true);
    expect(keepsFullQuality({ keep_originals: true }, { client_id: "agent1" }, agent, broker)).toBe(true);
  });
});

describe("defaultTone / resolveTone", () => {
  it("is business when the company is a different thing from the contact", () => {
    expect(defaultTone({ company: "The Webb School", contact_name: "Megan Winnicker" })).toBe("business");
    expect(defaultTone({ company: "Church At Nolensville", contact_name: "Jackson Derose" })).toBe("business");
  });
  it("is personal when they match, ignoring case and spacing", () => {
    expect(defaultTone({ company: "Felicia Long", contact_name: "felicia long " })).toBe("personal");
  });
  it("is personal with no contact, no company, or no client", () => {
    expect(defaultTone({ company: "Estefania", contact_name: "" })).toBe("personal");
    expect(defaultTone({ company: "", contact_name: "Ann" })).toBe("personal");
    expect(defaultTone(null)).toBe("personal");
  });
  it("lets a stored override win", () => {
    expect(resolveTone("personal", { company: "The Webb School", contact_name: "Megan" })).toBe("personal");
    expect(resolveTone("business", { company: "Felicia Long", contact_name: "Felicia Long" })).toBe("business");
    expect(resolveTone("", { company: "The Webb School", contact_name: "Megan" })).toBe("business");
    expect(resolveTone(undefined, null)).toBe("personal");
  });
});
