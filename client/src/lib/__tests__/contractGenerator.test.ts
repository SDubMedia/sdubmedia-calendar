// Smoke tests for the contract generator's merge-field substitution.
// Imports the API helper directly via vitest's path resolution so we
// exercise the same code that runs in production (no fixture drift).

import { describe, expect, it } from "vitest";
import { generateContractContent } from "../../../../api/_contractGenerator";

const baseInput = {
  masterTemplateHtml: "<p>Hello {{client_name}}, this is {{vendor_name}}.</p>",
  proposalTitle: "Wedding Day Coverage",
  clientName: "Sarah Adams",
  clientEmail: "sarah@example.com",
  clientAddress: "123 Main St, Nashville, TN 37204",
  clientPhone: "(615) 555-0001",
  vendorName: "S-Dub Media",
  vendorEmail: "geoff@sdubmedia.com",
  vendorAddress: "945 Tynan Way, Nolensville, TN 37135",
  vendorPhone: "(615) 555-0002",
  vendorSignerName: "Geoff Southworth",
  eventDate: "2026-06-14",
  eventLocation: "Grand Hotel",
  selectedPackages: [{
    id: "p1",
    name: "Full Coverage Wedding",
    description: "8 hours of coverage",
    defaultPrice: 1200,
    totalPrice: 1200,
    discountFromPrice: null as number | null,
    quantity: 1,
  }],
  totalPrice: 1200,
  milestones: [
    { type: "percent" as const, percent: 50, dueType: "at_signing" as const, label: "Deposit" },
    { type: "percent" as const, percent: 50, dueType: "absolute_date" as const, dueDate: "2026-06-14", label: "Balance" },
  ],
};

describe("generateContractContent", () => {
  it("substitutes plain merge fields", () => {
    const html = generateContractContent(baseInput);
    expect(html).toContain("Sarah Adams");
    expect(html).toContain("S-Dub Media");
    expect(html).not.toContain("{{client_name}}");
    expect(html).not.toContain("{{vendor_name}}");
  });

  it("escapes HTML in user values to prevent XSS", () => {
    const html = generateContractContent({
      ...baseInput,
      clientName: "<script>alert('x')</script>",
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("uses vendorSignerName for {{vendor_signer_name}}", () => {
    const html = generateContractContent({
      ...baseInput,
      masterTemplateHtml: "<p>{{vendor_signer_name}}</p>",
    });
    expect(html).toContain("Geoff Southworth");
  });

  it("falls back to vendorName when vendorSignerName is empty", () => {
    const html = generateContractContent({
      ...baseInput,
      vendorSignerName: undefined,
      masterTemplateHtml: "<p>{{vendor_signer_name}}</p>",
    });
    expect(html).toContain("S-Dub Media");
  });

  it("formats event_date as a long-form English date", () => {
    const html = generateContractContent({
      ...baseInput,
      masterTemplateHtml: "<p>{{event_date}}</p>",
    });
    expect(html).toMatch(/Sun|Sunday.*Jun.*14.*2026/);
  });

  it("renders {{packages_block}} with the selected package", () => {
    const html = generateContractContent({
      ...baseInput,
      masterTemplateHtml: "<p>{{packages_block}}</p>",
    });
    expect(html).toContain("Full Coverage Wedding");
    expect(html).toContain("$1200.00");
  });

  it("renders {{payment_schedule_block}} with calculated amounts", () => {
    const html = generateContractContent({
      ...baseInput,
      masterTemplateHtml: "<p>{{payment_schedule_block}}</p>",
    });
    // 50% of 1200 = 600
    expect(html).toContain("$600.00");
    expect(html).toContain("at time of signing");
  });

  it("renders {{parties_block}} with vendor + client info", () => {
    const html = generateContractContent({
      ...baseInput,
      masterTemplateHtml: "<p>{{parties_block}}</p>",
    });
    expect(html).toContain("Parties:");
    expect(html).toContain("Vendor");
    expect(html).toContain("Client");
    expect(html).toContain("S-Dub Media");
    expect(html).toContain("Sarah Adams");
  });

  it("resolves {{deposit_due_date}} to today for at_signing milestones", () => {
    const html = generateContractContent({
      ...baseInput,
      masterTemplateHtml: "<p>Deposit due: {{deposit_due_date}}</p>",
    });
    // Should be a real date string, not the literal token.
    expect(html).not.toContain("{{deposit_due_date}}");
  });

  it("resolves {{balance_due_date}} from the absolute_date milestone", () => {
    const html = generateContractContent({
      ...baseInput,
      masterTemplateHtml: "<p>Balance due: {{balance_due_date}}</p>",
    });
    expect(html).toContain("Sun, Jun 14, 2026");
  });

  it("handles a percent-only schedule with proper amounts", () => {
    const html = generateContractContent({
      ...baseInput,
      totalPrice: 2000,
      milestones: [
        { type: "percent" as const, percent: 25, dueType: "at_signing" as const, label: "Deposit" },
        { type: "percent" as const, percent: 75, dueType: "absolute_date" as const, dueDate: "2026-06-14", label: "Balance" },
      ],
      masterTemplateHtml: "<p>{{payment_schedule_block}}</p>",
    });
    expect(html).toContain("$500.00"); // 25% of 2000
    expect(html).toContain("$1500.00"); // 75% of 2000
  });

  it("handles fixed-amount milestones", () => {
    const html = generateContractContent({
      ...baseInput,
      milestones: [
        { type: "fixed" as const, fixedAmount: 500, dueType: "at_signing" as const, label: "Booking fee" },
        { type: "fixed" as const, fixedAmount: 700, dueType: "absolute_date" as const, dueDate: "2026-06-14", label: "Balance" },
      ],
      masterTemplateHtml: "<p>{{payment_schedule_block}}</p>",
    });
    expect(html).toContain("$500.00");
    expect(html).toContain("$700.00");
    expect(html).toContain("Booking fee");
  });

  it("handles empty selectedPackages gracefully", () => {
    const html = generateContractContent({
      ...baseInput,
      selectedPackages: [],
      masterTemplateHtml: "<p>{{packages_block}}</p>",
    });
    expect(html).toContain("No packages selected");
  });

  it("preserves contract template HTML structure around merge fields", () => {
    const html = generateContractContent({
      ...baseInput,
      masterTemplateHtml: "<h1>Contract</h1><p>Between {{vendor_name}} and {{client_name}}.</p><p>Total: ${{}}</p>",
    });
    expect(html).toContain("<h1>Contract</h1>");
    expect(html).toContain("<p>Between S-Dub Media and Sarah Adams.</p>");
  });
});
