import { describe, it, expect } from "vitest";
import { applyGalleryNote, defaultGalleryNote, countWord, formatRuntime, formatBytes, galleryHeadline, keepHeadline, defaultToneFor } from "../galleryCopy";

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

describe("galleryHeadline / keepHeadline — never a zero", () => {
  it("names only what the gallery holds", () => {
    expect(galleryHeadline(15, 2)).toBe("Fifteen photographs. Two films.");
    expect(galleryHeadline(0, 2)).toBe("Two films.");
    expect(galleryHeadline(1, 0)).toBe("One photograph.");
    expect(galleryHeadline(3, 1)).toBe("Three photographs. One film.");
    expect(galleryHeadline(0, 0)).toBe("Your gallery.");
  });
  it("does the same for the keep section", () => {
    expect(keepHeadline(15, 2)).toBe("Every photograph. Every film.");
    expect(keepHeadline(0, 2)).toBe("Every film.");
    expect(keepHeadline(0, 1)).toBe("The film.");
    expect(keepHeadline(9, 0)).toBe("Every photograph.");
  });
});

describe("defaultGalleryNote", () => {
  it("writes to a person about what is actually there", () => {
    expect(applyGalleryNote(defaultGalleryNote({ photos: 15, films: 1, tone: "personal" }), { firstName: "Felicia" }))
      .toBe("Felicia, thank you for having us. Everything here is yours to keep — the film first, then the photographs, in the order we made them.");
    expect(applyGalleryNote(defaultGalleryNote({ photos: 15, films: 0, tone: "personal" }), {}))
      .toBe("Thank you for having us. Everything here is yours to keep, in the order we made them.");
    expect(applyGalleryNote(defaultGalleryNote({ photos: 0, films: 2, tone: "personal" }), { firstName: "Ann" }))
      .toBe("Ann, thank you for having us. Everything here is yours to keep.");
  });
  it("writes to a business without the family warmth", () => {
    expect(applyGalleryNote(defaultGalleryNote({ photos: 0, films: 2, tone: "business" }), { firstName: "Megan" }))
      .toBe("Megan, thank you for working with us. Everything here is finished and ready to use.");
    expect(applyGalleryNote(defaultGalleryNote({ photos: 4, films: 1, tone: "business" }), {}))
      .toBe("Thank you for working with us. Everything here is finished and ready to use — the film first, then the photographs.");
  });
});

describe("defaultToneFor", () => {
  it("matches the server rule", () => {
    expect(defaultToneFor("The Webb School", "Megan Winnicker")).toBe("business");
    expect(defaultToneFor("Felicia Long", "Felicia Long")).toBe("personal");
    expect(defaultToneFor("Estefania", "")).toBe("personal");
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
