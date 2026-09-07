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
//
// Geoff, 2026-09-07: plus the gallery's own switch (deliveries.real_estate),
// for a listing shoot under a client that is otherwise standard. It wins
// even with no project to classify.
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

/** The two per-gallery switches that bear on quality and layout. */
export interface PresentationDelivery {
  real_estate?: boolean | null;
  keep_originals?: boolean | null;
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

/** Whether this gallery is delivered as real estate: its own switch, or the
 *  client-based rule. Same answer as isRealEstateGallery in the client lib. */
export function isRealEstateGallery(
  delivery: PresentationDelivery | null | undefined,
  project: PresentationProject | null,
  client: PresentationClient | null,
  payer: PresentationClient | null,
): boolean {
  if (delivery?.real_estate === true) return true;
  if (!project) return false;
  return isRealEstateShoot(client, payer);
}

/** Does Download hand over the untouched original? Always, unless this is a
 *  real estate delivery — and even then, if keep_originals is on. Same
 *  answer as keepsFullQuality in the client lib; read here at serve time so
 *  flipping the switch after upload changes what the client gets. */
export function keepsFullQuality(
  delivery: PresentationDelivery | null | undefined,
  project: PresentationProject | null,
  client: PresentationClient | null,
  payer: PresentationClient | null,
): boolean {
  return !isRealEstateGallery(delivery, project, client, payer) || delivery?.keep_originals === true;
}

/** A gallery with no project has nothing to classify and gets the full
 *  editorial treatment — unless its own switch says real estate. */
export function galleryPresentation(
  project: PresentationProject | null,
  client: PresentationClient | null,
  payer: PresentationClient | null,
  delivery?: PresentationDelivery | null,
): GalleryPresentation {
  return isRealEstateGallery(delivery, project, client, payer) ? "listing" : "editorial";
}

export type GalleryTone = "personal" | "business";

/** Who the copy is written for. A client record whose company name is a
 *  different thing from its contact person ("The Webb School" / "Megan")
 *  is a business; a record where they match, or with no contact at all
 *  ("Felicia Long" / "Felicia Long", "Estefania" / ""), is a person.
 *  Mirrored in client/src/lib/galleryCopy.ts for the owner's settings. */
export function defaultTone(client: { company?: string | null; contact_name?: string | null } | null): GalleryTone {
  const company = (client?.company || "").trim().toLowerCase();
  const contact = (client?.contact_name || "").trim().toLowerCase();
  return company && contact && company !== contact ? "business" : "personal";
}

export function resolveTone(stored: string | null | undefined, client: { company?: string | null; contact_name?: string | null } | null): GalleryTone {
  return stored === "business" || stored === "personal" ? stored : defaultTone(client);
}
