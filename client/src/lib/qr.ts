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

/**
 * Readable code slugs: what Geoff types ("Front Window!") becomes something
 * that survives a URL ("front-window"). Letters, digits, dashes; 3–40 chars.
 */
export function normalizeCode(input: string): string {
  return (input || "").toLowerCase().trim().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
}

export function isValidCode(code: string): boolean {
  return /^[A-Za-z0-9_-]{3,40}$/.test(code);
}

/** The exact link a scan lands on, tags included, for the preview text. */
export function taggedTarget(target: string, name: string, code: string, utmEnabled: boolean): string {
  if (!utmEnabled) return target;
  try {
    const u = new URL(target);
    if ([...u.searchParams.keys()].some(k => k.startsWith("utm_"))) return target;
    u.searchParams.set("utm_source", "qr");
    u.searchParams.set("utm_medium", "print");
    u.searchParams.set("utm_campaign", normalizeCode(name) || code);
    u.searchParams.set("utm_content", code);
    return u.toString();
  } catch {
    return target;
  }
}

/** Scans per day for the last `days` days (oldest first), from ISO timestamps. */
export function scansPerDay(scannedAt: string[], days: number, now: Date = new Date()): number[] {
  const out = new Array<number>(days).fill(0);
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const ms = 86_400_000;
  for (const iso of scannedAt) {
    const t = new Date(iso).getTime();
    if (Number.isNaN(t)) continue;
    const back = Math.floor((dayStart + ms - t) / ms);   // 0 = today
    if (back >= 0 && back < days) out[days - 1 - back]++;
  }
  return out;
}

export function countSince(scannedAt: string[], days: number, now: Date = new Date()): number {
  const cutoff = now.getTime() - days * 86_400_000;
  return scannedAt.reduce((n, iso) => n + (new Date(iso).getTime() >= cutoff ? 1 : 0), 0);
}

export interface QrContact {
  firstName: string; lastName: string; org: string; title: string;
  phone: string; email: string; website: string;
  address: string; city: string; state: string; zip: string; note: string;
}

export const emptyContact: QrContact = { firstName: "", lastName: "", org: "", title: "", phone: "", email: "", website: "", address: "", city: "", state: "", zip: "", note: "" };

export function contactDisplayName(c: Partial<QrContact> | null | undefined): string {
  if (!c) return "Contact card";
  return [c.firstName, c.lastName].filter(Boolean).join(" ").trim() || c.org || "Contact card";
}

/** Which link a scan follows right now: the scheduled one once its time has come. */
export function effectiveTarget(c: { targetUrl: string; nextTargetUrl: string; switchAt: string | null }, now: Date = new Date()): string {
  if (c.nextTargetUrl && c.switchAt && new Date(c.switchAt).getTime() <= now.getTime()) return c.nextTargetUrl;
  return c.targetUrl;
}

/** "2026-09-18T14:30" for a datetime-local input, in the viewer's own time zone. */
export function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
