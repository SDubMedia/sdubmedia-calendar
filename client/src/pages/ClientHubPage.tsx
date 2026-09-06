// ============================================================
// /hub/:token — a client's hub: every delivered gallery on their projects,
// newest first, plus the finished films and photographs merged for instant
// reference. Public, token-addressed, editorial presentation. Data and
// rules: api/hub-public.ts + api/_clientHub.ts.
// ============================================================

import { useEffect, useRef, useState } from "react";
import { useRoute } from "wouter";
import { toast } from "sonner";
import {
  EditorialStyles, EditorialHero, EditorialNav, EditorialIntro, EditorialFilms, EditorialPhotos, EditorialClosing,
  ED_FONT, type EdFile,
} from "./DeliverGalleryEditorial";
import { countWord } from "@/lib/galleryCopy";

interface HubInfo { clientName: string; firstName: string; tone: "personal" | "business"; presenter: string; website: string }
interface HubGallery { id: string; title: string; url: string; deliveredAt: string | null; coverDate: string | null; coverUrl: string; photoCount: number; filmCount: number; gated: boolean }
interface HubFile extends EdFile { galleryId: string; galleryTitle: string }

const INK = "#1d1d1f";
const MUTE = "#86868b";

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

/** A minimal viewer for the merged photographs: full file, crossfade,
 *  arrows, keyboard, download. Keeps to the editorial lightbox's manners. */
function HubLightbox({ photos, index, onIndex, onClose }: { photos: HubFile[]; index: number; onIndex: (i: number) => void; onClose: () => void }) {
  const f = photos[index];
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { setLoaded(false); }, [f?.id]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && index > 0) onIndex(index - 1);
      if (e.key === "ArrowRight" && index < photos.length - 1) onIndex(index + 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, photos.length, onIndex, onClose]);
  useEffect(() => { document.body.style.overflow = "hidden"; return () => { document.body.style.overflow = ""; }; }, []);
  if (!f) return null;
  return (
    <div className="fixed inset-0 bg-black z-50 flex items-center justify-center select-none" onClick={onClose}>
      <img src={f.url} alt={f.originalName} onLoad={() => setLoaded(true)} draggable={false} className="max-w-[100vw] max-h-[100vh] object-contain" style={{ opacity: loaded ? 1 : 0, transition: "opacity 350ms ease" }} onClick={(e) => e.stopPropagation()} />
      <div className="absolute top-0 inset-x-0 flex items-center justify-between p-4 text-white/60" onClick={(e) => e.stopPropagation()}>
        <span className="text-[12px] uppercase truncate max-w-[50vw]" style={{ letterSpacing: ".14em" }}>{f.galleryTitle}</span>
        <p className="text-[11px] text-white/50" style={{ letterSpacing: ".14em" }}>{index + 1} / {photos.length}</p>
        <div className="flex items-center gap-1">
          {f.downloadUrl && <a href={f.downloadUrl} className="p-2 hover:text-white" title="Download" aria-label="Download"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></a>}
          <button onClick={onClose} className="p-2 text-3xl leading-none hover:text-white" aria-label="Close">×</button>
        </div>
      </div>
      {index > 0 && <button onClick={(e) => { e.stopPropagation(); onIndex(index - 1); }} className="absolute left-2 top-1/2 -translate-y-1/2 text-white/45 hover:text-white px-4 py-6" aria-label="Previous"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 6l-6 6 6 6"/></svg></button>}
      {index < photos.length - 1 && <button onClick={(e) => { e.stopPropagation(); onIndex(index + 1); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-white/45 hover:text-white px-4 py-6" aria-label="Next"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6"/></svg></button>}
    </div>
  );
}

function GalleryCards({ galleries }: { galleries: HubGallery[] }) {
  return (
    <section style={{ padding: "0 0 clamp(96px, 14vh, 160px)" }}>
      <div className="mx-auto" style={{ width: "min(1100px, calc(100% - 48px))" }}>
        <div className="grid gap-6" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 320px), 1fr))" }}>
          {galleries.map(g => (
            <a key={g.id} href={g.url} className="group block rounded-[14px] overflow-hidden" style={{ background: "#f5f5f7", color: INK }}>
              <div className="relative overflow-hidden" style={{ aspectRatio: "3 / 2", background: "#e8e8ed" }}>
                {g.coverUrl && <img src={g.coverUrl} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover transition-transform duration-[1200ms]" style={{ transform: "scale(1.02)" }} onMouseEnter={(e) => { e.currentTarget.style.transform = "scale(1)"; }} onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1.02)"; }} />}
                {g.gated && <span className="absolute top-3 right-3 text-[10px] uppercase px-2 py-1 rounded-full bg-white/85" style={{ letterSpacing: ".12em", color: INK }}>Private</span>}
              </div>
              <div className="px-5 py-4">
                <div className="text-[19px] font-semibold" style={{ letterSpacing: "-.015em", lineHeight: 1.2 }}>{g.title}</div>
                <div className="mt-1 text-[14px]" style={{ color: MUTE }}>
                  {[fmtDate(g.deliveredAt), [g.filmCount ? `${g.filmCount} film${g.filmCount === 1 ? "" : "s"}` : "", g.photoCount ? `${g.photoCount} photograph${g.photoCount === 1 ? "" : "s"}` : ""].filter(Boolean).join(" · ")].filter(Boolean).join(" · ")}
                </div>
              </div>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}

export default function ClientHubPage() {
  const [, params] = useRoute("/hub/:token");
  const token = params?.token || "";
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hub, setHub] = useState<HubInfo | null>(null);
  const [galleries, setGalleries] = useState<HubGallery[]>([]);
  const [films, setFilms] = useState<HubFile[]>([]);
  const [photos, setPhotos] = useState<HubFile[]>([]);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const heroRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/hub-public?token=${encodeURIComponent(token)}`);
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) { setError(data.error || "This link isn't working"); return; }
        setHub(data.hub); setGalleries(data.galleries || []); setFilms(data.films || []); setPhotos(data.photos || []);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  // Signed links last an hour; a tab left open past that would show
  // filenames instead of photos. Quiet refresh at 45 minutes.
  useEffect(() => {
    if (!token) return;
    const t = setInterval(async () => {
      try {
        const res = await fetch(`/api/hub-public?token=${encodeURIComponent(token)}`);
        const data = await res.json();
        if (res.ok) { setGalleries(data.galleries || []); setFilms(data.films || []); setPhotos(data.photos || []); }
      } catch (err) { console.warn("Hub refresh failed", err); }
    }, 45 * 60 * 1000);
    return () => clearInterval(t);
  }, [token]);

  const share = async () => {
    try { await navigator.clipboard.writeText(window.location.href); toast.success("Link copied"); }
    catch { toast.message(window.location.href); }
  };

  if (loading) return <div className="min-h-screen bg-white flex items-center justify-center" style={{ fontFamily: ED_FONT, color: MUTE }}>Loading…</div>;
  if (error || !hub) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-6 text-center" style={{ fontFamily: ED_FONT, color: INK }}>
        <div><h1 className="text-2xl font-semibold m-0 mb-2" style={{ fontFamily: "inherit" }}>Hub unavailable</h1><p className="m-0" style={{ color: MUTE }}>{error || "Not found"}</p></div>
      </div>
    );
  }

  const business = hub.tone === "business";
  const filmTotal = galleries.reduce((n, g) => n + g.filmCount, 0);
  const photoTotal = galleries.reduce((n, g) => n + g.photoCount, 0);
  const headline = galleries.length === 0
    ? "Nothing delivered yet."
    : `${countWord(galleries.length)} galler${galleries.length === 1 ? "y" : "ies"}.`;
  const heroImage = galleries.find(g => g.coverUrl)?.coverUrl || films.find(f => f.thumbnailUrl)?.thumbnailUrl || "";
  const photoIndex = new Map(photos.map((p, i) => [p.id, i] as const));

  return (
    <div className="min-h-screen bg-white" style={{ fontFamily: ED_FONT, color: INK }}>
      <EditorialStyles />
      <EditorialHero
        heroRef={heroRef}
        imageUrl={heroImage}
        presenter={hub.presenter ? `${hub.presenter} presents` : ""}
        title={hub.clientName}
        subtitle={galleries.length ? "Everything we've made together" : ""}
      />
      <EditorialNav heroRef={heroRef} title={hub.clientName} orgName={hub.presenter} onShare={share} />
      <EditorialIntro
        eyebrow="Your hub"
        headline={headline}
        signature={hub.presenter || undefined}
      >
        <p className="m-0">
          {galleries.length === 0
            ? "Galleries appear here the moment they're delivered."
            : `Every gallery we've delivered, newest first${filmTotal || photoTotal ? ` — ${[filmTotal ? `${filmTotal} film${filmTotal === 1 ? "" : "s"}` : "", photoTotal ? `${photoTotal} photograph${photoTotal === 1 ? "" : "s"}` : ""].filter(Boolean).join(" and ")} in all` : ""}. ${business ? "Bookmark this page; it stays current." : "This page stays current, so keep the link."}`}
        </p>
      </EditorialIntro>
      <GalleryCards galleries={galleries} />
      {films.length > 0 && (
        <EditorialFilms
          films={films}
          onDownload={(f) => { if (f.downloadUrl) window.location.assign(f.downloadUrl); }}
        />
      )}
      {photos.length > 0 && (
        <EditorialPhotos
          photos={photos}
          indexOf={(f) => photoIndex.get(f.id) ?? 0}
          folders={[]}
          heading="The photographs."
          count={`${photos.length} photograph${photos.length === 1 ? "" : "s"} across ${countWord(new Set(photos.map(p => p.galleryId)).size).toLowerCase()} galler${new Set(photos.map(p => p.galleryId)).size === 1 ? "y" : "ies"}`}
          watermark={{ text: null, useLogo: false }}
          behaviour={{
            onOpen: (i) => setLightbox(i),
            selecting: false,
            isDlPicked: () => false,
            onToggleDlPick: () => {},
            proofing: { enabled: false, locked: true, isPicked: () => false, onPick: () => {} },
            isPaid: () => false,
            prints: { enabled: false, onPrint: () => {} },
            canDownload: (f) => !!f.downloadUrl,
            onDownload: (f) => { if (f.downloadUrl) window.location.assign(f.downloadUrl); },
            onShare: share,
          }}
        />
      )}
      <EditorialClosing firstName={hub.firstName} orgName={hub.presenter || "Slate"} website={hub.website} business={business} />
      {lightbox !== null && <HubLightbox photos={photos} index={lightbox} onIndex={setLightbox} onClose={() => setLightbox(null)} />}
    </div>
  );
}
