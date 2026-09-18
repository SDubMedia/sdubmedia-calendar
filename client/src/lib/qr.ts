// ============================================================
// QR code helpers — pure, tested in __tests__/qr.test.ts.
// ============================================================

/** Public path a printed QR encodes. Permanent for the life of the code. */
export function qrPath(code: string): string {
  return `/q/${code}`;
}

/**
 * Turn what Geoff types into a link a browser can open. Accepts bare domains
 * ("sdubmedia.com/weddings" → "https://sdubmedia.com/weddings"). Returns null
 * for anything that isn't a web address, so a typo never gets printed.
 */
export function normalizeTargetUrl(input: string): string | null {
  const raw = (input || "").trim();
  if (!raw) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  try {
    const u = new URL(withScheme);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    if (!u.hostname.includes(".") && u.hostname !== "localhost") return null;
    return u.toString();
  } catch {
    return null;
  }
}

/** Short, readable label for a destination: host plus path, no scheme. */
export function displayUrl(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname === "/" ? "" : u.pathname;
    return `${u.hostname}${path}${u.search}`;
  } catch {
    return url;
  }
}
