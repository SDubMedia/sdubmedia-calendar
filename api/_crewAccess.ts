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

/** Confirm the caller is staff, linked to a crew member, and assigned to the
 *  project in a qualifying role (photographer / videographer / editor). */
export async function verifyCrewOnProject(userId: string, projectId: string): Promise<CrewAccess> {
  const { data: profile } = await supabaseService
    .from("user_profiles").select("role, crew_member_id, org_id").eq("id", userId).single();
  if (!profile || profile.role !== "staff" || !profile.crew_member_id) {
    return { ok: false, status: 403, error: "Only assigned crew can do this" };
  }

  const { data: project } = await supabaseService
    .from("projects").select("id, org_id, status, client_id, location_id, crew, post_production").eq("id", projectId).single();
  if (!project) return { ok: false, status: 404, error: "Project not found" };
  if (project.org_id !== profile.org_id) return { ok: false, status: 403, error: "Not your project" };

  const myId = profile.crew_member_id;
  const crew: CrewEntry[] = Array.isArray(project.crew) ? project.crew : [];
  const post: CrewEntry[] = Array.isArray(project.post_production) ? project.post_production : [];
  // On-site shooters: photographer (main/second) or videographer (main/second).
  const onShoot = crew.some(c => memberId(c) === myId && /photograph|videograph/i.test(c.role || ""));
  // Post: anyone in an editor role (photo editor, video editor, etc.).
  const onEdit = post.some(c => memberId(c) === myId && /editor/i.test(c.role || ""));
  if (!onShoot && !onEdit) {
    return { ok: false, status: 403, error: "You're not assigned to this job" };
  }

  return {
    ok: true,
    orgId: profile.org_id,
    crewMemberId: myId,
    project: { id: project.id, org_id: project.org_id, status: project.status, client_id: project.client_id, location_id: project.location_id },
  };
}
