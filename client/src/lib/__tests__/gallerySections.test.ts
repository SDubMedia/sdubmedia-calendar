import { describe, it, expect } from "vitest";
import { sortGalleryFiles, gallerySectionBoundaries } from "../gallerySections";

type F = { id: string; folderId?: string | null; mediaType?: "image" | "video" };
const img = (id: string, folderId: string | null = null): F => ({ id, folderId, mediaType: "image" });
const vid = (id: string, folderId: string | null = null): F => ({ id, folderId, mediaType: "video" });
const ids = (files: F[]) => files.map(f => f.id);

const FOLDERS = [
  { id: "fold_finals", name: "Final Videos", position: 0 },
  { id: "fold_broll", name: "B Roll", position: 1 },
];

describe("sortGalleryFiles", () => {
  it("leaves a photo-only gallery with no folders in the owner's order", () => {
    const files = [img("a"), img("b"), img("c")];
    expect(ids(sortGalleryFiles(files, []))).toEqual(["a", "b", "c"]);
  });

  it("puts films before photos, each group keeping its relative order", () => {
    const files = [img("p1"), vid("v1"), img("p2"), vid("v2")];
    expect(ids(sortGalleryFiles(files, []))).toEqual(["v1", "v2", "p1", "p2"]);
  });

  it("puts unfoldered files first, then folders in creation order", () => {
    const files = [img("broll1", "fold_broll"), img("loose1"), img("final1", "fold_finals"), img("loose2")];
    expect(ids(sortGalleryFiles(files, FOLDERS))).toEqual(["loose1", "loose2", "final1", "broll1"]);
  });

  it("orders films first within each folder, not across folders", () => {
    const files = [img("bp", "fold_broll"), vid("bv", "fold_broll"), img("fp", "fold_finals"), vid("fv", "fold_finals")];
    expect(ids(sortGalleryFiles(files, FOLDERS))).toEqual(["fv", "fp", "bv", "bp"]);
  });

  it("treats a folder id the gallery doesn't know as unfoldered", () => {
    const files = [img("known", "fold_finals"), img("ghost", "fold_deleted"), img("loose")];
    expect(ids(sortGalleryFiles(files, FOLDERS))).toEqual(["ghost", "loose", "known"]);
  });

  it("does not mutate the input", () => {
    const files = [img("p"), vid("v")];
    sortGalleryFiles(files, []);
    expect(ids(files)).toEqual(["p", "v"]);
  });
});

describe("gallerySectionBoundaries", () => {
  it("adds no headers to a photo-only gallery with no folders", () => {
    expect(gallerySectionBoundaries([img("a"), img("b")], [])).toEqual([]);
  });

  it("adds no headers to a film-only gallery with no folders", () => {
    expect(gallerySectionBoundaries([vid("a"), vid("b")], [])).toEqual([]);
  });

  it("splits a mixed unfoldered gallery into Films / Photos", () => {
    const files = sortGalleryFiles([img("p1"), vid("v1"), vid("v2"), img("p2")], []);
    expect(gallerySectionBoundaries(files, [])).toEqual([
      { index: 0, label: "Films" },
      { index: 2, label: "Photos" },
    ]);
  });

  it("uses the singular 'Film' for exactly one video", () => {
    const files = sortGalleryFiles([img("p1"), vid("v1")], []);
    expect(gallerySectionBoundaries(files, [])).toEqual([
      { index: 0, label: "Film" },
      { index: 1, label: "Photos" },
    ]);
  });

  it("labels each folder run by name and keeps the unfoldered run unlabeled when it is not mixed", () => {
    const files = sortGalleryFiles(
      [img("loose1"), img("loose2"), vid("fv", "fold_finals"), img("bp", "fold_broll")],
      FOLDERS,
    );
    expect(gallerySectionBoundaries(files, FOLDERS)).toEqual([
      { index: 2, label: "Final Videos" },
      { index: 3, label: "B Roll" },
    ]);
  });

  it("adds a secondary Photos split inside a folder that mixes films and photos", () => {
    const files = sortGalleryFiles([img("fp", "fold_finals"), vid("fv", "fold_finals")], FOLDERS);
    expect(gallerySectionBoundaries(files, FOLDERS)).toEqual([
      { index: 0, label: "Final Videos" },
      { index: 1, label: "Photos" },
    ]);
  });

  it("agrees with the sort about an unknown folder id: it is part of the unfoldered run", () => {
    const raw = [img("ghost", "fold_deleted"), img("loose"), img("known", "fold_finals")];
    const files = sortGalleryFiles(raw, FOLDERS);
    // Only the real folder gets a header; the ghost never produces
    // "Untitled folder" in the middle of the loose photos.
    expect(gallerySectionBoundaries(files, FOLDERS)).toEqual([{ index: 2, label: "Final Videos" }]);
  });

  it("skips headers for folders whose files are all filtered out", () => {
    // e.g. the client toggled "picked only" and none of the B Roll was picked
    const visible = [img("loose"), img("fp", "fold_finals")];
    expect(gallerySectionBoundaries(visible, FOLDERS)).toEqual([{ index: 1, label: "Final Videos" }]);
  });
});
