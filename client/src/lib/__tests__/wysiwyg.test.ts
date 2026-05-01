// ============================================================
// Tests for plainTextToHtml — the editor's input pipeline.
// Idempotency matters: plainTextToHtml(plainTextToHtml(x)) must equal
// plainTextToHtml(x), otherwise the editor's value-sync effect can
// loop on every render.
// ============================================================

import { describe, it, expect } from "vitest";
import { plainTextToHtml } from "../../components/WysiwygContractEditor";

describe("plainTextToHtml", () => {
  it("returns empty string for empty input", () => {
    expect(plainTextToHtml("")).toBe("");
  });

  it("wraps plain text in a paragraph", () => {
    const out = plainTextToHtml("hello");
    expect(out).toContain("<p>");
    expect(out).toContain("hello");
  });

  it("turns blank lines into separate paragraphs", () => {
    const out = plainTextToHtml("first paragraph\n\nsecond paragraph");
    expect((out.match(/<p>/g) || []).length).toBe(2);
  });

  it("detects ALL CAPS lines as headings", () => {
    const out = plainTextToHtml("PHOTOGRAPHY SERVICES AGREEMENT\n\nbody text");
    expect(out).toContain("<h1>");
    expect(out).toContain("<p>");
  });

  it("does not treat bracketed placeholders as headings", () => {
    const out = plainTextToHtml("[FEE]");
    // [FEE] looks all-caps but is content
    expect(out).not.toContain("<h1>[FEE]");
    expect(out).toContain("<p>");
  });

  it("wraps bracket placeholders in chip spans", () => {
    const out = plainTextToHtml("Pay [FEE] within [X days].");
    expect(out).toContain("data-bracket-field");
    expect(out).toContain("data-placeholder=\"FEE\"");
    expect(out).toContain("data-placeholder=\"X days\"");
  });

  it("is idempotent on its own output (HTML detected and re-processed safely)", () => {
    const once = plainTextToHtml("Pay [FEE] within [X days].");
    const twice = plainTextToHtml(once);
    expect(twice).toBe(once);
  });

  it("does not double-wrap already-chipped brackets when re-processed", () => {
    const html = `<p>Pay <span data-bracket-field="" data-placeholder="FEE" data-value="" class="bracket-chip bracket-chip-empty">[FEE]</span> please</p>`;
    const out = plainTextToHtml(html);
    // Should not produce nested data-bracket-field spans
    const matches = (out.match(/data-bracket-field/g) || []).length;
    expect(matches).toBe(1);
  });

  it("preserves merge-field spans when re-processing HTML", () => {
    const html = `<p>Hello <span data-merge-field="client_name">{{client_name}}</span>!</p>`;
    const out = plainTextToHtml(html);
    expect(out).toContain("data-merge-field=\"client_name\"");
  });
});
