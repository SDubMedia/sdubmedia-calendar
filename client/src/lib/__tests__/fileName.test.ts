import { describe, it, expect } from "vitest";
import { renameFile, extensionOf, baseNameOf } from "../fileName";

describe("extensionOf / baseNameOf", () => {
  it("splits a normal filename", () => {
    expect(extensionOf("wedding.mov")).toBe(".mov");
    expect(baseNameOf("wedding.mov")).toBe("wedding");
  });

  it("uses only the last dot", () => {
    expect(extensionOf("8.9.26 Gracie and Elija.mov")).toBe(".mov");
    expect(baseNameOf("8.9.26 Gracie and Elija.mov")).toBe("8.9.26 Gracie and Elija");
  });

  it("handles a name with no extension", () => {
    expect(extensionOf("README")).toBe("");
    expect(baseNameOf("README")).toBe("README");
  });

  it("does not treat a dot in a folder path as an extension", () => {
    expect(extensionOf("a.b/c")).toBe("");
  });
});

describe("renameFile", () => {
  // The one that matters: a film saved without .mov won't open by double-click.
  it("keeps the original extension when the new name omits it", () => {
    expect(renameFile("8.9.26 Gracie and Elija.mov", "Gracie and Elijah Wedding Film"))
      .toBe("Gracie and Elijah Wedding Film.mov");
  });

  it("doesn't double up an extension the user typed", () => {
    expect(renameFile("clip.mov", "Final Cut.mov")).toBe("Final Cut.mov");
    expect(renameFile("clip.mov", "Final Cut.MOV")).toBe("Final Cut.MOV");
  });

  it("treats a different extension as part of the name and keeps the real one", () => {
    // Renaming a .mov to "teaser.mp4" must not claim to be an mp4 — the bytes
    // are still a mov, and the stored file has not changed.
    expect(renameFile("clip.mov", "teaser.mp4")).toBe("teaser.mp4.mov");
  });

  it("strips characters that would break a download header or a zip path", () => {
    expect(renameFile("a.jpg", 'He said "hi"')).toBe("He said hi.jpg");
    expect(renameFile("a.jpg", "../../etc/passwd")).toBe("....etcpasswd.jpg");
    expect(renameFile("a.jpg", "line\nbreak")).toBe("linebreak.jpg");
  });

  it("rejects names that would leave the file unusable", () => {
    expect(renameFile("a.jpg", "")).toBeNull();
    expect(renameFile("a.jpg", "   ")).toBeNull();
    expect(renameFile("a.jpg", '"""')).toBeNull();
    expect(renameFile("a.jpg", "...")).toBeNull();
  });

  it("trims surrounding whitespace", () => {
    expect(renameFile("a.jpg", "  Ceremony  ")).toBe("Ceremony.jpg");
  });

  it("keeps a file with no extension working", () => {
    expect(renameFile("README", "Notes")).toBe("Notes");
  });

  it("caps the length but never loses the extension", () => {
    const out = renameFile("a.mov", "x".repeat(500))!;
    expect(out.length).toBeLessThanOrEqual(200);
    expect(out.endsWith(".mov")).toBe(true);
  });

  it("leaves an unchanged name unchanged", () => {
    expect(renameFile("wedding.mov", "wedding.mov")).toBe("wedding.mov");
  });
});
