// ============================================================
// CreativePage — flyers (owner only)
//
// Pick photos from any gallery, drop them on a template, put one of the
// dynamic QR codes on it, download a print-ready PDF or PNG. The preview is
// the same canvas drawing as the export, so what you see is what prints.
// /creative lists flyers; /creative/:id edits one.
//
// Design: Dark Cinematic Studio
// ============================================================

import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { Plus, Trash2, ArrowLeft, Save, Download, FileText, ImagePlus, X, Palette, ExternalLink } from "lucide-react";
import { nanoid } from "nanoid";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useAuth } from "@/contexts/AuthContext";
import { useScopedData as useApp } from "@/hooks/useScopedData";
import { supabase } from "@/lib/supabase";
import { publicUrl } from "@/lib/publicUrl";
import { qrPath } from "@/lib/qr";
import { dataUrlToBlob, downloadBlob, type QrBrand } from "@/lib/qrRender";
import { defaultFlyerContent, ensureFlyerFonts, flyerPdf, hasTaintedPhotos, loadDataImage, loadPhoto, renderFlyer, FLYER_DESIGNS, FLYER_SIZES, MAX_SMALL_PHOTOS, type FlyerAssets, type FlyerContent, type FlyerDesign, type FlyerSize, type PhotoRef } from "@/lib/flyer";
import PhotoPicker from "@/components/PhotoPicker";
import { signedUrlsFor } from "@/lib/signedUrls";
import { toast } from "sonner";

interface Flyer { id: string; name: string; template: string; content: FlyerContent; createdAt: string; updatedAt: string }
interface QrOption { id: string; name: string; code: string; kind: string }

function rowToFlyer(r: any): Flyer {
  return { id: r.id, name: r.name || "", template: r.template in FLYER_SIZES ? r.template : "letter", content: { ...defaultFlyerContent(), ...(r.content || {}) }, createdAt: r.created_at || "", updatedAt: r.updated_at || "" };
}

/** Tiny sketch of each layout for the design strip. */
function DesignGlyph({ design, active }: { design: FlyerDesign; active: boolean }) {
  const s = active ? "fill-primary" : "fill-muted-foreground/60";
  const b = active ? "stroke-primary" : "stroke-muted-foreground/60";
  return (
    <svg width="22" height="28" viewBox="0 0 22 28" className="shrink-0" aria-hidden>
      <rect x="0.5" y="0.5" width="21" height="27" rx="1.5" className={`fill-transparent ${b}`} />
      {design === "fullbleed" && <><rect x="1" y="1" width="20" height="26" className={s} opacity="0.35" /><rect x="3" y="15" width="12" height="2" className={s} /><rect x="3" y="18" width="9" height="1.5" className={s} /><rect x="3" y="21" width="4" height="4" className="fill-white" /></>}
      {design === "colorblock" && <><rect x="1" y="1" width="20" height="14" className={s} opacity="0.5" /><rect x="1" y="15" width="20" height="12" className={s} /><rect x="9" y="21" width="4" height="4" className="fill-white" /></>}
      {design === "editorial" && <><rect x="7" y="3" width="8" height="1.5" className={s} /><rect x="3" y="6" width="16" height="10" className={s} opacity="0.5" /><rect x="3" y="18" width="10" height="2" className={s} /><rect x="3" y="21" width="7" height="1.5" className={s} /><rect x="15" y="21" width="4" height="4" className={s} /></>}
    </svg>
  );
}

const fileStem = (name: string) => `flyer-${name.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "untitled"}`;

export default function CreativePage() {
  const [, params] = useRoute("/creative/:id");
  return params?.id ? <FlyerEditor id={params.id} /> : <FlyerList />;
}

// ---------------------------------------------------------------------------
function FlyerList() {
  const [, setLocation] = useLocation();
  const { profile } = useAuth();
  const [flyers, setFlyers] = useState<Flyer[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<Flyer | null>(null);

  useEffect(() => {
    let cancelled = false;
    supabase.from("flyers").select("*").order("updated_at", { ascending: false }).then(({ data, error }) => {
      if (cancelled) return;
      if (error) toast.error(`Couldn't load flyers: ${error.message}`);
      setFlyers((data || []).map(rowToFlyer)); setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  const create = async () => {
    const id = nanoid(10);
    const { error } = await supabase.from("flyers").insert({ id, org_id: profile?.orgId || "", name: "New flyer", template: "letter", content: defaultFlyerContent() });
    if (error) { toast.error(error.message); return; }
    setLocation(`/creative/${id}`);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const { error } = await supabase.from("flyers").delete().eq("id", deleteTarget.id);
    if (error) { toast.error(error.message); return; }
    setFlyers(fs => fs.filter(f => f.id !== deleteTarget.id)); setDeleteTarget(null);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-b border-border bg-card/50">
        <div>
          <h1 className="text-xl font-semibold text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Creative</h1>
          <p className="text-sm text-muted-foreground">Flyers built from your gallery photos, with a QR code that you can re-point later.</p>
        </div>
        <Button onClick={create} className="bg-primary text-primary-foreground hover:bg-primary/90 gap-2"><Plus className="w-4 h-4" /> New Flyer</Button>
      </div>
      <div className="flex-1 overflow-auto p-6">
        {loading ? <p className="text-sm text-muted-foreground">Loading…</p> : flyers.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-muted-foreground gap-3">
            <Palette className="w-10 h-10 opacity-40" />
            <p className="text-sm">No flyers yet. Start one for a venue.</p>
            <Button onClick={create} variant="outline" className="gap-2"><Plus className="w-4 h-4" /> New Flyer</Button>
          </div>
        ) : (
          <div className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(220px,1fr))]">
            {flyers.map(f => (
              <div key={f.id} className="rounded-lg border border-border bg-card p-3 flex flex-col gap-2 min-w-0">
                <button onClick={() => setLocation(`/creative/${f.id}`)} className="text-left min-w-0">
                  <div className="rounded-md bg-secondary" style={{ aspectRatio: `${FLYER_SIZES[f.template as FlyerSize]?.w || 8.5} / ${FLYER_SIZES[f.template as FlyerSize]?.h || 11}` }}><div className="h-full border border-border flex items-end p-3 overflow-hidden">
                    <span className="text-xs font-semibold text-foreground line-clamp-3 uppercase" style={{ fontFamily: "'Playfair Display', serif", fontSize: 15, lineHeight: 1.15 }}>{f.content.headline}</span>
                  </div></div>
                  <h3 className="font-medium text-foreground truncate mt-2">{f.name}</h3>
                  <p className="text-[11px] text-muted-foreground">Updated {new Date(f.updatedAt).toLocaleDateString()}</p>
                </button>
                <div className="flex gap-1.5">
                  <Button size="sm" variant="outline" className="flex-1" onClick={() => setLocation(`/creative/${f.id}`)}>Open</Button>
                  <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setDeleteTarget(f)}><Trash2 className="w-3.5 h-3.5" /></Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <AlertDialog open={!!deleteTarget} onOpenChange={o => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete this flyer?</AlertDialogTitle><AlertDialogDescription>Anything you've already printed is unaffected. The QR code on it keeps working.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Keep it</AlertDialogCancel><AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
function FlyerEditor({ id }: { id: string }) {
  const [, setLocation] = useLocation();
  const { data } = useApp();
  const org = data.organization;
  const [flyer, setFlyer] = useState<Flyer | null>(null);
  const [name, setName] = useState("");
  const [content, setContent] = useState<FlyerContent>(defaultFlyerContent());
  const [size, setSize] = useState<FlyerSize>("letter");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [qrOptions, setQrOptions] = useState<QrOption[]>([]);
  const [picker, setPicker] = useState<"hero" | "small" | null>(null);
  const images = useRef(new Map<string, HTMLImageElement>());
  const thumbs = useRef(new Map<string, string>());
  const [, bump] = useState(0);
  const wordmark = useRef<HTMLImageElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderSeq = useRef(0);

  const brand = useMemo<QrBrand>(() => ({ mark: org?.faviconUrl || org?.logoUrl || undefined, wordmark: org?.logoUrl || undefined, name: org?.name || "" }), [org]);
  const contact = useMemo(() => ({ name: org?.name || "", phone: org?.businessInfo?.phone || "", email: org?.businessInfo?.email || "", website: (org?.businessInfo?.website || "").replace(/^https?:\/\//, "") }), [org]);

  // Load the flyer + the QR codes to choose from + the wordmark once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [{ data: row, error }, { data: qrs }] = await Promise.all([
        supabase.from("flyers").select("*").eq("id", id).maybeSingle(),
        supabase.from("qr_codes").select("id, name, code, kind").order("created_at", { ascending: false }),
      ]);
      if (cancelled) return;
      if (error || !row) { toast.error(error?.message || "Flyer not found"); setLocation("/creative"); return; }
      const f = rowToFlyer(row); setFlyer(f); setName(f.name); setContent(f.content); setSize(f.template as FlyerSize);
      setQrOptions((qrs || []) as QrOption[]);
      await ensureFlyerFonts();
      wordmark.current = await loadDataImage(org?.logoUrl || "");
      if (!cancelled) bump(n => n + 1);
    })();
    return () => { cancelled = true; };
  }, [id, setLocation, org?.logoUrl]);

  // Make sure every photo on the flyer is loaded (full size, CORS-clean) and has a thumbnail.
  const refs = useMemo(() => [content.hero, ...content.photos].filter((p): p is PhotoRef => !!p), [content.hero, content.photos]);
  useEffect(() => {
    let cancelled = false;
    const missing = refs.filter(r => !images.current.has(r.fileId));
    if (missing.length === 0) return;
    const byDelivery = new Map<string, string[]>();
    for (const r of missing) (byDelivery.get(r.deliveryId) || byDelivery.set(r.deliveryId, []).get(r.deliveryId)!).push(r.fileId);
    (async () => {
      for (const [deliveryId, fileIds] of byDelivery) {
        try {
          const urls = await signedUrlsFor(deliveryId, fileIds);
          await Promise.all(fileIds.map(async fid => {
            const url = urls.get(fid); if (!url) return;
            thumbs.current.set(fid, url);
            try { images.current.set(fid, await loadPhoto(url)); } catch (err) { console.error("[flyer] photo", err); toast.error("A photo couldn't be loaded for the preview"); }
          }));
        } catch (err) { toast.error(err instanceof Error ? err.message : "Couldn't load photos"); }
        if (!cancelled) bump(n => n + 1);
      }
    })();
    return () => { cancelled = true; };
  }, [refs]);

  // Draw the preview whenever anything changes.
  const qr = qrOptions.find(q => q.id === content.qrCodeId) || null;
  const assets = useMemo<FlyerAssets>(() => ({ images: images.current, qrUrl: qr ? publicUrl(qrPath(qr.code)) : null, brand, wordmark: wordmark.current, contact, size }), [qr, brand, contact, size]);
  useEffect(() => {
    const c = canvasRef.current; if (!c || !flyer) return;
    const seq = ++renderSeq.current;
    renderFlyer(c, content, assets, 2200 / Math.max(FLYER_SIZES[size].w, FLYER_SIZES[size].h)).catch(err => { if (seq === renderSeq.current) console.error("[flyer] render", err); });
  });

  const update = (patch: Partial<FlyerContent>) => { setContent(c => ({ ...c, ...patch })); setDirty(true); };

  const save = async () => {
    if (!flyer) return;
    setSaving(true);
    const { error } = await supabase.from("flyers").update({ name: name.trim() || "Untitled flyer", template: size, content, updated_at: new Date().toISOString() }).eq("id", flyer.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    setDirty(false); toast.success("Saved");
  };

  const exportAs = async (kind: "png" | "pdf") => {
    if (hasTaintedPhotos(images.current)) {
      toast.error("This site isn't allowed to read the photos for export. Preview works here; download from the live site.");
      return;
    }
    setExporting(true);
    try {
      const full = document.createElement("canvas");
      await renderFlyer(full, content, assets, 1);
      const png = full.toDataURL("image/png");
      if (kind === "png") downloadBlob(`${fileStem(name)}.png`, dataUrlToBlob(png));
      else downloadBlob(`${fileStem(name)}-${size}.pdf`, new Blob([(await flyerPdf(png, size)) as BlobPart], { type: "application/pdf" }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't export");
    } finally { setExporting(false); }
  };

  const onPick = (ref: PhotoRef) => {
    if (picker === "hero") update({ hero: ref });
    else if (picker === "small") update({ photos: [...content.photos, ref].slice(0, MAX_SMALL_PHOTOS) });
    setPicker(null);
  };

  if (!flyer) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;

  const Thumb = ({ r, onRemove }: { r: PhotoRef; onRemove: () => void }) => (
    <div className="relative w-20 h-20 rounded-md overflow-hidden bg-secondary border border-border shrink-0">
      {thumbs.current.get(r.fileId) ? <img src={thumbs.current.get(r.fileId)} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full animate-pulse" />}
      <button onClick={onRemove} className="absolute top-0.5 right-0.5 rounded-full bg-black/70 text-white p-0.5" title="Remove"><X className="w-3 h-3" /></button>
    </div>
  );

  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-3 border-b border-border bg-card/50">
        <div className="flex items-center gap-2 min-w-0">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/creative")} title="Back to flyers"><ArrowLeft className="w-4 h-4" /></Button>
          <Input value={name} onChange={e => { setName(e.target.value); setDirty(true); }} className="h-9 w-56 font-medium" placeholder="Flyer name (e.g. Drakewood)" />
          {dirty && <span className="text-xs text-amber-400">Unsaved</span>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" className="gap-2" disabled={exporting} onClick={() => exportAs("png")}><Download className="w-4 h-4" /> PNG</Button>
          <Button variant="outline" className="gap-2" disabled={exporting} onClick={() => exportAs("pdf")}><FileText className="w-4 h-4" /> PDF</Button>
          <Button onClick={save} disabled={saving || !dirty} className="bg-primary text-primary-foreground hover:bg-primary/90 gap-2"><Save className="w-4 h-4" /> {saving ? "Saving…" : "Save"}</Button>
        </div>
      </div>

      <div className="flex-1 min-h-0 grid lg:grid-cols-[400px_1fr]">
        {/* Controls */}
        <div className="overflow-y-auto border-b lg:border-b-0 lg:border-r border-border p-4 space-y-5">
          <section className="space-y-2">
            <Label>Size</Label>
            <Select value={size} onValueChange={v => { setSize(v as FlyerSize); setDirty(true); }}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{(Object.keys(FLYER_SIZES) as FlyerSize[]).map(k => <SelectItem key={k} value={k}>{FLYER_SIZES[k].label}</SelectItem>)}</SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Venue vendor racks hold 4×9 cards. 5×7 for open-house tables. Letter for boards. Half page, wide prints two to a sheet.</p>
          </section>

          <section className="space-y-2">
            <Label>Design</Label>
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(FLYER_DESIGNS) as FlyerDesign[]).map(d => (
                <button key={d} type="button" onClick={() => update({ design: d })} title={FLYER_DESIGNS[d].blurb}
                  className={`flex flex-col items-center gap-1.5 rounded-md border px-2 py-2 text-xs ${content.design === d ? "border-primary bg-primary/15 text-foreground" : "border-border bg-card text-muted-foreground hover:border-primary/40"}`}>
                  <DesignGlyph design={d} active={content.design === d} />
                  {FLYER_DESIGNS[d].label}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">{FLYER_DESIGNS[content.design]?.blurb}</p>
          </section>

          <section className="space-y-2">
            <Label>Hero photo</Label>
            <div className="flex items-center gap-2">
              {content.hero && <Thumb r={content.hero} onRemove={() => update({ hero: null })} />}
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setPicker("hero")}><ImagePlus className="w-4 h-4" /> {content.hero ? "Change" : "Choose from galleries"}</Button>
            </div>
            <p className="text-xs text-muted-foreground">The big one across the top. A couple, horizontal if you have it.</p>
          </section>

          <section className="space-y-2">
            <Label>Small photos <span className="text-muted-foreground font-normal">(up to {MAX_SMALL_PHOTOS})</span></Label>
            <div className="flex flex-wrap items-center gap-2">
              {content.photos.map((p, i) => <Thumb key={`${p.fileId}-${i}`} r={p} onRemove={() => update({ photos: content.photos.filter((_, j) => j !== i) })} />)}
              {content.photos.length < MAX_SMALL_PHOTOS && <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setPicker("small")}><ImagePlus className="w-4 h-4" /> Add</Button>}
            </div>
          </section>

          <section className="space-y-2">
            <Label htmlFor="fl-proof">Trust line <span className="text-muted-foreground font-normal">(small tag above the headline)</span></Label>
            <Input id="fl-proof" value={content.proofLine} placeholder="Drakewood Farm Preferred Videographer" onChange={e => update({ proofLine: e.target.value })} />
            <Label htmlFor="fl-head">Headline</Label>
            <Input id="fl-head" value={content.headline} onChange={e => update({ headline: e.target.value })} />
            <Label htmlFor="fl-sub">Under the headline</Label>
            <Input id="fl-sub" value={content.subheadline} onChange={e => update({ subheadline: e.target.value })} />
          </section>

          <section className="space-y-2">
            <Label htmlFor="fl-body">Body</Label>
            <Textarea id="fl-body" rows={6} value={content.body} onChange={e => update({ body: e.target.value })} />
            <p className="text-xs text-muted-foreground">Keep it short. Anything that doesn't fit above the QR band is cut off.</p>
          </section>

          <section className="space-y-2">
            <Label>QR code</Label>
            <Select value={content.qrCodeId || "none"} onValueChange={v => update({ qrCodeId: v === "none" ? null : v })}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Pick a QR code" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None yet</SelectItem>
                {qrOptions.map(q => <SelectItem key={q.id} value={q.id}>{q.name} <span className="text-muted-foreground">· /q/{q.code}{q.kind === "contact" ? " · contact card" : ""}</span></SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Make one per venue in <a href="/qr-codes" className="text-primary hover:underline inline-flex items-center gap-1">QR Codes <ExternalLink className="w-3 h-3" /></a>, so you can see which flyer gets scanned and re-point it later.</p>
            <Label>QR color</Label>
            <Select value={content.qrColor} onValueChange={v => update({ qrColor: v as FlyerContent["qrColor"] })}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="black">Black (scans best)</SelectItem>
                <SelectItem value="blue">Brand blue</SelectItem>
                <SelectItem value="accent">Match the accent color</SelectItem>
              </SelectContent>
            </Select>
            <Label htmlFor="fl-cta">Beside the code</Label>
            <Input id="fl-cta" value={content.cta} onChange={e => update({ cta: e.target.value })} />
          </section>

          <section className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="fl-contact">Show phone, email and website</Label>
              <Switch id="fl-contact" checked={content.showContact} onCheckedChange={v => update({ showContact: v })} />
            </div>
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="fl-short">Print the link under the QR</Label>
              <Switch id="fl-short" checked={content.showShortLink} onCheckedChange={v => update({ showShortLink: v })} />
            </div>
            <Label htmlFor="fl-accent">Accent color</Label>
            <div className="flex items-center gap-2">
              <input id="fl-accent" type="color" value={content.accent} onChange={e => update({ accent: e.target.value })} className="h-9 w-12 rounded border border-border bg-transparent" />
              <span className="text-xs font-mono text-muted-foreground">{content.accent}</span>
            </div>
          </section>
        </div>

        {/* Preview */}
        <div className="overflow-auto bg-black/30 p-4 flex items-start justify-center">
          <canvas ref={canvasRef} className="max-w-full h-auto shadow-2xl rounded-sm bg-white" style={{ width: FLYER_SIZES[size].w > FLYER_SIZES[size].h ? 1000 : Math.round(780 * FLYER_SIZES[size].w / FLYER_SIZES[size].h), aspectRatio: `${FLYER_SIZES[size].w} / ${FLYER_SIZES[size].h}` }} />
        </div>
      </div>

      <PhotoPicker open={!!picker} onClose={() => setPicker(null)} onPick={onPick} title={picker === "hero" ? "Choose the hero photo" : "Add a photo"} />
    </div>
  );
}
