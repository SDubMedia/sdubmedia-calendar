import { describe, it, expect } from "vitest";
import { mergeDashboardWidgets, DEFAULT_DASHBOARD_WIDGETS } from "../types";
import type { DashboardWidgetConfig } from "../types";

const ids = (w: DashboardWidgetConfig[]) => w.map(x => x.id);

describe("mergeDashboardWidgets", () => {
  it("returns the defaults when nothing is saved", () => {
    expect(ids(mergeDashboardWidgets())).toEqual(ids(DEFAULT_DASHBOARD_WIDGETS));
    expect(ids(mergeDashboardWidgets([]))).toEqual(ids(DEFAULT_DASHBOARD_WIDGETS));
  });

  it("keeps the user's order exactly", () => {
    const saved = [...DEFAULT_DASHBOARD_WIDGETS].reverse();
    expect(ids(mergeDashboardWidgets(saved))).toEqual(ids(saved));
  });

  it("keeps each widget's enabled flag", () => {
    const saved = DEFAULT_DASHBOARD_WIDGETS.map(w => ({ ...w, enabled: false }));
    expect(mergeDashboardWidgets(saved).every(w => !w.enabled)).toBe(true);
  });

  // The reason this function exists: Pipeline was added to the defaults after
  // people already had saved layouts. Appending would have dropped it to the
  // bottom of every existing dashboard when it had always sat near the top.
  it("slots a newly-added widget into its default position, not the end", () => {
    const saved = DEFAULT_DASHBOARD_WIDGETS.filter(w => w.id !== "pipeline");
    const merged = ids(mergeDashboardWidgets(saved));
    expect(merged).toContain("pipeline");
    // Derive pipeline's default predecessor instead of hardcoding it: the
    // anchor changes whenever a widget is added above pipeline in the
    // defaults (metrics → todos, 2026-08-21), and this test is about the
    // slotting behavior, not about which widget happens to sit above.
    const defaults = ids(DEFAULT_DASHBOARD_WIDGETS);
    const anchor = defaults[defaults.indexOf("pipeline") - 1];
    expect(merged.indexOf("pipeline")).toBe(merged.indexOf(anchor) + 1);
    expect(merged[merged.length - 1]).not.toBe("pipeline");
  });

  it("respects the user's order when slotting a new widget in", () => {
    // Everything above pipeline in the defaults moved to the end; pipeline
    // should follow its moved anchors rather than jump to the top.
    const defaults = ids(DEFAULT_DASHBOARD_WIDGETS);
    const abovePipeline = defaults.slice(0, defaults.indexOf("pipeline"));
    const saved = [
      ...DEFAULT_DASHBOARD_WIDGETS.filter(w => w.id !== "pipeline" && !abovePipeline.includes(w.id)),
      ...DEFAULT_DASHBOARD_WIDGETS.filter(w => abovePipeline.includes(w.id)),
    ];
    const merged = ids(mergeDashboardWidgets(saved));
    expect(merged[0]).not.toBe("pipeline");
    expect(merged.indexOf("pipeline")).toBeGreaterThan(merged.indexOf(abovePipeline[abovePipeline.length - 1]));
  });

  it("puts a new first-position widget at the front", () => {
    const saved = DEFAULT_DASHBOARD_WIDGETS.filter(w => w.id !== "metrics");
    expect(ids(mergeDashboardWidgets(saved))[0]).toBe("metrics");
  });

  it("drops ids that are no longer real widgets", () => {
    const saved = [{ id: "ghostWidget", enabled: true }] as unknown as DashboardWidgetConfig[];
    const merged = ids(mergeDashboardWidgets(saved));
    expect(merged).not.toContain("ghostWidget");
    expect(merged).toEqual(ids(DEFAULT_DASHBOARD_WIDGETS));
  });

  it("never loses or duplicates a widget", () => {
    const saved = DEFAULT_DASHBOARD_WIDGETS.filter(w => w.id !== "pipeline" && w.id !== "revenue");
    const merged = ids(mergeDashboardWidgets(saved));
    expect(new Set(merged).size).toBe(merged.length);
    expect(merged.length).toBe(DEFAULT_DASHBOARD_WIDGETS.length);
  });

  it("does not mutate the saved array it is given", () => {
    const saved = DEFAULT_DASHBOARD_WIDGETS.filter(w => w.id !== "pipeline");
    const before = saved.length;
    mergeDashboardWidgets(saved);
    expect(saved.length).toBe(before);
  });
});
