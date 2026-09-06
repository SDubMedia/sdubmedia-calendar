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
