import { describe, it, expect } from "vitest";
import { visibleGalleryRows } from "../../../../api/_deliveryVisibility";

type Row = { id: string; stage?: string | null };
const proof = (id: string): Row => ({ id, stage: "proof" });
const final = (id: string): Row => ({ id, stage: "final" });
const legacy = (id: string): Row => ({ id, stage: null });
const ids = (rows: Row[]) => rows.map(r => r.id);

describe("visibleGalleryRows — what the public link serves", () => {
  it("serves every file of a gallery with no proofs, whatever the status (real estate, legacy)", () => {
    const rows = [final("a"), legacy("b")];
    for (const status of ["draft", "sent", "working", "delivered"]) {
      const v = visibleGalleryRows(rows, status, false);
      expect(ids(v.rows)).toEqual(["a", "b"]);
      expect(v.previewingFinals).toBe(false);
    }
  });

  it("serves the proofs while there are no finals yet", () => {
    const v = visibleGalleryRows([proof("p1"), proof("p2")], "sent", false);
    expect(ids(v.rows)).toEqual(["p1", "p2"]);
    expect(v.previewingFinals).toBe(false);
  });

  it("hides finals from the client until the gallery is delivered", () => {
    const rows = [proof("p1"), proof("p2"), final("f1")];
    for (const status of ["sent", "submitted", "working"]) {
      const v = visibleGalleryRows(rows, status, false);
      expect(ids(v.rows)).toEqual(["p1", "p2"]);
      expect(v.previewingFinals).toBe(false);
    }
  });

  it("serves only the finals to the client once delivered", () => {
    const v = visibleGalleryRows([proof("p1"), final("f1"), final("f2")], "delivered", false);
    expect(ids(v.rows)).toEqual(["f1", "f2"]);
    expect(v.previewingFinals).toBe(false);
  });

  it("lets the team preview the finals before Deliver, and says so", () => {
    const v = visibleGalleryRows([proof("p1"), final("f1")], "working", true);
    expect(ids(v.rows)).toEqual(["f1"]);
    expect(v.previewingFinals).toBe(true);
  });

  it("does not flag a preview once delivered — the client sees the same thing", () => {
    const v = visibleGalleryRows([proof("p1"), final("f1")], "delivered", true);
    expect(ids(v.rows)).toEqual(["f1"]);
    expect(v.previewingFinals).toBe(false);
  });

  it("does not flag a preview when there is nothing hidden from the client", () => {
    expect(visibleGalleryRows([proof("p1")], "sent", true).previewingFinals).toBe(false);
    expect(visibleGalleryRows([final("f1")], "sent", true).previewingFinals).toBe(false);
  });

  it("returns an empty list for an empty gallery", () => {
    expect(visibleGalleryRows([], "sent", false).rows).toEqual([]);
  });
});
