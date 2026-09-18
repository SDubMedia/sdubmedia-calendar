// ============================================================
// PhotoPicker — browse every gallery in Slate and pick one photo.
// Thumbnails come from the same signed URLs the gallery page uses.
// ============================================================

import { useEffect, useMemo, useState } from "react";
import { Check, ImageIcon } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useScopedData as useApp } from "@/hooks/useScopedData";
import type { PhotoRef } from "@/lib/flyer";
import { signedUrlsFor } from "@/lib/signedUrls";

export default function PhotoPicker({ open, onClose, onPick, title = "Choose a photo" }: { open: boolean; onClose: () => void; onPick: (ref: PhotoRef) => void; title?: string }) {
  const { data } = useApp();
  const [search, setSearch] = useState("");
  const [deliveryId, setDeliveryId] = useState<string>("");
  const [urls, setUrls] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const galleries = useMemo(() => {
    const q = search.trim().toLowerCase();
    return data.deliveries
      .filter(d => data.deliveryFiles.some(f => f.deliveryId === d.id && f.mediaType === "image"))
      .filter(d => !q || `${d.title} ${d.clientName || ""}`.toLowerCase().includes(q))
      .slice()
      .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
  }, [data.deliveries, data.deliveryFiles, search]);

  useEffect(() => {
    if (open && !deliveryId && galleries[0]) setDeliveryId(galleries[0].id);
  }, [open, deliveryId, galleries]);

  const files = useMemo(() =>
    data.deliveryFiles.filter(f => f.deliveryId === deliveryId && f.mediaType === "image").slice().sort((a, b) => a.position - b.position),
  [data.deliveryFiles, deliveryId]);

  useEffect(() => {
    if (!open || !deliveryId) return;
    let cancelled = false;
    setLoading(true); setError(""); setUrls(new Map());
    signedUrlsFor(deliveryId).then(m => { if (!cancelled) setUrls(m); })
      .catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : "Couldn't load photos"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, deliveryId]);

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-5xl w-[96vw] h-[86vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-4 py-3 border-b border-border">
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-1 min-h-0">
          <aside className="w-64 shrink-0 border-r border-border flex flex-col min-h-0">
            <div className="p-2 border-b border-border">
              <Input placeholder="Search galleries…" value={search} onChange={e => setSearch(e.target.value)} className="h-8 text-sm" />
            </div>
            <div className="flex-1 overflow-y-auto">
              {galleries.length === 0 && <p className="p-3 text-xs text-muted-foreground">No galleries with photos yet.</p>}
              {galleries.map(g => (
                <button key={g.id} onClick={() => setDeliveryId(g.id)}
                  className={`w-full text-left px-3 py-2 text-sm border-b border-border/50 ${g.id === deliveryId ? "bg-primary/15 text-foreground" : "text-muted-foreground hover:bg-secondary"}`}>
                  <div className="truncate">{g.title || "Untitled gallery"}</div>
                  {g.clientName && <div className="text-[11px] truncate opacity-70">{g.clientName}</div>}
                </button>
              ))}
            </div>
          </aside>
          <div className="flex-1 min-w-0 overflow-y-auto p-3">
            {error && <p className="text-sm text-destructive mb-2">{error}</p>}
            {loading && files.length > 0 && <p className="text-xs text-muted-foreground mb-2">Loading thumbnails…</p>}
            {files.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-2">
                <ImageIcon className="w-8 h-8 opacity-40" /><p className="text-sm">No photos in this gallery.</p>
              </div>
            ) : (
              <div className="grid gap-2 grid-cols-[repeat(auto-fill,minmax(140px,1fr))]">
                {files.map(f => {
                  const url = urls.get(f.id);
                  return (
                    <button key={f.id} onClick={() => url && onPick({ fileId: f.id, deliveryId })} disabled={!url}
                      className="group relative aspect-square rounded-md overflow-hidden bg-secondary border border-border hover:border-primary focus:outline-none focus:ring-2 focus:ring-primary">
                      {url ? <img src={url} alt={f.originalName} loading="lazy" className="w-full h-full object-cover" /> : <div className="w-full h-full animate-pulse bg-secondary" />}
                      <span className="absolute bottom-1 left-1 text-[10px] px-1.5 py-0.5 rounded bg-black/60 text-white">{f.stage === "final" ? "Final" : "Proof"}</span>
                      <span className="absolute inset-0 hidden group-hover:flex items-center justify-center bg-primary/30"><Check className="w-6 h-6 text-white" /></span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
