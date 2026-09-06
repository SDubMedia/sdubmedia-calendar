import { describe, it, expect } from "vitest";
import { applyGalleryNote, defaultGalleryNote, countWord, formatRuntime, formatBytes } from "../galleryCopy";

describe("applyGalleryNote", () => {
  it("fills in the first name and studio", () => {
    expect(applyGalleryNote("{{first_name}}, thank you — {{studio}}", { firstName: "Felicia", studio: "SDub Media" }))
      .toBe("Felicia, thank you — SDub Media");
  });

  it("drops a leading name token cleanly when the name is unknown", () => {
    expect(applyGalleryNote("{{first_name}}, thank you for having us.", {})).toBe("Thank you for having us.");
  });

  it("drops a mid-sentence name token when the name is unknown", () => {
    expect(applyGalleryNote("Thanks again, {{first_name}}, it was a joy.", { firstName: "" })).toBe("Thanks again, it was a joy.");
  });

  it("falls back to 'us' for an unknown studio", () => {
    expect(applyGalleryNote("Made by {{studio}}.", {})).toBe("Made by us.");
  });

  it("keeps line breaks and capitalises after them when a token was removed", () => {
    expect(applyGalleryNote("{{first_name}}, hello.\n{{first_name}}, again.", {})).toBe("Hello.\nAgain.");
  });

  it("leaves a note with no tokens alone", () => {
    expect(applyGalleryNote("Just the photos. Enjoy.", { firstName: "Ann" })).toBe("Just the photos. Enjoy.");
  });
});

describe("defaultGalleryNote", () => {
  it("mentions the film only when there is one", () => {
    expect(defaultGalleryNote(true)).toContain("the film first");
    expect(defaultGalleryNote(false)).not.toContain("film");
  });
  it("resolves to a complete sentence with or without a name", () => {
    expect(applyGalleryNote(defaultGalleryNote(false), { firstName: "Felicia" })).toBe("Felicia, thank you for having us. Everything here is yours to keep, in the order we made them.");
    expect(applyGalleryNote(defaultGalleryNote(false), {})).toBe("Thank you for having us. Everything here is yours to keep, in the order we made them.");
  });
});

describe("formatting helpers", () => {
  it("spells small counts and falls back to digits", () => {
    expect(countWord(15)).toBe("Fifteen");
    expect(countWord(0)).toBe("Zero");
    expect(countWord(42)).toBe("42");
  });
  it("formats runtimes and sizes", () => {
    expect(formatRuntime(754)).toBe("12:34");
    expect(formatRuntime(0)).toBe("");
    expect(formatBytes(1536)).toBe("2 KB");
    expect(formatBytes(20 * 1024 * 1024)).toBe("20 MB");
    expect(formatBytes(1.5 * 1024 ** 3)).toBe("1.5 GB");
  });
});
