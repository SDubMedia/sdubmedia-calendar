// ============================================================
// Splits a shoot day's photos into per-booking groups.
//
// The rule the photographer works to: shoot the party's QR code, then shoot
// the party. So in capture order the card reads
//   [QR: Maria] p p p p [QR: the Nguyens] p p p [QR: …]
// and every photo belongs to the most recent QR before it.
//
// Two safety nets, because a blurry QR shouldn't mis-deliver a family's
// photos:
//   1. Photos with no QR ahead of them (or after an unreadable one) fall back
//      to matching their capture time against the slot schedule.
//   2. Anything still unresolved lands in an "unassigned" bucket that the
//      review screen shows the owner BEFORE anything is created or sent.
//
// Pure and dependency-free so it can be unit-tested without files.
// ============================================================

import { slotForTime, type SlotSpec } from "./miniSlots";

export interface ScannedPhoto {
  /** Stable key — the File's index in the upload batch. */
  id: string;
  name: string;
  /** Capture time (ms). See captureTime.ts. */
  ms: number;
  /** Whether ms came from EXIF or a weaker fallback. */
  fromExif: boolean;
  /** Booking token when this frame IS a QR divider, else null. */
  qrToken: string | null;
}

export interface GroupableBooking {
  id: string;
  bookingToken: string;
  name: string;
  slotTime: string;
}

export interface PhotoGroup {
  bookingId: string | null;   // null = unassigned bucket
  bookingName: string;
  slotTime: string;
  photoIds: string[];
  /** How each photo got here — shown in review so the owner knows what to trust. */
  via: "qr" | "slot-time" | "unassigned";
}

export interface GroupingResult {
  groups: PhotoGroup[];
  /** QR frames themselves — never delivered to clients. */
  qrPhotoIds: string[];
  /** QR codes that matched no booking on this event (someone else's code, or
   *  a stale one from another day). */
  unknownTokens: string[];
}

function localHHMM(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/**
 * Group photos by their preceding QR frame, with slot-time fallback.
 * `spec` is the event's slot schedule (used only by the fallback).
 */
export function groupPhotos(
  photos: ScannedPhoto[],
  bookings: GroupableBooking[],
  spec: SlotSpec,
): GroupingResult {
  const byToken = new Map(bookings.map(b => [b.bookingToken, b]));
  const bySlot = new Map(bookings.map(b => [b.slotTime, b]));

  // Capture order is the whole basis of the algorithm — never file order,
  // which Lightroom exports scramble.
  const ordered = [...photos].sort((a, b) => a.ms - b.ms || a.name.localeCompare(b.name));

  const qrPhotoIds: string[] = [];
  const unknownTokens: string[] = [];
  // bookingId (or "" for unassigned) → { photoIds, via }
  const buckets = new Map<string, { photoIds: string[]; via: PhotoGroup["via"] }>();
  const push = (key: string, id: string, via: PhotoGroup["via"]) => {
    const cur = buckets.get(key);
    if (cur) { cur.photoIds.push(id); if (cur.via !== via) cur.via = cur.via === "qr" ? "qr" : via; }
    else buckets.set(key, { photoIds: [id], via });
  };

  let current: GroupableBooking | null = null;
  for (const p of ordered) {
    if (p.qrToken) {
      qrPhotoIds.push(p.id);
      const match = byToken.get(p.qrToken);
      if (match) {
        current = match;
      } else {
        // A code we don't recognise: stop attributing to the previous party
        // rather than silently dumping strangers' photos into their gallery.
        current = null;
        if (!unknownTokens.includes(p.qrToken)) unknownTokens.push(p.qrToken);
      }
      continue;
    }

    if (current) { push(current.id, p.id, "qr"); continue; }

    // No QR ahead of this photo — fall back to when it was taken.
    const slot = slotForTime(spec, localHHMM(p.ms));
    const byTime = slot ? bySlot.get(slot) : undefined;
    if (byTime) push(byTime.id, p.id, "slot-time");
    else push("", p.id, "unassigned");
  }

  const groups: PhotoGroup[] = [];
  for (const b of bookings) {
    const bucket = buckets.get(b.id);
    if (!bucket || bucket.photoIds.length === 0) continue;
    groups.push({ bookingId: b.id, bookingName: b.name, slotTime: b.slotTime, photoIds: bucket.photoIds, via: bucket.via });
  }
  groups.sort((a, b) => a.slotTime.localeCompare(b.slotTime));

  const orphan = buckets.get("");
  if (orphan && orphan.photoIds.length > 0) {
    groups.push({ bookingId: null, bookingName: "Unassigned", slotTime: "", photoIds: orphan.photoIds, via: "unassigned" });
  }

  return { groups, qrPhotoIds, unknownTokens };
}

/** Move photos between groups from the review screen. Returns a new array. */
export function reassignPhotos(groups: PhotoGroup[], photoIds: string[], toBookingId: string | null): PhotoGroup[] {
  const moving = new Set(photoIds);
  const stripped = groups.map(g => ({ ...g, photoIds: g.photoIds.filter(id => !moving.has(id)) }));
  const target = stripped.find(g => g.bookingId === toBookingId);
  if (target) target.photoIds = [...target.photoIds, ...photoIds];
  return stripped.filter(g => g.photoIds.length > 0 || g.bookingId === toBookingId);
}
