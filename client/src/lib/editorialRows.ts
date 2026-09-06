// ============================================================
// The editorial photo rhythm for the public gallery (Apple-keynote look,
// Geoff 2026-09-06): instead of a uniform grid, photos flow in a sequence
// of statement images, pairs and trios. ORDER IS NEVER CHANGED — the
// owner arranged it — only how consecutive photos are grouped. Folders
// become chapters: a run of photos in one folder is laid out on its own
// under the folder's name. Pure so it can be tested.
// ============================================================

export interface RhythmFile {
  id: string;
  width: number | null;
  height: number | null;
  folderId?: string | null;
}

export type RowKind = "statement" | "portrait" | "two" | "three" | "wide";

export interface Row<T> {
  kind: RowKind;
  items: T[];
}

export interface Chapter<T> {
  folderId: string | null;
  name: string | null;
  rows: Row<T>[];
}

const isPortrait = (f: RhythmFile) => (f.height ?? 0) > (f.width ?? 0);
const isLandscape = (f: RhythmFile) => !isPortrait(f);

/** Group one ordered run of photos into rows.
 *  - two portraits side by side
 *  - a landscape with a portrait beside it (2:1)
 *  - three landscapes in a strip
 *  - two landscapes side by side
 *  - a lone landscape as a full-width statement; a lone portrait centred
 *  The very first landscape of a run always leads as a statement. */
export function buildRows<T extends RhythmFile>(files: T[]): Row<T>[] {
  const rows: Row<T>[] = [];
  let i = 0;
  const at = (n: number): T | undefined => files[n];
  while (i < files.length) {
    const a = files[i], b = at(i + 1), c = at(i + 2);
    if (i === 0 && isLandscape(a)) { rows.push({ kind: "statement", items: [a] }); i += 1; continue; }
    if (isPortrait(a) && b && isPortrait(b)) { rows.push({ kind: "two", items: [a, b] }); i += 2; continue; }
    if (isLandscape(a) && b && isPortrait(b)) { rows.push({ kind: "wide", items: [a, b] }); i += 2; continue; }
    if (isLandscape(a) && b && isLandscape(b) && c && isLandscape(c)) { rows.push({ kind: "three", items: [a, b, c] }); i += 3; continue; }
    if (isLandscape(a) && b && isLandscape(b)) { rows.push({ kind: "two", items: [a, b] }); i += 2; continue; }
    rows.push({ kind: isPortrait(a) ? "portrait" : "statement", items: [a] });
    i += 1;
  }
  return rows;
}

/** Split an ordered photo list into chapters by consecutive folder, then
 *  rows within each. Files whose folder the gallery doesn't know are treated
 *  as unfoldered (same rule as gallerySections.ts). */
export function buildChapters<T extends RhythmFile>(
  files: T[],
  folders: { id: string; name: string }[],
): Chapter<T>[] {
  const known = new Map(folders.map(f => [f.id, f.name]));
  const chapters: Chapter<T>[] = [];
  let i = 0;
  while (i < files.length) {
    const fid = files[i].folderId && known.has(files[i].folderId as string) ? (files[i].folderId as string) : null;
    let j = i;
    while (j < files.length) {
      const g = files[j].folderId && known.has(files[j].folderId as string) ? (files[j].folderId as string) : null;
      if (g !== fid) break;
      j++;
    }
    chapters.push({ folderId: fid, name: fid ? known.get(fid) ?? null : null, rows: buildRows(files.slice(i, j)) });
    i = j;
  }
  return chapters;
}
