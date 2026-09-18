// Shared QR helpers for the redirect and the daily summary. Kept free of
// request handling so the pieces are testable and reusable.

export interface QrContact {
  firstName?: string; lastName?: string; org?: string; title?: string;
  phone?: string; email?: string; website?: string;
  address?: string; city?: string; state?: string; zip?: string; note?: string;
}

function esc(v: string | undefined): string {
  return String(v || "").replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

/** vCard 3.0 — the format every phone's Contacts app accepts from a scan. */
export function buildVCard(c: QrContact): string {
  const fn = [c.firstName, c.lastName].filter(Boolean).join(" ").trim() || c.org || "Contact";
  const lines = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `N:${esc(c.lastName)};${esc(c.firstName)};;;`,
    `FN:${esc(fn)}`,
  ];
  if (c.org) lines.push(`ORG:${esc(c.org)}`);
  if (c.title) lines.push(`TITLE:${esc(c.title)}`);
  if (c.phone) lines.push(`TEL;TYPE=CELL,VOICE:${esc(c.phone)}`);
  if (c.email) lines.push(`EMAIL;TYPE=INTERNET:${esc(c.email)}`);
  if (c.website) lines.push(`URL:${esc(c.website)}`);
  if (c.address || c.city || c.state || c.zip) lines.push(`ADR;TYPE=WORK:;;${esc(c.address)};${esc(c.city)};${esc(c.state)};${esc(c.zip)};`);
  if (c.note) lines.push(`NOTE:${esc(c.note)}`);
  lines.push("END:VCARD");
  return lines.join("\r\n") + "\r\n";
}

/** Which link a scan should follow right now: the scheduled one once its time has come. */
export function effectiveTarget(row: { target_url: string; next_target_url?: string | null; switch_at?: string | null }, now: Date = new Date()): string {
  const next = (row.next_target_url || "").trim();
  if (next && row.switch_at && new Date(row.switch_at).getTime() <= now.getTime()) return next;
  return row.target_url;
}
