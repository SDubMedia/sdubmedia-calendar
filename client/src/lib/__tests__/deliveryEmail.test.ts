import { describe, it, expect } from "vitest";
import { contentsNoun, contentsVerb, defaultSubject, defaultBody, applyMerge } from "../deliveryEmail";

describe("contentsNoun / contentsVerb", () => {
  it("names photos, video, or both", () => {
    expect(contentsNoun({ photoCount: 40, videoCount: 0 })).toBe("photos");
    expect(contentsNoun({ photoCount: 0, videoCount: 1 })).toBe("video");
    expect(contentsNoun({ photoCount: 4, videoCount: 1 })).toBe("photos and video");
  });

  it("tracks singular and plural per count, not overall", () => {
    // "Your video is ready" is wrong for three films; "videos are" is wrong for one.
    expect(contentsNoun({ photoCount: 0, videoCount: 3 })).toBe("videos");
    expect(contentsNoun({ photoCount: 1, videoCount: 0 })).toBe("photo");
    expect(contentsNoun({ photoCount: 1, videoCount: 2 })).toBe("photo and videos");
  });

  it("agrees the verb", () => {
    expect(contentsVerb({ photoCount: 0, videoCount: 1 })).toBe("is");
    expect(contentsVerb({ photoCount: 1, videoCount: 0 })).toBe("is");
    expect(contentsVerb({ photoCount: 9, videoCount: 0 })).toBe("are");
    expect(contentsVerb({ photoCount: 4, videoCount: 1 })).toBe("are");
  });

  it("falls back to 'files' for an empty gallery rather than lying", () => {
    expect(contentsNoun({ photoCount: 0, videoCount: 0 })).toBe("files");
  });
});

describe("defaults", () => {
  it("build from the gallery's contents", () => {
    expect(defaultSubject({ photoCount: 0, videoCount: 1 }))
      .toBe("Your video is ready — {{gallery_title}}");
    expect(defaultBody({ photoCount: 4, videoCount: 1 }))
      .toContain("The photos and video for {{gallery_title}} are ready");
  });
});

describe("applyMerge", () => {
  const v = {
    firstName: "Gracie",
    galleryTitle: "Elijah and Gracie",
    galleryUrl: "https://slate.sdubmedia.com/g/elijahandgracie",
    contents: { photoCount: 4, videoCount: 1 },
  };

  it("fills every field", () => {
    const out = applyMerge("Hi {{first_name}}, the {{contents}} for {{gallery_title}}: {{gallery_link}}", v);
    expect(out).toBe("Hi Gracie, the photos and video for Elijah and Gracie: https://slate.sdubmedia.com/g/elijahandgracie");
  });

  it("replaces every occurrence, not just the first", () => {
    expect(applyMerge("{{first_name}} {{first_name}}", v)).toBe("Gracie Gracie");
  });

  // A blanked typo produces "Hi ," in a client's inbox and goes unnoticed.
  it("leaves an unknown token visible instead of blanking it", () => {
    expect(applyMerge("Hi {{frist_name}},", v)).toBe("Hi {{frist_name}},");
  });

  it("leaves text with no fields alone", () => {
    expect(applyMerge("Congratulations!", v)).toBe("Congratulations!");
  });
});
