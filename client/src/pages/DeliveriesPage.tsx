// Slate-side galleries management. Two views, switched by URL:
//   /deliveries        — list of galleries + "New gallery"
//   /deliveries/:id    — detail: upload, file grid, selections panel, status controls
//
// Most CRUD goes through AppContext. R2 upload + password set + R2 cleanup
// go through API endpoints (signed URL for upload, server-side hashing).

import { useEffect, useMemo, useRef, useState } from "react";
import { useRoute, Link } from "wouter";
import { useApp } from "@/contexts/AppContext";
import PrereqGate from "@/components/PrereqGate";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { getAuthToken } from "@/lib/supabase";
import type { Client, DeliveryStatus, Project } from "@/lib/types";
import { ArrowLeft, Plus, Upload, Copy, Trash2, Eye, Lock, ExternalLink, Check, X, Play, Image as ImageIcon } from "lucide-react";

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
  // Real-estate galleries (download-only) are listed in their own section.
  const reGalleries = galleries.filter(d => d.downloadOnly);
  const clientGalleries = galleries.filter(d => !d.downloadOnly);

  const renderGalleryCard = (d: typeof galleries[number]) => {
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
  };

  // Total storage usage across all galleries in this org — the API
  // enforces the 200GB cap server-side; this just surfaces it so
  // users see usage building before they hit a rejection mid-upload.
  const STORAGE_CAP_GB = 200;
  const usedBytes = data.deliveryFiles.reduce((s, f) => s + (f.sizeBytes || 0), 0);
  const usedGb = usedBytes / 1024 / 1024 / 1024;
  const usedPct = Math.min(100, (usedGb / STORAGE_CAP_GB) * 100);
  const usedDisplay = usedGb < 0.1 ? "< 0.1" : usedGb.toFixed(1);

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: "'Space Grotesk', system-ui" }}>Galleries</h1>
          <p className="text-sm text-slate-400">Photo delivery + client proofing.</p>
        </div>
        <PrereqGate
          met={data.projects.length > 0}
          title="Add a project first"
          body="Galleries deliver work for a specific project. Add at least one project on the calendar and you'll be able to attach a gallery to it."
          ctaLabel="Open Calendar"
          ctaHref="/calendar"
        >
          <button
            onClick={() => setCreateOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-[#0088ff] text-white rounded-lg font-semibold text-sm hover:bg-[#0066dd]"
          >
            <Plus className="w-4 h-4" /> New gallery
          </button>
        </PrereqGate>
      </div>

      {/* Storage usage — 200 GB hard cap. Server-side enforced; this
          row just surfaces it so users see usage building before they
          hit a rejection mid-upload. */}
      {galleries.length > 0 && (
        <div className="mb-6 rounded-lg border border-white/10 bg-white/[0.02] px-4 py-3">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
            <span>Storage</span>
            <span className="tabular-nums">{usedDisplay} / {STORAGE_CAP_GB} GB</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-white/5 overflow-hidden">
            <div
              className={`h-full transition-all ${usedPct >= 90 ? "bg-red-500" : usedPct >= 75 ? "bg-amber-500" : "bg-[#0088ff]"}`}
              style={{ width: `${usedPct}%` }}
            />
          </div>
          {usedPct >= 90 && (
            <p className="text-[11px] text-red-300 mt-1.5">
              You're near your storage cap. Archive or delete an old gallery to free up space.
            </p>
          )}
        </div>
      )}

      {galleries.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-12 text-center">
          <p className="text-slate-300 mb-2">No galleries yet.</p>
          <p className="text-sm text-slate-500 mb-6">Send a gallery for client proofing or just photo delivery.</p>
          <PrereqGate
            met={data.projects.length > 0}
            title="Add a project first"
            body="Galleries deliver work for a specific project. Add at least one project on the calendar and you'll be able to attach a gallery to it."
            ctaLabel="Open Calendar"
            ctaHref="/calendar"
          >
            <button
              onClick={() => setCreateOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#0088ff] text-white rounded-lg font-semibold text-sm hover:bg-[#0066dd]"
            >
              <Plus className="w-4 h-4" /> Create your first gallery
            </button>
          </PrereqGate>
        </div>
      ) : (
        <div className="space-y-8">
          {reGalleries.length > 0 && (
            <div>
              <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Real Estate ({reGalleries.length})</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {reGalleries.map(renderGalleryCard)}
              </div>
            </div>
          )}
          {clientGalleries.length > 0 && (
            <div>
              {reGalleries.length > 0 && <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Client Galleries ({clientGalleries.length})</h2>}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {clientGalleries.map(renderGalleryCard)}
              </div>
            </div>
          )}
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
  coverLayout: "center" | "vintage" | "minimal";
  coverFont: string;
  coverSubtitle: string | null;
  coverDate: string | null;
  slug: string | null;
  requireEmail: boolean;
  collectionId: string | null;
  watermarkText: string | null;
  watermarkUseLogo: boolean;
  printsEnabled: boolean;
}

function CreateGalleryDialog({ onClose, onCreate }: { onClose: () => void; onCreate: (g: CreateInput) => void }) {
  const { data } = useApp();
  const [title, setTitle] = useState("");
  const [projectId, setProjectId] = useState<string | null>(null);
  // String state so leading zeros don't get stuck (React + type="text" inputMode="decimal" quirk).
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
              coverLayout: "center",
              coverFont: "",
              coverSubtitle: null,
              coverDate: null,
              slug: null,
              requireEmail: false,
              collectionId: null,
              watermarkText: null,
              watermarkUseLogo: false,
              printsEnabled: false,
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
  const { data, updateDelivery, deleteDelivery, setDeliveryStatus, registerDeliveryFile, updateDeliveryFile, deleteDeliveryFile, markSelectionEdited } = useApp();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<{ done: number; total: number } | null>(null);
  const [pwOpen, setPwOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [signedUrls, setSignedUrls] = useState<Map<string, string>>(new Map());
  // Parallel map of thumbnail URLs (videos only). Keyed by file id.
  const [thumbUrls, setThumbUrls] = useState<Map<string, string>>(new Map());
  // File whose thumbnail the user is currently picking (or null when closed).
  const [thumbnailPickerFileId, setThumbnailPickerFileId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"photos" | "general" | "cover" | "privacy" | "selections">("photos");

  const delivery = data.deliveries.find(d => d.id === id);
  const files = useMemo(
    () => data.deliveryFiles.filter(f => f.deliveryId === id).sort((a, b) => a.position - b.position),
    [data.deliveryFiles, id]
  );
  const selections = useMemo(
    () => data.deliverySelections.filter(s => s.deliveryId === id),
    [data.deliverySelections, id]
  );

  // Fetch signed GET URLs for in-app previews. Two-phase to keep the
  // cover image fast while the photos grid loads in the background.
  // Phase 1: eager fetch just the cover photo's signed URL (single
  //   signature → milliseconds). Cover Design previews load instantly.
  // Phase 2: bulk fetch every file's signed URL for the photos grid.
  // Both populate the same signedUrls map; phase 2 overwrites phase 1.
  // Signed URLs are valid for 1 hour, so re-fetching is cheap.
  const coverFileIdForFetch = delivery?.coverFileId || files[0]?.id || null;
  useEffect(() => {
    if (files.length === 0) {
      setSignedUrls(new Map());
      setThumbUrls(new Map());
      return;
    }
    let cancelled = false;
    const run = async () => {
      try {
        const sess = await supabase.auth.getSession();
        const accessToken = sess.data.session?.access_token || "";
        const headers = { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` };

        // Phase 1: eager cover URL — completes fast, paints the preview tiles.
        if (coverFileIdForFetch) {
          fetch("/api/deliveries", {
            method: "POST",
            headers,
            body: JSON.stringify({ action: "signed-urls", deliveryId: id, fileIds: [coverFileIdForFetch] }),
          }).then(r => r.ok ? r.json() : null).then(body => {
            if (!body?.urls || cancelled) return;
            setSignedUrls(prev => {
              const next = new Map(prev);
              for (const u of body.urls as { id: string; url: string }[]) next.set(u.id, u.url);
              return next;
            });
            setThumbUrls(prev => {
              const next = new Map(prev);
              for (const u of body.urls as { id: string; thumbnailUrl?: string }[]) {
                if (u.thumbnailUrl) next.set(u.id, u.thumbnailUrl);
              }
              return next;
            });
          }).catch(() => {});
        }

        // Phase 2: full set for the photos grid.
        const res = await fetch("/api/deliveries", {
          method: "POST",
          headers,
          body: JSON.stringify({ action: "signed-urls", deliveryId: id }),
        });
        const body = await res.json();
        if (!res.ok || !body.urls || cancelled) return;
        const map = new Map<string, string>();
        const thumbs = new Map<string, string>();
        for (const u of body.urls as { id: string; url: string; thumbnailUrl?: string }[]) {
          map.set(u.id, u.url);
          if (u.thumbnailUrl) thumbs.set(u.id, u.thumbnailUrl);
        }
        setSignedUrls(map);
        setThumbUrls(thumbs);
      } catch { /* swallow — placeholder remains */ }
    };
    run();
    return () => { cancelled = true; };
  }, [id, files.length, coverFileIdForFetch]);

  if (!delivery) {
    return (
      <div className="max-w-3xl mx-auto p-6 text-center">
        <p className="text-slate-400 mb-4">Gallery not found.</p>
        <Link href="/deliveries"><a className="text-[#0088ff]">← Back to galleries</a></Link>
      </div>
    );
  }

  // Prefer the vanity URL when the owner has set a slug; otherwise the random token link.
  const publicUrl = delivery.slug
    ? `${PUBLIC_BASE}/g/${delivery.slug}`
    : `${PUBLIC_BASE}/deliver/${delivery.token}`;
  const totalSize = files.reduce((s, f) => s + f.sizeBytes, 0);

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const list = Array.from(fileList);
    setUploading({ done: 0, total: list.length });
    let done = 0;
    for (const file of list) {
      try {
        const isVideo = file.type.startsWith("video/");

        // Read dimensions/duration client-side. Video also produces a
        // first-frame Blob we'll upload as the auto-thumbnail.
        let width: number | null = null;
        let height: number | null = null;
        let durationSeconds: number | null = null;
        let autoThumbBlob: Blob | null = null;
        if (isVideo) {
          const meta = await readVideoMeta(file).catch(() => null);
          if (meta) {
            width = meta.width;
            height = meta.height;
            durationSeconds = meta.duration;
            autoThumbBlob = meta.thumbBlob;
          }
        } else {
          const dims = await readImageDims(file).catch(() => ({ width: null, height: null }));
          width = dims.width;
          height = dims.height;
        }

        // 1. Get signed upload URL for the primary file
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

        // 2b. For videos, upload the auto-captured first-frame thumbnail.
        let thumbnailStoragePath = "";
        if (isVideo && autoThumbBlob) {
          try {
            thumbnailStoragePath = await uploadThumbnailBlob(id, file.name, autoThumbBlob, accessToken);
          } catch (thumbErr) {
            // Non-fatal — file still uploads, user can pick a frame later.
            console.error("Thumbnail upload failed", thumbErr);
          }
        }

        // 3. Register file metadata
        await registerDeliveryFile({
          deliveryId: id,
          storagePath: uploadData.storagePath,
          originalName: file.name,
          sizeBytes: file.size,
          width,
          height,
          mimeType: file.type,
          position: files.length + done,
          mediaType: isVideo ? "video" : "image",
          thumbnailStoragePath,
          durationSeconds,
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
  const agentClient = project ? data.clients.find(c => c.id === project.clientId) : null;
  const hasBroker = agentClient?.clientType === "agent" && !!agentClient.brokerId;

  const notifyGallery = async (recipient: "agent" | "broker") => {
    try {
      const token = await getAuthToken();
      const res = await fetch("/api/notify-gallery-ready", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ deliveryId: id, recipient }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "Couldn't notify");
      if (d.emailed || d.pushed) toast.success(recipient === "broker" ? "Sent the broker the link" : "Notified the agent");
      else toast.message(`No email on file for the ${recipient} — add one to notify them.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't notify");
    }
  };

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

      {/* Tabs — Pixieset-style left nav (collapsed to top tabs on mobile) */}
      <div className="flex items-center gap-1 mb-6 border-b border-white/10 overflow-x-auto -mx-1 px-1">
        {(["photos", "general", "cover", "privacy", "selections"] as const).map(t => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={`px-4 py-2.5 text-xs font-semibold uppercase tracking-wider whitespace-nowrap border-b-2 transition-colors ${
              activeTab === t ? "border-[#0088ff] text-white" : "border-transparent text-slate-400 hover:text-white"
            }`}
          >
            {t === "photos" ? `Photos (${files.length})`
              : t === "general" ? "General"
              : t === "cover" ? "Cover"
              : t === "privacy" ? "Privacy"
              : `Selections${selections.length > 0 ? ` (${selections.length})` : ""}`}
          </button>
        ))}
      </div>

      {activeTab === "photos" && (
        <>
          {/* Stats compact strip */}
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
        </>
      )}

      {activeTab === "general" && (
        <>
          <BasicsPanel
            title={delivery.title}
            projectId={delivery.projectId}
            projects={data.projects}
            clients={data.clients}
            onUpdate={(patch) => updateDelivery(id, patch)}
          />
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5 mb-6">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">Status</h3>
            <div className="flex flex-wrap gap-2 text-xs">
              <StatusButton current={delivery.status} target="draft" onClick={() => setDeliveryStatus(id, "draft")} label="Draft" />
              <StatusButton current={delivery.status} target="sent" onClick={() => setDeliveryStatus(id, "sent")} label="Send to client" />
              <StatusButton current={delivery.status} target="working" onClick={() => setDeliveryStatus(id, "working")} label="Mark in-progress" disabled={delivery.status === "draft"} />
              <StatusButton current={delivery.status} target="delivered" onClick={async () => { await setDeliveryStatus(id, "delivered"); notifyGallery("agent"); }} label="Mark delivered" />
            </div>
            {hasBroker && (
              <div className="mt-3 pt-3 border-t border-white/10">
                <button
                  onClick={() => notifyGallery("broker")}
                  disabled={delivery.status !== "delivered"}
                  className="text-xs px-3 py-1.5 border border-white/10 rounded-lg hover:bg-white/[0.04] disabled:opacity-40 disabled:cursor-not-allowed"
                  title={delivery.status !== "delivered" ? "Deliver the gallery first" : "Email the brokerage this gallery link"}
                >
                  Send the broker the link
                </button>
                <p className="text-[10px] text-slate-500 mt-1.5">Delivering notifies the agent automatically. Use this only if the brokerage asks for the link.</p>
              </div>
            )}
          </div>
          <ExpiryPanel
            expiresAt={delivery.expiresAt}
            onUpdate={(v) => updateDelivery(id, { expiresAt: v })}
          />
          <CollectionPanel
            collectionId={delivery.collectionId}
            onUpdate={(v) => updateDelivery(id, { collectionId: v })}
          />
          <WatermarkPanel
            watermarkText={delivery.watermarkText}
            watermarkUseLogo={delivery.watermarkUseLogo}
            orgLogoUrl={data.organization?.logoUrl || ""}
            onUpdate={(patch) => updateDelivery(id, patch)}
          />
          <PrintsPanel
            printsEnabled={delivery.printsEnabled}
            onUpdate={(v) => updateDelivery(id, { printsEnabled: v })}
          />
        </>
      )}

      {activeTab === "cover" && (
        <CoverDesignPanel
          delivery={delivery}
          files={files}
          signedUrls={signedUrls}
          onUpdate={(patch) => updateDelivery(id, patch)}
        />
      )}

      {activeTab === "privacy" && (
        <>
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5 mb-6">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Password</h3>
            <button onClick={() => setPwOpen(true)} className="text-xs px-3 py-1.5 border border-white/10 rounded-lg hover:bg-white/[0.04] inline-flex items-center gap-1.5">
              <Lock className="w-3 h-3" /> {delivery.hasPassword ? "Change password" : "Set password"}
            </button>
            {delivery.hasPassword && <p className="text-[11px] text-slate-500 mt-2">A password is set. Visitors enter it before viewing.</p>}
          </div>
          <PrivacyPanel
            requireEmail={delivery.requireEmail}
            onUpdate={(v) => updateDelivery(id, { requireEmail: v })}
          />
        </>
      )}

      {activeTab === "selections" && (
        <>
          {delivery.submittedAt ? (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 mb-6">
              <p className="text-sm">
                <strong>{delivery.clientName || "Client"}</strong>
                {delivery.clientEmail && <span className="text-slate-400"> · {delivery.clientEmail}</span>}
                <span className="text-slate-500"> · submitted {new Date(delivery.submittedAt).toLocaleDateString()}</span>
              </p>
              <p className="text-xs text-slate-400 mt-1">{selections.length} pick{selections.length === 1 ? "" : "s"} {selections.some(s => s.isPaid) && "· includes paid extras"}</p>
            </div>
          ) : (
            <p className="text-sm text-slate-500 py-8 text-center">No selections submitted yet.</p>
          )}
        </>
      )}

      {activeTab === "photos" && (
      <>
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
          accept="image/*,video/mp4,video/quicktime,video/x-m4v,.mp4,.mov,.m4v"
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
        <Upload className="w-8 h-8 mx-auto mb-2 text-slate-500" />
        <p className="text-sm text-slate-300 mb-3">
          {dragOver ? "Drop to upload" : "Drag photos or videos here, or click to browse"}
        </p>
        <p className="text-[11px] text-slate-500 mb-3">
          Videos: .mp4, .mov, .m4v · up to 500 MB each. Photos: any image format · up to 50 MB each.
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
        <p className="text-center text-sm text-slate-500 py-8">No photos or videos yet.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {files.map((f) => {
            const sel = selections.find(s => s.fileId === f.id);
            const isVideo = f.mediaType === "video";
            const thumb = thumbUrls.get(f.id);
            const photo = signedUrls.get(f.id);
            return (
              <div key={f.id} className="relative group aspect-square bg-white/[0.02] border border-white/10 rounded-lg overflow-hidden">
                {isVideo ? (
                  // Video tile: show thumbnail (or fallback) + play overlay + duration
                  <>
                    {thumb ? (
                      <img src={thumb} alt={f.originalName} className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center bg-slate-900 text-slate-500 text-[10px] p-2 text-center">
                        <ImageIcon className="w-6 h-6 mb-1" />
                        No thumbnail
                      </div>
                    )}
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="bg-black/60 rounded-full p-3">
                        <Play className="w-6 h-6 text-white fill-white" />
                      </div>
                    </div>
                    {f.durationSeconds != null && (
                      <span className="absolute bottom-2 left-2 bg-black/70 text-white text-[10px] font-mono px-1.5 py-0.5 rounded">
                        {formatDuration(f.durationSeconds)}
                      </span>
                    )}
                  </>
                ) : photo ? (
                  <img src={photo} alt={f.originalName} className="w-full h-full object-cover" loading="lazy" />
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
                {sel && proofingEnabled && !isVideo && (
                  <button
                    onClick={() => markSelectionEdited(sel.id, !sel.editedAt)}
                    className={`absolute top-2 right-2 text-[10px] px-2 py-1 rounded font-semibold ${
                      sel.editedAt ? "bg-emerald-500 text-white" : "bg-white/10 text-white hover:bg-white/20"
                    }`}
                  >
                    {sel.editedAt ? <Check className="w-3 h-3" /> : "Mark edited"}
                  </button>
                )}
                {isVideo && (
                  <button
                    onClick={() => setThumbnailPickerFileId(f.id)}
                    className="absolute top-2 right-2 text-[10px] bg-black/60 hover:bg-blue-500 text-white px-2 py-1 rounded font-semibold opacity-0 group-hover:opacity-100"
                    title="Pick a thumbnail frame from playback"
                  >
                    Thumbnail
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

      {/* Video thumbnail picker — opens when admin clicks "Thumbnail" on a video tile */}
      {thumbnailPickerFileId && (() => {
        const file = files.find(f => f.id === thumbnailPickerFileId);
        if (!file) return null;
        return (
          <ThumbnailPicker
            file={file}
            videoUrl={signedUrls.get(file.id) || ""}
            onClose={() => setThumbnailPickerFileId(null)}
            onSaved={(newThumbUrl) => {
              setThumbUrls(prev => {
                const next = new Map(prev);
                next.set(file.id, newThumbUrl);
                return next;
              });
              setThumbnailPickerFileId(null);
              toast.success("Thumbnail updated");
            }}
            uploadThumbnail={(blob) => uploadAndAttachThumbnail(id, file.id, file.originalName, blob, updateDeliveryFile)}
          />
        );
      })()}
      </>
      )}

      {activeTab === "general" && (
        <div className="mt-10 pt-6 border-t border-white/10 flex justify-end">
          <button onClick={handleDeleteGallery} className="text-sm text-red-400 hover:text-red-300 inline-flex items-center gap-1">
            <Trash2 className="w-4 h-4" /> Delete gallery
          </button>
        </div>
      )}

      {pwOpen && <PasswordDialog hasPassword={delivery.hasPassword} onClose={() => setPwOpen(false)} onSave={async (pw) => { await setPassword(pw); setPwOpen(false); }} />}
    </div>
  );
}

type CoverLayoutId = "center" | "vintage" | "minimal" | "left" | "stripe" | "frame" | "divider" | "stamp";

// Hand-picked cover fonts. Empty value = the original Cormorant Garamond
// default. The same map lives in DeliverGalleryPage — keep them in sync
// if you add/remove options. Existing galleries pinned to a removed
// value fall back to default (getCoverFont).
export const COVER_FONTS: Array<{ value: string; label: string; family: string; weight: number }> = [
  { value: "",                label: "Cormorant",      family: "'Cormorant Garamond', Georgia, serif",        weight: 300 },
  { value: "playfair",        label: "Playfair",       family: "'Playfair Display', Georgia, serif",          weight: 400 },
  { value: "marcellus",       label: "Marcellus",      family: "'Marcellus', Georgia, serif",                 weight: 400 },
  { value: "inter",           label: "Inter",          family: "'Inter', system-ui, sans-serif",              weight: 300 },
  { value: "sans",            label: "Sans",           family: "'Montserrat', system-ui, sans-serif",         weight: 300 },
  { value: "serif-timeless",  label: "Serif Timeless", family: "'EB Garamond', Georgia, serif",               weight: 400 },
  { value: "serif-modern",    label: "Serif Modern",   family: "'DM Serif Display', Georgia, serif",          weight: 400 },
];

export function getCoverFont(value: string) {
  return COVER_FONTS.find(f => f.value === value) || COVER_FONTS[0];
}

interface CoverDesignProps {
  delivery: { title: string; coverFileId: string | null; coverLayout: CoverLayoutId; coverFont: string; coverSubtitle: string | null; coverDate: string | null; slug: string | null };
  files: Array<{ id: string; originalName: string }>;
  signedUrls: Map<string, string>;
  onUpdate: (patch: { coverFileId?: string | null; coverLayout?: CoverLayoutId; coverFont?: string; coverSubtitle?: string | null; coverDate?: string | null; slug?: string | null }) => Promise<void>;
}

// Stock photos per layout — used in the small chooser thumbnails so each
// layout has a visually distinct sample image (Pixieset-style). Picsum
// returns a stable image per seed.
const STOCK_COVERS: Record<CoverLayoutId, string> = {
  center:   "https://picsum.photos/seed/slate-cover-center/400/220",
  vintage:  "https://picsum.photos/seed/slate-cover-vintage/400/220",
  left:     "https://picsum.photos/seed/slate-cover-left/400/220",
  stripe:   "https://picsum.photos/seed/slate-cover-stripe/400/220",
  frame:    "https://picsum.photos/seed/slate-cover-frame/400/220",
  divider:  "https://picsum.photos/seed/slate-cover-divider/400/220",
  stamp:    "https://picsum.photos/seed/slate-cover-stamp/400/220",
  minimal:  "",
};

// Cover preview component. Renders a miniature of any layout for the
// chooser ("sm") OR a large live-preview pane mirroring what the public
// gallery hero will look like ("lg"). Same component, scaled fonts.
function CoverThumb({ layout, imageUrl, title, meta, fontValue, size = "sm", showCta = false }: {
  layout: CoverLayoutId;
  imageUrl?: string;
  title: string;
  meta: string;
  fontValue: string;
  size?: "sm" | "lg";
  showCta?: boolean;
}) {
  const isLg = size === "lg";
  const fontDef = getCoverFont(fontValue);
  const showImage = layout !== "minimal" && !!imageUrl;
  const overlayBg = (() => {
    switch (layout) {
      case "vintage": return "linear-gradient(135deg, rgba(0,0,0,0.65) 0%, rgba(0,0,0,0.25) 50%, rgba(0,0,0,0.55) 100%)";
      case "left": return "linear-gradient(90deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.05) 100%)";
      default: return "linear-gradient(180deg, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.45) 100%)";
    }
  })();
  const align = layout === "vintage" || layout === "left"
    ? `items-start justify-end text-left ${isLg ? "p-8 sm:p-10" : "p-2"}`
    : "items-center justify-center text-center";

  const titleStyle: React.CSSProperties = {
    fontFamily: fontDef.family,
    fontWeight: fontDef.weight,
    fontSize: isLg
      ? (layout === "stamp" ? "clamp(1.5rem, 3vw, 2.25rem)" : "clamp(2rem, 4.5vw, 3.5rem)")
      : (layout === "stamp" ? "9px" : "14px"),
    letterSpacing: "0.02em",
    lineHeight: 1.05,
    color: "white",
    maxWidth: "90%",
    textShadow: showImage ? "0 1px 6px rgba(0,0,0,0.4)" : "none",
  };

  const stripeWidth = isLg ? "w-12 sm:w-16" : "w-3";
  const frameInset = isLg ? "px-6 py-5 sm:px-10 sm:py-7" : "px-2 py-1.5";
  const stampSize = isLg ? "w-32 h-32 sm:w-40 sm:h-40" : "w-12 h-12";
  const dividerLineW = isLg ? "w-12" : "w-6";
  const metaSize = isLg ? "text-[10px] sm:text-xs" : "text-[6px]";

  const titleNode = (() => {
    if (layout === "stripe") {
      return (
        <div className="flex items-center gap-2 sm:gap-4">
          <div className={`h-px ${stripeWidth} bg-white/60`} />
          <span style={titleStyle}>{title || "TITLE"}</span>
          <div className={`h-px ${stripeWidth} bg-white/60`} />
        </div>
      );
    }
    if (layout === "frame") {
      return (
        <div className={`border ${isLg ? "border-2" : ""} border-white/70 ${frameInset}`}>
          <span style={titleStyle}>{title || "TITLE"}</span>
        </div>
      );
    }
    if (layout === "stamp") {
      return (
        <div className={`border ${isLg ? "border-2" : ""} border-white rounded-full ${stampSize} flex items-center justify-center px-1`}>
          <span style={titleStyle}>{title || "TITLE"}</span>
        </div>
      );
    }
    return <span style={titleStyle}>{title || "TITLE"}</span>;
  })();

  const metaNode = meta ? (
    layout === "divider" ? (
      <div className={`flex flex-col items-center ${isLg ? "mt-4" : "mt-1.5"}`}>
        <div className={`h-px ${dividerLineW} bg-white/60 ${isLg ? "mb-3" : "mb-1"}`} />
        <span className={`${metaSize} text-white/85 uppercase`} style={{ letterSpacing: "0.25em" }}>{meta}</span>
      </div>
    ) : (
      <span className={`${metaSize} text-white/85 uppercase ${isLg ? "mt-3" : "mt-1"}`} style={{ letterSpacing: "0.25em" }}>{meta}</span>
    )
  ) : null;

  return (
    <div className={`relative w-full ${isLg ? "aspect-[16/10]" : "aspect-[2/1]"} rounded-md overflow-hidden bg-zinc-800`}>
      {showImage ? (
        <img src={imageUrl} alt="" className="absolute inset-0 w-full h-full object-cover" loading={isLg ? "eager" : "lazy"} />
      ) : (
        <div className="absolute inset-0" style={{ background: "linear-gradient(135deg, #1a1a2e, #2a2a3e)" }} />
      )}
      {showImage && <div className="absolute inset-0" style={{ background: overlayBg }} />}
      <div className={`absolute inset-0 flex flex-col ${align}`}>
        {titleNode}
        {metaNode}
        {showCta && (
          <a
            href="#"
            onClick={(e) => e.preventDefault()}
            className="mt-6 inline-block text-white border border-white/70 hover:border-white px-6 py-2 text-[10px] sm:text-xs uppercase pointer-events-none"
            style={{ letterSpacing: "0.25em" }}
          >
            View Gallery
          </a>
        )}
      </div>
    </div>
  );
}

function slugify(s: string): string {
  return s.toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").slice(0, 60);
}

function CoverDesignPanel({ delivery, files, signedUrls, onUpdate }: CoverDesignProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [subtitle, setSubtitle] = useState(delivery.coverSubtitle || "");
  const [date, setDate] = useState(delivery.coverDate || "");
  const [slug, setSlug] = useState(delivery.slug || "");

  // Sync local state when delivery changes (e.g. after save echo from realtime)
  useEffect(() => { setSubtitle(delivery.coverSubtitle || ""); }, [delivery.coverSubtitle]);
  useEffect(() => { setDate(delivery.coverDate || ""); }, [delivery.coverDate]);
  useEffect(() => { setSlug(delivery.slug || ""); }, [delivery.slug]);

  const coverFile = files.find(f => f.id === delivery.coverFileId);
  const coverUrl = coverFile ? signedUrls.get(coverFile.id) : undefined;

  const layouts: Array<{ id: CoverLayoutId; label: string; hint: string }> = [
    { id: "center", label: "Center", hint: "Title centered over hero" },
    { id: "vintage", label: "Vintage", hint: "Bottom-left serif over dark hero" },
    { id: "left", label: "Left", hint: "Bottom-left, lighter overlay" },
    { id: "stripe", label: "Stripe", hint: "Title with horizontal accent stripes" },
    { id: "frame", label: "Frame", hint: "Title inside a bordered frame" },
    { id: "divider", label: "Divider", hint: "Title with horizontal divider line" },
    { id: "stamp", label: "Stamp", hint: "Title in circular badge" },
    { id: "minimal", label: "Minimal", hint: "Typography only, no hero image" },
  ];

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5 mb-6">
      <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">Cover & Design</h3>

      {/* Font picker — six hand-picked options. Loads Google Fonts inline so
          the swatches and previews render in the actual face. */}
      <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400;500&family=Playfair+Display:wght@400;600&family=Marcellus&family=Inter:wght@300;400;500&family=Montserrat:wght@300;400;500&family=EB+Garamond:wght@400;500&family=DM+Serif+Display&display=swap" rel="stylesheet" />
      <div className="mb-5">
        <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-2">Cover font</label>
        <div className="flex flex-wrap gap-2">
          {COVER_FONTS.map(f => (
            <button
              key={f.value || "default"}
              onClick={() => onUpdate({ coverFont: f.value })}
              className={`px-3 py-2 rounded-lg border transition-colors ${
                delivery.coverFont === f.value
                  ? "border-[#0088ff] bg-[#0088ff]/10 ring-1 ring-[#0088ff]/40"
                  : "border-white/10 hover:border-white/30"
              }`}
              style={{ fontFamily: f.family, fontWeight: f.weight }}
              title={f.label}
            >
              <span className="text-base text-white">{f.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Pixieset-style chooser: 2-col thumbnail grid on the left, big live
          preview on the right. The thumbs use stock photos + "TITLE" placeholder
          so the layout is the focus; the right pane shows the actual gallery's
          cover, title, font, and subtitle/date. */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-4 mb-4">
        {/* Layout thumbnails */}
        <div className="grid grid-cols-2 gap-3">
          {layouts.map(l => (
            <button
              key={l.id}
              onClick={() => onUpdate({ coverLayout: l.id })}
              className={`text-left p-2 rounded-lg border transition-colors ${
                delivery.coverLayout === l.id
                  ? "border-[#0088ff] bg-[#0088ff]/10 ring-1 ring-[#0088ff]/40"
                  : "border-white/10 hover:border-white/30"
              }`}
            >
              <CoverThumb
                layout={l.id}
                imageUrl={STOCK_COVERS[l.id]}
                title="TITLE"
                meta=""
                fontValue={delivery.coverFont}
                size="sm"
              />
              <div className="mt-2 text-center">
                <div className="text-xs font-semibold text-white">{l.label}</div>
              </div>
            </button>
          ))}
        </div>

        {/* Live preview pane — sticky on desktop so it stays visible while
            scrolling thumbnails. Uses the actual cover image, title, and meta. */}
        <div className="lg:sticky lg:top-4 self-start">
          <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">Live preview</div>
          <CoverThumb
            layout={delivery.coverLayout}
            imageUrl={coverUrl}
            title={delivery.title}
            meta={[delivery.coverDate, delivery.coverSubtitle].filter(Boolean).join(" · ")}
            fontValue={delivery.coverFont}
            size="lg"
            showCta
          />
          <p className="text-[10px] text-slate-500 mt-2 text-center">This is what your client sees.</p>
        </div>
      </div>

      {/* Cover image picker */}
      {delivery.coverLayout !== "minimal" && (
        <div className="mb-4">
          <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-2">Cover photo</label>
          <button
            onClick={() => setPickerOpen(true)}
            disabled={files.length === 0}
            className="w-full aspect-[3/1] bg-white/[0.03] border border-white/10 rounded-lg overflow-hidden hover:border-white/20 disabled:opacity-50 flex items-center justify-center text-xs text-slate-500"
          >
            {coverUrl ? (
              <img src={coverUrl} alt="" className="w-full h-full object-cover" />
            ) : files.length === 0 ? (
              "Upload photos first"
            ) : (
              `Pick a cover (defaults to first photo)`
            )}
          </button>
        </div>
      )}

      {/* Subtitle + Date */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1">Subtitle (optional)</label>
          <input
            type="text"
            value={subtitle}
            onChange={(e) => setSubtitle(e.target.value)}
            onBlur={() => { if (subtitle !== (delivery.coverSubtitle || "")) onUpdate({ coverSubtitle: subtitle || null }); }}
            placeholder="e.g. Coldwell Banker · Brentwood"
            className="w-full bg-white/[0.03] border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 outline-none focus:border-[#0088ff]"
          />
        </div>
        <div>
          <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1">Date (optional)</label>
          <input
            type="text"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            onBlur={() => { if (date !== (delivery.coverDate || "")) onUpdate({ coverDate: date || null }); }}
            placeholder="16th March, 2026"
            className="w-full bg-white/[0.03] border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 outline-none focus:border-[#0088ff]"
          />
        </div>
      </div>

      {/* Vanity URL slug */}
      <div className="mt-3">
        <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1">Custom URL (optional)</label>
        <div className="flex items-stretch gap-0">
          <span className="bg-white/[0.03] border border-r-0 border-white/10 rounded-l-lg px-3 py-2 text-sm text-slate-500">/g/</span>
          <input
            type="text"
            value={slug}
            onChange={(e) => setSlug(slugify(e.target.value))}
            onBlur={async () => {
              if (slug !== (delivery.slug || "")) {
                try {
                  await onUpdate({ slug: slug || null });
                  if (slug) toast.success(`URL set: /g/${slug}`);
                } catch (err) {
                  const msg = err instanceof Error ? err.message : "";
                  if (msg.includes("duplicate") || msg.includes("unique")) {
                    toast.error("That URL is already taken — try a different slug");
                  } else {
                    toast.error("Couldn't save URL", { description: msg });
                  }
                  setSlug(delivery.slug || "");
                }
              }
            }}
            placeholder="cbsr-awards-2026"
            className="flex-1 bg-white/[0.03] border border-white/10 rounded-r-lg px-3 py-2 text-sm text-white placeholder-slate-600 outline-none focus:border-[#0088ff]"
          />
        </div>
        <p className="text-[10px] text-slate-500 mt-1">Lowercase letters, numbers, dashes. Leave blank to use the random share link only.</p>
      </div>

      {/* Picker dialog */}
      {pickerOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setPickerOpen(false)}>
          <div className="bg-[#0a0e17] border border-white/10 rounded-xl max-w-3xl w-full max-h-[80vh] overflow-auto p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">Choose cover photo</h2>
              <button onClick={() => setPickerOpen(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {files.map(f => {
                const url = signedUrls.get(f.id);
                const isSel = delivery.coverFileId === f.id;
                return (
                  <button
                    key={f.id}
                    onClick={async () => { await onUpdate({ coverFileId: f.id }); setPickerOpen(false); }}
                    className={`relative aspect-square overflow-hidden rounded-lg border-2 ${isSel ? "border-[#0088ff]" : "border-transparent hover:border-white/30"}`}
                  >
                    {url ? <img src={url} alt={f.originalName} className="w-full h-full object-cover" /> : <div className="w-full h-full bg-slate-800" />}
                    {isSel && <div className="absolute top-2 right-2 bg-[#0088ff] text-white text-[10px] px-2 py-0.5 rounded">Selected</div>}
                  </button>
                );
              })}
            </div>
            {delivery.coverFileId && (
              <button
                onClick={async () => { await onUpdate({ coverFileId: null }); setPickerOpen(false); }}
                className="mt-4 text-xs text-slate-400 hover:text-white"
              >
                Clear cover (use first photo)
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function BasicsPanel({ title, projectId, projects, clients, onUpdate }: {
  title: string;
  projectId: string | null;
  projects: Project[];
  clients: Client[];
  onUpdate: (patch: { title?: string; projectId?: string | null }) => Promise<void>;
}) {
  const [t, setT] = useState(title);
  const [p, setP] = useState(projectId || "");
  useEffect(() => { setT(title); }, [title]);
  useEffect(() => { setP(projectId || ""); }, [projectId]);

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5 mb-6">
      <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">Basics</h3>
      <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1">Title</label>
      <input
        type="text"
        value={t}
        onChange={(e) => setT(e.target.value)}
        onBlur={() => { if (t.trim() && t !== title) onUpdate({ title: t.trim() }); }}
        placeholder="Gallery title"
        className="w-full bg-white/[0.03] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-[#0088ff] mb-3"
      />
      <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1">Project</label>
      <select
        value={p}
        onChange={(e) => {
          const next = e.target.value || null;
          setP(e.target.value);
          onUpdate({ projectId: next });
        }}
        className="w-full bg-white/[0.03] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-[#0088ff]"
      >
        <option value="">— No project —</option>
        {projects.map((proj) => (
          <option key={proj.id} value={proj.id}>{projectLabel(proj, clients)}</option>
        ))}
      </select>
    </div>
  );
}

function CollectionPanel({ collectionId, onUpdate }: { collectionId: string | null; onUpdate: (v: string | null) => Promise<void> }) {
  const { data, addDeliveryCollection } = useApp();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5 mb-6">
      <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Collection</h3>
      <p className="text-[11px] text-slate-500 mb-3">Group several galleries under a shared landing URL <span className="text-slate-400">/c/&lt;slug&gt;</span>.</p>
      <div className="flex items-center gap-2">
        <select
          value={collectionId || ""}
          onChange={(e) => onUpdate(e.target.value || null)}
          className="bg-white/[0.03] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-[#0088ff] flex-1"
        >
          <option value="">— Standalone (no collection) —</option>
          {data.deliveryCollections.map(c => (
            <option key={c.id} value={c.id}>{c.name}{c.slug ? ` (/c/${c.slug})` : ""}</option>
          ))}
        </select>
        {!creating && (
          <button onClick={() => setCreating(true)} className="text-xs text-[#0088ff] hover:underline whitespace-nowrap">New collection</button>
        )}
      </div>
      {creating && (
        <div className="flex items-center gap-2 mt-3">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Collection name"
            className="flex-1 bg-white/[0.03] border border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#0088ff]"
            autoFocus
          />
          <button
            onClick={async () => {
              if (!newName.trim()) return;
              try {
                const c = await addDeliveryCollection({ name: newName.trim(), slug: null, coverSubtitle: null });
                await onUpdate(c.id);
                setCreating(false);
                setNewName("");
                toast.success(`Collection "${c.name}" created`);
              } catch (err) {
                toast.error("Couldn't create", { description: err instanceof Error ? err.message : "" });
              }
            }}
            className="px-3 py-2 bg-[#0088ff] text-white rounded-lg text-sm font-semibold whitespace-nowrap"
          >Create</button>
          <button onClick={() => { setCreating(false); setNewName(""); }} className="text-xs text-slate-400 hover:text-white">Cancel</button>
        </div>
      )}
    </div>
  );
}

function WatermarkPanel({ watermarkText, watermarkUseLogo, orgLogoUrl, onUpdate }: {
  watermarkText: string | null;
  watermarkUseLogo: boolean;
  orgLogoUrl: string;
  onUpdate: (patch: { watermarkText?: string | null; watermarkUseLogo?: boolean }) => Promise<void>;
}) {
  const [val, setVal] = useState(watermarkText || "");
  useEffect(() => { setVal(watermarkText || ""); }, [watermarkText]);
  const canUseLogo = !!orgLogoUrl;
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5 mb-6">
      <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Watermark</h3>

      {/* Logo toggle — preferred when org has a logo set */}
      <label className={`flex items-start gap-3 mb-3 cursor-pointer ${!canUseLogo ? "opacity-50 cursor-not-allowed" : ""}`}>
        <input
          type="checkbox"
          checked={watermarkUseLogo && canUseLogo}
          disabled={!canUseLogo}
          onChange={(e) => onUpdate({ watermarkUseLogo: e.target.checked })}
          className="mt-1"
        />
        <div className="flex-1">
          <div className="text-sm text-white font-medium">Use my logo as watermark</div>
          <p className="text-[11px] text-slate-500 mt-0.5">
            {canUseLogo
              ? "Tiles your business logo across the public gallery at low opacity."
              : "Upload a logo in Settings → Business to enable this."}
          </p>
        </div>
      </label>

      {watermarkUseLogo && canUseLogo && (
        <div className="rounded-lg border border-white/10 bg-zinc-900 p-4 mb-3 relative overflow-hidden h-24">
          <div
            aria-hidden
            className="absolute inset-0 pointer-events-none"
            style={{
              backgroundImage: `url("${orgLogoUrl}")`,
              backgroundRepeat: "repeat",
              backgroundSize: "120px",
              opacity: 0.18,
            }}
          />
          <p className="text-[10px] text-slate-500 relative z-10 text-center mt-7">Preview — your logo tiled at ~18% opacity</p>
        </div>
      )}

      {/* Text watermark — kept as a fallback / supplemental option */}
      <label className="block text-[11px] text-slate-500 uppercase tracking-wider mb-1">Text watermark (optional)</label>
      <input
        type="text"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onBlur={() => { if (val !== (watermarkText || "")) onUpdate({ watermarkText: val || null }); }}
        placeholder="© Your Name 2026"
        className="w-full bg-white/[0.03] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-[#0088ff]"
      />
      <p className="text-[11px] text-slate-500 mt-2">Tiled overlay across the public gallery. Deters casual screenshots; the underlying image isn't modified — paid clients still get clean originals via download.</p>
    </div>
  );
}

function PrintsPanel({ printsEnabled, onUpdate }: { printsEnabled: boolean; onUpdate: (v: boolean) => Promise<void> }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5 mb-6">
      <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Print orders</h3>
      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={printsEnabled}
          onChange={(e) => onUpdate(e.target.checked)}
          className="mt-1 w-4 h-4 accent-[#0088ff]"
        />
        <span>
          <span className="text-sm text-white font-medium block">Allow clients to request prints</span>
          <span className="text-xs text-slate-500">Adds a "Request prints" button to each photo on the public gallery. Requests email you with the photo + size; you handle fulfillment manually for now.</span>
        </span>
      </label>
    </div>
  );
}

function PrivacyPanel({ requireEmail, onUpdate }: { requireEmail: boolean; onUpdate: (v: boolean) => Promise<void> }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5 mb-6">
      <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Privacy</h3>
      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={requireEmail}
          onChange={(e) => onUpdate(e.target.checked)}
          className="mt-1 w-4 h-4 accent-[#0088ff]"
        />
        <span>
          <span className="text-sm text-white font-medium block">Require email to view</span>
          <span className="text-xs text-slate-500">Visitors enter their email before seeing photos. Captured emails appear below.</span>
        </span>
      </label>
    </div>
  );
}

function ExpiryPanel({ expiresAt, onUpdate }: { expiresAt: string | null; onUpdate: (v: string | null) => Promise<void> }) {
  const [val, setVal] = useState(expiresAt ? expiresAt.slice(0, 10) : "");
  // Snapshot Date.now() at mount — calling it during render is impure.
  // Per audit pattern memory: useState lazy init is the safe pattern.
  const [nowMs] = useState(() => Date.now());
  useEffect(() => { setVal(expiresAt ? expiresAt.slice(0, 10) : ""); }, [expiresAt]);

  const daysLeft = expiresAt
    ? Math.ceil((new Date(expiresAt).getTime() - nowMs) / 86400_000)
    : null;

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5 mb-6">
      <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Expiry</h3>
      <div className="flex items-center gap-3">
        <input
          type="date"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onBlur={async () => {
            const next = val ? `${val}T23:59:59Z` : null;
            if (next !== expiresAt) await onUpdate(next);
          }}
          className="bg-white/[0.03] border border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#0088ff]"
        />
        {expiresAt && (
          <button
            onClick={() => onUpdate(null)}
            className="text-xs text-slate-400 hover:text-white"
          >
            Clear
          </button>
        )}
        {daysLeft !== null && (
          <span className={`text-xs ${daysLeft < 7 ? "text-amber-400" : "text-slate-500"}`}>
            {daysLeft > 0 ? `Expires in ${daysLeft} day${daysLeft === 1 ? "" : "s"}` : `Expired`}
          </span>
        )}
      </div>
      <p className="text-[11px] text-slate-500 mt-2">After expiry, clients can't view the gallery. We'll email you 7 days before.</p>
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

// ---------------------------------------------------------------
// Video helpers — used by the upload flow + thumbnail picker
// ---------------------------------------------------------------

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

// Read width/height/duration from a video file and capture the first
// playable frame as a JPEG Blob (the auto-thumbnail). Returns null if
// the browser can't decode the video.
async function readVideoMeta(file: File): Promise<{ width: number; height: number; duration: number; thumbBlob: Blob } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    video.src = url;

    const cleanup = () => {
      URL.revokeObjectURL(url);
      video.removeAttribute("src");
      video.load();
    };

    video.onloadedmetadata = () => {
      // Seek to ~0.5s (or 10% in for very short clips). Some browsers
      // refuse to capture frame data at exactly 0.
      const seekTo = Math.min(0.5, video.duration * 0.1);
      const onSeeked = () => {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          const ctx = canvas.getContext("2d");
          if (!ctx) { cleanup(); resolve(null); return; }
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          canvas.toBlob((blob) => {
            cleanup();
            if (!blob) { resolve(null); return; }
            resolve({
              width: video.videoWidth,
              height: video.videoHeight,
              duration: Math.round(video.duration),
              thumbBlob: blob,
            });
          }, "image/jpeg", 0.85);
        } catch {
          cleanup();
          resolve(null);
        }
      };
      video.onseeked = onSeeked;
      video.currentTime = seekTo;
    };

    video.onerror = () => { cleanup(); resolve(null); };
  });
}

// Upload a thumbnail Blob to R2 and return the storage key (R2 path).
async function uploadThumbnailBlob(deliveryId: string, originalName: string, blob: Blob, accessToken: string): Promise<string> {
  const thumbName = originalName.replace(/\.[^.]+$/, "") + "-thumb.jpg";
  const uploadRes = await fetch("/api/delivery-upload", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({
      deliveryId,
      fileName: thumbName,
      contentType: "image/jpeg",
      sizeBytes: blob.size,
      kind: "thumbnail",
    }),
  });
  const data = await uploadRes.json();
  if (!uploadRes.ok) throw new Error(data.error || "Thumbnail upload URL failed");

  const putRes = await fetch(data.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": "image/jpeg" },
    body: blob,
  });
  if (!putRes.ok) throw new Error(`Thumbnail R2 PUT failed: ${putRes.status}`);
  return data.storagePath as string;
}

// Helper called by the thumbnail-picker save: uploads new thumb, patches
// the delivery_files row, returns a fresh signed GET URL for immediate display.
async function uploadAndAttachThumbnail(
  deliveryId: string,
  fileId: string,
  originalName: string,
  blob: Blob,
  updateDeliveryFile: (id: string, patch: { thumbnailStoragePath?: string }) => Promise<void>,
): Promise<string> {
  const sess = await supabase.auth.getSession();
  const accessToken = sess.data.session?.access_token || "";
  const newKey = await uploadThumbnailBlob(deliveryId, originalName, blob, accessToken);
  await updateDeliveryFile(fileId, { thumbnailStoragePath: newKey });

  // Round-trip via the signed-urls action to get a fresh GET URL we can
  // display immediately (rather than refetching the whole gallery).
  const res = await fetch("/api/deliveries", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ action: "signed-urls", deliveryId, fileIds: [fileId] }),
  });
  const body = await res.json();
  const entry = (body?.urls || []).find((u: { id: string }) => u.id === fileId);
  return entry?.thumbnailUrl || "";
}

// ---------------------------------------------------------------
// ThumbnailPicker — modal that lets the admin scrub through a video
// and capture any frame as the new thumbnail.
// ---------------------------------------------------------------

interface ThumbnailPickerProps {
  file: { id: string; originalName: string };
  videoUrl: string;
  onClose: () => void;
  onSaved: (newThumbUrl: string) => void;
  uploadThumbnail: (blob: Blob) => Promise<string>;
}

function ThumbnailPicker({ file, videoUrl, onClose, onSaved, uploadThumbnail }: ThumbnailPickerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [saving, setSaving] = useState(false);

  const handleCapture = async () => {
    const v = videoRef.current;
    if (!v) return;
    setSaving(true);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = v.videoWidth;
      canvas.height = v.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Couldn't draw frame");
      ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
      if (!blob) throw new Error("Couldn't capture frame");
      const newUrl = await uploadThumbnail(blob);
      onSaved(newUrl);
    } catch (err) {
      toast.error("Couldn't save thumbnail", { description: err instanceof Error ? err.message : "" });
      setSaving(false);
    }
  };

  if (!videoUrl) {
    return (
      <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={onClose}>
        <div className="bg-slate-900 border border-white/10 rounded-lg p-6 max-w-md text-center" onClick={(e) => e.stopPropagation()}>
          <p className="text-sm text-slate-300 mb-3">Loading video — try again in a moment.</p>
          <button onClick={onClose} className="text-xs px-3 py-1.5 border border-white/10 rounded-md text-slate-300 hover:bg-white/5">Close</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-slate-900 border border-white/10 rounded-lg w-full max-w-2xl flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <h3 className="text-sm font-semibold text-white">Pick thumbnail — {file.originalName}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4">
          <video
            ref={videoRef}
            src={videoUrl}
            controls
            className="w-full rounded-md bg-black max-h-[60vh]"
            playsInline
          />
          <p className="text-[11px] text-slate-500 mt-2">
            Scrub to the frame you want, pause, then click "Use this frame."
          </p>
        </div>
        <div className="flex items-center justify-end gap-2 p-4 border-t border-white/10">
          <button onClick={onClose} disabled={saving} className="text-xs px-3 py-1.5 border border-white/10 rounded-md text-slate-300 hover:bg-white/5">
            Cancel
          </button>
          <button
            onClick={handleCapture}
            disabled={saving}
            className="text-xs px-3 py-1.5 bg-[#0088ff] text-white rounded-md font-semibold hover:bg-[#0066dd] disabled:opacity-50"
          >
            {saving ? "Saving…" : "Use this frame"}
          </button>
        </div>
      </div>
    </div>
  );
}
