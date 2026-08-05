// ============================================================
// Shared guard: is this user assigned crew on this project, in a role that's
// allowed to move the job along and upload finals? Used by the crew-facing
// status + gallery-upload endpoints. Qualifying roles: any photographer (main /
// second), any videographer (main / second), or any editor — assigned to THIS
// project. Travel-only or unassigned crew don't qualify.
// ============================================================

import { createClient } from "@supabase/supabase-js";

export const supabaseService = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLL_KEY || ""
);

type CrewEntry = { crewMemberId?: string; crew_member_id?: string; role?: string };

export type CrewAccess =
  | { ok: true; orgId: string; crewMemberId: string; project: { id: string; org_id: string; status: string; client_id: string | null; location_id: string | null } }
  | { ok: false; status: number; error: string };

function memberId(c: CrewEntry): string {
  return c.crewMemberId || c.crew_member_id || "";
}

/** Which assignment qualifies the caller.
 *  "any"     — on the shoot OR in post (drafts, status changes)
 *  "gallery" — allowed to put finals in the client's gallery: anyone who shot
 *              it, plus PHOTO editors, whose deliverable IS the finished
 *              gallery (hundreds of frames — drafts make no sense for that).
 *              Video editors are excluded: they post drafts for review and the
 *              owner promotes the approved cut. */
export type CrewRequirement = "any" | "gallery";

/** Confirm the caller is staff, linked to a crew member, and assigned to the
 *  project in a qualifying role. */
export async function verifyCrewOnProject(
  userId: string,
  projectId: string,
  require: CrewRequirement = "any",
): Promise<CrewAccess> {
  const { data: profile } = await supabaseService
    .from("user_profiles").select("role, crew_member_id, org_id").eq("id", userId).single();
  if (!profile) return { ok: false, status: 403, error: "Only assigned crew can do this" };
  const isOwner = profile.role === "owner";
  if (!isOwner && (profile.role !== "staff" || !profile.crew_member_id)) {
    return { ok: false, status: 403, error: "Only assigned crew can do this" };
  }

  const { data: project } = await supabaseService
    .from("projects").select("id, org_id, status, client_id, location_id, crew, post_production").eq("id", projectId).single();
  if (!project) return { ok: false, status: 404, error: "Project not found" };
  if (project.org_id !== profile.org_id) return { ok: false, status: 403, error: "Not your project" };

  // The owner can do anything in their own org, so they're never blocked by an
  // assignment check. This also makes impersonation usable: "view as Melissa"
  // switches the screens but every API call still carries the owner's token, so
  // without this the owner testing an editor's flow is refused by their own app.
  if (isOwner) {
    return {
      ok: true,
      orgId: profile.org_id,
      crewMemberId: profile.crew_member_id || "",
      project: { id: project.id, org_id: project.org_id, status: project.status, client_id: project.client_id, location_id: project.location_id },
    };
  }

  const myId = profile.crew_member_id;
  const crew: CrewEntry[] = Array.isArray(project.crew) ? project.crew : [];
  const post: CrewEntry[] = Array.isArray(project.post_production) ? project.post_production : [];
  // On-site shooters: photographer (main/second) or videographer (main/second).
  const onShoot = crew.some(c => memberId(c) === myId && /photograph|videograph/i.test(c.role || ""));
  // Post: anyone in an editor role (photo editor, video editor, etc.).
  const onEdit = post.some(c => memberId(c) === myId && /editor/i.test(c.role || ""));
  // Photo editors deliver galleries; video editors deliver drafts. Match the
  // photo side explicitly so a plain "Editor" role counts as photo too — the
  // one role that's ambiguous, and stills are the safer reading.
  const onPhotoEdit = post.some(c => {
    const role = c.role || "";
    return memberId(c) === myId && /editor/i.test(role) && !/video/i.test(role);
  });
  if (require === "gallery") {
    if (!onShoot && !onPhotoEdit) {
      return { ok: false, status: 403, error: "Video editors post drafts — the owner promotes the approved cut" };
    }
  } else if (!onShoot && !onEdit) {
    return { ok: false, status: 403, error: "You're not assigned to this job" };
  }

  return {
    ok: true,
    orgId: profile.org_id,
    crewMemberId: myId,
    project: { id: project.id, org_id: project.org_id, status: project.status, client_id: project.client_id, location_id: project.location_id },
  };
}
