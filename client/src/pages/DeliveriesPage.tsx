// Slate-side galleries management. Two views, switched by URL:
//   /deliveries        — list of galleries + "New gallery"
//   /deliveries/:id    — detail: upload, file grid, selections panel, status controls
//
// Most CRUD goes through AppContext. R2 upload + password set + R2 cleanup
// go through API endpoints (signed URL for upload, server-side hashing).

import { useEffect, useMemo, useRef, useState } from "react";
import { useRoute, Link } from "wouter";
import { useApp } from "@/contexts/AppContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import type { Client, DeliveryStatus, Project } from "@/lib/types";
import { ArrowLeft, Plus, Upload, Copy, Trash2, Eye, Lock, ExternalLink, Check, X } from "lucide-react";

const PUBLIC_BASE = typeof window !== "undefined" ? window.location.origin : "https://slate.sdubmedia.com";

function money(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function statusLabel(s: DeliveryStatus): string {
  switch (s) {
    case "draft": return "Draft";
    case "sent": return "Sent";
    case "submitted": return "Submitted";
    case "working": return "In progress";
    case "delivered": return "Delivered";
  }
}

function statusColor(s: DeliveryStatus): string {
  switch (s) {
    case "draft": return "bg-zinc-500/15 text-zinc-300 border-zinc-500/30";
    case "sent": return "bg-sky-500/15 text-sky-300 border-sky-500/30";
    case "submitted": return "bg-amber-500/15 text-amber-300 border-amber-500/30";
    case "working": return "bg-blue-500/15 text-blue-300 border-blue-500/30";
    case "delivered": return "bg-emerald-500/15 text-emerald-300 border-emerald-500/30";
  }
}

export default function DeliveriesPage() {
  const [, params] = useRoute("/deliveries/:id");
  const id = params?.id;
  if (id) return <DeliveryDetail id={id} />;
  return <DeliveriesList />;
}

function DeliveriesList() {
  const { data, addDelivery } = useApp();
  const [createOpen, setCreateOpen] = useState(false);

  const galleries = data.deliveries;

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: "'Space Grotesk', system-ui" }}>Galleries</h1>
          <p className="text-sm text-slate-400">Photo delivery + client proofing.</p>
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-[#0088ff] text-white rounded-lg font-semibold text-sm hover:bg-[#0066dd]"
        >
          <Plus className="w-4 h-4" /> New gallery
        </button>
      </div>

      {galleries.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-12 text-center">
          <p className="text-slate-300 mb-2">No galleries yet.</p>
          <p className="text-sm text-slate-500 mb-6">Send a gallery for client proofing or just photo delivery.</p>
          <button
            onClick={() => setCreateOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-[#0088ff] text-white rounded-lg font-semibold text-sm hover:bg-[#0066dd]"
          >
            <Plus className="w-4 h-4" /> Create your first gallery
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {galleries.map((d) => {
            const fileCount = data.deliveryFiles.filter(f => f.deliveryId === d.id).length;
            const pickCount = data.deliverySelections.filter(s => s.deliveryId === d.id).length;
            const project = data.projects.find(p => p.id === d.projectId);
            return (
              <Link key={d.id} href={`/deliveries/${d.id}`}>
                <a className="block rounded-xl border border-white/10 bg-white/[0.02] hover:border-[#0088ff]/30 hover:bg-white/[0.04] transition-colors p-5">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <h3 className="text-base font-semibold text-white truncate">{d.title || "Untitled"}</h3>
                    <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider border ${statusColor(d.status)}`}>{statusLabel(d.status)}</span>
                  </div>
                  {project && <p className="text-xs text-slate-500 mb-2">{projectLabel(project, data.clients)}</p>}
                  <div className="flex items-center gap-4 text-xs text-slate-400">
                    <span>{fileCount} photo{fileCount === 1 ? "" : "s"}</span>
                    {d.selectionLimit > 0 && <span>{pickCount} pick{pickCount === 1 ? "" : "s"}</span>}
                    {d.hasPassword && <span className="inline-flex items-center gap-1"><Lock className="w-3 h-3" /> Locked</span>}
                  </div>
                  {d.clientName && <p className="text-xs text-slate-500 mt-2">Submitted by {d.clientName}</p>}
                </a>
              </Link>
            );
          })}
        </div>
      )}

      {createOpen && (
        <CreateGalleryDialog
          onClose={() => setCreateOpen(false)}
          onCreate={async (g) => {
            try {
              const created = await addDelivery(g);
              setCreateOpen(false);
              window.location.assign(`/deliveries/${created.id}`);
            } catch (err) {
              toast.error("Couldn't create gallery", { description: err instanceof Error ? err.message : "Try again" });
            }
          }}
        />
      )}
    </div>
  );
}

interface CreateInput {
  title: string;
  projectId: string | null;
  selectionLimit: number;
  perExtraPhotoCents: number;
  buyAllFlatCents: number;
  expiresAt: string | null;
  status: DeliveryStatus;
  coverFileId: string | null;
}

function CreateGalleryDialog({ onClose, onCreate }: { onClose: () => void; onCreate: (g: CreateInput) => void }) {
  const { data } = useApp();
  const [title, setTitle] = useState("");
  const [projectId, setProjectId] = useState<string | null>(null);
  // String state so leading zeros don't get stuck (React + type="number" quirk).
  const [selectionLimit, setSelectionLimit] = useState("");
  const [perExtraDollars, setPerExtraDollars] = useState("");
  const [flatDollars, setFlatDollars] = useState("");
  const [expiresAt, setExpiresAt] = useState("");

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[#0a0e17] border border-white/10 rounded-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-xl font-bold mb-4" style={{ fontFamily: "'Space Grotesk', system-ui" }}>New gallery</h2>

        <label className="block text-xs text-slate-500 uppercase tracking-wider mb-1">Title</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Smith Headshots"
          className="w-full bg-white/[0.03] border border-white/10 rounded-lg px-3 py-2 text-sm mb-4 outline-none focus:border-[#0088ff]"
          autoFocus
        />

        <label className="block text-xs text-slate-500 uppercase tracking-wider mb-1">Project (optional)</label>
        <select
          value={projectId || ""}
          onChange={(e) => setProjectId(e.target.value || null)}
          className="w-full bg-white/[0.03] border border-white/10 rounded-lg px-3 py-2 text-sm mb-4 outline-none focus:border-[#0088ff]"
        >
          <option value="">— No project —</option>
          {data.projects.slice(0, 50).map(p => (
            <option key={p.id} value={p.id}>{projectLabel(p, data.clients)}</option>
          ))}
        </select>

        <div className="border-t border-white/10 my-5" />
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Proofing (optional)</p>
        <p className="text-xs text-slate-500 mb-3">Free up to N picks. Charge for extras either per-photo or as a flat unlock-all fee. Set to 0 to disable.</p>

        <div className="grid grid-cols-3 gap-2 mb-4">
          <div>
            <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1">Free picks</label>
            <input type="text" inputMode="numeric" value={selectionLimit} onChange={(e) => setSelectionLimit(e.target.value.replace(/[^\d]/g, ""))} placeholder="0" className="w-full bg-white/[0.03] border border-white/10 rounded-lg px-2 py-2 text-sm outline-none focus:border-[#0088ff]" />
          </div>
          <div>
            <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1">Per extra ($)</label>
            <input type="text" inputMode="decimal" value={perExtraDollars} onChange={(e) => setPerExtraDollars(e.target.value.replace(/[^\d.]/g, ""))} placeholder="0" className="w-full bg-white/[0.03] border border-white/10 rounded-lg px-2 py-2 text-sm outline-none focus:border-[#0088ff]" />
          </div>
          <div>
            <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1">Unlock all ($)</label>
            <input type="text" inputMode="decimal" value={flatDollars} onChange={(e) => setFlatDollars(e.target.value.replace(/[^\d.]/g, ""))} placeholder="0" className="w-full bg-white/[0.03] border border-white/10 rounded-lg px-2 py-2 text-sm outline-none focus:border-[#0088ff]" />
          </div>
        </div>

        <label className="block text-xs text-slate-500 uppercase tracking-wider mb-1">Expiry (optional)</label>
        <input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} className="w-full bg-white/[0.03] border border-white/10 rounded-lg px-3 py-2 text-sm mb-5 outline-none focus:border-[#0088ff]" />

        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 border border-white/10 py-2.5 rounded-lg font-semibold text-sm">Cancel</button>
          <button
            onClick={() => onCreate({
              title: title.trim() || "Untitled gallery",
              projectId,
              selectionLimit: parseInt(selectionLimit, 10) || 0,
              perExtraPhotoCents: Math.round((parseFloat(perExtraDollars) || 0) * 100),
              buyAllFlatCents: Math.round((parseFloat(flatDollars) || 0) * 100),
              expiresAt: expiresAt || null,
              status: "draft",
              coverFileId: null,
            })}
            disabled={!title.trim()}
            className="flex-1 bg-[#0088ff] text-white py-2.5 rounded-lg font-semibold text-sm disabled:opacity-50"
          >Create</button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------
// Detail view
// ---------------------------------------------------------------
function DeliveryDetail({ id }: { id: string }) {
  const { data, updateDelivery, deleteDelivery, setDeliveryStatus, registerDeliveryFile, deleteDeliveryFile, markSelectionEdited } = useApp();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<{ done: number; total: number } | null>(null);
  const [pwOpen, setPwOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [signedUrls, setSignedUrls] = useState<Map<string, string>>(new Map());

  const delivery = data.deliveries.find(d => d.id === id);
  const files = useMemo(
    () => data.deliveryFiles.filter(f => f.deliveryId === id).sort((a, b) => a.position - b.position),
    [data.deliveryFiles, id]
  );
  const selections = useMemo(
    () => data.deliverySelections.filter(s => s.deliveryId === id),
    [data.deliverySelections, id]
  );

  // Fetch signed GET URLs for in-app previews. Re-runs whenever the file
  // count changes (covers both initial load and post-upload). Signed URLs
  // are valid for 1 hour, so re-fetching is cheap and keeps them fresh.
  useEffect(() => {
    if (files.length === 0) {
      setSignedUrls(new Map());
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const sess = await supabase.auth.getSession();
        const accessToken = sess.data.session?.access_token || "";
        const res = await fetch("/api/deliveries", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({ action: "signed-urls", deliveryId: id }),
        });
        const body = await res.json();
        if (!res.ok || !body.urls || cancelled) return;
        const map = new Map<string, string>();
        for (const u of body.urls as { id: string; url: string }[]) map.set(u.id, u.url);
        setSignedUrls(map);
      } catch { /* swallow — placeholder remains */ }
    })();
    return () => { cancelled = true; };
  }, [id, files.length]);

  if (!delivery) {
    return (
      <div className="max-w-3xl mx-auto p-6 text-center">
        <p className="text-slate-400 mb-4">Gallery not found.</p>
        <Link href="/deliveries"><a className="text-[#0088ff]">← Back to galleries</a></Link>
      </div>
    );
  }

  const publicUrl = `${PUBLIC_BASE}/deliver/${delivery.token}`;
  const totalSize = files.reduce((s, f) => s + f.sizeBytes, 0);

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const list = Array.from(fileList);
    setUploading({ done: 0, total: list.length });
    let done = 0;
    for (const file of list) {
      try {
        // Get image dimensions client-side
        const dims = await readImageDims(file).catch(() => ({ width: null, height: null }));

        // 1. Get signed upload URL
        const sess = await supabase.auth.getSession();
        const accessToken = sess.data.session?.access_token || "";
        const uploadRes = await fetch("/api/delivery-upload", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({
            deliveryId: id,
            fileName: file.name,
            contentType: file.type,
            sizeBytes: file.size,
          }),
        });
        const uploadData = await uploadRes.json();
        if (!uploadRes.ok) throw new Error(uploadData.error || "Upload URL failed");

        // 2. PUT to R2
        const putRes = await fetch(uploadData.uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": file.type },
          body: file,
        });
        if (!putRes.ok) throw new Error(`R2 upload failed: ${putRes.status}`);

        // 3. Register file metadata
        await registerDeliveryFile({
          deliveryId: id,
          storagePath: uploadData.storagePath,
          originalName: file.name,
          sizeBytes: file.size,
          width: dims.width,
          height: dims.height,
          mimeType: file.type,
          position: files.length + done,
        });

        done++;
        setUploading({ done, total: list.length });
      } catch (err) {
        toast.error(`Failed: ${file.name}`, { description: err instanceof Error ? err.message : "Try again" });
        done++;
        setUploading({ done, total: list.length });
      }
    }
    setUploading(null);
    toast.success("Upload complete", { description: `${list.length} file${list.length === 1 ? "" : "s"} added.` });
  }

  async function handleDeleteFile(fileId: string) {
    if (!confirm("Delete this photo? This also removes it from the client gallery.")) return;
    try {
      const sess = await supabase.auth.getSession();
      const accessToken = sess.data.session?.access_token || "";
      await fetch("/api/deliveries", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ action: "delete-file", fileId }),
      });
      await deleteDeliveryFile(fileId);
    } catch (err) {
      toast.error("Couldn't delete", { description: err instanceof Error ? err.message : "Try again" });
    }
  }

  async function handleDeleteGallery() {
    if (!delivery) return;
    if (!confirm(`Delete "${delivery.title}"? This removes all photos permanently.`)) return;
    try {
      const sess = await supabase.auth.getSession();
      const accessToken = sess.data.session?.access_token || "";
      await fetch("/api/deliveries", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ action: "delete-delivery", id }),
      });
      await deleteDelivery(id);
      window.location.assign("/deliveries");
    } catch (err) {
      toast.error("Couldn't delete", { description: err instanceof Error ? err.message : "Try again" });
    }
  }

  async function copyLink() {
    await navigator.clipboard.writeText(publicUrl);
    toast.success("Link copied");
  }

  async function setPassword(pw: string) {
    try {
      const sess = await supabase.auth.getSession();
      const accessToken = sess.data.session?.access_token || "";
      const res = await fetch("/api/deliveries", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ action: "set-password", id, password: pw }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed");
      }
      // Reload deliveries to refresh hasPassword (a full refresh isn't ideal, but realtime will pick it up)
      toast.success(pw ? "Password set" : "Password cleared");
    } catch (err) {
      toast.error("Couldn't set password", { description: err instanceof Error ? err.message : "Try again" });
    }
  }

  const proofingEnabled = delivery.selectionLimit > 0;
  const project = data.projects.find(p => p.id === delivery.projectId);

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6">
      <Link href="/deliveries"><a className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-white mb-3"><ArrowLeft className="w-4 h-4" /> All galleries</a></Link>

      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-6">
        <div className="min-w-0">
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold truncate" style={{ fontFamily: "'Space Grotesk', system-ui" }}>{delivery.title}</h1>
            <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider border ${statusColor(delivery.status)}`}>{statusLabel(delivery.status)}</span>
          </div>
          {project && <p className="text-sm text-slate-500">Project: {projectLabel(project, data.clients)}</p>}

        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={copyLink} className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 border border-white/10 rounded-lg hover:bg-white/[0.04]"><Copy className="w-3 h-3" /> Copy link</button>
          <a href={publicUrl} target="_blank" rel="noopener" className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 border border-white/10 rounded-lg hover:bg-white/[0.04]"><ExternalLink className="w-3 h-3" /> Preview</a>
          <button onClick={() => setPwOpen(true)} className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 border border-white/10 rounded-lg hover:bg-white/[0.04]"><Lock className="w-3 h-3" /> {delivery.hasPassword ? "Change password" : "Set password"}</button>
        </div>
      </div>

      {/* Status controls */}
      <div className="flex flex-wrap gap-2 mb-6 text-xs">
        <StatusButton current={delivery.status} target="draft" onClick={() => setDeliveryStatus(id, "draft")} label="Draft" />
        <StatusButton current={delivery.status} target="sent" onClick={() => setDeliveryStatus(id, "sent")} label="Send to client" />
        <StatusButton current={delivery.status} target="working" onClick={() => setDeliveryStatus(id, "working")} label="Mark in-progress" disabled={delivery.status === "draft"} />
        <StatusButton current={delivery.status} target="delivered" onClick={() => setDeliveryStatus(id, "delivered")} label="Mark delivered" />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6 text-sm">
        <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
          <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Photos</div>
          <div className="text-lg font-semibold">{files.length}</div>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
          <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Storage</div>
          <div className="text-lg font-semibold">{(totalSize / 1024 / 1024).toFixed(1)} MB</div>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
          <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Views</div>
          <div className="text-lg font-semibold">{delivery.viewCount}</div>
        </div>
        {proofingEnabled && (
          <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
            <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Picks</div>
            <div className="text-lg font-semibold">{selections.length}</div>
          </div>
        )}
      </div>

      {/* Submitted-by panel */}
      {delivery.submittedAt && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 mb-6">
          <p className="text-sm">
            <strong>{delivery.clientName || "Client"}</strong>
            {delivery.clientEmail && <span className="text-slate-400"> · {delivery.clientEmail}</span>}
            <span className="text-slate-500"> · submitted {new Date(delivery.submittedAt).toLocaleDateString()}</span>
          </p>
          <p className="text-xs text-slate-400 mt-1">{selections.length} pick{selections.length === 1 ? "" : "s"} {selections.some(s => s.isPaid) && "· includes paid extras"}</p>
        </div>
      )}

      {/* Upload zone — drag-drop OR click to browse */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragEnter={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={(e) => { e.preventDefault(); setDragOver(false); }}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const dropped = e.dataTransfer.files;
          if (dropped && dropped.length > 0) handleFiles(dropped);
        }}
        className={`rounded-xl border-2 border-dashed p-6 text-center mb-6 transition-colors ${
          dragOver ? "border-[#0088ff] bg-[#0088ff]/10" : "border-white/10 bg-white/[0.02]"
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*"
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
        <Upload className="w-8 h-8 mx-auto mb-2 text-slate-500" />
        <p className="text-sm text-slate-300 mb-3">
          {dragOver ? "Drop to upload" : "Drag photos here, or click to browse"}
        </p>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={!!uploading}
          className="inline-flex items-center gap-2 px-4 py-2 bg-[#0088ff] text-white rounded-lg font-semibold text-sm hover:bg-[#0066dd] disabled:opacity-50"
        >
          {uploading ? `Uploading ${uploading.done} / ${uploading.total}…` : "Choose files"}
        </button>
      </div>

      {/* File grid */}
      {files.length === 0 ? (
        <p className="text-center text-sm text-slate-500 py-8">No photos yet.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {files.map((f) => {
            const sel = selections.find(s => s.fileId === f.id);
            return (
              <div key={f.id} className="relative group aspect-square bg-white/[0.02] border border-white/10 rounded-lg overflow-hidden">
                {signedUrls.get(f.id) ? (
                  <img src={signedUrls.get(f.id)} alt={f.originalName} className="w-full h-full object-cover" loading="lazy" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-slate-500 text-xs p-2 text-center">
                    {f.originalName}
                  </div>
                )}
                {sel && (
                  <div className="absolute top-2 left-2 flex items-center gap-1">
                    <span className="bg-red-500 text-white text-xs px-1.5 py-0.5 rounded">♥</span>
                    {sel.isPaid && <span className="bg-emerald-500 text-white text-[10px] uppercase font-bold px-1.5 py-0.5 rounded">Paid</span>}
                  </div>
                )}
                {sel && proofingEnabled && (
                  <button
                    onClick={() => markSelectionEdited(sel.id, !sel.editedAt)}
                    className={`absolute top-2 right-2 text-[10px] px-2 py-1 rounded font-semibold ${
                      sel.editedAt ? "bg-emerald-500 text-white" : "bg-white/10 text-white hover:bg-white/20"
                    }`}
                  >
                    {sel.editedAt ? <Check className="w-3 h-3" /> : "Mark edited"}
                  </button>
                )}
                <button
                  onClick={() => handleDeleteFile(f.id)}
                  className="absolute bottom-2 right-2 p-1 bg-black/60 hover:bg-red-500 text-white rounded opacity-0 group-hover:opacity-100"
                  aria-label="Delete"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-10 pt-6 border-t border-white/10 flex justify-end">
        <button onClick={handleDeleteGallery} className="text-sm text-red-400 hover:text-red-300 inline-flex items-center gap-1">
          <Trash2 className="w-4 h-4" /> Delete gallery
        </button>
      </div>

      {pwOpen && <PasswordDialog hasPassword={delivery.hasPassword} onClose={() => setPwOpen(false)} onSave={async (pw) => { await setPassword(pw); setPwOpen(false); }} />}
    </div>
  );
}

function StatusButton({ current, target, onClick, label, disabled }: { current: DeliveryStatus; target: DeliveryStatus; onClick: () => void; label: string; disabled?: boolean }) {
  const active = current === target;
  return (
    <button
      onClick={onClick}
      disabled={disabled || active}
      className={`px-3 py-1.5 rounded-lg border text-xs font-semibold ${
        active
          ? "bg-[#0088ff] text-white border-[#0088ff] cursor-default"
          : disabled
          ? "border-white/5 text-slate-600 cursor-not-allowed"
          : "border-white/10 text-slate-300 hover:bg-white/[0.04]"
      }`}
    >
      {label}
    </button>
  );
}

function PasswordDialog({ hasPassword, onClose, onSave }: { hasPassword: boolean; onClose: () => void; onSave: (pw: string) => void }) {
  const [pw, setPw] = useState("");
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[#0a0e17] border border-white/10 rounded-xl max-w-sm w-full p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold mb-4">{hasPassword ? "Change password" : "Set password"}</h2>
        <input
          type="password"
          autoFocus
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          placeholder={hasPassword ? "Leave empty to remove" : "New password"}
          className="w-full bg-white/[0.03] border border-white/10 rounded-lg px-3 py-2 text-sm mb-4 outline-none focus:border-[#0088ff]"
        />
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 border border-white/10 py-2.5 rounded-lg font-semibold text-sm">Cancel</button>
          <button onClick={() => onSave(pw)} className="flex-1 bg-[#0088ff] text-white py-2.5 rounded-lg font-semibold text-sm">{hasPassword && !pw ? "Remove" : "Save"}</button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------
function readImageDims(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Couldn't read image"));
    };
    img.src = url;
  });
}

function projectLabel(p: Project, clients: Client[]): string {
  const client = clients.find(c => c.id === p.clientId);
  const dateStr = p.date ? new Date(p.date + "T00:00:00").toLocaleDateString() : "";
  return [client?.company, dateStr].filter(Boolean).join(" · ") || "Project";
}
