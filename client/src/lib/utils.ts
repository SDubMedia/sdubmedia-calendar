import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Progressive phone formatting for an input field — adds dashes as you type.
 * "6619169468" → "661-916-9468". Caps at 10 digits (drops a leading US 1).
 */
export function formatPhoneInput(value: string): string {
  let d = value.replace(/\D/g, "");
  if (d.length === 11 && d[0] === "1") d = d.slice(1);
  d = d.slice(0, 10);
  if (d.length < 4) return d;
  if (d.length < 7) return `${d.slice(0, 3)}-${d.slice(3)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
}

/**
 * Build a maps link for an address, preferring the native app per platform:
 * Apple Maps on iPhone/iPad, Google Maps everywhere else. Both universal links
 * hand off to the installed app on mobile and open the web map on desktop.
 */
export function mapsUrlFor(query: string): string {
  const q = encodeURIComponent(query.trim());
  const isApple = typeof navigator !== "undefined" && /iPhone|iPad|iPod/i.test(navigator.userAgent);
  return isApple ? `https://maps.apple.com/?q=${q}` : `https://maps.google.com/?q=${q}`;
}

/**
 * Split a pasted full address into street / city / state / zip. Handles the
 * common US formats — "123 Main St, Nashville, TN 37201" and
 * "123 Main St, Nashville, TN, 37201". If there's no comma (just a street or a
 * place name) it returns everything as the street and leaves the rest blank, so
 * a bare paste never gets mangled.
 */
export function parsePastedAddress(raw: string): { address: string; city: string; state: string; zip: string } {
  const cleaned = raw.trim().replace(/\s+/g, " ").replace(/,\s*$/, "");
  const blank = { address: cleaned, city: "", state: "", zip: "" };
  if (!cleaned.includes(",")) return blank;

  let s = cleaned;
  let zip = "";
  let state = "";
  // ZIP (5 digits, optional +4) at the very end.
  const zipM = s.match(/[,\s](\d{5})(?:-\d{4})?$/);
  if (zipM) { zip = zipM[1]; s = s.slice(0, zipM.index).replace(/,\s*$/, "").trim(); }
  // Two-letter state at the end (must follow a comma or space).
  const stM = s.match(/[,\s]([A-Za-z]{2})$/);
  if (stM) { state = stM[1].toUpperCase(); s = s.slice(0, stM.index).replace(/,\s*$/, "").trim(); }
  // What's left is "street[, more], city".
  const parts = s.split(",").map((x) => x.trim()).filter(Boolean);
  if (parts.length >= 2) {
    return { address: parts.slice(0, -1).join(", "), city: parts[parts.length - 1], state, zip };
  }
  return { address: parts[0] || s, city: "", state, zip };
}

/** Format a stored phone for display (dashes). Leaves odd-length input as-is. */
export function formatPhoneDisplay(phone: string): string {
  const d = (phone || "").replace(/\D/g, "");
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  if (d.length === 11 && d[0] === "1") return `${d.slice(1, 4)}-${d.slice(4, 7)}-${d.slice(7)}`;
  return phone || "";
}
