// Small formatting helpers for the public gallery's editorial copy.

const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty"];

/** "Fifteen" — spelled out up to twenty, digits beyond. */
export function countWord(n: number): string {
  const w = WORDS[n] || String(n);
  return w.charAt(0).toUpperCase() + w.slice(1);
}

/** 754 → "12:34". Empty for nothing. */
export function formatRuntime(s: number | null | undefined): string {
  if (!s) return "";
  const m = Math.floor(s / 60), r = Math.round(s % 60);
  return `${m}:${String(r).padStart(2, "0")}`;
}

export function formatBytes(b: number): string {
  if (b >= 1024 ** 3) return `${(b / 1024 ** 3).toFixed(1)} GB`;
  if (b >= 1024 ** 2) return `${Math.round(b / 1024 ** 2)} MB`;
  return `${Math.max(1, Math.round(b / 1024))} KB`;
}

export type GalleryTone = "personal" | "business";

/** Same rule as api/_galleryPresentation.ts defaultTone — a company name
 *  that is a different thing from the contact person is a business. */
export function defaultToneFor(company: string | null | undefined, contactName: string | null | undefined): GalleryTone {
  const co = (company || "").trim().toLowerCase();
  const contact = (contactName || "").trim().toLowerCase();
  return co && contact && co !== contact ? "business" : "personal";
}

const plural = (n: number, one: string, many: string) => `${countWord(n)} ${n === 1 ? one : many}.`;

/** "Fifteen photographs. Two films." — never a zero. Both zero: "Your gallery." */
export function galleryHeadline(photos: number, films: number): string {
  const parts: string[] = [];
  if (photos > 0) parts.push(plural(photos, "photograph", "photographs"));
  if (films > 0) parts.push(plural(films, "film", "films"));
  return parts.length ? parts.join(" ") : "Your gallery.";
}

/** "Every photograph. Every film." for the yours-to-keep section. */
export function keepHeadline(photos: number, films: number): string {
  const parts: string[] = [];
  if (photos > 0) parts.push("Every photograph.");
  if (films > 0) parts.push(films === 1 ? "The film." : "Every film.");
  return parts.length ? parts.join(" ") : "Everything.";
}

/** The studio's note when the owner hasn't written one. Written for a
 *  person or a business, and only mentions what the gallery actually holds. */
export function defaultGalleryNote(o: { photos: number; films: number; tone: GalleryTone }): string {
  const film = o.films === 1 ? "the film" : "the films";
  if (o.tone === "business") {
    const order = o.photos > 0 && o.films > 0 ? ` — ${film} first, then the photographs` : "";
    return `{{first_name}}, thank you for working with us. Everything here is finished and ready to use${order}.`;
  }
  const order = o.photos > 0 && o.films > 0 ? ` — ${film} first, then the photographs` : "";
  return `{{first_name}}, thank you for having us. Everything here is yours to keep${order}.`;
}

/** Resolve {{first_name}} and {{studio}} in a note. With no first name the
 *  token disappears cleanly — "{{first_name}}, thank you" becomes "Thank
 *  you" — rather than leaving a dangling comma or a literal token. */
export function applyGalleryNote(template: string, v: { firstName?: string; studio?: string }): string {
  const first = (v.firstName || "").trim();
  let out = template.replace(/\{\{studio\}\}/g, (v.studio || "").trim() || "us");
  if (first) {
    out = out.replace(/\{\{first_name\}\}/g, first);
  } else {
    out = out
      .replace(/\{\{first_name\}\},?\s*/g, "")
      .replace(/(^|\n)\s*([a-z])/g, (_m, br: string, c: string) => `${br}${c.toUpperCase()}`);
  }
  return out.replace(/[ \t]+\n/g, "\n").trim();
}
