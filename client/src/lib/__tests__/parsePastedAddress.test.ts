import { describe, it, expect } from "vitest";
import { parsePastedAddress } from "../utils";

describe("parsePastedAddress", () => {
  it("parses street, city, ST ZIP", () => {
    expect(parsePastedAddress("123 Main St, Nashville, TN 37201")).toEqual({
      address: "123 Main St", city: "Nashville", state: "TN", zip: "37201",
    });
  });

  it("parses street, city, ST, ZIP (comma before zip)", () => {
    expect(parsePastedAddress("1500 Medical Center Pkwy Box 12, Murfreesboro, TN, 37129")).toEqual({
      address: "1500 Medical Center Pkwy Box 12", city: "Murfreesboro", state: "TN", zip: "37129",
    });
  });

  it("parses with no zip", () => {
    expect(parsePastedAddress("123 Main St, Nashville, TN")).toEqual({
      address: "123 Main St", city: "Nashville", state: "TN", zip: "",
    });
  });

  it("leaves a bare street (no comma) untouched", () => {
    expect(parsePastedAddress("123 Main St")).toEqual({
      address: "123 Main St", city: "", state: "", zip: "",
    });
  });

  it("doesn't mistake a street suffix for a state", () => {
    // No comma → whole thing stays as the street, 'St' is not treated as state.
    expect(parsePastedAddress("456 Oak St")).toEqual({
      address: "456 Oak St", city: "", state: "", zip: "",
    });
  });

  it("handles a multi-part street", () => {
    expect(parsePastedAddress("100 Broadway, Suite 200, Nashville, TN 37203")).toEqual({
      address: "100 Broadway, Suite 200", city: "Nashville", state: "TN", zip: "37203",
    });
  });
});
