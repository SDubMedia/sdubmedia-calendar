// Tests for the pure helpers in api/inbound-email.ts. Verifies sender
// extraction + quoted-reply stripping work across mail clients.

import { describe, expect, it } from "vitest";
import { extractEmail, stripQuotedReply } from "../../../../api/inbound-email";

describe("extractEmail", () => {
  it("extracts the bare email from 'Name <email@example.com>' format", () => {
    expect(extractEmail("Sarah Adams <sarah@example.com>")).toBe("sarah@example.com");
  });

  it("returns the raw email when there's no display name", () => {
    expect(extractEmail("sarah@example.com")).toBe("sarah@example.com");
  });

  it("lowercases the result", () => {
    expect(extractEmail("Sarah <Sarah@Example.com>")).toBe("sarah@example.com");
  });

  it("trims whitespace", () => {
    expect(extractEmail("  sarah@example.com  ")).toBe("sarah@example.com");
  });

  it("returns null for empty input", () => {
    expect(extractEmail("")).toBeNull();
  });
});

describe("stripQuotedReply", () => {
  it("returns whole body when no quote markers are present", () => {
    const body = "Hi there,\n\nLooks great. When can we start?";
    expect(stripQuotedReply(body)).toBe(body.trim());
  });

  it("strips Gmail-style 'On <date> wrote:' marker", () => {
    const body = "Yes, let's add the videographer.\n\nOn Mon, May 5, 2026 at 2:14 PM Geoff <geoff@sdubmedia.com> wrote:\n> Original message here";
    expect(stripQuotedReply(body)).toBe("Yes, let's add the videographer.");
  });

  it("strips Outlook-style 'Original Message' marker", () => {
    const body = "Sounds good!\n\n----- Original Message -----\nFrom: Geoff\nSent: ...";
    expect(stripQuotedReply(body)).toBe("Sounds good!");
  });

  it("strips '> '-prefixed quote lines", () => {
    const body = "Yes — confirming.\n\n> Original message\n> with multiple lines";
    expect(stripQuotedReply(body)).toBe("Yes — confirming.");
  });

  it("strips forwarded 'From:' headers", () => {
    const body = "FYI\n\nFrom: Sarah <sarah@example.com>\nDate: ...";
    expect(stripQuotedReply(body)).toBe("FYI");
  });

  it("returns empty string for empty input", () => {
    expect(stripQuotedReply("")).toBe("");
  });

  it("uses the earliest marker when multiple are present", () => {
    const body = "Reply text\n> quoted line\nOn Mon wrote:\n> more quote";
    expect(stripQuotedReply(body)).toBe("Reply text");
  });
});
