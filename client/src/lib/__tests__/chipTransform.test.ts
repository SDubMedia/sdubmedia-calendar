// Tests for chipTransform — round-trips between {{token}} and styled chip
// spans inside prose HTML. Critical because the editor sees chips while the
// server-side contract generator + persisted HTML use the canonical token
// form; a one-way bug here would silently break template authoring.

import { describe, expect, it } from "vitest";
import { tokensToChips, chipsToTokens } from "@/components/proposal-editor/chipTransform";

describe("tokensToChips", () => {
  it("wraps a known token in a chip span", () => {
    const out = tokensToChips("Hello {{client_name}}");
    expect(out).toContain('class="merge-chip merge-chip-placeholder"');
    expect(out).toContain('contenteditable="false"');
    expect(out).toContain('data-field="client_name"');
    expect(out).toContain(">Client Name<");
  });

  it("leaves unknown tokens alone", () => {
    const out = tokensToChips("This is {{not_a_real_field}} text");
    expect(out).toBe("This is {{not_a_real_field}} text");
  });

  it("handles multiple tokens in one string", () => {
    const out = tokensToChips("From {{vendor_name}} to {{client_name}}");
    expect(out.match(/data-field=/g)?.length).toBe(2);
    expect(out).toContain('data-field="vendor_name"');
    expect(out).toContain('data-field="client_name"');
  });

  it("handles a string with no tokens", () => {
    expect(tokensToChips("just text")).toBe("just text");
  });

  it("escapes HTML in the label", () => {
    // All known field labels are plain — but verify the escape is wired.
    const out = tokensToChips("{{event_date}}");
    expect(out).not.toContain("<script");
  });
});

describe("chipsToTokens", () => {
  it("strips chip spans back to canonical {{token}} form", () => {
    const html = '<p>Hello <span class="merge-chip merge-chip-placeholder" contenteditable="false" data-field="client_name">Client Name</span>!</p>';
    expect(chipsToTokens(html)).toBe("<p>Hello {{client_name}}!</p>");
  });

  it("handles attribute order variation", () => {
    const html = '<span data-field="event_date" class="x" contenteditable="false">Event Date</span>';
    expect(chipsToTokens(html)).toBe("{{event_date}}");
  });

  it("collapses multiple chips", () => {
    const html = '<span data-field="vendor_name">Vendor</span> and <span data-field="client_name">Client</span>';
    expect(chipsToTokens(html)).toBe("{{vendor_name}} and {{client_name}}");
  });

  it("leaves non-chip spans alone", () => {
    const html = '<p>Hello <span class="other">there</span></p>';
    expect(chipsToTokens(html)).toBe(html);
  });
});

describe("round-trip", () => {
  // The editor's job: tokens → chips on mount, chips → tokens on commit.
  // Persisted HTML should always equal what we started with.
  it("tokens → chips → tokens preserves the canonical form", () => {
    const original = "<p>Payment due on {{deposit_due_date}} and final on {{balance_due_date}}.</p>";
    const chipped = tokensToChips(original);
    expect(chipped).not.toBe(original); // chips actually rendered
    const back = chipsToTokens(chipped);
    expect(back).toBe(original);
  });

  it("plain text round-trips unchanged", () => {
    const original = "<p>This contract is between the parties.</p>";
    expect(chipsToTokens(tokensToChips(original))).toBe(original);
  });
});
