// ============================================================
// Tests for type constants and defaults
// ============================================================

import { describe, it, expect } from "vitest";
import { DEFAULT_PIPELINE_STAGES, DEFAULT_DASHBOARD_WIDGETS } from "../types";

describe("DEFAULT_PIPELINE_STAGES", () => {
  it("has at least 5 stages", () => {
    expect(DEFAULT_PIPELINE_STAGES.length).toBeGreaterThanOrEqual(5);
  });

  it("starts with inquiry", () => {
    expect(DEFAULT_PIPELINE_STAGES[0].id).toBe("inquiry");
  });

  it("ends with archived", () => {
    expect(DEFAULT_PIPELINE_STAGES[DEFAULT_PIPELINE_STAGES.length - 1].id).toBe("archived");
  });

  it("every stage has id, label, and color", () => {
    for (const stage of DEFAULT_PIPELINE_STAGES) {
      expect(stage.id).toBeTruthy();
      expect(stage.label).toBeTruthy();
      expect(stage.color).toBeTruthy();
    }
  });

  it("has no duplicate ids", () => {
    const ids = DEFAULT_PIPELINE_STAGES.map(s => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("DEFAULT_DASHBOARD_WIDGETS", () => {
  it("has at least 3 widgets", () => {
    expect(DEFAULT_DASHBOARD_WIDGETS.length).toBeGreaterThanOrEqual(3);
  });

  it("every widget has id and enabled flag", () => {
    for (const widget of DEFAULT_DASHBOARD_WIDGETS) {
      expect(widget.id).toBeTruthy();
      expect(typeof widget.enabled).toBe("boolean");
    }
  });
});
