import { describe, it, expect } from "vitest";
import { groupPhotos, reassignPhotos, type ScannedPhoto, type GroupableBooking } from "../miniGrouping";
import { parseExifDate, captureTimeFromBuffer } from "../captureTime";
import { tokenFromQrText } from "../qrScan";

const spec = { startTime: "13:00", endTime: "14:00", slotMinutes: 15, breakMinutes: 5 };

const bookings: GroupableBooking[] = [
  { id: "b1", bookingToken: "tok_maria", name: "Maria Lopez", slotTime: "13:00" },
  { id: "b2", bookingToken: "tok_nguyen", name: "The Nguyens", slotTime: "13:20" },
];

// A shoot-day timeline: QR frame, then that party's photos.
const at = (hh: number, mm: number, ss = 0) => new Date(2026, 9, 11, hh, mm, ss).getTime();
const photo = (id: string, ms: number, qrToken: string | null = null): ScannedPhoto =>
  ({ id, name: `${id}.jpg`, ms, fromExif: true, qrToken });

describe("groupPhotos — the happy path", () => {
  it("assigns every photo to the QR that came before it", () => {
    const { groups, qrPhotoIds } = groupPhotos([
      photo("q1", at(13, 0), "tok_maria"),
      photo("p1", at(13, 1)), photo("p2", at(13, 3)),
      photo("q2", at(13, 20), "tok_nguyen"),
      photo("p3", at(13, 21)), photo("p4", at(13, 25)), photo("p5", at(13, 28)),
    ], bookings, spec);

    expect(groups.find(g => g.bookingId === "b1")?.photoIds).toEqual(["p1", "p2"]);
    expect(groups.find(g => g.bookingId === "b2")?.photoIds).toEqual(["p3", "p4", "p5"]);
    // The QR frames themselves never reach a client gallery.
    expect(qrPhotoIds).toEqual(["q1", "q2"]);
    expect(groups.every(g => !g.photoIds.some(id => qrPhotoIds.includes(id)))).toBe(true);
  });

  it("sorts by capture time, not the order files were handed over", () => {
    const { groups } = groupPhotos([
      photo("p3", at(13, 21)),
      photo("q1", at(13, 0), "tok_maria"),
      photo("q2", at(13, 20), "tok_nguyen"),
      photo("p1", at(13, 2)),
    ], bookings, spec);
    expect(groups.find(g => g.bookingId === "b1")?.photoIds).toEqual(["p1"]);
    expect(groups.find(g => g.bookingId === "b2")?.photoIds).toEqual(["p3"]);
  });
});

describe("groupPhotos — safety nets", () => {
  it("falls back to slot times when the first QR was missed", () => {
    // No QR at all for Maria — her photos still land on her by capture time.
    const { groups } = groupPhotos([
      photo("p1", at(13, 5)), photo("p2", at(13, 8)),
      photo("q2", at(13, 20), "tok_nguyen"), photo("p3", at(13, 22)),
    ], bookings, spec);
    const maria = groups.find(g => g.bookingId === "b1");
    expect(maria?.photoIds).toEqual(["p1", "p2"]);
    expect(maria?.via).toBe("slot-time");
    expect(groups.find(g => g.bookingId === "b2")?.via).toBe("qr");
  });

  it("an unknown QR stops attribution instead of dumping strangers' photos on the last party", () => {
    const { groups, unknownTokens } = groupPhotos([
      photo("q1", at(13, 0), "tok_maria"), photo("p1", at(13, 1)),
      photo("qX", at(13, 40), "tok_from_another_event"),
      photo("p9", at(13, 41)),
    ], bookings, spec);
    expect(unknownTokens).toEqual(["tok_from_another_event"]);
    expect(groups.find(g => g.bookingId === "b1")?.photoIds).toEqual(["p1"]);
    // 13:41 is outside every slot, so it can't fall back either → unassigned.
    expect(groups.find(g => g.bookingId === null)?.photoIds).toEqual(["p9"]);
  });

  it("photos outside the event entirely land in the unassigned bucket", () => {
    const { groups } = groupPhotos([photo("p1", at(9, 0))], bookings, spec);
    expect(groups).toHaveLength(1);
    expect(groups[0].bookingId).toBeNull();
    expect(groups[0].via).toBe("unassigned");
  });

  it("a booking with no photos produces no group", () => {
    const { groups } = groupPhotos([
      photo("q1", at(13, 0), "tok_maria"), photo("p1", at(13, 1)),
    ], bookings, spec);
    expect(groups.map(g => g.bookingId)).toEqual(["b1"]);
  });
});

describe("reassignPhotos (review screen fixes)", () => {
  it("moves photos between parties without duplicating them", () => {
    const { groups } = groupPhotos([
      photo("q1", at(13, 0), "tok_maria"), photo("p1", at(13, 1)), photo("p2", at(13, 2)),
      photo("q2", at(13, 20), "tok_nguyen"), photo("p3", at(13, 21)),
    ], bookings, spec);
    const moved = reassignPhotos(groups, ["p2"], "b2");
    expect(moved.find(g => g.bookingId === "b1")?.photoIds).toEqual(["p1"]);
    expect(moved.find(g => g.bookingId === "b2")?.photoIds).toEqual(["p3", "p2"]);
    const all = moved.flatMap(g => g.photoIds);
    expect(new Set(all).size).toBe(all.length);
  });
});

describe("captureTime EXIF parsing", () => {
  it("parses the EXIF date format", () => {
    expect(parseExifDate("2026:10:11 14:23:07")).toBe(new Date(2026, 9, 11, 14, 23, 7).getTime());
    expect(parseExifDate("nonsense")).toBeNull();
    expect(parseExifDate("")).toBeNull();
  });

  it("reads DateTimeOriginal out of a little-endian TIFF header", () => {
    // Minimal TIFF: header → IFD0 with an Exif pointer → Exif IFD with 0x9003.
    const buf = new ArrayBuffer(200);
    const dv = new DataView(buf), u8 = new Uint8Array(buf);
    u8[0] = 0x49; u8[1] = 0x49;            // "II" little-endian
    dv.setUint16(2, 42, true);
    dv.setUint32(4, 8, true);              // IFD0 at 8
    dv.setUint16(8, 1, true);              // one entry
    dv.setUint16(10, 0x8769, true);        // ExifIFD pointer
    dv.setUint16(12, 4, true);             // LONG
    dv.setUint32(14, 1, true);
    dv.setUint32(18, 30, true);            // → Exif IFD at 30
    dv.setUint16(30, 1, true);             // one entry
    dv.setUint16(32, 0x9003, true);        // DateTimeOriginal
    dv.setUint16(34, 2, true);             // ASCII
    dv.setUint32(36, 20, true);            // 20 chars
    dv.setUint32(40, 60, true);            // → value at 60
    const s = "2026:10:11 14:23:07\0";
    for (let i = 0; i < s.length; i++) u8[60 + i] = s.charCodeAt(i);

    expect(captureTimeFromBuffer(buf)).toBe(new Date(2026, 9, 11, 14, 23, 7).getTime());
  });

  it("returns null rather than throwing on junk", () => {
    expect(captureTimeFromBuffer(new ArrayBuffer(4))).toBeNull();
    expect(captureTimeFromBuffer(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17]).buffer)).toBeNull();
  });
});

describe("tokenFromQrText", () => {
  it("accepts our booking URLs and bare tokens, rejects anything else", () => {
    expect(tokenFromQrText("https://slate.sdubmedia.com/msb/abc123XYZ_")).toBe("abc123XYZ_");
    expect(tokenFromQrText("V1StGXR8Z5jdHi6B")).toBe("V1StGXR8Z5jdHi6B");
    expect(tokenFromQrText("https://example.com/promo")).toBeNull();
    expect(tokenFromQrText("")).toBeNull();
  });
});
