// ============================================================
// What a client hub shows. Pure, so it can be tested.
//
// A hub lists every DELIVERED gallery on the client's projects — never a
// proofing round in progress, never a view-only portfolio. Files from a
// gallery that has its own gate (password or email) are not spread into
// the hub's merged Films / Photographs sections: the gate would be
// meaningless if the same files were one link away without it. The card
// still appears, and opens the gallery through its gate.
// ============================================================

export interface HubDeliveryRow {
  id: string;
  project_id: string | null;
  status: string;
  view_only?: boolean | null;
  password_hash?: string | null;
  require_email?: boolean | null;
  delivered_at?: string | null;
  created_at?: string | null;
}

export interface HubFileRow {
  id: string;
  delivery_id: string;
  stage?: string | null;
}

export function hubGalleries<T extends HubDeliveryRow>(deliveries: T[], clientProjectIds: Set<string>): T[] {
  return deliveries
    .filter(d => d.project_id && clientProjectIds.has(d.project_id))
    .filter(d => d.status === "delivered")
    .filter(d => d.view_only !== true)
    .sort((a, b) => (b.delivered_at || b.created_at || "").localeCompare(a.delivered_at || a.created_at || ""));
}

export function isGated(d: HubDeliveryRow): boolean {
  return !!d.password_hash || d.require_email === true;
}

/** Finished files only (a proof is never a deliverable), from ungated
 *  galleries only. */
export function hubMergedFiles<T extends HubFileRow>(files: T[], galleries: HubDeliveryRow[]): T[] {
  const open = new Set(galleries.filter(g => !isGated(g)).map(g => g.id));
  return files.filter(f => open.has(f.delivery_id) && f.stage !== "proof");
}
