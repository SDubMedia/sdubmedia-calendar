// ============================================================
// Canonical public origin for links that LEAVE the app — QR codes on printed
// flyers, links texted to a client, anything encoded into an image.
//
// Never use window.location.origin for these. It's whatever origin the browser
// happens to be on: http://localhost:3000 in dev, a random *.vercel.app on a
// preview deploy. A flyer printed from a preview build would carry a QR code
// pointing at a URL that stops existing — and /api/qr rightly refuses to
// encode a non-Slate link, which is how this surfaced.
//
// Same idea as WEB_ORIGIN in the iOS app: one hard-coded home for outbound
// links, overridable by env for a self-hosted deployment.
// ============================================================

const FALLBACK = "https://slate.sdubmedia.com";

/** The origin an outsider should be sent to. */
export function publicOrigin(): string {
  const configured = import.meta.env.VITE_PUBLIC_APP_URL as string | undefined;
  const origin = (configured || FALLBACK).trim().replace(/\/+$/, "");
  return origin || FALLBACK;
}

/** Absolute public URL for a path ("/minis/abc" → "https://…/minis/abc"). */
export function publicUrl(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${publicOrigin()}${p}`;
}

/** The hosted QR image for a public path. Encodes the canonical URL, so the
 *  code works wherever it's printed or scanned. */
export function qrImageUrl(path: string, size = 320): string {
  return `/api/qr?d=${encodeURIComponent(publicUrl(path))}&s=${size}`;
}
