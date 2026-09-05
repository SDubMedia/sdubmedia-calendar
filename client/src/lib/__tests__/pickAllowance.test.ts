import { describe, it, expect } from "vitest";
import { countEditedPhotos, pendingPickIds, pickOverage, picksRemaining } from "../../../../api/_pickAllowance";

type F = { id: string; stage?: string | null; media_type?: string | null };
const proof = (id: string): F => ({ id, stage: "proof", media_type: "image" });
const final = (id: string): F => ({ id, stage: "final", media_type: "image" });
const video = (id: string): F => ({ id, stage: "final", media_type: "video" });

describe("countEditedPhotos", () => {
  it("counts finished photos in a proofing gallery, not videos", () => {
    expect(countEditedPhotos([proof("p1"), proof("p2"), final("f1"), final("f2"), video("v1")])).toBe(2);
  });

  it("is 0 while nothing has come back", () => {
    expect(countEditedPhotos([proof("p1"), proof("p2")])).toBe(0);
  });

  it("is 0 for a gallery with no proofs at all — nothing there was 'edited'", () => {
    expect(countEditedPhotos([final("a"), final("b"), video("v")])).toBe(0);
    expect(countEditedPhotos([])).toBe(0);
  });

  it("counts legacy rows with no stage as finals", () => {
    expect(countEditedPhotos([proof("p1"), { id: "old", stage: null, media_type: "image" }])).toBe(1);
  });
});

describe("pendingPickIds", () => {
  it("keeps only picks whose proof is still a proof", () => {
    // p1 was picked and has since been replaced by its final (row flipped to
    // 'final'); p2 is still waiting. Only p2 is pending.
    const files = [final("p1"), proof("p2"), proof("p3")];
    expect(pendingPickIds(["p1", "p2"], files)).toEqual(["p2"]);
  });

  it("keeps every pick in a gallery with no proofs", () => {
    expect(pendingPickIds(["a", "b"], [final("a"), final("b")])).toEqual(["a", "b"]);
  });
});

describe("pickOverage / picksRemaining — Felicia's reopened round", () => {
  // 25 free. 13 picks all edited, plus 1 extra the editor finished that was
  // never picked: 14 finished photos. Reopened, she has 11 left.
  const limit = 25;
  const edited = 14;

  it("leaves limit minus edited photos on a reopened round", () => {
    expect(picksRemaining(limit, edited, 0)).toBe(11);
  });

  it("charges nothing for exactly the remaining picks", () => {
    const eleven = Array.from({ length: 11 }, (_, i) => `n${i}`);
    expect(pickOverage(limit, edited, [], eleven)).toBe(0);
  });

  it("charges for picks past the remaining allowance", () => {
    const twelve = Array.from({ length: 12 }, (_, i) => `n${i}`);
    expect(pickOverage(limit, edited, [], twelve)).toBe(1);
  });

  it("counts pending picks from an earlier send, without double-counting a re-sent heart", () => {
    // 3 pending on file, she sends 2 of those again plus 9 new = 12 distinct → 14 + 12 = 26 → 1 over
    const pending = ["a", "b", "c"];
    const now = ["a", "b", ...Array.from({ length: 9 }, (_, i) => `n${i}`)];
    expect(pickOverage(limit, edited, pending, now)).toBe(1);
    expect(picksRemaining(limit, edited, pending.length)).toBe(8);
  });

  it("matches the old rule when nothing is edited", () => {
    const picks = Array.from({ length: 27 }, (_, i) => `n${i}`);
    expect(pickOverage(limit, 0, [], picks)).toBe(2);
    expect(picksRemaining(limit, 0, 0)).toBe(25);
  });

  it("never goes negative", () => {
    expect(picksRemaining(10, 12, 0)).toBe(0);
    expect(pickOverage(10, 0, [], [])).toBe(0);
  });
});
