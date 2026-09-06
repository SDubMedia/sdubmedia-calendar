// ============================================================
// Which presentation the public gallery page renders.
//
// Geoff, 2026-09-06: every client gallery gets the editorial ("Apple
// keynote") presentation; real estate keeps the stripped-down listing look
// the agents are used to. Real estate is a kind of CLIENT, not a gallery
// setting — the same test the dashboard, the gallery list and
// client/src/lib/galleryQuality.ts use: the client is an agent, or the
// shoot is billed to a brokerage. Mirrored here because the public route
// runs on the server and can't import the client lib.
// ============================================================

export type GalleryPresentation = "editorial" | "listing";

export interface PresentationClient {
  id: string;
  client_type?: string | null;
  broker_id?: string | null;
}

export interface PresentationProject {
  client_id: string;
  bill_to_id?: string | null;
}

/** Same rule as getProjectPayerId in client/src/lib/data.ts. */
export function payerIdFor(project: PresentationProject, client: PresentationClient | null): string {
  if (project.bill_to_id) return project.bill_to_id;
  if (client?.client_type === "agent" && client.broker_id) return client.broker_id;
  return project.client_id;
}

export function isRealEstateShoot(client: PresentationClient | null, payer: PresentationClient | null): boolean {
  if (client?.client_type === "agent") return true;
  return payer?.client_type === "broker";
}

/** A gallery with no project has nothing to classify and gets the full
 *  editorial treatment. */
export function galleryPresentation(
  project: PresentationProject | null,
  client: PresentationClient | null,
  payer: PresentationClient | null,
): GalleryPresentation {
  if (!project) return "editorial";
  return isRealEstateShoot(client, payer) ? "listing" : "editorial";
}
