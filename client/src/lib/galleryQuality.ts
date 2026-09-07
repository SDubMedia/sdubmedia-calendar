// ============================================================
// Which galleries keep full-quality files.
//
// Geoff, 2026-09-05: every photo shoot stays full quality, end to end — the
// raws as proofs, what the editor downloads, and what the editor uploads
// back. The ONE exception is a real estate shoot: those are re-saved small
// because the agent is putting them on the MLS. Real estate is a kind of
// client, not a gallery setting — same test the dashboard and the gallery
// list use: the client is an agent, or the shoot is billed to a brokerage.
//
// Geoff, 2026-09-07: plus a per-gallery switch. A brokerage that is mostly
// recurring corporate work (Coldwell Banker Southern Realty) is a standard
// client, so its occasional listing shoot had no way to be a real estate
// delivery. `delivery.realEstate` treats that one gallery exactly like an
// agent's. api/_galleryPresentation.ts mirrors the same rule server-side.
// ============================================================

import type { Client, Delivery, Project } from "./types";
import { getProjectPayerId } from "./data";

/** The client-based rule alone: the client is an agent, or the shoot is
 *  billed to a brokerage. What the per-gallery switch adds to. */
export function isRealEstateProject(
  project: Project | null | undefined,
  clientsById: Record<string, Client>,
): boolean {
  if (!project) return false;
  if (clientsById[project.clientId]?.clientType === "agent") return true;
  return clientsById[getProjectPayerId(project, clientsById)]?.clientType === "broker";
}

/** Whether THIS gallery is delivered as real estate: the owner's switch, or
 *  the client-based rule. The test every gallery decision should use. */
export function isRealEstateGallery(
  delivery: Pick<Delivery, "realEstate"> | null | undefined,
  project: Project | null | undefined,
  clientsById: Record<string, Client>,
): boolean {
  if (delivery?.realEstate === true) return true;
  return isRealEstateProject(project, clientsById);
}

/** Keep the untouched file beside the browsable copy? Always, unless this is
 *  a real estate delivery — and even then, if the owner switched it on. A
 *  gallery with no project (nothing to classify) keeps full quality. */
export function keepsFullQuality(
  delivery: Pick<Delivery, "keepOriginals" | "realEstate">,
  project: Project | null | undefined,
  clientsById: Record<string, Client>,
): boolean {
  return !isRealEstateGallery(delivery, project, clientsById) || delivery.keepOriginals === true;
}
