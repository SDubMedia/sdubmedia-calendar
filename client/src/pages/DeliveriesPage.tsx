// Slate-side galleries management. Two views, switched by URL:
//   /deliveries        — list of galleries + "New gallery"
//   /deliveries/:id    — detail: upload, file grid, selections panel, status controls
//
// Most CRUD goes through AppContext. R2 upload + password set + R2 cleanup
// go through API endpoints (signed URL for upload, server-side hashing).

import { useEffect, useMemo, useRef, useState } from "react";
import { useRoute, Link, useLocation } from "wouter";
import { useApp } from "@/contexts/AppContext";
import { toUploadableImage } from "@/lib/heic";
import PrereqGate from "@/components/PrereqGate";
import { DateField } from "@/components/DateTimeField";
import { useConfirm } from "@/components/ConfirmProvider";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { getAuthToken } from "@/lib/supabase";
import { buildInvoice, generateInvoiceNumberFromDB } from "@/lib/invoice";
import { expectedPartSize, resumablePartNumbers, type ListedPart } from "@/lib/multipart";
import { getProjectInvoiceAmount, getProjectPayerId } from "@/lib/data";
import type { Client, DeliveryStatus, Project } from "@/lib/types";
import { ArrowLeft, Plus, Upload, Copy, Trash2, Eye, Lock, ExternalLink, Check, X, Play, Image as ImageIcon, HardDrive, Pencil } from "lucide-react";
import { DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy, arrayMove, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

const PUBLIC_BASE = typeof window !== "undefined" ? window.location.origin : "https://slate.sdubmedia.com";

// One draggable photo tile. Drag to reorder (mouse: move ~6px; touch: press &
// hold ~0.2s, so normal scrolling still works). The tile's own buttons stop the
// drag from starting so taps still delete / mark / pick a thumbnail.
function SortablePhoto({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 30 : undefined,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      className="relative group aspect-square bg-white/[0.02] border border-white/10 rounded-lg overflow-hidden cursor-grab active:cursor-grabbing"
      {...attributes}
      {...listeners}
    >
      {children}
    </div>
  );
}

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
  const { data, addDelivery, deleteDelivery } = useApp();
  const [createOpen, setCreateOpen] = useState(false);
  const confirm = useConfirm();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Delete from the list, so clearing out a test or duplicate gallery does not
  // mean opening it, finding the General tab and scrolling to the bottom. Same
  // two-step as the detail page: the API call unlinks the R2 objects, the
  // context call removes the row and its files/selections.
  async function deleteFromList(e: React.MouseEvent, d: { id: string; title: string }) {
    // The card is a link. Without this, deleting navigates into the gallery.
    e.preventDefault();
    e.stopPropagation();
    const fileCount = data.deliveryFiles.filter(f => f.deliveryId === d.id).length;
    const ok = await confirm({
      title: "Delete gallery?",
      description: `Delete "${d.title || "Untitled"}"?${fileCount ? ` This permanently removes ${fileCount} file${fileCount === 1 ? "" : "s"}.` : ""} If the client has the link, it stops working.`,
      destructive: true,
      confirmLabel: "Delete",
    });
    if (!ok) return;
    setDeletingId(d.id);
    try {
      const accessToken = await getAuthToken();
      await fetch("/api/deliveries", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ action: "delete-delivery", id: d.id }),
      });
      await deleteDelivery(d.id);
      toast.success("Gallery deleted");
    } catch (err) {
      toast.error("Couldn't delete", { description: err instanceof Error ? err.message : "Try again" });
    } finally {
      setDeletingId(null);
    }
  }

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
        <a className="group relative block rounded-xl border border-white/10 bg-white/[0.02] hover:border-[#0088ff]/30 hover:bg-white/[0.04] transition-colors p-5">
          {/* Hover-reveal on desktop, but ALWAYS visible below md. A phone has
              no hover, so opacity-0 there would leave an invisible-but-clickable
              delete sitting over the top-right corner of the card. */}
          <button
            type="button"
            onClick={(e) => deleteFromList(e, d)}
            disabled={deletingId === d.id}
            title="Delete gallery"
            aria-label={`Delete ${d.title || "Untitled"}`}
            className="absolute top-2.5 right-2.5 z-10 p-1.5 rounded-lg text-slate-500 opacity-100 md:opacity-0 md:group-hover:opacity-100 focus:opacity-100 hover:text-red-400 hover:bg-red-500/10 transition-opacity disabled:opacity-40"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <div className="flex items-start justify-between gap-3 mb-3 pr-7">
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
        <DateField value={expiresAt} onChange={setExpiresAt} className="w-full mb-5" />

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
  const { data, updateDelivery, deleteDelivery, setDeliveryStatus, registerDeliveryFile, updateDeliveryFile, deleteDeliveryFile, reorderDeliveryFiles, markSelectionEdited, addInvoice } = useApp();
  const confirm = useConfirm();
  const [, setLocation] = useLocation();
  // Go back to wherever we came from (e.g. the project we opened the gallery
  // from) rather than always dumping the user in the galleries list.
  const goBack = () => { if (window.history.length > 1) window.history.back(); else setLocation("/deliveries"); };

  // Archive this gallery to the owner's Google Drive — one file per request so
  // large galleries don't time out. Shows live progress.
  const [driveSend, setDriveSend] = useState<{ active: boolean; done: number; total: number }>({ active: false, done: 0, total: 0 });
  // Rename state lives up here with the other hooks: everything below the
  // `if (!delivery) return` early exit runs conditionally, and a hook there
  // changes hook order between renders.
  const [renaming, setRenaming] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [savingTitle, setSavingTitle] = useState(false);
  const sendToDrive = async () => {
    if (!delivery) return;
    if (!data.organization?.googleDriveEmail) { toast.error("Connect Google Drive first (Manage → Settings)"); return; }
    setDriveSend({ active: true, done: 0, total: 0 });
    try {
      const token = await getAuthToken();
      const auth = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
      const prep = await fetch("/api/gallery-drive-prepare", { method: "POST", headers: auth, body: JSON.stringify({ deliveryId: delivery.id }) });
      const pbody = await prep.json().catch(() => ({ error: "Failed" }));
      if (!prep.ok) throw new Error(pbody.error || "Couldn't prepare Drive folder");
      const driveFiles: { id: string }[] = pbody.files || [];
      setDriveSend({ active: true, done: 0, total: driveFiles.length });
      let done = 0, failed = 0;
      for (const f of driveFiles) {
        try {
          const up = await fetch("/api/gallery-drive-upload", { method: "POST", headers: auth, body: JSON.stringify({ deliveryId: delivery.id, fileId: f.id, folderId: pbody.folderId }) });
          if (!up.ok) failed++;
        } catch { failed++; }
        done++;
        setDriveSend({ active: true, done, total: driveFiles.length });
      }
      toast.success(failed ? `Sent ${done - failed} of ${done} to Google Drive (${failed} failed)` : `Sent ${done} photo${done === 1 ? "" : "s"} to Google Drive`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't send to Google Drive");
    } finally {
      setDriveSend({ active: false, done: 0, total: 0 });
    }
  };
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Declared up here (before any early return) to keep hook order stable.
  const clientsById = useMemo(() => Object.fromEntries(data.clients.map(c => [c.id, c])), [data.clients]);
  const [charging, setCharging] = useState(false);
  const [uploading, setUploading] = useState<{ done: number; total: number; pct: number; name: string } | null>(null);
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

  // Drag-to-reorder: mouse drags after a small move; touch needs a short press
  // (so the gallery still scrolls normally on phones).
  const dragSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
  );
  function handlePhotoDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = files.findIndex(f => f.id === active.id);
    const newIndex = files.findIndex(f => f.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const newOrder = arrayMove(files, oldIndex, newIndex).map(f => f.id);
    reorderDeliveryFiles(id, newOrder).catch(() => toast.error("Couldn't save the new order"));
  }
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
    setUploading({ done: 0, total: list.length, pct: 0, name: "" });
    let done = 0, failed = 0;
    for (const rawFile of list) {
      try {
        // iPhone HEIC → JPEG so it displays; full quality, full resolution.
        const file = await toUploadableImage(rawFile);
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

        // 1 + 2. Get the file into R2.
        //
        // Anything over MULTIPART_THRESHOLD goes the multipart route: a single
        // presigned PUT cannot resume and its URL expires, so a 3-5GB film over
        // a domestic upstream loses the whole transfer to one blip. Below the
        // threshold the single PUT is fewer round trips and simpler.
        const sess = await supabase.auth.getSession();
        const accessToken = sess.data.session?.access_token || "";
        const onPct = (pct: number) => setUploading({ done, total: list.length, pct, name: file.name });
        let primaryStoragePath: string;

        if (file.size > MULTIPART_THRESHOLD) {
          primaryStoragePath = await uploadFileMultipart(id, file, accessToken, onPct);
        } else {
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
          await putFileWithProgress(uploadData.uploadUrl, file, onPct);
          primaryStoragePath = uploadData.storagePath;
        }

        // 2a. Portrait work: keep the untouched original next to the
        // compressed copy. `file` above has been re-encoded to JPEG at 80%
        // (fast galleries, right for real estate); `rawFile` is exactly what
        // came off the card, EXIF and colour profile intact. Only stills — a
        // video is never re-encoded, so its "original" is the same bytes.
        let originalStoragePath = "";
        let originalSizeBytes = 0;
        if (delivery?.keepOriginals && !isVideo && rawFile !== file) {
          try {
            const origRes = await fetch("/api/delivery-upload", {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
              body: JSON.stringify({
                deliveryId: id,
                fileName: rawFile.name,
                contentType: rawFile.type || "application/octet-stream",
                sizeBytes: rawFile.size,
                kind: "original",
              }),
            });
            const origData = await origRes.json();
            if (!origRes.ok) throw new Error(origData.error || "Original upload URL failed");
            await putFileWithProgress(origData.uploadUrl, rawFile, () => {});
            originalStoragePath = origData.storagePath;
            originalSizeBytes = rawFile.size;
          } catch (origErr) {
            // Non-fatal: the client still gets the photo, just the compressed
            // one. Loud in the console so it isn't silent.
            console.error("Original upload failed — compressed copy kept", origErr);
            toast.message(`Kept the compressed copy of ${rawFile.name}`, { description: "The full-quality original didn't upload." });
          }
        }

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

        // 3. Register file metadata.
        //
        // The bytes are already in R2 by this point. If this write fails the
        // object is stranded — billed monthly, shown to nobody, and outside
        // the multipart lifecycle rule, which only reaps uploads that never
        // completed. So clean up before surfacing the error.
        try {
          await registerDeliveryFile({
            deliveryId: id,
            storagePath: primaryStoragePath,
            originalName: file.name,
            sizeBytes: file.size,
            width,
            height,
            mimeType: file.type,
            position: files.length + done,
            mediaType: isVideo ? "video" : "image",
            thumbnailStoragePath,
            durationSeconds,
            originalStoragePath,
            originalSizeBytes,
          });
        } catch (regErr) {
          await discardOrphanedUpload(
            [primaryStoragePath, originalStoragePath, thumbnailStoragePath],
            accessToken,
          );
          throw regErr;
        }

        done++;
        setUploading({ done, total: list.length, pct: 0, name: "" });
      } catch (err) {
        console.error(`Upload failed: ${rawFile.name}`, err);
        toast.error(`Failed: ${rawFile.name}`, { description: err instanceof Error ? err.message : "Try again" });
        failed++;
        done++;
        setUploading({ done, total: list.length, pct: 0, name: "" });
      }
    }
    setUploading(null);
    // This used to say "Upload complete" unconditionally, so a run where every
    // single file failed still ended on a green success toast. Say what
    // actually happened.
    const added = list.length - failed;
    if (failed === 0) {
      toast.success("Upload complete", { description: `${added} file${added === 1 ? "" : "s"} added.` });
    } else if (added === 0) {
      toast.error("Nothing uploaded", { description: `All ${failed} file${failed === 1 ? "" : "s"} failed.` });
    } else {
      toast.warning("Partly uploaded", { description: `${added} added, ${failed} failed.` });
    }
  }

  async function handleDeleteFile(fileId: string) {
    if (!(await confirm({ title: "Delete this photo?", description: "This also removes it from the client gallery.", destructive: true, confirmLabel: "Delete" }))) return;
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
    if (!(await confirm({ title: "Delete gallery?", description: `Delete "${delivery.title}"? This removes all photos permanently.`, destructive: true, confirmLabel: "Delete" }))) return;
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
  // "Agent" is real-estate language and reads as a mistake on a portrait,
  // school or business shoot. Use the client's own name where we have it, and
  // only fall back to "agent" when they actually are one.
  const clientNoun = agentClient?.company
    || (agentClient?.clientType === "agent" ? "the agent" : "the client");
  const clientNounGeneric = agentClient?.clientType === "agent" ? "the agent" : "the client";
  const hasBroker = agentClient?.clientType === "agent" && !!agentClient.brokerId;

  // Self-pay charge on delivery: when the shoot's payer resolves to an agent
  // (no broker covering it) who has a card on file, the owner can charge that
  // card right when they deliver the photos. Their agreement authorizes it.
  const payer = project ? clientsById[getProjectPayerId(project, clientsById)] : null;
  const canChargeOnDelivery = !!project && payer?.clientType === "agent" && !!payer.cardOnFile && !project.paidDate;
  const chargeAmount = (project && payer) ? getProjectInvoiceAmount(project, payer) : 0;

  // Build a one-shoot invoice billed to the agent, then charge their saved card
  // off-session. On a decline the invoice stays unpaid so it can be sent instead.
  const chargeOnDelivery = async () => {
    if (!project || !payer) return;
    setCharging(true);
    try {
      const draft = buildInvoice(payer, [project], data.projectTypes, data.locations, [], project.date, project.date, data.organization, data.clients);
      if (!draft.lineItems.length || !(draft.total > 0)) { toast.error("Nothing to charge on this shoot"); return; }
      draft.invoiceNumber = await generateInvoiceNumberFromDB(supabase);
      draft.viewToken = Math.random().toString(36).slice(2, 12) + Math.random().toString(36).slice(2, 12);
      const created = await addInvoice(draft);
      const token = await getAuthToken();
      const res = await fetch("/api/charge-agent-card", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ invoiceId: created.id }),
      });
      const body = await res.json().catch(() => ({ error: "Failed" }));
      if (!res.ok) throw new Error(body.error || "Couldn't charge the card");
      toast.success(`Charged${body.last4 ? ` ···· ${body.last4}` : ""} $${chargeAmount.toFixed(2)} — invoice marked paid`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't charge — invoice saved, send it to collect", { description: "Send the payment link from Invoices." });
    } finally {
      setCharging(false);
    }
  };

  // One-tap deliver: mark delivered, notify the agent, and (for a self-pay
  // agent with a card) offer to charge. Used by the prominent Photos-tab button
  // and the granular Status control.
  const deliverToAgent = async () => {
    // Delivering emails the client a live link. It can't be unsent, and setting
    // the gallery back to draft doesn't revoke it — the public link works
    // whatever the status. So it gets an explicit confirmation naming who and
    // how many, which is what a one-tap deliver was missing when a gallery went
    // out by accident.
    const photoCount = files.length;
    const emailTarget = agentClient?.email || "";
    const ok = await confirm({
      title: `Send this gallery to ${clientNoun}?`,
      description: `${photoCount} file${photoCount === 1 ? "" : "s"} will be emailed${emailTarget ? ` to ${emailTarget}` : ""} as a live link they can view and download straight away.${hasBroker ? " The brokerage is notified too." : ""} This can't be unsent — putting the gallery back to draft doesn't take the link away.`,
      confirmLabel: "Send it",
    });
    if (!ok) return;
    await setDeliveryStatus(id, "delivered");
    notifyGallery("agent");
    // If this shoot belongs to a brokerage, automatically notify every managing
    // broker too — no button. Fires quietly so a brokerage-less shoot is a no-op.
    const shootClient = project ? data.clients.find(c => c.id === project.clientId) : null;
    const hasBrokerage = shootClient?.clientType === "broker" || (shootClient?.clientType === "agent" && !!shootClient.brokerId);
    if (hasBrokerage) notifyBrokersSilently();
    if (canChargeOnDelivery && !charging && await confirm({ title: "Charge card on file?", description: `Charge ${payer?.company || clientNounGeneric} $${chargeAmount.toFixed(2)} to their card on file now? They get the photos either way.`, confirmLabel: "Charge card" })) {
      await chargeOnDelivery();
    }
  };

  // Rename in place. The title is what the client sees on the page, in the
  // link preview and in the delivery email, so it needs to be fixable while
  // organising — not only at creation, which is when it's least known.
  const saveTitle = async () => {
    const next = titleDraft.trim();
    if (!next || next === delivery?.title) { setRenaming(false); return; }
    setSavingTitle(true);
    try {
      await updateDelivery(id, { title: next });
      setRenaming(false);
      toast.success("Gallery renamed");
    } catch { toast.error("Couldn't rename the gallery"); }
    finally { setSavingTitle(false); }
  };

  // Mark delivered WITHOUT telling the client. For work handed over outside
  // Slate (WeTransfer, Drive, a hand-off in person) — the job stops showing as
  // outstanding without anyone receiving a gallery link they don't need.
  const markDeliveredQuietly = async () => {
    const ok = await confirm({
      title: "Mark delivered without notifying?",
      description: "The client won't be emailed and no link is sent. Use this when you've delivered the work some other way — it just clears the job off your outstanding list.",
      confirmLabel: "Mark delivered",
    });
    if (!ok) return;
    await setDeliveryStatus(id, "delivered");
    toast.success("Marked delivered — nothing was sent to the client");
  };

  // Best-effort auto fan-out to the brokerage's managing brokers on delivery.
  const notifyBrokersSilently = async () => {
    try {
      const token = await getAuthToken();
      const res = await fetch("/api/notify-gallery-ready", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ deliveryId: id, recipient: "broker" }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        console.error("Auto broker-notify failed:", d.error || res.status);
      }
    } catch (e) {
      console.error("Auto broker-notify failed:", e);
    }
  };

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
      if (d.emailed || d.pushed) toast.success(recipient === "broker" ? "Sent the broker the link" : `Notified ${clientNoun}`);
      else toast.message(`No email on file for ${recipient === "broker" ? "the broker" : clientNoun} — add one to notify them.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't notify");
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6">
      <button onClick={goBack} className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-white mb-3"><ArrowLeft className="w-4 h-4" /> Back</button>

      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-6">
        <div className="min-w-0">
          <div className="flex items-center gap-3 mb-1">
            {renaming ? (
              <input
                autoFocus
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); saveTitle(); }
                  if (e.key === "Escape") { setTitleDraft(delivery.title); setRenaming(false); }
                }}
                onBlur={saveTitle}
                disabled={savingTitle}
                className="text-2xl font-bold bg-transparent border-b border-white/30 focus:border-white/70 outline-none min-w-0 flex-1"
                style={{ fontFamily: "'Space Grotesk', system-ui" }}
              />
            ) : (
              <button
                type="button"
                onClick={() => { setTitleDraft(delivery.title); setRenaming(true); }}
                title="Rename this gallery"
                className="group flex items-center gap-2 min-w-0 text-left"
              >
                <h1 className="text-2xl font-bold truncate" style={{ fontFamily: "'Space Grotesk', system-ui" }}>{delivery.title}</h1>
                <Pencil className="w-3.5 h-3.5 text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
              </button>
            )}
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
          {/* One-tap deliver, right where the photos are. */}
          <div className="mb-6">
            {delivery.status === "delivered" ? (
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-emerald-300 flex items-center gap-2"><Check className="w-4 h-4 shrink-0" /> Delivered — {clientNoun} has been notified</span>
                <button onClick={() => notifyGallery("agent")} className="text-xs px-3 py-1.5 border border-emerald-500/30 rounded-lg hover:bg-emerald-500/10 whitespace-nowrap">Re-notify</button>
              </div>
            ) : (
              <button
                onClick={deliverToAgent}
                disabled={files.length === 0 || charging}
                className="w-full bg-emerald-600 text-white rounded-lg py-3 px-4 font-semibold flex items-center justify-center gap-2 hover:bg-emerald-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ImageIcon className="w-5 h-5 shrink-0" />
                {files.length === 0 ? "Upload photos, then deliver" : `Deliver ${files.length} photo${files.length === 1 ? "" : "s"} to ${clientNoun}`}
              </button>
            )}
          </div>
          {/* Archive to Google Drive */}
          {files.length > 0 && data.organization?.googleDriveEmail && (
            <div className="mb-6">
              <button
                onClick={sendToDrive}
                disabled={driveSend.active}
                className="w-full border border-border rounded-lg py-2.5 px-4 text-sm font-medium flex items-center justify-center gap-2 hover:bg-white/5 transition-colors disabled:opacity-50"
              >
                <HardDrive className="w-4 h-4 shrink-0" />
                {driveSend.active ? `Sending to Google Drive… ${driveSend.done}/${driveSend.total}` : "Send to Google Drive"}
              </button>
            </div>
          )}
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
              <StatusButton current={delivery.status} target="delivered" onClick={deliverToAgent} label="Mark delivered" />
            </div>
            <button
              onClick={markDeliveredQuietly}
              disabled={delivery.status === "delivered"}
              className="mt-2 text-xs text-slate-400 underline underline-offset-2 hover:text-slate-200 disabled:opacity-40 disabled:no-underline disabled:cursor-not-allowed"
              title="Clears the job without emailing the client — for work delivered outside Slate"
            >
              Mark delivered without notifying
            </button>
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
                <p className="text-[10px] text-slate-500 mt-1.5">Delivering notifies {clientNounGeneric} automatically. Use this only if the brokerage asks for the link.</p>
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
          <QualityPanel
            keepOriginals={delivery.keepOriginals ?? false}
            onUpdate={(v) => updateDelivery(id, { keepOriginals: v })}
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
          Videos: .mp4, .mov, .m4v · up to 5 GB each. Photos: any image format · up to 50 MB each.
        </p>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={!!uploading}
          className="inline-flex items-center gap-2 px-4 py-2 bg-[#0088ff] text-white rounded-lg font-semibold text-sm hover:bg-[#0066dd] disabled:opacity-50"
        >
          {uploading ? `Uploading ${uploading.done} / ${uploading.total}…` : "Choose files"}
        </button>
        {uploading && (
          <div className="mt-3 max-w-md mx-auto text-left">
            {uploading.name && (
              <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1 gap-2">
                <span className="truncate min-w-0">{uploading.name}</span>
                <span className="shrink-0 tabular-nums">{uploading.pct}%</span>
              </div>
            )}
            <div className="h-2 rounded-full bg-white/10 overflow-hidden">
              <div className="h-full bg-[#0088ff] transition-[width] duration-150" style={{ width: `${uploading.pct}%` }} />
            </div>
            <p className="text-[10px] text-slate-500 mt-1.5">Keep this tab open until it finishes.</p>
          </div>
        )}
      </div>

      {/* File grid */}
      {files.length === 0 ? (
        <p className="text-center text-sm text-slate-500 py-8">No photos or videos yet.</p>
      ) : (
        <DndContext sensors={dragSensors} collisionDetection={closestCenter} onDragEnd={handlePhotoDragEnd}>
        <SortableContext items={files.map(f => f.id)} strategy={rectSortingStrategy}>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {files.map((f) => {
            const sel = selections.find(s => s.fileId === f.id);
            const isVideo = f.mediaType === "video";
            const thumb = thumbUrls.get(f.id);
            const photo = signedUrls.get(f.id);
            return (
              <SortablePhoto key={f.id} id={f.id}>
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
                  </>
                ) : photo ? (
                  <img src={photo} alt={f.originalName} className="w-full h-full object-cover" loading="lazy" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-slate-500 text-xs p-2 text-center">
                    {f.originalName}
                  </div>
                )}
                {/* Filename caption — so you and the client can reference each
                    file by name ("change Main Video"). Extension stripped. */}
                <div className="absolute bottom-0 inset-x-0 px-2 py-1.5 bg-gradient-to-t from-black/85 via-black/45 to-transparent pointer-events-none">
                  <div className="flex items-end justify-between gap-2">
                    <p className="text-[10px] text-white/95 font-medium truncate min-w-0" title={f.originalName}>
                      {f.originalName.replace(/\.[^.]+$/, "")}
                    </p>
                    {isVideo && f.durationSeconds != null && (
                      <span className="text-[10px] text-white/80 font-mono shrink-0">{formatDuration(f.durationSeconds)}</span>
                    )}
                  </div>
                </div>
                {sel && (
                  <div className="absolute top-2 left-2 flex items-center gap-1">
                    <span className="bg-red-500 text-white text-xs px-1.5 py-0.5 rounded">♥</span>
                    {sel.isPaid && <span className="bg-emerald-500 text-white text-[10px] uppercase font-bold px-1.5 py-0.5 rounded">Paid</span>}
                  </div>
                )}
                {sel && proofingEnabled && !isVideo && (
                  <button
                    onClick={() => markSelectionEdited(sel.id, !sel.editedAt)}
                    onPointerDown={(e) => e.stopPropagation()}
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
                    onPointerDown={(e) => e.stopPropagation()}
                    className="absolute top-2 right-2 text-[10px] bg-black/60 hover:bg-blue-500 text-white px-2 py-1 rounded font-semibold opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100"
                    title="Pick a thumbnail frame from playback"
                  >
                    Thumbnail
                  </button>
                )}
                <button
                  onClick={() => handleDeleteFile(f.id)}
                  onPointerDown={(e) => e.stopPropagation()}
                  className="absolute bottom-2 right-2 p-1.5 bg-black/60 hover:bg-red-500 text-white rounded opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100"
                  aria-label="Delete"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </SortablePhoto>
            );
          })}
        </div>
        </SortableContext>
        </DndContext>
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

function QualityPanel({ keepOriginals, onUpdate }: { keepOriginals: boolean; onUpdate: (v: boolean) => Promise<void> }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5 mb-6">
      <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Photo quality</h3>
      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={keepOriginals}
          onChange={(e) => onUpdate(e.target.checked)}
          className="mt-1 w-4 h-4 accent-[#0088ff]"
        />
        <span>
          <span className="text-sm text-white font-medium block">Keep full-quality originals</span>
          <span className="text-xs text-slate-500">
            Photos are normally re-saved at 80% quality so galleries load fast — right for listings, not for portrait work.
            Turn this on and the untouched file is kept too: the client browses the light version and downloads the original,
            with its EXIF and colour profile intact. Uses about twice the storage. Applies to photos added from now on.
          </span>
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
        <DateField
          value={val}
          onChange={(v) => {
            setVal(v);
            const next = v ? `${v}T23:59:59Z` : null;
            if (next !== expiresAt) onUpdate(next);
          }}
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
// PUT a file to a signed URL with byte-level upload progress. fetch() can't
// report upload progress, so we use XMLHttpRequest for the transfer — critical
// for large videos where the user needs to see it's actually moving.
// Above this, use multipart. 100MB is well under the point where a single PUT
// becomes risky, so ordinary photos and short clips keep the simpler path.
const MULTIPART_THRESHOLD = 100 * 1024 * 1024;

// No bytes moved for this long = the connection is dead, whatever it claims.
// Used by both uploaders. Generous enough that a genuinely slow line is never
// mistaken for a stall.
const STALL_TIMEOUT_MS = 60_000;

function putFileWithProgress(url: string, file: File, onProgress: (pct: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", file.type);

    // Same stall detection as the multipart path. This used to have an
    // ontimeout handler and never set xhr.timeout, so the handler was dead
    // code and a stalled connection hung here forever — no error, no progress,
    // no way out but reloading the page.
    let stall: ReturnType<typeof setTimeout>;
    const armStall = () => {
      clearTimeout(stall);
      stall = setTimeout(() => xhr.abort(), STALL_TIMEOUT_MS);
    };
    const settle = (fn: () => void) => { clearTimeout(stall); fn(); };

    xhr.upload.onprogress = (e) => {
      armStall();
      if (e.lengthComputable) onProgress(Math.min(99, Math.round((e.loaded / e.total) * 100)));
    };
    xhr.onload = () => settle(() => {
      if (xhr.status >= 200 && xhr.status < 300) { onProgress(100); resolve(); }
      else reject(new Error(`R2 upload failed: ${xhr.status}`));
    });
    xhr.onerror = () => settle(() => reject(new Error("Network error during upload — check your connection")));
    xhr.onabort = () => settle(() => reject(new Error(`Upload stalled — no data for ${STALL_TIMEOUT_MS / 1000}s`)));
    armStall();
    xhr.send(file);
  });
}

/** Delete bytes that reached R2 but never got a gallery row.
 *
 *  Best effort by design: the upload has already failed and the user needs
 *  that error, not a second one about cleanup. The server refuses to delete
 *  anything a delivery_files row still points at, so a false alarm here cannot
 *  destroy a live file. */
async function discardOrphanedUpload(paths: string[], accessToken: string): Promise<void> {
  for (const storagePath of paths.filter(Boolean)) {
    try {
      await fetch("/api/delivery-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ action: "discard-orphan", storagePath }),
      });
    } catch (e) {
      console.warn(`Couldn't clean up orphaned upload ${storagePath}`, e);
    }
  }
}

// Resume bookkeeping for multipart uploads
// ---------------------------------------------------------------
// All the browser needs to remember is an upload id. Which parts actually
// landed is asked of R2 at resume time — a local tally of "what I think I
// sent" can be wrong (a part can fail after the progress event fires), and
// being wrong here means a silently truncated file.
//
// Kept in localStorage rather than the database: it is per-browser scratch,
// worthless to any other device (the file lives on this machine), and a schema
// migration to store it server-side would buy nothing.

const MPU_PREFIX = "slate:mpu:";
// Must not exceed the bucket's "abort incomplete multipart uploads" lifecycle
// rule, or we would offer to resume an upload R2 has already reaped.
const MPU_RECORD_TTL_MS = 7 * 24 * 60 * 60 * 1000;

interface MpuRecord {
  uploadId: string;
  storagePath: string;
  partSize: number;
  partCount: number;
  savedAt: number;
}

/** Identifies the exact file. Name alone is not enough — resuming onto a
 *  different file that happens to share a name would splice two videos
 *  together and the result would still "complete" cleanly. */
function mpuKey(deliveryId: string, file: File): string {
  return `${MPU_PREFIX}${deliveryId}:${file.name}:${file.size}:${file.lastModified}`;
}

// localStorage throws in private mode and when the quota is full. Resume is a
// convenience: if the bookkeeping fails, the upload must still work.
function mpuLoad(key: string): MpuRecord | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const rec = JSON.parse(raw) as MpuRecord;
    // Validate rather than trust. This is user-writable storage that survives
    // across deploys, so a truncated or hand-edited record is possible — and a
    // partSize of 0 or NaN would compute nonsense offsets and slice the file
    // wrongly. Anything not obviously sound is discarded and the upload starts
    // clean, which costs bandwidth and nothing else.
    const sound = typeof rec?.uploadId === "string" && rec.uploadId.length > 0
      && typeof rec?.storagePath === "string" && rec.storagePath.length > 0
      && Number.isInteger(rec?.partSize) && rec.partSize > 0
      && Number.isInteger(rec?.partCount) && rec.partCount > 0
      && typeof rec?.savedAt === "number" && Number.isFinite(rec.savedAt);
    if (!sound) { localStorage.removeItem(key); return null; }
    if (Date.now() - rec.savedAt > MPU_RECORD_TTL_MS) { localStorage.removeItem(key); return null; }
    return rec;
  } catch { return null; }
}

function mpuSave(key: string, rec: MpuRecord): void {
  try { localStorage.setItem(key, JSON.stringify(rec)); } catch { /* resume is optional */ }
}

function mpuClear(key: string): void {
  try { localStorage.removeItem(key); } catch { /* resume is optional */ }
}

/** Drop records past the TTL so a laptop that uploads a lot does not
 *  accumulate dead keys forever. */
function mpuPrune(): void {
  try {
    const dead: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(MPU_PREFIX)) continue;
      // Parsed per key: one unreadable record used to throw out of the whole
      // loop, so everything after it stayed forever.
      try {
        const rec = JSON.parse(localStorage.getItem(k) || "{}") as MpuRecord;
        if (Date.now() - (rec?.savedAt || 0) > MPU_RECORD_TTL_MS) dead.push(k);
      } catch { dead.push(k); }
    }
    dead.forEach(k => localStorage.removeItem(k));
  } catch { /* resume is optional */ }
}

/**
 * Multipart upload for large files (finished wedding films run 3-5GB).
 *
 * A single presigned PUT cannot resume and its URL expires, so one network
 * blip 40 minutes in loses the whole transfer. This slices the TRANSFER — not
 * the file — into parts, uploads several at a time, retries a failed part on
 * its own, and R2 reassembles them into one object. The client downloads a
 * single intact file.
 *
 * RESUMABLE. A failed or abandoned upload is deliberately NOT aborted: the
 * parts R2 already holds are the whole point, and dropping the same file on
 * the same gallery again picks up where it stopped. The bucket's lifecycle
 * rule reaps anything never resumed (see MPU_RECORD_TTL_MS).
 */
async function uploadFileMultipart(
  deliveryId: string,
  file: File,
  accessToken: string,
  onProgress: (pct: number) => void,
): Promise<string> {
  const authHeaders = { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` };
  const call = async (payload: Record<string, unknown>) => {
    const r = await fetch("/api/delivery-multipart", {
      method: "POST", headers: authHeaders, body: JSON.stringify(payload),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || "Upload failed");
    return j;
  };

  mpuPrune();
  const recordKey = mpuKey(deliveryId, file);

  // --- resume, if this exact file was interrupted on this gallery ---
  let uploadId = "";
  let storagePath = "";
  let partSize = 0;
  let partCount = 0;
  const alreadyDone = new Set<number>();

  const saved = mpuLoad(recordKey);
  if (saved) {
    try {
      const st = await call({ action: "status", storagePath: saved.storagePath, uploadId: saved.uploadId });
      // Only resume when R2 still has the upload AND the part size has not
      // changed under us (a deploy can change PART_SIZE, which would shift
      // every offset and interleave garbage).
      if (st.live && st.partSize === saved.partSize) {
        uploadId = saved.uploadId;
        storagePath = saved.storagePath;
        partSize = saved.partSize;
        partCount = saved.partCount;
        resumablePartNumbers(file.size, partSize, partCount, st.parts as ListedPart[])
          .forEach(n => alreadyDone.add(n));
      } else {
        // Still live but unusable (part size changed under us). Abort it here
        // rather than leaving it for the lifecycle rule — this is the one case
        // where we know for certain the parts will never be wanted.
        if (st.live) { try { await call({ action: "abort", storagePath: saved.storagePath, uploadId: saved.uploadId }); } catch { /* lifecycle rule will get it */ } }
        mpuClear(recordKey);
      }
    } catch (e) {
      // Resume is best-effort: fall through to a clean upload rather than
      // failing the whole thing because a status check hiccupped.
      console.warn("Couldn't check for a resumable upload — starting fresh", e);
      mpuClear(recordKey);
    }
  }

  if (!uploadId) {
    const created = await call({
      action: "create", deliveryId, fileName: file.name,
      contentType: file.type || "application/octet-stream", sizeBytes: file.size,
    });
    ({ uploadId, storagePath, partSize, partCount } = created);
    alreadyDone.clear();
  }

  // Written before a single byte goes out: if the tab dies mid-upload, the id
  // has to already be on disk or those parts are unreachable.
  mpuSave(recordKey, { uploadId, storagePath, partSize, partCount, savedAt: Date.now() });

  try {
    const numbers = Array.from({ length: partCount }, (_, i) => i + 1)
      .filter(n => !alreadyDone.has(n));
    if (alreadyDone.size > 0) {
      toast.message(`Resuming ${file.name}`, {
        description: `${alreadyDone.size} of ${partCount} pieces already uploaded.`,
      });
    }
    // Signed in batches of 200 — the endpoint's per-request ceiling.
    const urlMap = new Map<number, string>();
    for (let i = 0; i < numbers.length; i += 200) {
      const { urls } = await call({ action: "sign", storagePath, uploadId, partNumbers: numbers.slice(i, i + 200) });
      (urls as { partNumber: number; url: string }[]).forEach(u => urlMap.set(u.partNumber, u.url));
    }

    // Progress is tracked per part so the bar reflects real bytes in flight
    // rather than jumping a whole part at a time. Parts recovered from a
    // previous attempt count as fully sent, so a resumed upload picks the bar
    // up where it left off instead of restarting at zero.
    const sent = new Array<number>(partCount).fill(0);
    alreadyDone.forEach(n => { sent[n - 1] = expectedPartSize(file.size, partSize, n); });
    const report = () => {
      const total = sent.reduce((a, b) => a + b, 0);
      onProgress(Math.min(99, Math.round((total / file.size) * 100)));
    };

    // Deliberately does NOT read the response ETag. A cross-origin PUT only
    // exposes the headers the bucket's CORS names, and this one does not name
    // ETag, so getResponseHeader("ETag") is always null in the browser even
    // though R2 sent it. The server asks R2 for the ETags at completion time
    // instead. A 2xx here means the part is stored; that is all we need.
    const putPart = (partNumber: number, blob: Blob) => new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", urlMap.get(partNumber)!);

      // Stall detection, NOT a total time limit. xhr.timeout caps the whole
      // request, which is wrong here: a 32MB part on a slow line legitimately
      // takes minutes. What is never legitimate is bytes ceasing to move. A
      // connection that dies without erroring — sleep, dropped wifi, a proxy
      // holding the socket open — otherwise leaves this promise unsettled and
      // the progress bar frozen forever, which is exactly how an upload
      // "gets stuck". Retry handles the rest.
      let stall: ReturnType<typeof setTimeout>;
      const armStall = () => {
        clearTimeout(stall);
        stall = setTimeout(() => xhr.abort(), STALL_TIMEOUT_MS);
      };
      const settle = (fn: () => void) => { clearTimeout(stall); fn(); };

      xhr.upload.onprogress = (e) => {
        armStall();
        if (e.lengthComputable) { sent[partNumber - 1] = e.loaded; report(); }
      };
      xhr.onload = () => settle(() => {
        if (xhr.status >= 200 && xhr.status < 300) {
          sent[partNumber - 1] = blob.size; report();
          resolve();
        } else reject(new Error(`Part ${partNumber} failed: ${xhr.status}`));
      });
      xhr.onerror = () => settle(() => reject(new Error(`Network error on part ${partNumber}`)));
      // Without this the abort above resolves nothing and the slot wedges: an
      // aborted XHR fires neither onload nor onerror.
      xhr.onabort = () => settle(() => reject(new Error(`Part ${partNumber} stalled — no data for ${STALL_TIMEOUT_MS / 1000}s`)));
      armStall();
      xhr.send(blob);
    });

    const queue = [...numbers];
    const CONCURRENCY = 4; // enough to saturate a domestic upstream, few enough not to starve each other
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
      for (;;) {
        const partNumber = queue.shift();
        if (partNumber === undefined) return;
        const start = (partNumber - 1) * partSize;
        const blob = file.slice(start, Math.min(start + partSize, file.size));
        // Retry the individual part rather than the whole file — the entire
        // reason for doing it this way.
        let lastErr: unknown;
        for (let attempt = 0; attempt < 3; attempt++) {
          try { await putPart(partNumber, blob); lastErr = null; break; }
          catch (e) { lastErr = e; sent[partNumber - 1] = 0; report();
            await new Promise(r => setTimeout(r, 1000 * (attempt + 1))); }
        }
        if (lastErr) throw lastErr;
      }
    }));

    // Sends the file size, not a part count: the server derives how many parts
    // there should be and how big each must be, then checks R2 against that.
    // A client that has just failed shouldn't get a vote on whether the upload
    // is complete.
    await call({ action: "complete", storagePath, uploadId, sizeBytes: file.size });
    mpuClear(recordKey);
    onProgress(100);
    return storagePath as string;
  } catch (err) {
    // Deliberately does NOT abort. The parts already in R2 are exactly what
    // makes this resumable, and throwing them away would mean re-uploading
    // gigabytes over a connection that just proved it drops. The record stays
    // on disk so dropping the same file on this gallery again continues from
    // here; the bucket lifecycle rule reaps whatever is never resumed.
    const msg = err instanceof Error ? err.message : "Upload failed";
    throw new Error(`${msg} — drop the same file here again to pick up where it stopped.`, { cause: err });
  }
}

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
      // Default the auto-thumbnail to the FINAL frame. Seek just shy of the
      // very end — seeking to exactly duration often renders nothing. Falls
      // back to a tiny offset for zero/unknown-duration clips.
      const dur = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0.5;
      const seekTo = Math.max(0, dur - 0.1);
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
    if (!v || !videoUrl) return;
    setSaving(true);
    const targetTime = v.currentTime;
    try {
      // The visible player loads WITHOUT crossOrigin so playback never breaks.
      // Drawing that cross-origin frame to a canvas taints it ("operation is
      // insecure"). So capture from a HIDDEN copy loaded with crossOrigin —
      // the canvas stays clean and we can read the pixels. Requires the R2
      // bucket to allow GET from this origin (CORS); if it doesn't, the hidden
      // video errors and we say so instead of failing cryptically.
      const cap = document.createElement("video");
      cap.crossOrigin = "anonymous";
      cap.muted = true;
      cap.playsInline = true;
      cap.src = videoUrl;

      await new Promise<void>((resolve, reject) => {
        cap.onerror = () => reject(new Error("Couldn't read the video for capture — the storage bucket needs cross-origin (CORS) access enabled."));
        cap.onloadeddata = () => {
          cap.currentTime = Math.min(targetTime, Math.max(0, (cap.duration || 0) - 0.05));
        };
        cap.onseeked = () => resolve();
      });

      const canvas = document.createElement("canvas");
      canvas.width = cap.videoWidth;
      canvas.height = cap.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Couldn't draw frame");
      ctx.drawImage(cap, 0, 0, canvas.width, canvas.height);
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
