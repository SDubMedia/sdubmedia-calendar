import { describe, it, expect } from "vitest";
import { hubGalleries, hubMergedFiles, isGated } from "../../../../api/_clientHub";

const d = (id: string, o: Partial<{ project_id: string | null; status: string; view_only: boolean; password_hash: string | null; require_email: boolean; delivered_at: string | null; created_at: string | null }> = {}) => ({
  id, project_id: "p1", status: "delivered", view_only: false, password_hash: null, require_email: false, delivered_at: "2026-09-01", created_at: "2026-08-01", ...o,
});
const mine = new Set(["p1", "p2"]);

describe("hubGalleries", () => {
  it("keeps only delivered galleries on the client's projects", () => {
    const rows = [d("a"), d("b", { status: "submitted" }), d("c", { status: "sent" }), d("d", { project_id: "other" }), d("e", { project_id: null })];
    expect(hubGalleries(rows, mine).map(g => g.id)).toEqual(["a"]);
  });

  it("leaves out view-only portfolios", () => {
    expect(hubGalleries([d("a", { view_only: true }), d("b")], mine).map(g => g.id)).toEqual(["b"]);
  });

  it("orders newest delivered first, falling back to creation", () => {
    const rows = [d("old", { delivered_at: "2026-07-01" }), d("new", { delivered_at: "2026-09-05" }), d("nodate", { delivered_at: null, created_at: "2026-08-15" })];
    expect(hubGalleries(rows, mine).map(g => g.id)).toEqual(["new", "nodate", "old"]);
  });
});

describe("gates and merged files", () => {
  it("treats a password or an email requirement as a gate", () => {
    expect(isGated(d("a"))).toBe(false);
    expect(isGated(d("b", { password_hash: "x" }))).toBe(true);
    expect(isGated(d("c", { require_email: true }))).toBe(true);
  });

  it("merges finished files from open galleries only, never proofs", () => {
    const galleries = [d("open"), d("locked", { password_hash: "x" })];
    const files = [
      { id: "f1", delivery_id: "open", stage: "final" },
      { id: "f2", delivery_id: "open", stage: "proof" },
      { id: "f3", delivery_id: "open", stage: null },
      { id: "f4", delivery_id: "locked", stage: "final" },
    ];
    expect(hubMergedFiles(files, galleries).map(f => f.id)).toEqual(["f1", "f3"]);
  });
});
