import { describe, it, expect } from "vitest";
import { composeAddress, addressLines, mapsQueryFor, postalAddress, hasAddress } from "../address";

const full = {
  locationName: "Harlinsdale Farm",
  address: "239 Franklin Rd",
  city: "Franklin",
  state: "TN",
  zip: "37064",
};

describe("composeAddress", () => {
  it("renders the full canonical shape", () => {
    expect(composeAddress(full)).toBe("Harlinsdale Farm · 239 Franklin Rd · Franklin, TN · 37064");
  });

  it("collapses missing parts without leaving separators behind", () => {
    expect(composeAddress({ locationName: "The Factory" })).toBe("The Factory");
    expect(composeAddress({ address: "239 Franklin Rd", zip: "37064" }))
      .toBe("239 Franklin Rd · 37064");
  });

  it("keeps city and state together, and each works alone", () => {
    expect(composeAddress({ city: "Franklin", state: "TN" })).toBe("Franklin, TN");
    expect(composeAddress({ city: "Franklin" })).toBe("Franklin");
    // A state with no city must not render as ", TN".
    expect(composeAddress({ state: "TN" })).toBe("TN");
  });

  it("is empty for an empty address rather than punctuation", () => {
    expect(composeAddress({})).toBe("");
    expect(composeAddress({ locationName: "  ", city: "" })).toBe("");
  });

  it("trims whitespace the user typed", () => {
    expect(composeAddress({ locationName: "  The Factory  ", city: " Franklin ", state: " TN " }))
      .toBe("The Factory · Franklin, TN");
  });

  it("tolerates nulls from the database", () => {
    expect(composeAddress({ locationName: null, address: "239 Franklin Rd", city: null, state: null, zip: null }))
      .toBe("239 Franklin Rd");
  });
});

describe("addressLines", () => {
  it("splits into display lines with city/state/zip together", () => {
    expect(addressLines(full)).toEqual(["Harlinsdale Farm", "239 Franklin Rd", "Franklin, TN 37064"]);
  });

  it("drops empty lines entirely", () => {
    expect(addressLines({ locationName: "The Factory", city: "Franklin", state: "TN" }))
      .toEqual(["The Factory", "Franklin, TN"]);
    expect(addressLines({})).toEqual([]);
  });
});

describe("postalAddress", () => {
  it("puts a SPACE between state and zip, never a comma", () => {
    // The bug in every hand-rolled version: `[a,city,state,zip].join(", ")`
    // produced "Franklin, TN, 37064", which is why contracts and invoices
    // printed the same address two different ways.
    expect(postalAddress(full)).toBe("239 Franklin Rd, Franklin, TN 37064");
    expect(postalAddress(full)).not.toContain("TN, 37064");
  });

  it("leaves out the venue name — callers show it as a heading", () => {
    expect(postalAddress(full)).not.toContain("Harlinsdale Farm");
  });

  it("handles partial addresses without stray punctuation", () => {
    expect(postalAddress({ city: "Franklin", state: "TN" })).toBe("Franklin, TN");
    expect(postalAddress({ address: "239 Franklin Rd" })).toBe("239 Franklin Rd");
    expect(postalAddress({ zip: "37064" })).toBe("37064");
    expect(postalAddress({})).toBe("");
  });
});

describe("mapsQueryFor", () => {
  it("uses commas, not the display separator — maps search needs them", () => {
    expect(mapsQueryFor(full)).toBe("239 Franklin Rd, Franklin, TN 37064");
  });

  it("leads with the street and omits the venue name when it has one", () => {
    // "Harlinsdale Farm, 239 Franklin Rd" geocodes worse than the street alone.
    expect(mapsQueryFor(full)).not.toContain("Harlinsdale Farm");
  });

  it("falls back to the venue name when there is no street to search on", () => {
    expect(mapsQueryFor({ locationName: "Harlinsdale Farm" })).toBe("Harlinsdale Farm");
  });

  it("is empty when there is nothing to search", () => {
    expect(mapsQueryFor({})).toBe("");
  });
});

describe("hasAddress", () => {
  it("distinguishes a real address from an empty one", () => {
    expect(hasAddress(full)).toBe(true);
    expect(hasAddress({ city: "Franklin" })).toBe(true);
    expect(hasAddress({})).toBe(false);
    expect(hasAddress({ locationName: "   " })).toBe(false);
  });
});
