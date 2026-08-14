// Renaming a delivered file.
//
// The stored name is what the client sees in the gallery AND the filename they
// end up with on disk — it is used for the Content-Disposition header, for zip
// entries, and for single-file downloads. So a rename has to survive being put
// in an HTTP header and a zip, and it must not lose the extension: a wedding
// film saved as "Gracie and Elijah" with no .mov will not open by
// double-clicking on most machines.
//
// The stored R2 key is deliberately NOT touched by any of this. Renaming an
// object in S3 means copy-then-delete, which for a 2.7GB film is minutes of
// transfer and a window where the file exists twice or not at all, all to
// change a label nobody sees.

/** The extension including the dot ("" when there isn't one). */
export function extensionOf(name: string): string {
  const m = name.match(/\.[^./\\]+$/);
  return m ? m[0] : "";
}

/** The name without its extension — what a rename box should start out showing. */
export function baseNameOf(name: string): string {
  const ext = extensionOf(name);
  return ext ? name.slice(0, -ext.length) : name;
}

/**
 * Work out what to store when someone renames `currentName` to `input`.
 *
 * Returns null when the input isn't a usable name, so the caller can keep the
 * old one rather than saving something that breaks a download.
 */
export function renameFile(currentName: string, input: string): string | null {
  // Strip characters that would break the Content-Disposition header or let a
  // name climb out of a zip folder. Done here rather than only at the server
  // so what is stored is what is served.
  // eslint-disable-next-line no-control-regex -- deliberately matching control chars
  const cleaned = input.replace(/["\\/\u0000-\u001f\u007f]/g, "").trim();
  if (!cleaned) return null;

  // A name that is nothing but dots would leave the file effectively unnamed.
  if (/^\.+$/.test(cleaned)) return null;

  const ext = extensionOf(currentName);
  if (!ext) return cleaned.slice(0, 200);

  // Keep the original extension unless they typed it themselves.
  const hasExt = cleaned.toLowerCase().endsWith(ext.toLowerCase());
  const withExt = hasExt ? cleaned : `${cleaned}${ext}`;

  // Cap the length: some filesystems stop at 255 bytes, and a multi-byte name
  // hits that sooner than its character count suggests.
  if (withExt.length <= 200) return withExt;
  return `${baseNameOf(withExt).slice(0, 200 - ext.length)}${ext}`;
}
