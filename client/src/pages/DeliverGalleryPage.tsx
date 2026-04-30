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

import { useEffect, useMemo, useState } from "react";
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
}

interface DeliveryInfo {
  id: string;
  title: string;
  coverFileId: string | null;
  coverLayout: "center" | "vintage" | "minimal" | "left" | "stripe" | "frame" | "divider" | "stamp";
  coverFont?: string;
  coverSubtitle: string | null;
  coverDate: string | null;
  watermarkText: string | null;
  printsEnabled: boolean;
  status: "draft" | "sent" | "submitted" | "working" | "delivered";
  selectionLimit: number;
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

  async function loadGallery(pwToTry?: string, emailToTry?: string) {
    setLoading(true);
    setError(null);
    try {
      // Bundle whatever credentials we have — password (if pwToTry given) or
      // remembered email (from localStorage) — into a single POST so the
      // server can decide which gate(s) to apply.
      const emailForCall = emailToTry !== undefined ? emailToTry : visitorEmail;
      const res = pwToTry !== undefined || emailForCall
        ? await fetch(`/api/delivery-public?action=verify-password`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token, password: pwToTry, email: emailForCall || undefined }),
          })
        : await fetch(`/api/delivery-public?action=get&token=${encodeURIComponent(token)}`);
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
      setFiles(data.files || []);
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

  const isLocked = delivery?.status === "submitted" || delivery?.status === "working" || delivery?.status === "delivered";
  const isWorking = delivery?.status === "working" || delivery?.status === "delivered";
  const proofingEnabled = (delivery?.selectionLimit ?? 0) > 0;
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

  async function downloadAll() {
    if (files.length === 0) return;
    setZipping(true);
    try {
      // Lazy-load JSZip from CDN — no bundle bloat for clients who don't use this
      if (!window.JSZip) {
        await new Promise<void>((resolve, reject) => {
          const s = document.createElement("script");
          s.src = "https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js";
          s.onload = () => resolve();
          s.onerror = () => reject(new Error("Failed to load ZIP library"));
          document.head.appendChild(s);
        });
      }
      const JSZipCtor = (window.JSZip as unknown as { new(): { file: (n: string, b: Blob) => void; generateAsync: (o: { type: "blob" }) => Promise<Blob> } });
      const zip = new JSZipCtor();
      // Fetch files in parallel batches of 4 to avoid hammering R2
      const batchSize = 4;
      for (let i = 0; i < files.length; i += batchSize) {
        const batch = files.slice(i, i + batchSize);
        await Promise.all(batch.map(async (f) => {
          const r = await fetch(f.url);
          if (!r.ok) throw new Error(`Failed to fetch ${f.originalName}`);
          const blob = await r.blob();
          zip.file(f.originalName, blob);
        }));
      }
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(delivery?.title || "gallery").replace(/[^\w-]+/g, "_")}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error("Download failed", { description: err instanceof Error ? err.message : "Try again" });
    } finally {
      setZipping(false);
    }
  }

  const lightboxFile = lightboxIdx !== null ? files[lightboxIdx] : null;

  // Cover image: explicit pick first, otherwise first uploaded photo.
  const coverFile = files.find((f) => f.id === delivery?.coverFileId) || files[0] || null;
  const coverUrl = coverFile?.url || "";

  async function downloadOne(f: FileItem) {
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
  const layoutHasHero = cover !== "minimal" && coverUrl;

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
        />
      ) : (
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
            <button onClick={downloadAll} disabled={zipping} title="Download all" className="p-2 hover:bg-slate-100 rounded-full text-slate-600 hover:text-black disabled:opacity-50">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            </button>
            <button onClick={shareGallery} title="Share" className="p-2 hover:bg-slate-100 rounded-full text-slate-600 hover:text-black">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
            </button>
          </div>
        </div>
      </header>

      {/* Status / state banners */}
      {(isWorking || delivery.status === "submitted" || delivery.status === "delivered" || (proofingEnabled && delivery.status === "sent")) && (
        <div className="max-w-[1600px] mx-auto px-6 sm:px-10 py-4">
          {isWorking && <p className="text-emerald-700 text-xs sm:text-sm uppercase tracking-widest">Your selections are being edited.</p>}
          {delivery.status === "submitted" && <p className="text-blue-700 text-xs sm:text-sm uppercase tracking-widest">Submitted ✓ · We'll be in touch.</p>}
          {delivery.status === "delivered" && <p className="text-slate-500 text-xs sm:text-sm uppercase tracking-widest">Final files delivered.</p>}
          {proofingEnabled && delivery.status === "sent" && (
            <p className="text-amber-900 text-xs sm:text-sm">
              <strong>Pick your {delivery.selectionLimit} favorite{delivery.selectionLimit === 1 ? "" : "s"} for editing.</strong>
              {hasPerPhoto && <> Need more? <strong>{money(perExtraCents)}</strong> per extra photo.</>}
              {hasFlat && <> {hasPerPhoto ? "Or " : "Or "}<strong>{money(flatCents)}</strong> to unlock all picks.</>}
            </p>
          )}
          {delivery.status === "submitted" && !isWorking && (
            <button onClick={requestChange} className="text-xs text-blue-700 underline mt-2">Request a change</button>
          )}
        </div>
      )}

      {/* PHOTO GRID — flush, full-bleed, no gaps */}
      <div
        className="relative grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-px bg-slate-200"
        onContextMenu={(e) => { if (delivery.watermarkText) e.preventDefault(); }}
      >
        {/* Tiled watermark overlay (CSS only — doesn't modify the underlying images) */}
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
          return (
            <div
              key={f.id}
              className="relative group cursor-pointer aspect-square overflow-hidden bg-white"
              onClick={() => setLightboxIdx(i)}
            >
              <img
                src={f.url}
                alt={f.originalName}
                loading="lazy"
                className="w-full h-full object-cover"
              />
              {/* Hover gradient for icon legibility */}
              <div className="absolute inset-0 bg-gradient-to-b from-black/0 via-transparent to-black/40 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />

              {/* Hover icons — bottom-right cluster */}
              <div className="absolute bottom-3 right-3 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {delivery.printsEnabled && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setPrintFor(f); }}
                    className="w-8 h-8 rounded-full bg-white/90 hover:bg-white text-slate-700 hover:text-black flex items-center justify-center shadow-md"
                    title="Order print"
                    aria-label="Order print"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
                  </button>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); downloadOne(f); }}
                  className="w-8 h-8 rounded-full bg-white/90 hover:bg-white text-slate-700 hover:text-black flex items-center justify-center shadow-md"
                  title="Download"
                  aria-label="Download"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); shareGallery(); }}
                  className="w-8 h-8 rounded-full bg-white/90 hover:bg-white text-slate-700 hover:text-black flex items-center justify-center shadow-md"
                  title="Share"
                  aria-label="Share"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
                </button>
              </div>

              {/* Heart (proofing) — top-right, always semi-visible if picked */}
              {proofingEnabled && (
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
          );
        })}
      </div>

        {/* Sticky proofing footer */}
        {proofingEnabled && delivery.status === "sent" && picked.size > 0 && (
          <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 p-4 shadow-lg z-30">
            <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
              <div className="text-sm">
                <strong>{picked.size}</strong> of <strong>{delivery.selectionLimit}</strong> picked
                {overage > 0 && (
                  <span className="ml-2 text-amber-700">
                    · {overage} extra {hasPerPhoto && `(${money(overagePerPhotoTotal)})`}
                  </span>
                )}
              </div>
              <button
                onClick={startSubmit}
                className="bg-black text-white px-5 py-2.5 rounded-lg font-semibold text-sm"
              >
                Submit selections →
              </button>
            </div>
          </div>
        )}

        {/* First-visit walkthrough */}
        {walkthroughStep !== null && (() => {
          const steps = [
            { title: "Welcome", body: `Take a look through ${delivery.title}. Click any photo to view full-size.` },
            ...(proofingEnabled ? [{ title: "Pick favorites", body: `Tap the ♡ heart on photos you'd like edited. You can pick up to ${delivery.selectionLimit} for free.` }] : []),
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
        {lightboxFile && (
          <div
            className="fixed inset-0 bg-black/95 z-40 flex items-center justify-center p-4"
            onClick={() => { setLightboxIdx(null); setSlideshowPlaying(false); }}
          >
            <img src={lightboxFile.url} alt={lightboxFile.originalName} className="max-w-full max-h-full object-contain" />
            <button
              onClick={(e) => { e.stopPropagation(); setLightboxIdx(null); setSlideshowPlaying(false); }}
              className="absolute top-4 right-4 text-white/80 text-3xl hover:text-white"
              aria-label="Close"
            >
              ×
            </button>
            {/* Slideshow play/pause toggle — top-left */}
            <button
              onClick={(e) => { e.stopPropagation(); setSlideshowPlaying(p => !p); }}
              className="absolute top-4 left-4 text-white/70 hover:text-white px-3 py-2 text-xs uppercase tracking-widest"
              aria-label={slideshowPlaying ? "Pause slideshow" : "Play slideshow"}
            >
              {slideshowPlaying ? "❚❚ Pause" : "▶ Slideshow"}
            </button>
            {proofingEnabled && !isLocked && (
              <button
                onClick={(e) => { e.stopPropagation(); togglePick(lightboxFile.id); }}
                className={`absolute bottom-8 left-1/2 -translate-x-1/2 px-6 py-3 rounded-full font-semibold ${
                  picked.has(lightboxFile.id) ? "bg-red-500 text-white" : "bg-white text-black"
                }`}
              >
                {picked.has(lightboxFile.id) ? "♥ Picked" : "♡ Pick this one"}
              </button>
            )}
            {lightboxIdx !== null && lightboxIdx > 0 && (
              <button
                onClick={(e) => { e.stopPropagation(); setLightboxIdx(lightboxIdx - 1); }}
                className="absolute left-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white text-4xl px-3 py-2"
                aria-label="Previous"
              >‹</button>
            )}
            {lightboxIdx !== null && lightboxIdx < files.length - 1 && (
              <button
                onClick={(e) => { e.stopPropagation(); setLightboxIdx(lightboxIdx + 1); }}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white text-4xl px-3 py-2"
                aria-label="Next"
              >›</button>
            )}
          </div>
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

function CoverHero({ layout, imageUrl, title, subtitle, date, fontValue }: {
  layout: CoverLayout;
  imageUrl: string;
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
      <img src={imageUrl} alt="" className="absolute inset-0 w-full h-full object-cover" loading="eager" />
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
