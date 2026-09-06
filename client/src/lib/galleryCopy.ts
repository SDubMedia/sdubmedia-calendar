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

/** The studio's note when the owner hasn't written one. */
export function defaultGalleryNote(hasFilms: boolean): string {
  return `{{first_name}}, thank you for having us. Everything here is yours to keep${hasFilms ? " — the film first, then the photographs" : ""}, in the order we made them.`;
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
