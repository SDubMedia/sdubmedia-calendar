// ============================================================
// One address format for the whole app.
//
// Before this there were five hand-rolled variants — `a, city, state zip`,
// `[a, city, state, zip].join(", ")`, `city, state zip`, a `joinAddr` closure
// buried in AppContext, and a `·`-separated one in the mini-session form. Same
// venue, different string, depending on which screen you happened to be on.
//
// The shape is: venue name · street · city, state · zip
//
//   Harlinsdale Farm · 239 Franklin Rd · Franklin, TN · 37064
//
// Every part is optional and empties collapse, so a venue with no street or a
// street with no venue still reads correctly and never leaves a dangling
// separator or a stray comma.
//
// STANDARD: anything in Slate that captures a place uses these parts and this
// composer — never a single free-text "where" box. See CLAUDE.md.
// ============================================================
//
// MIRROR of client/src/lib/address.ts — keep the two in step. The client bundle
// and the serverless functions have no shared module graph.

export interface AddressParts {
  /** The venue's name — "Harlinsdale Farm", "The Factory". Optional. */
  locationName?: string | null;
  /** Street line — "239 Franklin Rd". */
  address?: string | null;
  city?: string | null;
  /** Two-letter abbreviation by convention, but not enforced. */
  state?: string | null;
  zip?: string | null;
}

const clean = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/**
 * The canonical one-line address. This is what gets stored in `location_text`
 * and read by every downstream surface (sign-up pages, emails, reminders, the
 * calendar feed), so those surfaces never have to know the shape.
 */
export function composeAddress(parts: AddressParts): string {
  const city = clean(parts.city);
  const state = clean(parts.state);
  return [
    clean(parts.locationName),
    clean(parts.address),
    // City and state belong together — "Franklin, TN" — and either alone is
    // still valid, which is why this inner join is separate.
    [city, state].filter(Boolean).join(", "),
    clean(parts.zip),
  ].filter(Boolean).join(" · ");
}

/**
 * The same address as separate display lines, for cards and emails where the
 * one-liner would wrap badly on a phone.
 */
export function addressLines(parts: AddressParts): string[] {
  const city = clean(parts.city);
  const state = clean(parts.state);
  const zip = clean(parts.zip);
  return [
    clean(parts.locationName),
    clean(parts.address),
    [[city, state].filter(Boolean).join(", "), zip].filter(Boolean).join(" "),
  ].filter(Boolean);
}

/**
 * What to hand a maps app. Deliberately NOT the `·` form — map search wants
 * commas, and a venue name alone geocodes badly, so the street leads whenever
 * we have one.
 */
export function mapsQueryFor(parts: AddressParts): string {
  const street = clean(parts.address);
  const city = clean(parts.city);
  const state = clean(parts.state);
  const zip = clean(parts.zip);
  const name = clean(parts.locationName);
  const tail = [street, city, [state, zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  // Venue name only helps when there's nothing better to search on.
  return tail || name;
}

/** True when there's nothing worth showing. */
export function hasAddress(parts: AddressParts): boolean {
  return composeAddress(parts).length > 0;
}
