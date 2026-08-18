import { describe, it, expect } from "vitest";
import {
  classifyFollowUp,
  isOpenLead,
  pipelineValueByStage,
  totalPipelineValue,
  aggregateLostReasons,
  leadWinRate,
} from "../pipelineInsights";

const TODAY = "2026-08-18";

describe("classifyFollowUp", () => {
  it("null date means no follow-up scheduled", () => {
    expect(classifyFollowUp(null, TODAY)).toBeNull();
    expect(classifyFollowUp(undefined, TODAY)).toBeNull();
    expect(classifyFollowUp("", TODAY)).toBeNull();
  });
  it("today is due_today", () => {
    expect(classifyFollowUp("2026-08-18", TODAY)).toEqual({ kind: "due_today" });
  });
  it("tomorrow is upcoming", () => {
    expect(classifyFollowUp("2026-08-19", TODAY)).toEqual({ kind: "upcoming" });
  });
  it("yesterday is 1 day overdue", () => {
    expect(classifyFollowUp("2026-08-17", TODAY)).toEqual({ kind: "overdue", daysOverdue: 1 });
  });
  it("counts days overdue across a month boundary", () => {
    expect(classifyFollowUp("2026-07-31", TODAY)).toEqual({ kind: "overdue", daysOverdue: 18 });
  });
});

describe("isOpenLead", () => {
  it("open lead in a working stage counts", () => {
    expect(isOpenLead({ closedOutcome: "", pipelineStage: "inquiry" })).toBe(true);
  });
  it("won, lost, and archived do not", () => {
    expect(isOpenLead({ closedOutcome: "won", pipelineStage: "inquiry" })).toBe(false);
    expect(isOpenLead({ closedOutcome: "lost", pipelineStage: "inquiry" })).toBe(false);
    expect(isOpenLead({ closedOutcome: "", pipelineStage: "archived" })).toBe(false);
  });
});

describe("pipelineValueByStage", () => {
  const leads = [
    { pipelineStage: "inquiry" as const, expectedValue: 4000, closedOutcome: "" as const },
    { pipelineStage: "inquiry" as const, expectedValue: 350, closedOutcome: "" as const },
    { pipelineStage: "follow_up" as const, expectedValue: 1200, closedOutcome: "" as const },
    // Excluded: closed and archived
    { pipelineStage: "inquiry" as const, expectedValue: 9999, closedOutcome: "lost" as const },
    { pipelineStage: "archived" as const, expectedValue: 500, closedOutcome: "" as const },
    // Zero value adds nothing (no empty map entries)
    { pipelineStage: "proposal_sent" as const, expectedValue: 0, closedOutcome: "" as const },
  ];
  it("sums open leads per stage and skips closed/archived/zero", () => {
    const m = pipelineValueByStage(leads, []);
    expect(m.get("inquiry")).toBe(4350);
    expect(m.get("follow_up")).toBe(1200);
    expect(m.has("proposal_sent")).toBe(false);
    expect(m.has("archived")).toBe(false);
    expect(totalPipelineValue(m)).toBe(5550);
  });
  it("adds unlinked proposals but not archived ones", () => {
    const m = pipelineValueByStage(leads, [
      { pipelineStage: "proposal_sent" as const, total: 2500 },
      { pipelineStage: "archived" as const, total: 800 },
    ]);
    expect(m.get("proposal_sent")).toBe(2500);
    expect(totalPipelineValue(m)).toBe(8050);
  });
});

describe("aggregateLostReasons", () => {
  const lost = (reason: string, value: number, closedAt: string | null = "2026-08-01T00:00:00Z") =>
    ({ closedOutcome: "lost" as const, closedAt, lostReason: reason, expectedValue: value });
  it("groups by reason, sorted by count, empty reason becomes Unspecified", () => {
    const rows = aggregateLostReasons([
      lost("Price", 4000), lost("Price", 3000), lost("Ghosted", 500), lost("", 100),
      { closedOutcome: "won", closedAt: "2026-08-01T00:00:00Z", lostReason: "", expectedValue: 50 },
      { closedOutcome: "", closedAt: null, lostReason: "", expectedValue: 50 },
    ], null);
    expect(rows[0]).toEqual({ reason: "Price", count: 2, expectedValue: 7000 });
    expect(rows).toHaveLength(3);
    expect(rows.map(r => r.reason)).toContain("Unspecified");
  });
  it("window cutoff drops older closes and closes with no timestamp", () => {
    const cutoff = Date.parse("2026-07-01T00:00:00Z");
    const rows = aggregateLostReasons([
      lost("Price", 4000, "2026-06-01T00:00:00Z"),
      lost("Price", 1000, "2026-08-01T00:00:00Z"),
      lost("Ghosted", 500, null),
    ], cutoff);
    expect(rows).toEqual([{ reason: "Price", count: 1, expectedValue: 1000 }]);
  });
});

describe("leadWinRate", () => {
  it("rate is null when nothing is closed — not 0%", () => {
    expect(leadWinRate([{ closedOutcome: "", closedAt: null }], null).rate).toBeNull();
  });
  it("computes won / closed", () => {
    const r = leadWinRate([
      { closedOutcome: "won", closedAt: "2026-08-01T00:00:00Z" },
      { closedOutcome: "won", closedAt: "2026-08-02T00:00:00Z" },
      { closedOutcome: "lost", closedAt: "2026-08-03T00:00:00Z" },
      { closedOutcome: "", closedAt: null },
    ], null);
    expect(r).toEqual({ won: 2, lost: 1, rate: 2 / 3 });
  });
  it("respects the window on closedAt", () => {
    const cutoff = Date.parse("2026-08-02T00:00:00Z");
    const r = leadWinRate([
      { closedOutcome: "won", closedAt: "2026-08-01T00:00:00Z" },
      { closedOutcome: "lost", closedAt: "2026-08-03T00:00:00Z" },
    ], cutoff);
    expect(r).toEqual({ won: 0, lost: 1, rate: 0 });
  });
});
