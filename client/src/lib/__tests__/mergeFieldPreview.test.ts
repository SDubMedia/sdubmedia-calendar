// What a reader sees where a {{token}} was written.
//
// This is the helper the agreement leans on in two places: inside a
// paragraph, and as a standalone merge-field block (the Parties header is
// built entirely from those). Braces reaching a client is the bug this
// guards — a legal document is the worst place to leak template syntax.

import { describe, it, expect } from "vitest";
import {
  renderTemplatePreviewHtml,
  clientFieldsIn,
  fieldFilledBy,
} from "../mergeFieldPreview";
import type { Organization } from "../types";

const ORG = {
  name: "S-Dub Media",
  businessInfo: {
    email: "geoff@sdubmedia.com",
    phone: "615-555-0100",
    address: "1 Main St",
    city: "Nolensville",
    state: "TN",
    zip: "37135",
  },
} as unknown as Organization;

const strip = (html: string) => html.replace(/<[^>]*>/g, "");

describe("renderTemplatePreviewHtml", () => {
  it("never leaves braces behind for a field it knows", () => {
    const fields = [
      "vendor_name", "vendor_email", "vendor_address", "vendor_phone",
      "client_name", "client_email", "client_address", "client_phone",
      "event_date", "event_location", "packages_block", "payment_schedule_block",
    ];
    for (const field of fields) {
      expect(renderTemplatePreviewHtml(`{{${field}}}`, ORG)).not.toContain("{{");
    }
  });

  it("prints the vendor's real details, not a label", () => {
    expect(strip(renderTemplatePreviewHtml("{{vendor_name}}", ORG))).toBe("S-Dub Media");
    expect(strip(renderTemplatePreviewHtml("{{vendor_address}}", ORG)))
      .toBe("1 Main St Nolensville, TN 37135");
  });

  // Better a visible "Vendor Email *" than a silent blank in a contract.
  it("keeps a labelled box when Settings has no value for it", () => {
    const bare = { name: "", businessInfo: {} } as unknown as Organization;
    expect(strip(renderTemplatePreviewHtml("{{vendor_email}}", bare))).toBe("Vendor Email*");
  });

  it("shows the client's own fields as boxes until they're typed", () => {
    expect(strip(renderTemplatePreviewHtml("{{client_name}}", ORG))).toBe("Client Name*");
    expect(strip(renderTemplatePreviewHtml("{{client_name}}", ORG, { client_name: "Gracie" })))
      .toBe("Gracie");
  });

  it("makes only the client's own fields editable in place", () => {
    const client = renderTemplatePreviewHtml("{{client_name}}", ORG, {}, true);
    expect(client).toContain('contenteditable="true"');
    expect(client).toContain('data-merge-field="client_name"');
    // The vendor's details aren't the signer's to change.
    expect(renderTemplatePreviewHtml("{{vendor_name}}", ORG, {}, true))
      .not.toContain("contenteditable");
  });

  // A second person is optional. An empty "Second Person's Email *" box on a
  // solo booking's contract reads as a missing signer.
  it("renders nothing at all for an unfilled second person", () => {
    expect(renderTemplatePreviewHtml("{{partner_name}}", ORG)).toBe("");
    expect(renderTemplatePreviewHtml("{{partner_email}}", ORG, {})).toBe("");
    expect(strip(renderTemplatePreviewHtml("{{partner_name}}", ORG, { partner_name: "Elijah" })))
      .toBe("Elijah");
  });

  it("leaves a token it doesn't recognise visible rather than deleting text", () => {
    expect(renderTemplatePreviewHtml("{{mystery_field}}", ORG)).toBe("{{mystery_field}}");
  });

  it("escapes what it substitutes", () => {
    const out = renderTemplatePreviewHtml("{{client_name}}", ORG, {
      client_name: '<img src=x onerror="alert(1)">',
    });
    expect(out).not.toContain("<img");
    expect(out).toContain("&lt;img");
  });
});

describe("clientFieldsIn", () => {
  it("lists what the signer has to complete, in order, once each", () => {
    const html = "{{vendor_name}} {{client_name}} {{event_date}} {{client_name}}";
    expect(clientFieldsIn(html).map(f => f.field)).toEqual([
      "client_name", "event_date",
    ]);
  });

  it("asks for the second person's details when the text uses them", () => {
    expect(clientFieldsIn("{{partner_name}}").map(f => f.label))
      .toEqual(["Second Person's Full Name"]);
  });
});

describe("fieldFilledBy", () => {
  it("separates what the signer supplies from what Slate does", () => {
    expect(fieldFilledBy("client_name")).toBe("client");
    expect(fieldFilledBy("event_location")).toBe("client");
    expect(fieldFilledBy("partner_name")).toBe("client");
    expect(fieldFilledBy("vendor_name")).toBe("auto");
    expect(fieldFilledBy("contract_signed_date")).toBe("auto");
  });
});

describe("tokens that reached a live client as raw braces", () => {
  // Found by opening a real proposal in a browser, not by reading code:
  // the agreement printed 'due in full by {{balance_due_date}}' and the
  // signature lines printed '{{contract_signed_date}}' and
  // '{{vendor_signer_name}}' to the person being asked to sign.
  it("labels the dates derived at signing", () => {
    expect(strip(renderTemplatePreviewHtml("{{balance_due_date}}", ORG))).toBe("Balance Due Date*");
    expect(strip(renderTemplatePreviewHtml("{{deposit_due_date}}", ORG))).toBe("Deposit Due Date*");
  });

  it("prints who signs for the business", () => {
    const withOwner = { name: "S-Dub Media", businessInfo: { ownerName: "Geoff Southworth" } } as unknown as Organization;
    expect(strip(renderTemplatePreviewHtml("{{vendor_signer_name}}", withOwner))).toBe("Geoff Southworth");
    // Server falls back company-ward, so the preview must too or the name
    // changes between what they read and what they sign.
    expect(strip(renderTemplatePreviewHtml("{{vendor_signer_name}}", ORG))).toBe("S-Dub Media");
  });

  it("prints a real signing date", () => {
    const out = strip(renderTemplatePreviewHtml("{{contract_signed_date}}", ORG));
    expect(out).not.toContain("{{");
    expect(out).toMatch(/^[A-Z][a-z]+ \d{1,2}, \d{4}$/);
  });
});
