// ============================================================
// Ordering + section headers for the public gallery grid
// (DeliverGalleryPage). Pure so it can be tested without React.
//
// Files render in one flat masonry grid; the lightbox, arrow keys and the
// slideshow all address files by index, so the ORDER is the source of
// truth and headers are just labels dropped in front of certain indexes.
// ============================================================

export interface SectionFile {
  folderId?: string | null;
  mediaType?: "image" | "video";
}

export interface SectionFolder {
  id: string;
  position: number;
}

export interface SectionBoundary {
  index: number;
  label: string;
}

const mediaRank = (f: SectionFile) => (f.mediaType === "video" ? 0 : 1);

/** A folder id only counts if the gallery actually knows that folder —
 *  otherwise the file is treated as unfoldered, so ordering and headers
 *  can never disagree about which group a file belongs to. */
function effectiveFolderId(f: SectionFile, known: Map<string, number>): string | null {
  return f.folderId && known.has(f.folderId) ? f.folderId : null;
}

/** Unfoldered files first (a legacy gallery with no folders is entirely
 *  "unfoldered", so this looks identical to before folders existed), then
 *  named folders in the order they were created. Films first within each
 *  group, each group keeping the order the owner arranged. A stable sort by
 *  one key does exactly that — the relative order of two photos never
 *  changes, so drag-to-reorder still means something. */
export function sortGalleryFiles<T extends SectionFile>(files: T[], folders: SectionFolder[]): T[] {
  const folderPos = new Map(folders.map(f => [f.id, f.position]));
  const groupRank = (f: T) => {
    const fid = effectiveFolderId(f, folderPos);
    return fid ? folderPos.get(fid)! + 1 : 0;
  };
  return [...files].sort((a, b) => {
    const g = groupRank(a) - groupRank(b);
    return g !== 0 ? g : mediaRank(a) - mediaRank(b);
  });
}

/** Where headers go in an already-sorted list. A named-folder run always
 *  gets its name; within any run (a folder, or the leading unfoldered group)
 *  that mixes videos and photos, a secondary "Films"/"Photos" split appears
 *  too — exactly the old behavior when no folders exist at all, since the
 *  unfoldered run then IS the whole gallery. A photo-only or film-only
 *  gallery with no folders gets no headers, as it always has. */
export function gallerySectionBoundaries(
  files: SectionFile[],
  folders: { id: string; name: string; position: number }[],
): SectionBoundary[] {
  const known = new Map(folders.map(f => [f.id, f.position]));
  const boundaries: SectionBoundary[] = [];
  let i = 0;
  while (i < files.length) {
    const fid = effectiveFolderId(files[i], known);
    let j = i;
    while (j < files.length && effectiveFolderId(files[j], known) === fid) j++;
    const runVideoCount = files.slice(i, j).filter(f => f.mediaType === "video").length;
    const mixed = runVideoCount > 0 && runVideoCount < j - i;
    if (fid) {
      boundaries.push({ index: i, label: folders.find(fo => fo.id === fid)?.name || "Untitled folder" });
      if (mixed) boundaries.push({ index: i + runVideoCount, label: "Photos" });
    } else if (mixed) {
      boundaries.push({ index: i, label: runVideoCount === 1 ? "Film" : "Films" });
      boundaries.push({ index: i + runVideoCount, label: "Photos" });
    }
    i = j;
  }
  return boundaries;
}
