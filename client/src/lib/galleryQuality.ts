// ============================================================
// Which galleries keep full-quality files.
//
// Geoff, 2026-09-05: every photo shoot stays full quality, end to end — the
// raws as proofs, what the editor downloads, and what the editor uploads
// back. The ONE exception is a real estate shoot: those are re-saved small
// because the agent is putting them on the MLS. Real estate is a kind of
// client, not a gallery setting — same test the dashboard and the gallery
// list use: the client is an agent, or the shoot is billed to a brokerage.
// ============================================================

import type { Client, Delivery, Project } from "./types";
import { getProjectPayerId } from "./data";

export function isRealEstateProject(
  project: Project | null | undefined,
  clientsById: Record<string, Client>,
): boolean {
  if (!project) return false;
  if (clientsById[project.clientId]?.clientType === "agent") return true;
  return clientsById[getProjectPayerId(project, clientsById)]?.clientType === "broker";
}

/** Keep the untouched file beside the browsable copy? Always, unless this is
 *  a real estate shoot — and even then, if the owner switched it on. A
 *  gallery with no project (nothing to classify) keeps full quality. */
export function keepsFullQuality(
  delivery: Pick<Delivery, "keepOriginals">,
  project: Project | null | undefined,
  clientsById: Record<string, Client>,
): boolean {
  return !isRealEstateProject(project, clientsById) || delivery.keepOriginals === true;
}
