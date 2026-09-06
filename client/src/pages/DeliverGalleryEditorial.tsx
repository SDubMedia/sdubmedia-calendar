// ============================================================
// The editorial presentation of the public gallery — the "Apple keynote"
// look Geoff signed off on 2026-09-06 (prototype: one typeface, one quiet
// accent, hairline borders, generous air, sections that reveal on scroll).
//
// Presentation only. DeliverGalleryPage still owns every piece of state and
// behaviour — picks, downloads, gates, lightbox, prints — and hands this
// file callbacks. Real estate galleries never come here; the server marks
// them "listing" and the page keeps its stripped-down layout for them.
// ============================================================

import { Fragment, useEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import { buildChapters, type Row } from "@/lib/editorialRows";
import { formatRuntime, formatBytes } from "@/lib/galleryCopy";

export interface EdFile {
  id: string;
  originalName: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  url: string;
  downloadUrl?: string;
  isProof?: boolean;
  mediaType?: "image" | "video";
  durationSeconds?: number | null;
  thumbnailUrl?: string;
  folderId?: string | null;
}

export interface EdFolder { id: string; name: string; position: number }

export const ED_FONT = '-apple-system, "SF Pro Display", "SF Pro Text", "Helvetica Neue", Helvetica, Arial, sans-serif';
const INK = "#1d1d1f";
const MUTE = "#86868b";
const ACCENT = "#0066cc";
const EASE = "cubic-bezier(.2,.6,.2,1)";
const WRAP: CSSProperties = { width: "min(1100px, calc(100% - 48px))" };
const SECTION_PAD = "clamp(96px, 14vh, 160px)";

/** Keyframes only. Reveal-on-scroll is React state (see Reveal), because a
 *  class toggled from outside React gets wiped the next time React writes
 *  className — a tile would vanish the moment its selection ring changed. */
export function EditorialStyles() {
  return (
    <style>{`
      @keyframes ed-drift { to { transform: scale(1); } }
      @keyframes ed-bob { 0%,100% { transform: translate(-50%, 0) } 50% { transform: translate(-50%, 8px) } }
      @keyframes ed-fadein { from { opacity: 0; transform: translateY(14px) } to { opacity: 1; transform: none } }
      .ed-fade { animation: ed-fadein 1.4s ease-out both } .ed-fade-2 { animation-delay: .25s } .ed-fade-3 { animation-delay: .5s }
      .ed-hero-img { transform: scale(1.08); animation: ed-drift 26s ease-out forwards; will-change: transform; }
      .ed-cue { animation: ed-bob 2.4s ease-in-out infinite; }
      .ed-ph img { transform: scale(1.02); transition: transform 1.2s ${EASE}, opacity .8s; }
      .ed-ph:hover img { transform: scale(1); }
      @media (prefers-reduced-motion: reduce) {
        .ed-hero-img, .ed-cue, .ed-fade { animation: none; transform: none; }
      }
    `}</style>
  );
}

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** True once the element has scrolled into view (and stays true). */
function useInView<T extends Element>() {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined" || reducedMotion()) { setInView(true); return; }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setInView(true); io.disconnect(); } }, { rootMargin: "0px 0px -10% 0px", threshold: 0.08 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return { ref, inView };
}

function revealStyle(inView: boolean, delay = 0): CSSProperties {
  return {
    opacity: inView ? 1 : 0,
    transform: inView ? "none" : "translateY(28px)",
    transition: `opacity .9s ${EASE} ${delay}s, transform .9s ${EASE} ${delay}s`,
  };
}

function Reveal({ children, delay = 0, className = "", style }: { children: ReactNode; delay?: number; className?: string; style?: CSSProperties }) {
  const { ref, inView } = useInView<HTMLDivElement>();
  return <div ref={ref} className={className} style={{ ...style, ...revealStyle(inView, delay) }}>{children}</div>;
}

const Eyebrow = ({ children, dark }: { children: ReactNode; dark?: boolean }) => (
  <Reveal><div className="text-[17px] font-semibold" style={{ color: dark ? "#a1a1a6" : MUTE, letterSpacing: "-.01em" }}>{children}</div></Reveal>
);
const Headline = ({ children, dark, className = "" }: { children: ReactNode; dark?: boolean; className?: string }) => (
  <Reveal delay={0.1} className={className}>
    <h2 className="font-semibold m-0" style={{ fontSize: "clamp(32px, 4.5vw, 56px)", lineHeight: 1.08, letterSpacing: "-.02em", color: dark ? "#fff" : INK }}>{children}</h2>
  </Reveal>
);
const Quiet = ({ children, onClick, href, dark, disabled }: { children: ReactNode; onClick?: () => void; href?: string; dark?: boolean; disabled?: boolean }) => {
  const cls = `inline-flex items-center gap-2 px-[22px] py-3 rounded-full text-[15px] font-medium transition-colors border disabled:opacity-40 ${dark ? "border-white/30 text-white hover:bg-white/10" : "border-black/15 text-[#1d1d1f] hover:bg-black/[0.04] hover:border-black/30"}`;
  return href
    ? <a href={href} target="_blank" rel="noopener" className={cls}>{children}</a>
    : <button type="button" onClick={onClick} disabled={disabled} className={cls}>{children}</button>;
};
const DownloadIcon = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 4v12m0 0l-5-5m5 5l5-5M4 20h16"/></svg>;

// ---------------------------------------------------------------
// Hero
// ---------------------------------------------------------------
export function EditorialHero({ heroRef, imageUrl, presenter, title, subtitle, previewing }: {
  heroRef: RefObject<HTMLElement | null>;
  imageUrl: string;
  presenter: string;
  title: string;
  subtitle: string;
  previewing?: boolean;
}) {
  return (
    <section ref={heroRef} className="relative overflow-hidden bg-black" style={{ height: "100svh", minHeight: 560 }}>
      {imageUrl && <img src={imageUrl} alt="" className="ed-hero-img absolute inset-0 w-full h-full object-cover" />}
      <div className="absolute inset-0" style={{ background: "linear-gradient(to bottom, rgba(0,0,0,.15) 0%, rgba(0,0,0,0) 35%, rgba(0,0,0,.55) 100%)" }} />
      <div className="absolute left-0 right-0 text-center text-white px-6" style={{ bottom: "clamp(56px, 10vh, 120px)" }}>
        {presenter && <div className="ed-fade text-[12px] font-medium uppercase mb-[18px]" style={{ letterSpacing: ".14em", color: "rgba(255,255,255,.72)" }}>{presenter}</div>}
        <h1 className="ed-fade ed-fade-2 m-0 font-semibold" style={{ fontSize: "clamp(40px, 7vw, 80px)", lineHeight: 1.05, letterSpacing: "-.02em", textShadow: "0 2px 30px rgba(0,0,0,.25)" }}>{title}</h1>
        {subtitle && <div className="ed-fade ed-fade-3 mt-[18px] text-[17px]" style={{ color: "rgba(255,255,255,.8)", letterSpacing: "-.01em" }}>{subtitle}</div>}
      </div>
      <div className="ed-cue absolute left-1/2 bottom-[22px]" style={{ color: "rgba(255,255,255,.7)" }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M6 9l6 6 6-6"/></svg>
      </div>
      {previewing && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 max-w-[92vw] px-4 py-2 rounded-full text-[12px] text-center" style={{ background: "rgba(0,0,0,.55)", color: "rgba(255,255,255,.85)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)" }}>
          You're previewing the finished files as the team. The client still sees proofs until you press Deliver.
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------
// Frosted nav — appears once the hero has scrolled away
// ---------------------------------------------------------------
export function EditorialNav({ heroRef, title, orgName, onSlideshow, onDownload, onShare }: {
  heroRef: RefObject<HTMLElement | null>;
  title: string;
  orgName?: string;
  onSlideshow?: () => void;
  onDownload?: () => void;
  onShare: () => void;
}) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const el = heroRef.current;
    if (!el || typeof IntersectionObserver === "undefined") { setShow(true); return; }
    const io = new IntersectionObserver(([e]) => setShow(!e.isIntersecting), { threshold: 0.05 });
    io.observe(el);
    return () => io.disconnect();
  }, [heroRef]);
  return (
    <div
      className="fixed top-0 left-0 right-0 z-40 h-[52px] flex items-center justify-between px-6 border-b transition-transform duration-500"
      style={{
        background: "rgba(255,255,255,.72)", backdropFilter: "saturate(180%) blur(20px)", WebkitBackdropFilter: "saturate(180%) blur(20px)",
        borderColor: "rgba(0,0,0,.12)", transform: show ? "none" : "translateY(-100%)", transitionTimingFunction: EASE,
      }}
    >
      <div className="min-w-0 text-[14px] font-semibold truncate" style={{ color: INK, letterSpacing: "-.01em" }}>
        {title}{orgName && <span className="font-normal" style={{ color: MUTE }}> · {orgName}</span>}
      </div>
      <div className="flex items-center gap-5 shrink-0 text-[13px]" style={{ color: ACCENT }}>
        {onSlideshow && <button type="button" onClick={onSlideshow} className="hover:underline">Slideshow</button>}
        {onDownload && <button type="button" onClick={onDownload} className="hover:underline">Download</button>}
        <button type="button" onClick={onShare} className="hover:underline">Share</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------
// Statement + note
// ---------------------------------------------------------------
export function EditorialIntro({ eyebrow, headline, children, signature, action }: {
  eyebrow: string;
  headline: string;
  children?: ReactNode;
  signature?: string;
  action?: ReactNode;
}) {
  return (
    <section className="text-center" style={{ padding: `${SECTION_PAD} 0` }}>
      <div className="mx-auto" style={WRAP}>
        <Eyebrow>{eyebrow}</Eyebrow>
        <Headline className="mt-5">{headline}</Headline>
        {children && (
          <Reveal delay={0.2} className="mx-auto mt-9" style={{ fontSize: "clamp(20px, 2.4vw, 28px)", lineHeight: 1.35, letterSpacing: "-.015em", maxWidth: "28em", color: INK }}>
            {children}
          </Reveal>
        )}
        {signature && <Reveal delay={0.3} className="mt-7 text-[17px]" style={{ color: MUTE }}>— <b className="font-semibold" style={{ color: INK }}>{signature}</b></Reveal>}
        {action && <Reveal delay={0.3} className="mt-6">{action}</Reveal>}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------
// Films — a dark stage, the largest first, verticals centred
// ---------------------------------------------------------------
function FilmPoster({ f, vertical, onDownload }: { f: EdFile; vertical: boolean; onDownload?: (f: EdFile) => void }) {
  const [playing, setPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const play = () => { const v = videoRef.current; if (!v) return; setPlaying(true); v.controls = true; v.play().catch(() => setPlaying(false)); };
  const label = (f.width ?? 0) >= 3840 ? "4K" : (f.height ?? 0) >= 1080 || (f.width ?? 0) >= 1080 ? "HD" : "";
  return (
    <div className="relative rounded-[18px] overflow-hidden" style={{ background: "#111", boxShadow: "0 40px 120px rgba(0,0,0,.5)", width: vertical ? "min(100%, calc(72vh * 9 / 16))" : "100%" }}>
      <video
        ref={videoRef}
        preload="none"
        playsInline
        poster={f.thumbnailUrl || undefined}
        src={f.url}
        className="block w-full h-auto object-cover"
        style={{ aspectRatio: vertical ? "9 / 16" : "16 / 9" }}
        onPause={() => { const v = videoRef.current; if (v && (v.currentTime === 0 || v.ended)) setPlaying(false); }}
      />
      {!playing && (
        <div className="absolute inset-0 grid place-items-center cursor-pointer" style={{ background: "linear-gradient(to top, rgba(0,0,0,.35), rgba(0,0,0,0) 45%)" }} onClick={play}>
          <div className="w-[84px] h-[84px] rounded-full grid place-items-center transition-transform hover:scale-105" style={{ background: "rgba(255,255,255,.92)", boxShadow: "0 10px 40px rgba(0,0,0,.35)" }}>
            <svg width="30" height="30" viewBox="0 0 24 24" fill="#111" style={{ marginLeft: 5 }}><path d="M8 5v14l11-7z"/></svg>
          </div>
        </div>
      )}
      {!playing && (
        <div className="absolute left-[22px] bottom-[18px] flex items-center gap-[14px] text-[14px] text-white" style={{ opacity: .85 }}>
          <span>{f.originalName.replace(/\.[^.]+$/, "")}</span>
          {f.durationSeconds ? <span>{formatRuntime(f.durationSeconds)}</span> : null}
          {label && <span>{label}</span>}
          {onDownload && f.downloadUrl && (
            <button type="button" onClick={(e) => { e.stopPropagation(); onDownload(f); }} className="inline-flex items-center gap-1 hover:underline" aria-label={`Download ${f.originalName}`}>
              <DownloadIcon /> Save
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function EditorialFilms({ films, onDownload }: { films: EdFile[]; onDownload?: (f: EdFile) => void }) {
  if (films.length === 0) return null;
  const ordered = [...films].sort((a, b) => ((b.width ?? 0) * (b.height ?? 0)) - ((a.width ?? 0) * (a.height ?? 0)));
  return (
    <section className="bg-black" style={{ padding: `${SECTION_PAD} 0`, color: "#f5f5f7" }}>
      <div className="mx-auto" style={WRAP}>
        <Eyebrow dark>{films.length === 1 ? "The film" : "The films"}</Eyebrow>
        <Headline dark className="mt-5">Press play. Sound on.</Headline>
        <div className="flex flex-col gap-16 mt-14">
          {ordered.map((f, i) => {
            const vertical = (f.height ?? 0) > (f.width ?? 0);
            return (
              <Reveal key={f.id} className={vertical ? "flex flex-col md:flex-row items-center justify-center gap-7 md:gap-16" : ""}>
                <FilmPoster f={f} vertical={vertical} onDownload={onDownload} />
                {vertical && (
                  <p className="m-0 text-[19px] max-w-[22em]" style={{ color: "#a1a1a6", lineHeight: 1.45, letterSpacing: "-.01em" }}>
                    {i === 0 ? "Made for your phone and your feed." : "The vertical cut, made for your phone and your feed."}
                  </p>
                )}
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------
// Photos — editorial rhythm, chapters from folders, all the page's
// per-tile behaviour handed in as callbacks
// ---------------------------------------------------------------
export interface TileBehaviour {
  onOpen: (index: number) => void;
  selecting: boolean;
  isDlPicked: (id: string) => boolean;
  onToggleDlPick: (id: string) => void;
  proofing: { enabled: boolean; locked: boolean; isPicked: (id: string) => boolean; onPick: (id: string) => void };
  isPaid: (id: string) => boolean;
  prints: { enabled: boolean; onPrint: (f: EdFile) => void };
  canDownload: (f: EdFile) => boolean;
  onDownload: (f: EdFile) => void;
  onShare: () => void;
}

function Tile({ f, index, kind, b }: { f: EdFile; index: number; kind: Row<EdFile>["kind"]; b: TileBehaviour }) {
  const { ref, inView } = useInView<HTMLDivElement>();
  const imgRef = useRef<HTMLImageElement>(null);
  const [loaded, setLoaded] = useState(false);
  // A cached image can finish before onLoad is attached; check on mount.
  useEffect(() => { if (imgRef.current?.complete && imgRef.current.naturalWidth > 0) setLoaded(true); }, []);
  const ratio = kind === "statement" ? "16 / 10" : (f.height ?? 0) > (f.width ?? 0) ? "2 / 3" : "3 / 2";
  const picked = b.proofing.enabled && b.proofing.isPicked(f.id);
  const dlPicked = b.selecting && b.isDlPicked(f.id);
  return (
    <div
      ref={ref}
      className={`ed-ph group relative overflow-hidden rounded-[14px] cursor-zoom-in ${dlPicked ? "ring-4 ring-inset ring-black" : ""}`}
      style={{ aspectRatio: ratio, background: "#f5f5f7", ...revealStyle(inView) }}
      onClick={() => (b.selecting ? b.onToggleDlPick(f.id) : b.onOpen(index))}
    >
      <img ref={imgRef} src={f.url} alt={f.originalName} loading="lazy" onLoad={() => setLoaded(true)} className="w-full h-full object-cover" style={{ opacity: loaded ? 1 : 0 }} />
      {b.selecting && (
        <div className={`absolute top-3 left-3 z-20 w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs font-bold ${dlPicked ? "bg-black text-white border-black" : "bg-white/85 border-black/30 text-transparent"}`}>✓</div>
      )}
      {/* Hover-only actions on pointer devices; the lightbox carries them on touch. */}
      <div className="absolute inset-0 pointer-events-none opacity-0 [@media(hover:hover)]:group-hover:opacity-100 transition-opacity" style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0), rgba(0,0,0,.35))" }} />
      <div className="absolute bottom-3 right-3 flex items-center gap-1.5 opacity-0 [@media(hover:hover)]:group-hover:opacity-100 transition-opacity">
        {b.prints.enabled && (
          <button type="button" onClick={(e) => { e.stopPropagation(); b.prints.onPrint(f); }} className="w-8 h-8 rounded-full bg-white/90 hover:bg-white text-[#1d1d1f] flex items-center justify-center" title="Order print" aria-label="Order print">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
          </button>
        )}
        {b.canDownload(f) && (
          <button type="button" onClick={(e) => { e.stopPropagation(); b.onDownload(f); }} className="w-8 h-8 rounded-full bg-white/90 hover:bg-white text-[#1d1d1f] flex items-center justify-center" title="Download" aria-label="Download"><DownloadIcon /></button>
        )}
        <button type="button" onClick={(e) => { e.stopPropagation(); b.onShare(); }} className="w-8 h-8 rounded-full bg-white/90 hover:bg-white text-[#1d1d1f] flex items-center justify-center" title="Share" aria-label="Share">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
        </button>
      </div>
      {/* Heart — quiet by default, solid ink when picked. Always visible
          while she's choosing: half these galleries open on a phone. */}
      {b.proofing.enabled && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); b.proofing.onPick(f.id); }}
          disabled={b.proofing.locked}
          aria-label={picked ? "Unpick" : "Pick"}
          className={`absolute top-3 right-3 w-9 h-9 rounded-full flex items-center justify-center text-[18px] transition-all ${picked ? "bg-[#1d1d1f] text-white" : "bg-white/85 text-[#1d1d1f] hover:bg-white"} ${b.proofing.locked ? "cursor-default" : ""}`}
          style={{ backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }}
        >
          {picked ? "♥" : "♡"}
        </button>
      )}
      {b.isPaid(f.id) && (
        <div className="absolute top-3 left-3 bg-white/90 text-[#1d1d1f] text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full">Paid</div>
      )}
    </div>
  );
}

export function EditorialPhotos({ photos, indexOf, folders, heading, count, watermark, behaviour }: {
  photos: EdFile[];
  /** Index of a file in the page's lightbox order. */
  indexOf: (f: EdFile) => number;
  folders: EdFolder[];
  heading: string;
  count: string;
  watermark: { text: string | null; useLogo: boolean; logoUrl?: string };
  behaviour: TileBehaviour;
}) {
  if (photos.length === 0) return null;
  const chapters = buildChapters(photos, folders);
  const gap = "clamp(16px, 2.4vw, 32px)";
  const rowStyle = (kind: Row<EdFile>["kind"]): CSSProperties => ({
    display: "grid", gap,
    gridTemplateColumns: kind === "two" ? "1fr 1fr" : kind === "three" ? "1fr 1fr 1fr" : kind === "wide" ? "2fr 1fr" : "1fr",
  });
  return (
    <section style={{ padding: `0 0 ${SECTION_PAD}` }}>
      <div className="mx-auto" style={WRAP}>
        <div style={{ height: SECTION_PAD }} />
        <Reveal className="flex items-baseline justify-between gap-6 mb-8">
          <h2 className="font-semibold m-0" style={{ fontSize: "clamp(32px, 4.5vw, 56px)", lineHeight: 1.08, letterSpacing: "-.02em", color: INK }}>{heading}</h2>
          <span className="text-[12px] font-medium uppercase shrink-0" style={{ letterSpacing: ".14em", color: MUTE }}>{count}</span>
        </Reveal>
        <div
          className="relative"
          onContextMenu={(e) => { if (watermark.text || (watermark.useLogo && watermark.logoUrl)) e.preventDefault(); }}
        >
          {watermark.useLogo && watermark.logoUrl && (
            <div aria-hidden className="pointer-events-none absolute inset-0 z-10 select-none" style={{ backgroundImage: `url("${watermark.logoUrl}")`, backgroundRepeat: "repeat", backgroundSize: "180px", opacity: 0.18 }} />
          )}
          {watermark.text && (
            <div aria-hidden className="pointer-events-none absolute inset-0 z-10 select-none" style={{
              backgroundImage: `url("data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='400' height='400'><text x='50%' y='50%' fill='rgba(255,255,255,0.18)' font-family='Helvetica' font-size='22' text-anchor='middle' transform='rotate(-30 200 200)'>${watermark.text}</text></svg>`)}")`,
              backgroundRepeat: "repeat", mixBlendMode: "difference",
            }} />
          )}
          <div className="grid" style={{ gap }}>
            {chapters.map((ch, ci) => (
              <Fragment key={ch.folderId ?? `unfoldered-${ci}`}>
                {ch.name && (
                  <Reveal style={{ paddingTop: ci === 0 ? 0 : "clamp(48px, 7vh, 96px)" }}>
                    <div className="text-[12px] font-medium uppercase mb-2" style={{ letterSpacing: ".14em", color: MUTE }}>Chapter</div>
                    <h3 className="m-0 font-semibold" style={{ fontSize: "clamp(24px, 3vw, 36px)", letterSpacing: "-.02em", lineHeight: 1.1, color: INK }}>{ch.name}</h3>
                  </Reveal>
                )}
                {ch.rows.map((row, ri) => (
                  <div
                    key={`${ci}-${ri}`}
                    style={row.kind === "portrait" ? { display: "grid", gridTemplateColumns: "minmax(0, 62%)", justifyContent: "center" } : rowStyle(row.kind)}
                    className={row.kind === "two" || row.kind === "three" || row.kind === "wide" ? "max-[720px]:!grid-cols-1" : ""}
                  >
                    {row.items.map(f => <Tile key={f.id} f={f} index={indexOf(f)} kind={row.kind} b={behaviour} />)}
                  </div>
                ))}
              </Fragment>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------
// Yours to keep
// ---------------------------------------------------------------
export function EditorialKeep({ photoCount, filmCount, maxW, maxH, totalBytes, zipping, selecting, onDownloadAll, onToggleSelect }: {
  photoCount: number; filmCount: number; maxW: number; maxH: number; totalBytes: number;
  zipping: boolean; selecting: boolean; onDownloadAll: () => void; onToggleSelect: () => void;
}) {
  const total = photoCount + filmCount;
  return (
    <section id="keep" className="text-center" style={{ background: "#f5f5f7", padding: `${SECTION_PAD} 0` }}>
      <div className="mx-auto" style={WRAP}>
        <Eyebrow>Yours to keep</Eyebrow>
        <Reveal delay={0.1} className="mt-4"><p className="m-0 font-semibold" style={{ fontSize: "clamp(88px, 14vw, 160px)", lineHeight: 1, letterSpacing: "-.04em", color: INK }}>{total}</p></Reveal>
        <Headline className="mt-4">{filmCount > 0 ? "Every photograph. Every film." : "Every photograph."}</Headline>
        <Reveal delay={0.2} className="mx-auto mt-4" style={{ fontSize: "clamp(19px, 2vw, 24px)", lineHeight: 1.4, letterSpacing: "-.01em", maxWidth: "34em", color: INK }}>
          Download everything at once, or pick out a few.
        </Reveal>
        <Reveal delay={0.3} className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <Quiet onClick={onDownloadAll} disabled={zipping || selecting}>{zipping ? "Preparing…" : "Download everything"} <DownloadIcon /></Quiet>
          <Quiet onClick={onToggleSelect} disabled={zipping}>{selecting ? "Cancel" : "Select photos"}</Quiet>
        </Reveal>
        <Reveal delay={0.3} className="flex flex-wrap justify-center gap-x-9 gap-y-3 mt-7 text-[15px]" style={{ color: MUTE }}>
          <span><b className="font-semibold" style={{ color: INK }}>{photoCount}</b> photograph{photoCount === 1 ? "" : "s"}</span>
          {filmCount > 0 && <span><b className="font-semibold" style={{ color: INK }}>{filmCount}</b> film{filmCount === 1 ? "" : "s"}</span>}
          {maxW > 0 && maxH > 0 && <span>Up to <b className="font-semibold" style={{ color: INK }}>{maxW} × {maxH}</b></span>}
          {totalBytes > 0 && <span><b className="font-semibold" style={{ color: INK }}>{formatBytes(totalBytes)}</b> in total</span>}
        </Reveal>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------
// Closing
// ---------------------------------------------------------------
export function EditorialClosing({ firstName, orgName, website }: { firstName?: string; orgName: string; website?: string }) {
  const initials = orgName.split(/\s+/).map(w => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
  const link = website && /^https?:\/\//i.test(website) ? website : website ? `https://${website}` : "";
  return (
    <section className="bg-black text-center" style={{ padding: `${SECTION_PAD} 0 80px`, color: "#f5f5f7" }}>
      <div className="mx-auto" style={WRAP}>
        <Reveal className="mx-auto mb-7 w-10"><div className="w-10 h-10 rounded-full grid place-items-center text-[11px]" style={{ border: "1.5px solid rgba(255,255,255,.5)", letterSpacing: ".1em" }}>{initials}</div></Reveal>
        <Headline dark>Thank you{firstName ? `, ${firstName}` : ""}.</Headline>
        <Reveal delay={0.2} className="mx-auto mt-3 text-[19px] max-w-[30em]" style={{ color: "#a1a1a6", lineHeight: 1.45 }}>
          It was a pleasure. When you're ready for the next one, we'd love to do it again.
        </Reveal>
        {link && <Reveal delay={0.3} className="mt-8"><Quiet dark href={link}>Book another session</Quiet></Reveal>}
        <p className="mt-14 mb-0 text-[12px]" style={{ color: MUTE }}>{orgName} · Powered by Slate</p>
      </div>
    </section>
  );
}
