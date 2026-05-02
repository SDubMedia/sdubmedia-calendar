// Tests for buildProjectMailto — confirms subject + body are correctly
// shaped for confirmation vs cancellation emails. Pure function so safe
// to assert on the literal output.

import { describe, expect, it } from "vitest";
import { buildProjectMailto } from "../projectMailto";

const baseInput = {
  to: "client@example.com",
  orgName: "S-Dub Media",
  ownerName: "Geoff Southworth",
  clientName: "Sarah Adams",
  projectType: "Wedding",
  date: "2026-06-14",
  startTime: "14:00",
  endTime: "20:00",
  location: "Grand Hotel",
  cancelled: false,
  cancellationReason: "",
};

describe("buildProjectMailto", () => {
  it("produces a mailto: URL with the recipient", () => {
    const url = buildProjectMailto(baseInput);
    expect(url.startsWith("mailto:")).toBe(true);
    expect(decodeURIComponent(url)).toContain("client@example.com");
  });

  it("uses confirmation subject when not cancelled", () => {
    const url = buildProjectMailto(baseInput);
    expect(decodeURIComponent(url)).toContain("subject=Confirmed: Wedding on");
  });

  it("uses cancellation subject when cancelled", () => {
    const url = buildProjectMailto({ ...baseInput, cancelled: true });
    expect(decodeURIComponent(url)).toContain("subject=Cancellation: Wedding on");
  });

  it("includes the cancellation reason when cancelled and reason provided", () => {
    const url = buildProjectMailto({
      ...baseInput,
      cancelled: true,
      cancellationReason: "Moved out of state",
    });
    expect(decodeURIComponent(url)).toContain("Moved out of state");
  });

  it("formats the date in long-form English", () => {
    const url = buildProjectMailto(baseInput);
    expect(decodeURIComponent(url)).toContain("Sunday, June 14, 2026");
  });

  it("includes location and time on confirmation emails", () => {
    const url = buildProjectMailto(baseInput);
    const decoded = decodeURIComponent(url);
    expect(decoded).toContain("Grand Hotel");
    expect(decoded).toContain("14:00");
    expect(decoded).toContain("20:00");
  });

  it("greets by first name", () => {
    const url = buildProjectMailto(baseInput);
    expect(decodeURIComponent(url)).toContain("Hi Sarah,");
  });

  it("falls back to 'there' when client name is empty", () => {
    const url = buildProjectMailto({ ...baseInput, clientName: "" });
    expect(decodeURIComponent(url)).toContain("Hi there,");
  });

  it("signs with owner name and company when both are present", () => {
    const url = buildProjectMailto(baseInput);
    const decoded = decodeURIComponent(url);
    expect(decoded).toContain("Thanks,");
    expect(decoded).toContain("Geoff Southworth");
    expect(decoded).toContain("S-Dub Media");
  });

  it("doesn't duplicate when owner and org name match", () => {
    const url = buildProjectMailto({ ...baseInput, ownerName: "S-Dub Media" });
    const decoded = decodeURIComponent(url);
    // Should appear only once in the signature block.
    const matches = decoded.match(/S-Dub Media/g);
    expect(matches?.length).toBe(1);
  });

  it("URL-encodes special characters in subject + body", () => {
    const url = buildProjectMailto({
      ...baseInput,
      cancellationReason: "Couldn't make it & wanted to reschedule",
      cancelled: true,
    });
    // Apostrophe + ampersand + spaces all need to be encoded.
    expect(url).not.toContain(" & ");
    expect(url).toMatch(/%26|&amp;|amp%3B|amp%26/);
  });

  it("uses reschedule subject + 'moved from / to' copy when rescheduledFromDate is set", () => {
    const url = buildProjectMailto({
      ...baseInput,
      date: "2026-07-04",
      rescheduledFromDate: "2026-06-14",
    });
    const decoded = decodeURIComponent(url);
    expect(decoded).toContain("subject=Rescheduled: Wedding now on Saturday, July 4, 2026");
    expect(decoded).toContain("Sunday, June 14, 2026");
    expect(decoded).toContain("Saturday, July 4, 2026");
  });

  it("reschedule body says 'we've moved your...'", () => {
    const url = buildProjectMailto({
      ...baseInput,
      date: "2026-07-04",
      rescheduledFromDate: "2026-06-14",
    });
    expect(decodeURIComponent(url)).toContain("we've moved your wedding");
  });
});
