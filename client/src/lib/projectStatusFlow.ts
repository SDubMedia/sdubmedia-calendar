// ============================================================
// Project status flow + role-based permissions for who can move
// a project to the next state.
//
// Status flow:
//   tentative → upcoming → filming_done → in_editing → editing_done → delivered
//   cancelled is separate (any role can mark cancelled; not part of the chain).
//
// Role rules:
//   - Filming roles (Videographer, Photographer family) can advance
//     upcoming → filming_done and filming_done → in_editing.
//   - Editing roles (Video Editor, Photo Editor, Editor) can advance
//     in_editing → editing_done.
//   - Only owner / partner can mark a project Delivered (the final
//     hand-off to the client). Editors propose "editing done"; the
//     admin confirms delivery.
//   - Tentative → upcoming happens automatically when the deposit
//     pays — not a manual action — so it's not in NEXT_STATUS.
// ============================================================

import type { ProjectStatus, UserRole } from "@/lib/types";

// "Done" in most operational contexts = editing finished OR delivered.
// Use this everywhere old code checked `status === "completed"` so
// both new states are treated consistently (billing finalized,
// "completed" filters on dashboards, client health rollups, etc.).
export function isProjectFinished(status: ProjectStatus): boolean {
  return status === "editing_done" || status === "delivered";
}

export const NEXT_STATUS: Partial<Record<ProjectStatus, ProjectStatus>> = {
  upcoming: "filming_done",
  filming_done: "in_editing",
  in_editing: "editing_done",
  editing_done: "delivered",
};

export const NEXT_STATUS_LABEL: Partial<Record<ProjectStatus, string>> = {
  upcoming: "Mark Filming Done",
  filming_done: "Move to Editing",
  in_editing: "Mark Editing Done",
  editing_done: "Mark Delivered",
};

// Substring-match against the role string so customized role names
// like "Lead Videographer" or "Senior Editor" still work.
function isFilmingRole(role: string): boolean {
  const r = role.toLowerCase();
  return r.includes("videographer") || r.includes("photographer") || r.includes("camera") || r.includes("cinema");
}
function isEditingRole(role: string): boolean {
  const r = role.toLowerCase();
  // Match "Editor", "Video Editor", "Photo Editor", etc. — but NOT
  // "Audio Engineer" (no "edit" substring there anyway).
  return r.includes("editor") || r.includes("editing");
}

// Can THIS user advance the project from currentStatus to its
// next status? rolesOnProject is the set of roles this user
// is assigned across the project's crew + post-production lists.
export function canAdvanceProjectStatus(
  currentStatus: ProjectStatus,
  userAuthRole: UserRole | undefined,
  rolesOnProject: string[],
): boolean {
  if (!NEXT_STATUS[currentStatus]) return false;
  // Owner and partner can always advance.
  if (userAuthRole === "owner" || userAuthRole === "partner") return true;
  // Staff: gated by their crew role on this specific project.
  const next = NEXT_STATUS[currentStatus];
  if (next === "filming_done" || next === "in_editing") {
    return rolesOnProject.some(isFilmingRole);
  }
  if (next === "editing_done") {
    return rolesOnProject.some(isEditingRole);
  }
  // Marking Delivered is admin-only — even editors can't do it.
  // Owner/partner already returned true above; staff hits this gate.
  if (next === "delivered") {
    return false;
  }
  return false;
}
