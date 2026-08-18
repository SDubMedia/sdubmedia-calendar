// Public gallery page at /deliver/:token. No auth — token is the gate.
//
// States visible to the client:
//   draft (server returns this only if you sneak in early — UI shows "not ready")
//   sent       — browse + favorite + submit
//   submitted  — locked picks visible, "Request a change" link
//   working    — locked picks visible, "Pay for extras" if pricing exists
//   delivered  — galleries archive view
//
// Proofing UX:
//   - Sticky bar shows "X / N selected · Y extra ($Z)"
//   - Hearts toggle inline; counter updates live
//   - Submit collects name+email, then either saves (within free limit)
//     or routes to Stripe Connect Checkout for the overage
//   - JSZip via CDN handles "Download all" — no server-side ZIP

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useRoute } from "wouter";
import { toast } from "sonner";

interface FileItem {
  id: string;
  originalName: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  mimeType: string;
  position: number;
  url: string;
  // Attachment-forced link (Content-Disposition) that streams straight to disk.
  // Used for videos, which are too large to pull into memory like photos.
  downloadUrl?: string;
  /** A choosing sheet, not a deliverable. Set by the server, which also
   *  withholds downloadUrl for these — the flag only stops the page offering
   *  a button that couldn't work. */
  isProof?: boolean;
  // Server returns these for video files (otherwise "image" / "" / null).
  mediaType?: "image" | "video";
  durationSeconds?: number | null;
  thumbnailUrl?: string;
}

/** A full-width divider inside the masonry grid.
 *
 *  Spans every column so it reads as a section break. Kept as a row IN the
 *  grid rather than splitting the page into two grids: one grid means one
 *  watermark layer, one column measurement, and — the part that matters — the
 *  lightbox keeps addressing files by their position in a single array, so
 *  arrow keys and the slideshow still move to the tile you can see next.
 *
 *  `span 11` is 11*4px of rows plus 10*1px of gaps = 54px. */
/** Full-screen viewer.
 *
 *  Rebuilt from a plain overlay. What it fixes, in the order clients notice:
 *   - tapping the photo used to CLOSE it, because click-to-close covered the
 *     image; the instinct to tap a photo to look closer threw you out
 *   - swipe on a phone, instead of aiming at small arrow glyphs
 *   - the neighbouring photos are preloaded, so arrowing through a 4K set
 *     doesn't sit on black with no spinner
 *   - download from here, rather than closing and hunting for the tile
 *   - "12 of 84" and the filename, so a long set has a sense of place
 *   - pinch or double-tap to zoom, then drag to pan
 */
function Lightbox({
  file, index, total, prevUrl, nextUrl, slideshowPlaying, canPick, isPicked,
  onPick, onToggleSlideshow, onDownload, canDownload, onPrev, onNext, onClose,
}: {
  file: FileItem;
  index: number;
  total: number;
  prevUrl?: string;
  nextUrl?: string;
  slideshowPlaying: boolean;
  canPick: boolean;
  isPicked: boolean;
  onPick: () => void;
  onToggleSlideshow: () => void;
  onDownload: () => void;
  canDownload: boolean;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
}) {
  const isVideo = file.mediaType === "video";
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [loaded, setLoaded] = useState(false);
  // Whether a finger is down, in state rather than read off the ref during
  // render — reading a ref while rendering breaks React's purity rules and is
  // banned in this codebase. Drives whether the transform animates: a
  // transition during a pinch makes it feel like it's lagging behind you.
  const [gesturing, setGesturing] = useState(false);
  // Live pointers, for telling a pinch from a drag.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ startDist: number; startZoom: number; startX: number; startY: number; panX: number; panY: number } | null>(null);

  // Reset per photo: carrying a 2.5x zoom onto the next image is disorienting.
  useEffect(() => { setZoom(1); setPan({ x: 0, y: 0 }); setLoaded(false); }, [file.id]);

  // Preload the neighbours so arrowing through feels instant.
  useEffect(() => {
    [prevUrl, nextUrl].filter(Boolean).forEach(u => { const img = new Image(); img.src = u as string; });
  }, [prevUrl, nextUrl]);

  const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

  const onPointerDown = (e: React.PointerEvent) => {
    setGesturing(true);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointers.current.values()];
    if (pts.length === 2) {
      gesture.current = { startDist: dist(pts[0], pts[1]), startZoom: zoom, startX: 0, startY: 0, panX: pan.x, panY: pan.y };
    } else if (pts.length === 1) {
      gesture.current = { startDist: 0, startZoom: zoom, startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y };
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointers.current.values()];
    const g = gesture.current;
    if (!g) return;
    if (pts.length === 2 && g.startDist > 0) {
      const next = Math.max(1, Math.min(4, g.startZoom * (dist(pts[0], pts[1]) / g.startDist)));
      setZoom(next);
      if (next === 1) setPan({ x: 0, y: 0 });
    } else if (pts.length === 1 && zoom > 1) {
      // Zoomed in, so a drag pans rather than changing photo.
      setPan({ x: g.panX + (e.clientX - g.startX), y: g.panY + (e.clientY - g.startY) });
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const g = gesture.current;
    const wasSingle = pointers.current.size === 1;
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 0) setGesturing(false);
    if (!g || !wasSingle) { if (pointers.current.size === 0) gesture.current = null; return; }
    gesture.current = null;

    // Only a single-finger gesture at 1x navigates.
    if (zoom > 1) return;
    const dx = e.clientX - g.startX;
    const dy = e.clientY - g.startY;
    const SWIPE = 50;
    if (Math.abs(dx) > SWIPE && Math.abs(dx) > Math.abs(dy)) {
      if (dx < 0) onNext(); else onPrev();
    } else if (dy > 90 && Math.abs(dy) > Math.abs(dx)) {
      onClose(); // flick down to dismiss, like a phone photo viewer
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/95 z-40 flex items-center justify-center select-none"
      onClick={onClose}
      style={{ touchAction: "none" }}
    >
      {/* The media itself never closes the viewer — that was the old bug. */}
      <div
        className="relative max-w-full max-h-full flex items-center justify-center"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={() => { setZoom(z => (z > 1 ? 1 : 2.5)); setPan({ x: 0, y: 0 }); }}
      >
        {isVideo ? (
          <video src={file.url} controls autoPlay playsInline className="max-w-[100vw] max-h-[100vh]" />
        ) : (
          <>
            {!loaded && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-white/25 border-t-white/80 rounded-full animate-spin" />
              </div>
            )}
            <img
              src={file.url}
              alt={file.originalName}
              onLoad={() => setLoaded(true)}
              draggable={false}
              className="max-w-[100vw] max-h-[100vh] object-contain"
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                transition: gesturing ? "none" : "transform 160ms ease-out",
                cursor: zoom > 1 ? "grab" : "zoom-in",
                opacity: loaded ? 1 : 0,
              }}
            />
          </>
        )}
      </div>

      {/* Top bar */}
      <div className="absolute top-0 inset-x-0 flex items-center justify-between p-4 text-white/80" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={onToggleSlideshow}
          className="text-xs uppercase tracking-widest hover:text-white px-2 py-2"
          aria-label={slideshowPlaying ? "Pause slideshow" : "Play slideshow"}
        >{slideshowPlaying ? "❚❚ Pause" : "▶ Slideshow"}</button>

        <div className="text-center min-w-0 px-2">
          <p className="text-[11px] tracking-wider">{index + 1} of {total}</p>
          <p className="text-[11px] text-white/50 truncate max-w-[50vw]">{file.originalName.replace(/\.[^.]+$/, "")}</p>
        </div>

        <div className="flex items-center gap-1">
          {canDownload && (
            <button onClick={onDownload} className="p-2 hover:text-white" aria-label="Download this one" title="Download">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            </button>
          )}
          <button onClick={onClose} className="p-2 text-3xl leading-none hover:text-white" aria-label="Close">×</button>
        </div>
      </div>

      {/* Arrows stay for mouse and keyboard; swipe covers touch. */}
      {index > 0 && (
        <button
          onClick={(e) => { e.stopPropagation(); onPrev(); }}
          className="absolute left-2 top-1/2 -translate-y-1/2 text-white/60 hover:text-white text-4xl px-4 py-6"
          aria-label="Previous"
        >‹</button>
      )}
      {index < total - 1 && (
        <button
          onClick={(e) => { e.stopPropagation(); onNext(); }}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-white/60 hover:text-white text-4xl px-4 py-6"
          aria-label="Next"
        >›</button>
      )}

      {canPick && (
        <button
          onClick={(e) => { e.stopPropagation(); onPick(); }}
          className={`absolute bottom-8 left-1/2 -translate-x-1/2 px-6 py-3 rounded-full font-semibold ${isPicked ? "bg-red-500 text-white" : "bg-white text-black"}`}
        >{isPicked ? "♥ Picked" : "♡ Pick this one"}</button>
      )}
    </div>
  );
}

function GallerySectionHead({ label, fontFamily }: { label: string; fontFamily?: string }) {
  return (
    <div
      // span 15 at 4px rows + 14 gaps of 4px = 116px. Deliberately generous:
      // the old 44px let sections run into each other, so the page read as one
      // long strip rather than a film section and a photo section.
      style={{ gridColumn: "1 / -1", gridRow: "span 15" }}
      className="flex items-end justify-center bg-white pb-5 pt-12"
    >
      {/* Set in the cover's typeface so the page reads as one piece — these
          labels were in the UI sans while the hero was Cormorant. */}
      <span
        className="text-[13px] uppercase tracking-[0.3em] text-slate-500"
        style={{ fontFamily }}
      >{label}</span>
    </div>
  );
}

/** Films first, then photos, each group keeping the order the owner arranged.
 *  A stable sort by one key does exactly that — the relative order of two
 *  photos never changes, so drag-to-reorder still means something. */
function sortFilmsFirst(files: FileItem[]): FileItem[] {
  return [...files].sort((a, b) => rank(a) - rank(b));
}
const rank = (f: FileItem) => (f.mediaType === "video" ? 0 : 1);

/** Row height and gap of the masonry grid, in px. gridAutoRows and gap-px in
 *  the grid below must match these — the tile heights are computed from them. */
const GRID_ROW = 4;
const GRID_GAP = 4; // px, matches gap-1 on the grid

/** How much of the grid's width a film takes. Full-bleed was too dominant for
 *  a single wedding film; 35% reads as a feature without eating the page. */
const FILM_WIDTH = 0.35;
/** Ceiling in px, so a wide monitor does not inflate the film. */
const FILM_MAX_PX = 400;

/** The signed-in Slate token, if this browser happens to have one.
 *
 *  Read straight from storage rather than importing the auth context: this
 *  page renders OUTSIDE AuthProvider (it's public, see App.tsx), so there is
 *  no context to ask. Returns "" for a normal client visitor. */
async function sessionTokenIfAny(): Promise<string> {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      // supabase-js stores its session under sb-<project-ref>-auth-token.
      if (!k || !k.startsWith("sb-") || !k.endsWith("-auth-token")) continue;
      const raw = localStorage.getItem(k);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      const t = parsed?.access_token || parsed?.currentSession?.access_token || "";
      if (typeof t === "string" && t) return t;
    }
  } catch { /* a visitor with storage blocked is simply anonymous */ }
  return "";
}

interface DeliveryInfo {
  id: string;
  title: string;
  coverFileId: string | null;
  coverUrl?: string;
  coverFocal?: string;
  coverFocalX?: number;
  coverFocalY?: number;
  coverWidth?: number;
  coverHeight?: number;
  coverLayout: "center" | "vintage" | "minimal" | "left" | "stripe" | "frame" | "divider" | "stamp";
  coverFont?: string;
  coverSubtitle: string | null;
  coverDate: string | null;
  watermarkText: string | null;
  watermarkUseLogo?: boolean;
  printsEnabled: boolean;
  status: "draft" | "sent" | "submitted" | "working" | "delivered";
  selectionLimit: number;
  downloadOnly?: boolean;
  perExtraPhotoCents: number;
  buyAllFlatCents: number;
  submittedAt: string | null;
  clientName: string | null;
  clientEmail: string | null;
}

interface OrgInfo {
  name: string;
  logoUrl: string;
  businessInfo: Record<string, unknown> | null;
}

interface SelectionRecord { fileId: string; isPaid: boolean }

interface CheckoutOptions {
  perPhoto?: { extras: number; unitCents: number; totalCents: number };
  flat?: { totalCents: number };
}

declare global {
  interface Window { JSZip?: unknown }
}

function money(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export default function DeliverGalleryPage() {
  // Same component handles /deliver/:token (random secret link) and /g/:token (vanity slug).
  // The :token param is used as a generic identifier — backend resolves token-or-slug.
  const [, deliverParams] = useRoute("/deliver/:token");
  const [, gParams] = useRoute("/g/:token");
  const token = deliverParams?.token || gParams?.token || "";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [delivery, setDelivery] = useState<DeliveryInfo | null>(null);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [serverSelections, setServerSelections] = useState<SelectionRecord[]>([]);
  const [org, setOrg] = useState<OrgInfo | null>(null);

  // Local proofing state — what the client has hearted but not yet submitted
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const [slideshowPlaying, setSlideshowPlaying] = useState(false);

  // Auto-advance lightbox when slideshow is on. ~4s per photo, loops at end.
  useEffect(() => {
    if (lightboxIdx === null || !slideshowPlaying) return;
    const t = setTimeout(() => {
      setLightboxIdx((i) => {
        if (i === null) return null;
        return i + 1 >= files.length ? 0 : i + 1;
      });
    }, 4000);
    return () => clearTimeout(t);
  }, [lightboxIdx, slideshowPlaying, files.length]);

  // Keyboard nav inside lightbox: arrows + escape + space-to-toggle-slideshow
  useEffect(() => {
    if (lightboxIdx === null) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { setLightboxIdx(null); setSlideshowPlaying(false); }
      else if (e.key === "ArrowRight") setLightboxIdx((i) => (i === null ? null : Math.min(files.length - 1, i + 1)));
      else if (e.key === "ArrowLeft") setLightboxIdx((i) => (i === null ? null : Math.max(0, i - 1)));
      else if (e.key === " ") { e.preventDefault(); setSlideshowPlaying(p => !p); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightboxIdx, files.length]);

  // Password gate
  const [passwordRequired, setPasswordRequired] = useState(false);
  const [password, setPassword] = useState("");
  const [pwError, setPwError] = useState("");

  // Email-registration gate (visitor must enter email before viewing)
  const [emailRequired, setEmailRequired] = useState(false);
  const [visitorEmail, setVisitorEmail] = useState(() =>
    typeof window !== "undefined" ? (localStorage.getItem(`gallery-email-${token}`) || "") : ""
  );
  const [registering, setRegistering] = useState(false);

  // First-visit walkthrough — shown once per token via localStorage. Triggered
  // after the gallery loads (not before, to avoid blocking gates).
  const [walkthroughStep, setWalkthroughStep] = useState<number | null>(null);
  useEffect(() => {
    if (!delivery || typeof window === "undefined") return;
    // Download-only galleries (real-estate) skip the favorites/proofing
    // walkthrough — there's nothing to select.
    if (delivery.downloadOnly || (delivery.selectionLimit ?? 0) === 0) return;
    if (localStorage.getItem(`gallery-walkthrough-${token}`) === "done") return;
    // Show welcome card after a short delay so the hero animates in first.
    const t = setTimeout(() => setWalkthroughStep(0), 800);
    return () => clearTimeout(t);
  }, [delivery, token]);

  function dismissWalkthrough() {
    setWalkthroughStep(null);
    if (typeof window !== "undefined") localStorage.setItem(`gallery-walkthrough-${token}`, "done");
  }

  // Submission UI
  const [submitOpen, setSubmitOpen] = useState(false);
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [checkoutOptions, setCheckoutOptions] = useState<CheckoutOptions | null>(null);
  const [zipping, setZipping] = useState(false);

  // Print request modal — file id + collected fields
  const [printFor, setPrintFor] = useState<FileItem | null>(null);
  const [printSize, setPrintSize] = useState("8x10");
  const [printQty, setPrintQty] = useState(1);
  const [printName, setPrintName] = useState("");
  const [printEmail, setPrintEmail] = useState("");
  const [printNote, setPrintNote] = useState("");
  const [printSubmitting, setPrintSubmitting] = useState(false);

  async function submitPrintRequest() {
    if (!printFor) return;
    if (!printName.trim() || !printEmail.trim()) {
      toast.error("Name and email required");
      return;
    }
    setPrintSubmitting(true);
    try {
      const res = await fetch(`/api/delivery-public?action=request-prints`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          fileId: printFor.id,
          size: printSize,
          quantity: printQty,
          clientName: printName.trim(),
          clientEmail: printEmail.trim(),
          note: printNote.trim(),
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed");
      }
      toast.success("Print request sent", { description: "We'll be in touch with pricing." });
      setPrintFor(null);
      setPrintNote("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setPrintSubmitting(false);
    }
  }

  async function loadGallery(pwToTry?: string, emailToTry?: string, opts?: { quiet?: boolean }) {
    // A background refresh must not flip `loading` — that unmounts the gallery
    // and throws away scroll position and any selection in progress.
    if (!opts?.quiet) { setLoading(true); setError(null); }
    try {
      // Bundle whatever credentials we have — password (if pwToTry given) or
      // remembered email (from localStorage) — into a single POST so the
      // server can decide which gate(s) to apply.
      const emailForCall = emailToTry !== undefined ? emailToTry : visitorEmail;

      // If whoever is looking happens to be signed in to Slate in this browser,
      // hand the server their token. This page is public and on the same
      // domain as the app, so the owner previewing their own gallery is
      // indistinguishable from a client — which is why the view counter has
      // been counting Geoff. The server decides: a member of the gallery's own
      // org doesn't count as a view. Anonymous visitors send nothing and are
      // unaffected.
      const viewerToken = await sessionTokenIfAny();
      const authHeader: Record<string, string> = viewerToken ? { Authorization: `Bearer ${viewerToken}` } : {};

      const res = pwToTry !== undefined || emailForCall
        ? await fetch(`/api/delivery-public?action=verify-password`, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...authHeader },
            body: JSON.stringify({ token, password: pwToTry, email: emailForCall || undefined }),
          })
        : await fetch(`/api/delivery-public?action=get&token=${encodeURIComponent(token)}`, {
            headers: authHeader,
          });
      const data = await res.json();
      if (!res.ok && !data.passwordRequired && !data.emailRequired) {
        setError(data.error || "Failed to load gallery");
        return;
      }
      if (data.passwordRequired) {
        setPasswordRequired(true);
        if (pwToTry !== undefined) setPwError(data.error || "Incorrect password");
        return;
      }
      if (data.emailRequired) {
        setEmailRequired(true);
        return;
      }
      setPasswordRequired(false);
      setEmailRequired(false);
      setDelivery(data.delivery);
      // Films first, then photos, each keeping the order the owner arranged.
      //
      // Sorted HERE rather than only when rendering, so the array the grid
      // draws is the array everything else indexes into: the lightbox, its
      // arrow keys and the slideshow all address files by position, and
      // splitting them at render time alone would make "next" jump somewhere
      // that isn't the next tile on screen.
      setFiles(sortFilmsFirst(data.files || []));
      loadedAtRef.current = Date.now();
      setServerSelections(data.selections || []);
      setOrg(data.org);
      // Pre-populate local picks from server (client returning to view their picks)
      const submitted = (data.selections || []).map((s: SelectionRecord) => s.fileId);
      if (submitted.length > 0 && data.delivery.status !== "sent") {
        setPicked(new Set(submitted));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (token) loadGallery();
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the signed URLs fresh.
  //
  // Every image and download link is signed for one hour. Nothing refreshed
  // them, so a gallery left open longer than that turned every photo into its
  // filename and every download into a 403 — a client browsing over lunch
  // watched the page fall apart, with no clue that reloading would fix it.
  //
  // Re-fetches quietly in the background at 45 minutes, and again whenever the
  // tab is brought back to the front after that long away (a laptop that slept
  // for three hours fires no timers). loadGallery() sets `loading`, which
  // would blank the page, so the refresh path skips the initial-load flag.
  useEffect(() => {
    if (!token || !delivery) return;
    const REFRESH_MS = 45 * 60 * 1000;
    const refresh = () => { void loadGallery(undefined, undefined, { quiet: true }); };
    const timer = setInterval(refresh, REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - loadedAtRef.current >= REFRESH_MS) refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [token, delivery]); // eslint-disable-line react-hooks/exhaustive-deps -- re-arm once loaded, not on every data change

  const isLocked = delivery?.status === "submitted" || delivery?.status === "working" || delivery?.status === "delivered";
  const isWorking = delivery?.status === "working" || delivery?.status === "delivered";
  const proofingEnabled = !delivery?.downloadOnly && (delivery?.selectionLimit ?? 0) > 0;

  /** Proofs are for choosing from, not for keeping. When the gallery is
   *  showing them, every download route goes away — the single button, the
   *  lightbox, and Download all. The server withholds the URLs regardless;
   *  this is so nobody is offered something that won't work. */
  const showingProofs = files.some(f => f.isProof);
  const overage = Math.max(0, picked.size - (delivery?.selectionLimit ?? 0));
  const perExtraCents = delivery?.perExtraPhotoCents ?? 0;
  const flatCents = delivery?.buyAllFlatCents ?? 0;
  const hasPerPhoto = perExtraCents > 0;
  const hasFlat = flatCents > 0;
  const overagePerPhotoTotal = overage * perExtraCents;
  const recommendFlat = hasFlat && hasPerPhoto && flatCents < overagePerPhotoTotal && overage > 0;

  function togglePick(fileId: string) {
    if (isLocked) return;
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(fileId)) next.delete(fileId);
      else next.add(fileId);
      return next;
    });
  }

  async function startSubmit() {
    if (picked.size === 0) {
      toast.error("Pick at least one photo");
      return;
    }
    setSubmitOpen(true);
  }

  async function doSubmit(mode?: "per-photo" | "flat") {
    if (!clientName.trim() || !clientEmail.trim()) {
      toast.error("Name and email required");
      return;
    }
    setSubmitting(true);
    try {
      // First try the free path
      if (!mode) {
        const res = await fetch(`/api/delivery-public?action=submit`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token, fileIds: Array.from(picked),
            clientName: clientName.trim(), clientEmail: clientEmail.trim(),
            password: passwordRequired ? password : undefined,
          }),
        });
        const data = await res.json();
        if (res.status === 402 && data.needsCheckout) {
          setCheckoutOptions(data.options);
          setSubmitting(false);
          return;
        }
        if (!res.ok) throw new Error(data.error || "Submit failed");
        toast.success("Submitted!", { description: "We'll be in touch shortly." });
        setSubmitOpen(false);
        await loadGallery(); // refresh into "submitted" state
        return;
      }

      // Paid path — create Stripe Checkout session
      const res = await fetch(`/api/delivery-checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token, mode, fileIds: Array.from(picked),
          clientName: clientName.trim(), clientEmail: clientEmail.trim(),
          password: passwordRequired ? password : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error || "Checkout failed");
      window.location.assign(data.url);
    } catch (err) {
      toast.error("Couldn't submit", { description: err instanceof Error ? err.message : "Try again" });
    } finally {
      setSubmitting(false);
    }
  }

  async function requestChange() {
    const message = window.prompt("What would you like to change? (Optional)") || "";
    try {
      const res = await fetch(`/api/delivery-public?action=request-change`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, message }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      toast.success("Request sent", { description: "The team will reach out." });
    } catch (err) {
      toast.error("Couldn't send", { description: err instanceof Error ? err.message : "Try again" });
    }
  }

  /** Fetch photos and hand back one zip. Shared by "download all" and
   *  "download selected" so there's a single implementation of the batching
   *  and the CDN load, rather than two that drift. */
  /** How many 4px grid rows a tile needs to keep its real shape.
   *  The span is in absolute pixels, so it has to be computed against the
   *  ACTUAL width the tile will occupy — a fixed guess would make every photo
   *  the wrong height on a phone, where columns are half the size. `colWidth`
   *  is measured from the grid's own column track and updates on resize. */
  function tileRowSpan(f: FileItem, widthPx = colWidth): number {
    const ROW = GRID_ROW;
    const GAP = GRID_GAP;
    const w = f.width && f.width > 0 ? f.width : 3;
    const h = f.height && f.height > 0 ? f.height : 2;
    const targetPx = widthPx * (h / w);
    // Spanning n rows is NOT n*ROW tall — the grid puts a gap between every
    // row it crosses, so the real height is n*ROW + (n-1)*GAP. Ignoring that
    // stretched every tile by a quarter: a 16:9 photo at 220px wide should be
    // 124px tall and was rendering at 154px, so object-cover quietly cropped
    // the sides off every photo in the gallery. Solve for n instead:
    //   n*ROW + (n-1)*GAP = target  ->  n = (target + GAP) / (ROW + GAP)
    return Math.max(1, Math.round((targetPx + GAP) / (ROW + GAP)));
  }

  async function zipPhotos(photos: FileItem[], filename: string) {
    // Lazy-load JSZip from CDN — no bundle bloat for clients who never download.
    if (!window.JSZip) {
      await new Promise<void>((resolve, reject) => {
        const el = document.createElement("script");
        el.src = "https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js";
        el.onload = () => resolve();
        el.onerror = () => reject(new Error("Failed to load ZIP library"));
        document.head.appendChild(el);
      });
    }
    const JSZipCtor = (window.JSZip as unknown as { new(): { file: (n: string, b: Blob) => void; generateAsync: (o: { type: "blob" }) => Promise<Blob> } });
    const zip = new JSZipCtor();
    // Batches of 4 so we don't hammer R2.
    const batchSize = 4;
    for (let i = 0; i < photos.length; i += batchSize) {
      const batch = photos.slice(i, i + batchSize);
      await Promise.all(batch.map(async (f) => {
        // downloadUrl serves the full-quality original when the gallery kept
        // one; url is the compressed copy the grid browses.
        const r = await fetch(f.downloadUrl || f.url);
        if (!r.ok) throw new Error(`Failed to fetch ${f.originalName}`);
        zip.file(f.originalName, await r.blob());
      }));
    }
    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Multi-select download. Separate from `picked`, which is proofing — that's
  // "these are my favourites", this is "give me these files". Proofing
  // galleries don't offer downloads at all, so the two never appear together.
  // Measured width of one grid column, used to turn each photo's aspect ratio
  // into a row span. Starts at a sane guess so the first paint isn't wild.
  // When the URLs currently on screen were signed. Used to decide whether a
  // tab returning to the foreground needs fresh ones.
  const loadedAtRef = useRef<number>(Date.now());
  const gridRef = useRef<HTMLDivElement | null>(null);
  const [colWidth, setColWidth] = useState(360);
  const [gridWidth, setGridWidth] = useState(1200);
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const measure = () => {
      // Read the column tracks rather than measuring a tile. A tile is only a
      // reliable stand-in for one column while every tile is one column wide —
      // films span the full width, and measuring one of those set colWidth to
      // the whole grid and made every photo below it enormous.
      const tracks = getComputedStyle(el).gridTemplateColumns.split(" ").filter(Boolean).map(parseFloat);
      const track = tracks[0];
      // What a full-width tile actually spans: the tracks plus the gaps
      // between them. NOT the container width — the grid is centred, so the
      // container is wider than its columns and a film sized from it came out
      // 6% too tall (1043x619 where 1043x586 is 16:9).
      const spanned = tracks.length ? tracks.reduce((a, b) => a + b, 0) + (tracks.length - 1) * GRID_GAP : 0;
      if (track && Math.abs(track - colWidth) > 1) setColWidth(track);
      if (spanned && Math.abs(spanned - gridWidth) > 1) setGridWidth(spanned);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [colWidth, gridWidth, files.length]);

  // 35% on a real screen; full width on a phone, where 35% would leave the
  // headline deliverable smaller than the stills under it.
  //
  // The floor used to be colWidth ("never narrower than a photo tile"), which
  // worked while tiles were 260px and quietly broke when they grew to 460 —
  // the floor beat the 35% and the film became exactly one tile wide.
  // Capped as well as proportional. Tier one widened the content area, and 35%
  // of the new width came out near 485px — bigger than the size Geoff looked
  // at and approved. The cap holds it there on a large monitor.
  const filmWidth = Math.round(gridWidth < 640 ? gridWidth : Math.min(gridWidth * FILM_WIDTH, FILM_MAX_PX));

  // Films and photos get their own headed sections, but only when the gallery
  // holds both — a photo-only gallery should look exactly as it always has.
  const videoCount = useMemo(() => files.filter(f => f.mediaType === "video").length, [files]);
  const showSectionHeads = videoCount > 0 && videoCount < files.length;

  const [selecting, setSelecting] = useState(false);
  const [dlPicked, setDlPicked] = useState<Set<string>>(new Set());
  const toggleDlPick = (id: string) =>
    setDlPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  async function downloadSelected() {
    const chosen = files.filter((f) => dlPicked.has(f.id));
    if (chosen.length === 0) return;
    trackDownload(chosen.length);
    // Same split as download-all: videos stream straight to disk, photos get
    // zipped. But zipping happens in memory, so a big selection of
    // full-quality originals would blow up a phone — past this size each file
    // streams individually instead.
    const ZIP_BUDGET_BYTES = 300 * 1024 * 1024;
    const photos = chosen.filter((f) => f.mediaType !== "video");
    const videos = chosen.filter((f) => f.mediaType === "video");
    const photoBytes = photos.reduce((sum, f) => sum + (f.sizeBytes || 0), 0);
    setZipping(true);
    try {
      for (const v of videos) {
        streamToDisk(v.downloadUrl || v.url);
        await new Promise((r) => setTimeout(r, 800));
      }
      if (photos.length > 0 && photoBytes > ZIP_BUDGET_BYTES) {
        for (const f of photos) {
          streamToDisk(f.downloadUrl || f.url);
          await new Promise((r) => setTimeout(r, 600));
        }
      } else if (photos.length > 0) {
        await zipPhotos(photos, `${(delivery?.title || "photos").replace(/[^\w-]+/g, "_")}-selected.zip`);
      }
      setSelecting(false);
      setDlPicked(new Set());
    } catch (err) {
      alert(err instanceof Error ? err.message : "Download failed");
    } finally {
      setZipping(false);
    }
  }

  async function downloadAll() {
    if (files.length === 0) return;
    trackDownload(files.length);
    // Videos are streamed to disk individually; only photos go through the
    // in-memory client-side ZIP (they're small). This keeps a big video from
    // ever being fetched into memory, which is what breaks download-all today.
    const videos = files.filter((f) => f.mediaType === "video");
    const photos = files.filter((f) => f.mediaType !== "video");
    setZipping(true);
    try {
      // Stream each video straight to disk. A short gap keeps the browser from
      // collapsing several rapid-fire downloads into one.
      for (const v of videos) {
        streamToDisk(v.downloadUrl || v.url);
        if (videos.length > 1) await new Promise((r) => setTimeout(r, 800));
      }

      if (photos.length > 0) {
        await zipPhotos(photos, `${(delivery?.title || "gallery").replace(/[^\w-]+/g, "_")}.zip`);
      }
    } catch (err) {
      toast.error("Download failed", { description: err instanceof Error ? err.message : "Try again" });
    } finally {
      setZipping(false);
    }
  }

  const lightboxFile = lightboxIdx !== null ? files[lightboxIdx] : null;

  // Cover image: explicit pick first, otherwise first uploaded photo.
  // A cover uploaded for this gallery wins over one picked from the photos.
  // It is full quality (never re-encoded), isn't listed among the files, and
  // survives deleting the photo it was made from — the whole point of it.
  const coverFile = files.find((f) => f.id === delivery?.coverFileId) || files[0] || null;
  const coverUrl = delivery?.coverUrl || coverFile?.url || "";

  // Kick off a direct, attachment-forced download that the browser streams to
  // disk — no blob held in memory, so it works for files of any size.
  /** Tell the server files are leaving. Best-effort by design: the download
   *  has already started, and a failed metric must never surface to a client
   *  or block their photos. */
  function trackDownload(fileCount: number, fileId?: string) {
    void fetch(`/api/delivery-public?action=track-download`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // keepalive so the request survives the tab being closed straight after
      // a download — otherwise the last download of a visit goes uncounted.
      keepalive: true,
      body: JSON.stringify({ token, fileCount, fileId, email: visitorEmail || undefined }),
    }).catch(() => { /* never bother the client with a metric */ });
  }

  function streamToDisk(url: string) {
    const a = document.createElement("a");
    a.href = url;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async function downloadOne(f: FileItem) {
    // Belt and braces. The server sends no downloadUrl for a proof and the
    // buttons are hidden, but this is the one function every route ends at.
    if (f.isProof) return;
    trackDownload(1, f.id);
    // Videos stream straight to disk via their attachment link — pulling a
    // multi-hundred-MB video into a blob first would run mobile Safari out of
    // memory. Photos keep the blob path (forces a save even cross-origin).
    if (f.mediaType === "video" && f.downloadUrl) {
      streamToDisk(f.downloadUrl);
      return;
    }
    try {
      const res = await fetch(f.url);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = f.originalName;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Couldn't download");
    }
  }

  async function registerAndEnter() {
    const email = visitorEmail.trim().toLowerCase();
    if (!email.includes("@")) return;
    setRegistering(true);
    try {
      const res = await fetch(`/api/delivery-public?action=register-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, email }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Couldn't register");
      }
      // Remember per-token so revisits skip the gate.
      localStorage.setItem(`gallery-email-${token}`, email);
      setVisitorEmail(email);
      await loadGallery(undefined, email);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setRegistering(false);
    }
  }

  async function shareGallery() {
    const url = window.location.href;
    if (navigator.share) {
      try { await navigator.share({ url, title: delivery?.title }); return; } catch { /* user dismissed */ }
    }
    try { await navigator.clipboard.writeText(url); toast.success("Link copied"); } catch { /* ignore */ }
  }

  // ---- Renders ----

  if (loading) {
    return <div className="min-h-screen bg-white text-black flex items-center justify-center"><div className="text-slate-500">Loading…</div></div>;
  }

  if (passwordRequired && !delivery) {
    return (
      <div className="min-h-screen bg-white text-black flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <h1 className="text-2xl font-bold mb-2 text-center">Password required</h1>
          <p className="text-slate-500 text-sm mb-6 text-center">This gallery is private.</p>
          <input
            type="password"
            value={password}
            onChange={(e) => { setPassword(e.target.value); setPwError(""); }}
            onKeyDown={(e) => e.key === "Enter" && loadGallery(password)}
            className="w-full border border-slate-300 rounded-lg px-4 py-3 text-base mb-3 outline-none focus:border-black"
            placeholder="Password"
            autoFocus
            style={{ fontSize: 16 }}
          />
          {pwError && <p className="text-red-600 text-sm mb-3">{pwError}</p>}
          <button
            onClick={() => loadGallery(password)}
            className="w-full bg-black text-white py-3 rounded-lg font-semibold"
          >
            View gallery
          </button>
        </div>
      </div>
    );
  }

  if (emailRequired && !delivery) {
    return (
      <div className="min-h-screen bg-white text-black flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <h1 className="text-2xl font-bold mb-2 text-center">Sign in to view</h1>
          <p className="text-slate-500 text-sm mb-6 text-center">Enter your email to access this gallery.</p>
          <input
            type="email"
            value={visitorEmail}
            onChange={(e) => setVisitorEmail(e.target.value)}
            onKeyDown={async (e) => {
              if (e.key === "Enter") await registerAndEnter();
            }}
            className="w-full border border-slate-300 rounded-lg px-4 py-3 text-base mb-3 outline-none focus:border-black"
            placeholder="you@example.com"
            autoFocus
            style={{ fontSize: 16 }}
          />
          <button
            onClick={registerAndEnter}
            disabled={registering || !visitorEmail.includes("@")}
            className="w-full bg-black text-white py-3 rounded-lg font-semibold disabled:opacity-50"
          >
            {registering ? "Signing in…" : "View gallery"}
          </button>
        </div>
      </div>
    );
  }

  if (error || !delivery) {
    return (
      <div className="min-h-screen bg-white text-black flex items-center justify-center p-6 text-center">
        <div>
          <h1 className="text-2xl font-bold mb-2">Gallery unavailable</h1>
          <p className="text-slate-500">{error || "Not found."}</p>
        </div>
      </div>
    );
  }


  const cover = delivery.coverLayout || "center";
  // A cover that was DELIBERATELY chosen always shows, download-only or not.
  // It is branding, and the whole point of previewing is to see what the
  // client will see — a gallery that hides the cover you picked is lying to
  // you. Download-only used to suppress it outright, which meant the cover
  // picker happily accepted a choice that could never appear.
  //
  // The fallback is treated differently on purpose. With no cover chosen,
  // coverUrl silently becomes the first file, so honouring it everywhere would
  // staple a full-screen hero built from a random first photo onto every
  // real-estate delivery that was never configured to have one. Explicit
  // choice: shown. Never chosen: unchanged.
  const hasChosenCover = !!delivery.coverUrl || !!delivery.coverFileId;
  const layoutHasHero = cover !== "minimal" && !!coverUrl
    && (hasChosenCover || !delivery.downloadOnly);

  return (
    <div className="min-h-screen bg-white text-black">
      {/* Inline font for the hero — Cormorant for that Pixieset serif feel */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400;500&family=Playfair+Display:wght@400;600&family=Marcellus&family=Inter:wght@300;400;500&family=Montserrat:wght@300;400;500&family=EB+Garamond:wght@400;500&family=DM+Serif+Display&display=swap" rel="stylesheet" />

      {/* HERO */}
      {layoutHasHero ? (
        <CoverHero
          layout={cover}
          imageUrl={coverUrl}
          title={delivery.title}
          subtitle={delivery.coverSubtitle}
          date={delivery.coverDate}
          fontValue={delivery.coverFont || ""}
          focal={delivery.coverFocal || "point"}
          focalX={delivery.coverFocalX ?? 50}
          focalY={delivery.coverFocalY ?? 50}
        />
      ) : delivery.downloadOnly ? null : (
        // Minimal layout: typography-only on white
        <section className="text-center py-20 sm:py-28 px-6 border-b border-slate-200">
          <h1 className="text-black" style={{
            fontFamily: getCoverHeroFontFamily(delivery.coverFont || ""),
            fontWeight: getCoverHeroFontWeight(delivery.coverFont || ""),
            fontSize: "clamp(2.5rem, 6vw, 5rem)",
            letterSpacing: "0.02em",
            lineHeight: 1.1,
          }}>
            {delivery.title}
          </h1>
          {(delivery.coverDate || delivery.coverSubtitle) && (
            <p className="text-slate-500 mt-4 text-xs sm:text-sm uppercase" style={{ letterSpacing: "0.3em" }}>
              {delivery.coverDate}
              {delivery.coverDate && delivery.coverSubtitle && " · "}
              {delivery.coverSubtitle}
            </p>
          )}
        </section>
      )}

      {/* Sticky thin header — gallery name + global actions */}
      <header
        id="photos"
        className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-slate-200"
      >
        <div className="max-w-[1600px] mx-auto px-6 sm:px-10 py-4 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-xs sm:text-sm font-semibold uppercase tracking-[0.25em] text-black truncate">
              {delivery.title}
            </h2>
            {org?.name && (
              <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400 mt-0.5">{org.name}</p>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => { if (files.length > 0) { setLightboxIdx(0); setSlideshowPlaying(true); } }}
              disabled={files.length === 0}
              title="Slideshow"
              className="p-2 hover:bg-slate-100 rounded-full text-slate-600 hover:text-black disabled:opacity-50"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            </button>
            {!showingProofs && (
            <button onClick={downloadAll} disabled={zipping} title="Download all" className="p-2 hover:bg-slate-100 rounded-full text-slate-600 hover:text-black disabled:opacity-50">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            </button>
            )}
            <button onClick={shareGallery} title="Share" className="p-2 hover:bg-slate-100 rounded-full text-slate-600 hover:text-black">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
            </button>
          </div>
        </div>
      </header>

      {/* The cover's date and subtitle, carried past the hero.
          They were set once on the cover and then vanished the moment the
          client scrolled, so the rest of the page had nothing tying it to the
          occasion. Only for galleries that HAVE a hero — a bare download list
          shouldn't grow a title block. */}
      {layoutHasHero && (delivery.coverDate || delivery.coverSubtitle) && (
        <div className="max-w-[1600px] mx-auto px-6 sm:px-10 pt-10 text-center">
          <p
            className="text-[13px] uppercase tracking-[0.28em] text-slate-500"
            style={{ fontFamily: getCoverHeroFontFamily(delivery.coverFont || "") }}
          >
            {[delivery.coverDate, delivery.coverSubtitle].filter(Boolean).join(" · ")}
          </p>
        </div>
      )}

      {/* Download-only galleries (e.g. real-estate): one prominent download-all. */}
      {/* Shown whenever there is something to download. It used to require
          status delivered/sent, so previewing a draft — the moment you are
          actually checking the layout — showed no download action at all.
          
          Gated on what's ON SCREEN, not on whether the gallery does proofing.
          `!proofingEnabled` also hid this after delivery: a proofing gallery
          keeps its pick limit forever, so the client could never download the
          finals she'd paid for. */}
      {!showingProofs && files.length > 0 && (
        <div className="max-w-[1600px] mx-auto px-6 sm:px-10 pt-4">
          <button
            onClick={() => { setSelecting(v => !v); setDlPicked(new Set()); }}
            disabled={zipping}
            className="inline-flex items-center gap-2 border border-slate-300 text-slate-700 px-5 py-2.5 rounded-full text-sm font-medium hover:bg-slate-100 disabled:opacity-50 mr-2"
          >
            {selecting ? "Cancel" : "Select photos"}
          </button>
          <button onClick={downloadAll} disabled={zipping || selecting} className="inline-flex items-center gap-2 bg-black text-white px-5 py-2.5 rounded-full text-sm font-medium hover:bg-black/80 disabled:opacity-50">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            {zipping ? "Preparing…" : (() => {
              const v = files.filter((f) => f.mediaType === "video").length;
              const p = files.length - v;
              const parts: string[] = [];
              if (p) parts.push(`${p} photo${p === 1 ? "" : "s"}`);
              if (v) parts.push(`${v} video${v === 1 ? "" : "s"}`);
              return `Download all ${parts.join(" + ")}`;
            })()}
          </button>
        </div>
      )}

      {/* Status / state banners */}
      {(isWorking || delivery.status === "submitted" || delivery.status === "delivered" || (proofingEnabled && delivery.status === "sent")) && (
        <div className="max-w-[1600px] mx-auto px-6 sm:px-10 py-4">
          {/* `isWorking` counts "delivered" as in-progress, which is fine for
              deciding what to render but wrong for a status line — it told a
              client her photos were being edited AND delivered at the same
              time. These read off the actual status, and speak to a person
              rather than a pipeline. */}
          {delivery.status === "working" && (
            <p className="text-emerald-700 text-sm sm:text-base">
              We're editing your picks now — you'll get an email the moment they're ready.
            </p>
          )}
          {delivery.status === "submitted" && (
            <p className="text-blue-700 text-sm sm:text-base">
              Thank you — we've got your picks and we'll take it from here.
            </p>
          )}
          {delivery.status === "delivered" && !showingProofs && (
            <p className="text-slate-700 text-sm sm:text-base">
              Your photos are ready. Download the whole set, or tap <strong>Select photos</strong> to pick out a few — they're yours to keep, so grab them whenever suits you.
            </p>
          )}
          {proofingEnabled && !isLocked && (
            <p className="text-amber-900 text-xs sm:text-sm">
              <strong>Choose the {delivery.selectionLimit} you'd like edited</strong>, then send them back with the button at the bottom.
              {hasPerPhoto && <> Need more? <strong>{money(perExtraCents)}</strong> per extra photo.</>}
              {hasFlat && <> Or <strong>{money(flatCents)}</strong> to unlock all picks.</>}
            </p>
          )}
          {delivery.status === "submitted" && !isWorking && (
            <button onClick={requestChange} className="text-xs text-blue-700 underline mt-2">Request a change</button>
          )}
        </div>
      )}

      {/* PHOTO GRID — flush, full-bleed, no gaps */}
      <div
        // Masonry, not a square grid. Every photo used to be cropped to a
        // square, which on portrait work cuts off heads and feet — the frame
        // the photographer chose is the product. Tiles now span however many
        // 4px rows their real aspect ratio needs, so nothing is cropped and the
        // left-to-right order the owner arranged is preserved (CSS columns
        // would have reflowed it top-to-bottom per column).
        ref={gridRef}
        // auto-fit collapses tracks with nothing in them, and justify-center
        // centres what's left — so a row that doesn't fill the width sits in
        // the middle instead of hugging the left with dead space beside it.
        // The MIN is what decides how many columns you get: auto-fit packs as
        // many tracks as fit at the minimum, then grows them toward the max.
        // A low min gives five small columns no matter how high the max is, so
        // 360 is the number that forces three across — the senior-portrait
        // strips are the reference Geoff asked for.
        style={{ gridAutoRows: "4px" }}
        // No grey backdrop: it only ever showed through where there were no
        // tiles, which read as a grey bar down the side of the gallery. Tiles
        // carry their own hairline instead.
        //
        // Capped and centred: with no max width the set floated in a sea of
        // white on a large monitor with nothing holding it together.
        // Explicit column counts, not auto-fit. auto-fit computes how many
        // tracks fit using the track's MAX when that max is definite, so
        // minmax(360px, 460px) produced two 460px columns in a 1352px space
        // rather than the three the minimum implied — measured, not assumed.
        // Fixed counts do exactly what they say at every width.
        className="relative grid justify-center gap-1 mx-auto max-w-[1400px] px-4 sm:px-6 grid-cols-2 lg:grid-cols-3"
        onContextMenu={(e) => {
          if (delivery.watermarkText || (delivery.watermarkUseLogo && org?.logoUrl)) e.preventDefault();
        }}
      >
        {/* Logo watermark — tiled at low opacity. Preferred over text when enabled. */}
        {delivery.watermarkUseLogo && org?.logoUrl && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 z-10 select-none"
            style={{
              backgroundImage: `url("${org.logoUrl}")`,
              backgroundRepeat: "repeat",
              backgroundSize: "180px",
              opacity: 0.18,
            }}
          />
        )}
        {/* Text watermark — runs alongside logo OR alone, same tiled style. */}
        {delivery.watermarkText && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 z-10 select-none"
            style={{
              backgroundImage: `url("data:image/svg+xml;utf8,${encodeURIComponent(
                `<svg xmlns='http://www.w3.org/2000/svg' width='400' height='400'><text x='50%' y='50%' fill='rgba(255,255,255,0.18)' font-family='Helvetica' font-size='22' text-anchor='middle' transform='rotate(-30 200 200)'>${delivery.watermarkText}</text></svg>`
              )}")`,
              backgroundRepeat: "repeat",
              mixBlendMode: "difference",
            }}
          />
        )}
        {files.map((f, i) => {
          const isPicked = picked.has(f.id);
          const isPaid = serverSelections.find((s) => s.fileId === f.id)?.isPaid;
          const isVideo = f.mediaType === "video";
          // files is sorted films-first, so the first video is index 0 and the
          // first photo is index videoCount. Headings only appear when the
          // gallery actually holds both — a photo-only gallery is unchanged.
          const head = !showSectionHeads ? null
            : i === 0 ? (videoCount === 1 ? "Film" : "Films")
            : i === videoCount ? "Photos"
            : null;
          return (
            <Fragment key={f.id}>
            {head && <GallerySectionHead label={head} fontFamily={getCoverHeroFontFamily(delivery.coverFont || "")} />}
            <div
              // Height comes from the photo's own proportions. Videos and
              // anything missing dimensions fall back to 3:2 rather than
              // collapsing to nothing.
              data-tile
              // A film gets its own centred row rather than sitting in a
              // column — a lone video tile in a five-column row left a stripe
              // of empty gallery beside it. It claims the full row and is
              // centred within it at FILM_WIDTH of the grid, and its height is
              // worked out from THAT width: sizing a wide tile by the column
              // width would letterbox it.
              style={
                isVideo
                  ? { gridColumn: "1 / -1", justifySelf: "center", width: filmWidth, gridRow: `span ${tileRowSpan(f, filmWidth)}` }
                  : { gridRow: `span ${tileRowSpan(f)}` }
              }
              className={`relative group cursor-pointer overflow-hidden bg-white outline outline-1 -outline-offset-1 outline-slate-200 ${selecting && dlPicked.has(f.id) ? "ring-4 ring-black ring-inset" : ""}`}
              onClick={() => (selecting ? toggleDlPick(f.id) : setLightboxIdx(i))}
            >
              {/* In select mode the tick is the whole point, so it's always
                  visible rather than appearing on hover — half these clients
                  are on a phone with no hover at all. */}
              {selecting && (
                <div className={`absolute top-2 left-2 z-20 w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs font-bold ${dlPicked.has(f.id) ? "bg-black text-white border-black" : "bg-white/80 border-slate-400 text-transparent"}`}>
                  ✓
                </div>
              )}
              {isVideo ? (
                <>
                  {f.thumbnailUrl ? (
                    <img src={f.thumbnailUrl} alt={f.originalName} loading="lazy" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-slate-200 text-slate-500 text-xs p-2 text-center">
                      Video
                    </div>
                  )}
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="bg-black/60 rounded-full p-3 sm:p-4">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z"/></svg>
                    </div>
                  </div>
                  {/* The name used to sit inside the frame under a black
                      gradient, which darkened the last inch of every film and
                      read like a stock video player. It's a caption on the
                      page now — see the row emitted after this tile. */}
                </>
              ) : (
                <img
                  src={f.url}
                  alt={f.originalName}
                  loading="lazy"
                  className="w-full h-full object-cover"
                />
              )}
              {/* Hover gradient for icon legibility */}
              <div className="absolute inset-0 bg-gradient-to-b from-black/0 via-transparent to-black/40 opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 transition-opacity pointer-events-none" />

              {/* Hover icons — bottom-right cluster */}
              <div className="absolute bottom-3 right-3 flex items-center gap-1 opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 transition-opacity">
                {delivery.printsEnabled && !isVideo && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setPrintFor(f); }}
                    className="w-8 h-8 rounded-full bg-white/90 hover:bg-white text-slate-700 hover:text-black flex items-center justify-center shadow-md"
                    title="Order print"
                    aria-label="Order print"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
                  </button>
                )}
                {!f.isProof && (
                <button
                  onClick={(e) => { e.stopPropagation(); downloadOne(f); }}
                  className="w-8 h-8 rounded-full bg-white/90 hover:bg-white text-slate-700 hover:text-black flex items-center justify-center shadow-md"
                  title="Download"
                  aria-label="Download"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                </button>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); shareGallery(); }}
                  className="w-8 h-8 rounded-full bg-white/90 hover:bg-white text-slate-700 hover:text-black flex items-center justify-center shadow-md"
                  title="Share"
                  aria-label="Share"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
                </button>
              </div>

              {/* Heart (proofing) — photos only. Videos are download-only. */}
              {proofingEnabled && !isVideo && (
                <button
                  onClick={(e) => { e.stopPropagation(); togglePick(f.id); }}
                  disabled={isLocked}
                  className={`absolute top-3 right-3 w-9 h-9 rounded-full flex items-center justify-center text-lg shadow-md transition-all ${
                    isPicked
                      ? "bg-red-500 text-white"
                      : "bg-white/80 text-slate-500 hover:text-red-500 opacity-0 group-hover:opacity-100"
                  } ${isLocked ? "cursor-default" : ""}`}
                  aria-label={isPicked ? "Unpick" : "Pick"}
                >
                  {isPicked ? "♥" : "♡"}
                </button>
              )}
              {isPaid && (
                <div className="absolute top-3 left-3 bg-emerald-500 text-white text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded">
                  Paid
                </div>
              )}
            </div>
            {isVideo && (
              <div
                style={{ gridColumn: "1 / -1", gridRow: "span 8" }}
                className="flex items-baseline justify-center gap-3 pt-3 pb-1"
              >
                <span
                  className="text-[13px] text-slate-700"
                  style={{ fontFamily: getCoverHeroFontFamily(delivery.coverFont || "") }}
                >{f.originalName.replace(/\.[^.]+$/, "")}</span>
                {f.durationSeconds != null && (
                  <span className="text-[11px] font-mono text-slate-400">
                    {Math.floor(f.durationSeconds / 60)}:{String(f.durationSeconds % 60).padStart(2, "0")}
                  </span>
                )}
              </div>
            )}
            </Fragment>
          );
        })}
      </div>

        {/* Sticky proofing footer */}
        {/* Selection bar. Fixed to the bottom so it's reachable one-handed on a
            phone, which is where most of these galleries get opened. */}
        {selecting && (
          <div className="fixed bottom-0 inset-x-0 z-40 bg-white border-t border-slate-200 px-5 py-3 flex items-center justify-between gap-3">
            <div className="text-sm text-slate-700 min-w-0">
              <strong>{dlPicked.size}</strong> selected
              {dlPicked.size > 0 && (
                <button
                  onClick={() => setDlPicked(new Set(files.map(f => f.id)))}
                  className="ml-3 text-xs underline text-slate-500 hover:text-black"
                >
                  Select all
                </button>
              )}
            </div>
            <button
              onClick={downloadSelected}
              disabled={dlPicked.size === 0 || zipping}
              className="shrink-0 bg-black text-white px-5 py-2.5 rounded-full text-sm font-medium disabled:opacity-40"
            >
              {zipping ? "Preparing…" : `Download ${dlPicked.size || ""}`.trim()}
            </button>
          </div>
        )}

        {/* Always present while she's choosing — not only once she's picked
            something. A first-time visitor otherwise sees a wall of cards and
            a line of small print that scrolls away, with nothing telling them
            what this page wants.

            Gated on isLocked rather than status === "sent" so the owner's
            Preview shows it too: a draft is exactly when you're checking that
            the page reads right. */}
        {proofingEnabled && !isLocked && (
          <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 p-4 shadow-lg z-30">
            <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm min-w-0">
                {picked.size === 0 ? (
                  <span className="text-slate-700">
                    Tap the <span className="text-rose-500">♥</span> on the {delivery.selectionLimit} photo{delivery.selectionLimit === 1 ? "" : "s"} you'd like edited
                  </span>
                ) : (
                  <>
                    <strong>{picked.size}</strong> of <strong>{delivery.selectionLimit}</strong> picked
                    {picked.size < delivery.selectionLimit && (
                      <span className="text-slate-500"> · {delivery.selectionLimit - picked.size} to go</span>
                    )}
                    {overage > 0 && (
                      <span className="ml-2 text-amber-700">
                        · {overage} extra {hasPerPhoto && `(${money(overagePerPhotoTotal)})`}
                      </span>
                    )}
                  </>
                )}
              </div>
              <button
                onClick={startSubmit}
                disabled={picked.size === 0}
                className="shrink-0 bg-black text-white px-5 py-2.5 rounded-lg font-semibold text-sm disabled:opacity-30 disabled:cursor-not-allowed"
              >
                {picked.size === 0
                  ? `Choose ${delivery.selectionLimit}`
                  : `Send my ${picked.size} pick${picked.size === 1 ? "" : "s"} →`}
              </button>
            </div>
          </div>
        )}

        {/* First-visit walkthrough */}
        {walkthroughStep !== null && (() => {
          // Two different jobs, two different walkthroughs. A proofing visitor
          // is here to CHOOSE — telling them how to download a ZIP is both
          // wrong (proofs aren't downloadable) and a distraction from the only
          // thing the page needs them to do.
          const steps = proofingEnabled
            ? [
                { title: "Welcome", body: `Have a look through ${delivery.title}. Tap any photo to see it full-size.` },
                { title: `Choose your ${delivery.selectionLimit}`, body: `Tap the ♥ on the ${delivery.selectionLimit} you'd like edited. Tap again to change your mind — nothing is final until you send them.` },
                { title: "Send them back", body: `When you're happy, press the button at the bottom to send your picks. We'll edit those and send the finished photos over.` },
              ]
            : [
                { title: "Welcome", body: `Take a look through ${delivery.title}. Click any photo to view full-size.` },
                { title: "Download anytime", body: "Save individual photos or download everything as a ZIP from the top bar." },
              ];
          const step = steps[walkthroughStep];
          const last = walkthroughStep >= steps.length - 1;
          return (
            <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-xl max-w-sm w-full p-6 shadow-2xl">
                <p className="text-[10px] uppercase tracking-widest text-slate-400 mb-2">{walkthroughStep + 1} of {steps.length}</p>
                <h3 className="text-xl font-bold mb-2" style={{ fontFamily: "'Cormorant Garamond', Georgia, serif" }}>{step.title}</h3>
                <p className="text-sm text-slate-600 mb-5">{step.body}</p>
                <div className="flex items-center justify-between">
                  <button onClick={dismissWalkthrough} className="text-xs text-slate-400 hover:text-slate-700">Skip</button>
                  <button
                    onClick={() => last ? dismissWalkthrough() : setWalkthroughStep(walkthroughStep + 1)}
                    className="bg-black text-white px-5 py-2 rounded-lg text-sm font-semibold"
                  >
                    {last ? "Got it" : "Next"}
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Lightbox */}
        {lightboxFile && lightboxIdx !== null && (
          <Lightbox
            file={lightboxFile}
            index={lightboxIdx}
            total={files.length}
            prevUrl={files[lightboxIdx - 1]?.url}
            nextUrl={files[lightboxIdx + 1]?.url}
            slideshowPlaying={slideshowPlaying}
            canPick={proofingEnabled && !isLocked && lightboxFile.mediaType !== "video"}
            isPicked={picked.has(lightboxFile.id)}
            onPick={() => togglePick(lightboxFile.id)}
            onToggleSlideshow={() => setSlideshowPlaying(p => !p)}
            onDownload={() => downloadOne(lightboxFile)}
            canDownload={!lightboxFile.isProof}
            onPrev={() => setLightboxIdx(i => (i === null ? null : Math.max(0, i - 1)))}
            onNext={() => setLightboxIdx(i => (i === null ? null : Math.min(files.length - 1, i + 1)))}
            onClose={() => { setLightboxIdx(null); setSlideshowPlaying(false); }}
          />
        )}

        {/* Submit modal */}
        {submitOpen && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => !submitting && setSubmitOpen(false)}>
            <div className="bg-white rounded-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
              {!checkoutOptions ? (
                <>
                  <h2 className="text-xl font-bold mb-2">Submit your picks</h2>
                  <p className="text-sm text-slate-500 mb-4">
                    {picked.size} photo{picked.size === 1 ? "" : "s"} selected.
                  </p>
                  <input
                    type="text"
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    placeholder="Your name"
                    className="w-full border border-slate-300 rounded-lg px-4 py-3 mb-3 outline-none focus:border-black"
                    style={{ fontSize: 16 }}
                  />
                  <input
                    type="email"
                    value={clientEmail}
                    onChange={(e) => setClientEmail(e.target.value)}
                    placeholder="your@email.com"
                    className="w-full border border-slate-300 rounded-lg px-4 py-3 mb-4 outline-none focus:border-black"
                    style={{ fontSize: 16 }}
                  />
                  <div className="flex gap-2">
                    <button onClick={() => setSubmitOpen(false)} disabled={submitting} className="flex-1 border border-slate-300 py-3 rounded-lg font-semibold">Cancel</button>
                    <button onClick={() => doSubmit()} disabled={submitting} className="flex-1 bg-black text-white py-3 rounded-lg font-semibold disabled:opacity-50">
                      {submitting ? "Submitting…" : "Submit"}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <h2 className="text-xl font-bold mb-2">You picked {picked.size}</h2>
                  <p className="text-sm text-slate-500 mb-4">
                    {delivery.selectionLimit} are included free. Cover the {overage} extra{overage === 1 ? "" : "s"}:
                  </p>
                  <div className="space-y-2 mb-4">
                    {checkoutOptions.perPhoto && (
                      <button
                        onClick={() => doSubmit("per-photo")}
                        disabled={submitting}
                        className={`w-full text-left p-4 rounded-lg border-2 ${recommendFlat ? "border-slate-300" : "border-black"} hover:border-black`}
                      >
                        <div className="font-semibold">Pay per photo · {money(checkoutOptions.perPhoto.totalCents)}</div>
                        <div className="text-sm text-slate-500">{checkoutOptions.perPhoto.extras} × {money(checkoutOptions.perPhoto.unitCents)}</div>
                      </button>
                    )}
                    {checkoutOptions.flat && (
                      <button
                        onClick={() => doSubmit("flat")}
                        disabled={submitting}
                        className={`w-full text-left p-4 rounded-lg border-2 ${recommendFlat ? "border-black bg-amber-50" : "border-slate-300"} hover:border-black relative`}
                      >
                        {recommendFlat && <span className="absolute top-2 right-2 text-[10px] uppercase tracking-wider text-amber-700 font-bold">Best value</span>}
                        <div className="font-semibold">Unlock all · {money(checkoutOptions.flat.totalCents)}</div>
                        <div className="text-sm text-slate-500">All {picked.size} photos for one flat fee.</div>
                      </button>
                    )}
                  </div>
                  <button onClick={() => { setCheckoutOptions(null); setSubmitOpen(false); }} disabled={submitting} className="w-full text-sm text-slate-500">Cancel</button>
                </>
              )}
            </div>
          </div>
        )}

      {/* Print request modal */}
      {printFor && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => !printSubmitting && setPrintFor(null)}>
          <div className="bg-white rounded-xl max-w-sm w-full p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-bold mb-1">Request a print</h2>
            <p className="text-xs text-slate-500 mb-4">{printFor.originalName}</p>
            <div className="grid grid-cols-2 gap-2 mb-3">
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-slate-500 mb-1">Size</label>
                <select value={printSize} onChange={(e) => setPrintSize(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" style={{ fontSize: 16 }}>
                  <option value="4x6">4×6</option>
                  <option value="5x7">5×7</option>
                  <option value="8x10">8×10</option>
                  <option value="11x14">11×14</option>
                  <option value="16x20">16×20</option>
                  <option value="24x36">24×36</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-slate-500 mb-1">Quantity</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={printQty === 0 ? "" : String(printQty)}
                  onChange={(e) => {
                    const cleaned = e.target.value.replace(/[^\d]/g, "");
                    if (cleaned === "") { setPrintQty(0); return; }
                    setPrintQty(Math.min(50, Math.max(1, parseInt(cleaned, 10))));
                  }}
                  onBlur={() => { if (printQty < 1) setPrintQty(1); }}
                  placeholder="1"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                  style={{ fontSize: 16 }}
                />
              </div>
            </div>
            <input type="text" value={printName} onChange={(e) => setPrintName(e.target.value)} placeholder="Your name" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm mb-2" style={{ fontSize: 16 }} />
            <input type="email" value={printEmail} onChange={(e) => setPrintEmail(e.target.value)} placeholder="your@email.com" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm mb-2" style={{ fontSize: 16 }} />
            <textarea value={printNote} onChange={(e) => setPrintNote(e.target.value)} placeholder="Notes (optional)" rows={2} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm mb-3" style={{ fontSize: 16 }} />
            <p className="text-[11px] text-slate-500 mb-3">We'll email you with pricing and payment options. No charge yet.</p>
            <div className="flex gap-2">
              <button onClick={() => setPrintFor(null)} disabled={printSubmitting} className="flex-1 border border-slate-300 py-2.5 rounded-lg font-semibold text-sm">Cancel</button>
              <button onClick={submitPrintRequest} disabled={printSubmitting} className="flex-1 bg-black text-white py-2.5 rounded-lg font-semibold text-sm disabled:opacity-50">
                {printSubmitting ? "Sending…" : "Request"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="border-t border-slate-200 py-8 text-center text-xs text-slate-400">
        Powered by Slate · slate.sdubmedia.com
      </footer>
    </div>
  );
}

// ----------------------------------------------------------------------
// Cover layouts — each renders the title/subtitle/date over a hero image
// in a different visual style. Inspired by Pixieset's cover designs.
// ----------------------------------------------------------------------
type CoverLayout = "center" | "vintage" | "minimal" | "left" | "stripe" | "frame" | "divider" | "stamp";

// Keep these in sync with COVER_FONTS in DeliveriesPage. Public bundle
// can't import from the admin page, so the list is duplicated by design.
const COVER_HERO_FONTS: Record<string, { family: string; weight: number }> = {
  "":                { family: "'Cormorant Garamond', Georgia, serif",  weight: 300 },
  "playfair":        { family: "'Playfair Display', Georgia, serif",    weight: 400 },
  "marcellus":       { family: "'Marcellus', Georgia, serif",           weight: 400 },
  "inter":           { family: "'Inter', system-ui, sans-serif",        weight: 300 },
  "sans":            { family: "'Montserrat', system-ui, sans-serif",   weight: 300 },
  "serif-timeless":  { family: "'EB Garamond', Georgia, serif",         weight: 400 },
  "serif-modern":    { family: "'DM Serif Display', Georgia, serif",    weight: 400 },
};
function getCoverHeroFontFamily(value: string) { return (COVER_HERO_FONTS[value] || COVER_HERO_FONTS[""]).family; }
function getCoverHeroFontWeight(value: string) { return (COVER_HERO_FONTS[value] || COVER_HERO_FONTS[""]).weight; }

function CoverHero({ layout, imageUrl, title, subtitle, date, fontValue, focal = "point", focalX = 50, focalY = 50 }: {
  layout: CoverLayout;
  imageUrl: string;
  focal?: string;
  focalX?: number;
  focalY?: number;
  title: string;
  subtitle: string | null;
  date: string | null;
  fontValue: string;
}) {
  const meta = (date || subtitle)
    ? <>{date}{date && subtitle && " · "}{subtitle}</>
    : null;

  // Each layout chooses its own overlay gradient + alignment + extra decoration
  const overlay = (() => {
    switch (layout) {
      case "vintage": return "linear-gradient(135deg, rgba(0,0,0,0.65) 0%, rgba(0,0,0,0.25) 50%, rgba(0,0,0,0.55) 100%)";
      case "left": return "linear-gradient(90deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.15) 60%, rgba(0,0,0,0.05) 100%)";
      case "center":
      case "stripe":
      case "frame":
      case "divider":
      case "stamp":
        return "linear-gradient(180deg, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.45) 100%)";
      default: return "linear-gradient(180deg, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.45) 100%)";
    }
  })();

  // Wrapper alignment (placement of the inner block)
  const wrapAlign = layout === "vintage" || layout === "left"
    ? "items-start justify-end text-left"
    : "items-center justify-center text-center";

  // Title styling per layout
  const titleStyle: React.CSSProperties = {
    fontFamily: getCoverHeroFontFamily(fontValue),
    fontWeight: getCoverHeroFontWeight(fontValue),
    fontSize: layout === "vintage" || layout === "left" ? "clamp(2.5rem, 7vw, 5.5rem)" : "clamp(3rem, 8vw, 6rem)",
    letterSpacing: layout === "vintage" ? "0.04em" : "0.02em",
    lineHeight: 1.05,
    textShadow: "0 2px 18px rgba(0,0,0,0.4)",
    maxWidth: "20ch",
    color: "white",
  };


  // The title element with optional decorative bits per layout
  const titleEl = (() => {
    if (layout === "stripe") {
      return (
        <div className="flex items-center gap-6">
          <div className="hidden sm:block h-px w-24 bg-white/60" />
          <h1 style={titleStyle}>{title}</h1>
          <div className="hidden sm:block h-px w-24 bg-white/60" />
        </div>
      );
    }
    if (layout === "frame") {
      return (
        <div className="border border-white/50 px-10 py-12 sm:px-16 sm:py-14">
          <h1 style={titleStyle}>{title}</h1>
        </div>
      );
    }
    if (layout === "stamp") {
      return (
        <div className="border-2 border-white rounded-full px-12 py-10 sm:px-20 sm:py-16 inline-flex items-center justify-center">
          <h1 style={{ ...titleStyle, fontSize: "clamp(2rem, 5vw, 4rem)", maxWidth: "16ch" }}>{title}</h1>
        </div>
      );
    }
    return <h1 style={titleStyle}>{title}</h1>;
  })();

  // Subtitle/divider element
  const metaEl = meta ? (
    layout === "divider" ? (
      <div className="mt-6 flex flex-col items-center text-center">
        <div className="h-px w-20 bg-white/60 mb-5" />
        <p className="text-white/85 text-xs sm:text-sm uppercase" style={{ letterSpacing: "0.3em" }}>{meta}</p>
      </div>
    ) : (
      <p className="text-white/85 mt-5 text-xs sm:text-sm uppercase" style={{ letterSpacing: "0.3em" }}>{meta}</p>
    )
  ) : null;

  return (
    <section className="relative w-full overflow-hidden" style={{ height: "min(100vh, 900px)" }}>
      {/* object-position with percentages keeps the chosen point of the photo
          at the same relative spot in the frame whatever shape the hero takes
          — phone, iPad, wide desktop. Pick it once and it holds everywhere,
          which top/centre/bottom could never do. */}
      <img
        src={imageUrl}
        alt=""
        className={`absolute inset-0 w-full h-full ${focal === "contain" ? "object-contain bg-black" : "object-cover"}`}
        style={focal === "contain" ? undefined : { objectPosition: `${focalX}% ${focalY}%` }}
        loading="eager"
      />
      <div className="absolute inset-0" style={{ background: overlay }} />
      <div className={`absolute inset-0 flex flex-col p-8 sm:p-16 ${wrapAlign}`}>
        {titleEl}
        {metaEl}
        <a
          href="#photos"
          className="mt-10 inline-block text-white border border-white/70 hover:border-white hover:bg-white hover:text-black transition-colors px-8 py-3 text-xs uppercase"
          style={{ letterSpacing: "0.25em" }}
        >
          View Gallery
        </a>
      </div>
    </section>
  );
}
