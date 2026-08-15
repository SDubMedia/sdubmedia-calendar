// The delivery email: default wording, merge fields, and filling them in.
//
// Shared by the composer (which shows it before sending), Settings (which
// edits the default) and — mirrored, see below — the API that sends it. It has
// to be one implementation or the preview stops matching what the client gets,
// which is the entire point of having a preview.
//
// Kept free of React, network and env access so it can be unit-tested. The
// send path in api/notify-gallery-ready.ts applies the same rules; they are
// duplicated deliberately, matching how the rest of api/ stays self-contained
// — change both together.

export interface GalleryContents {
  photoCount: number;
  videoCount: number;
}

export interface MergeValues {
  firstName: string;
  galleryTitle: string;
  galleryUrl: string;
  contents: GalleryContents;
}

/**
 * What to call what's in the gallery: "photos", "video", "photos and video".
 *
 * Singular and plural track the two counts separately — "Your video is ready"
 * is wrong for three films and "Your videos are ready" is wrong for one.
 */
export function contentsNoun({ photoCount, videoCount }: GalleryContents): string {
  if (photoCount === 0 && videoCount === 0) return "files";
  const videoWord = videoCount === 1 ? "video" : "videos";
  const photoWord = photoCount === 1 ? "photo" : "photos";
  if (videoCount && photoCount) return `${photoWord} and ${videoWord}`;
  return videoCount ? videoWord : photoWord;
}

/** "is" or "are", agreeing with contentsNoun(). */
export function contentsVerb(c: GalleryContents): string {
  const noun = contentsNoun(c);
  return noun.includes(" and ") || noun.endsWith("s") ? "are" : "is";
}

/** The wording used when an org hasn't written its own. */
export function defaultSubject(c: GalleryContents): string {
  return `Your ${contentsNoun(c)} ${contentsVerb(c)} ready — {{gallery_title}}`;
}

export function defaultBody(c: GalleryContents): string {
  return [
    "Hi {{first_name}},",
    "",
    `The ${contentsNoun(c)} for {{gallery_title}} ${contentsVerb(c)} ready to view and download.`,
  ].join("\n");
}

/** Fields available in the composer and in the Settings default. */
export const MERGE_FIELDS = [
  { token: "{{first_name}}", label: "Client's first name" },
  { token: "{{gallery_title}}", label: "Gallery title" },
  { token: "{{contents}}", label: "photos / video / photos and video" },
  { token: "{{gallery_link}}", label: "Link to the gallery" },
] as const;

/**
 * Substitute the merge fields.
 *
 * Unknown {{tokens}} are left exactly as typed rather than blanked: a typo
 * showing up as "{{frist_name}}" in the preview is obvious, whereas silently
 * emptying it produces "Hi ," in a client's inbox and nobody notices until
 * it's sent.
 */
export function applyMerge(text: string, v: MergeValues): string {
  return text
    .replace(/\{\{first_name\}\}/g, v.firstName)
    .replace(/\{\{gallery_title\}\}/g, v.galleryTitle)
    .replace(/\{\{contents\}\}/g, contentsNoun(v.contents))
    .replace(/\{\{gallery_link\}\}/g, v.galleryUrl);
}
