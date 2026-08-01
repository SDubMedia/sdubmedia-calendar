// Tests for the personal calendar-feed filters in api/calendar.ics.ts.
//
// These decide what lands on someone's phone when they subscribe. Getting them
// wrong doesn't throw — it silently hands a contractor the whole client list —
// so the rules are pure functions and pinned here.

import { describe, expect, it } from "vitest";
import { projectInFeed, meetingInFeed, type FeedViewer } from "../../../../api/calendar.ics";

const david: FeedViewer = { userId: "u_david", role: "staff", crewMemberId: "crew_david", clientIds: [] };
const melissa: FeedViewer = { userId: "u_mel", role: "staff", crewMemberId: "crew_mel", clientIds: [] };
const unlinkedStaff: FeedViewer = { userId: "u_new", role: "staff", crewMemberId: "", clientIds: [] };
const agent: FeedViewer = { userId: "u_agent", role: "client", crewMemberId: "", clientIds: ["cl_1"] };
const family: FeedViewer = { userId: "u_fam", role: "family", crewMemberId: "", clientIds: [] };

const editJob = { client_id: "cl_1", crew: [], post_production: [{ crewMemberId: "crew_david", role: "Video Editor" }] };
const shootJob = { client_id: "cl_2", crew: [{ crewMemberId: "crew_david", role: "Main Videographer" }], post_production: [] };
const legacyJob = { client_id: "cl_2", crew: [{ crew_member_id: "crew_david", role: "Videographer" }], post_production: [] };
const melJob = { client_id: "cl_3", crew: [{ crewMemberId: "crew_mel", role: "Main Photographer" }], post_production: [] };
const unassigned = { client_id: "cl_4", crew: [], post_production: [] };

describe("projectInFeed", () => {
  it("gives the org-wide feed (no viewer) everything", () => {
    expect(projectInFeed(melJob, null)).toBe(true);
    expect(projectInFeed(unassigned, null)).toBe(true);
  });

  it("includes a job the staff member edits", () => {
    expect(projectInFeed(editJob, david)).toBe(true);
  });

  it("includes a job the staff member shot", () => {
    expect(projectInFeed(shootJob, david)).toBe(true);
  });

  it("matches older rows that stored the id as crew_member_id", () => {
    expect(projectInFeed(legacyJob, david)).toBe(true);
  });

  it("excludes another crew member's job", () => {
    expect(projectInFeed(melJob, david)).toBe(false);
    expect(projectInFeed(editJob, melissa)).toBe(false);
  });

  it("excludes jobs nobody is assigned to", () => {
    expect(projectInFeed(unassigned, david)).toBe(false);
  });

  it("gives a staff member with no crew record nothing, rather than everything", () => {
    expect(projectInFeed(editJob, unlinkedStaff)).toBe(false);
    expect(projectInFeed(unassigned, unlinkedStaff)).toBe(false);
  });

  it("gives a client only their own projects", () => {
    expect(projectInFeed(editJob, agent)).toBe(true);      // cl_1
    expect(projectInFeed(shootJob, agent)).toBe(false);    // cl_2
  });

  it("denies an unrecognised role instead of defaulting open", () => {
    const stranger: FeedViewer = { userId: "u_x", role: "somethingelse", crewMemberId: "crew_david", clientIds: ["cl_1"] };
    expect(projectInFeed(editJob, stranger)).toBe(false);
  });

  it("survives malformed crew data without throwing", () => {
    expect(projectInFeed({ client_id: "c", crew: null, post_production: undefined }, david)).toBe(false);
    expect(projectInFeed({ client_id: "c", crew: { crewMemberId: "crew_david" }, post_production: [] }, david)).toBe(false);
  });
});

describe("meetingInFeed", () => {
  it("gives staff only meetings they're assigned to", () => {
    expect(meetingInFeed({ assigned_user_ids: ["u_david"] }, david)).toBe(true);
    expect(meetingInFeed({ assigned_user_ids: ["u_mel"] }, david)).toBe(false);
  });

  it("keeps unassigned admin meetings off a staff feed", () => {
    expect(meetingInFeed({ assigned_user_ids: [] }, david)).toBe(false);
    expect(meetingInFeed({}, david)).toBe(false);
  });

  it("gives a client a meeting only when it's theirs and marked visible", () => {
    expect(meetingInFeed({ client_id: "cl_1", visible_to_client: true }, agent)).toBe(true);
    expect(meetingInFeed({ client_id: "cl_1", visible_to_client: false }, agent)).toBe(false);
    expect(meetingInFeed({ client_id: "cl_9", visible_to_client: true }, agent)).toBe(false);
  });

  it("passes everything through for family and the org feed", () => {
    expect(meetingInFeed({ assigned_user_ids: [] }, family)).toBe(true);
    expect(meetingInFeed({ assigned_user_ids: [] }, null)).toBe(true);
  });
});
