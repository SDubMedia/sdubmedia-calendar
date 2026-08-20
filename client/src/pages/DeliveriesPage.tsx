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
import { extractRawPreview, isRawFile } from "@/lib/rawPreview";
import PrereqGate from "@/components/PrereqGate";
import { DateField } from "@/components/DateTimeField";
import { useConfirm } from "@/components/ConfirmProvider";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { getAuthToken } from "@/lib/supabase";
import { buildInvoice, generateInvoiceNumberFromDB } from "@/lib/invoice";
import { expectedPartSize, resumablePartNumbers, type ListedPart } from "@/lib/multipart";
import { baseNameOf, renameFile } from "@/lib/fileName";
import { defaultSubject, defaultBody, applyMerge, MERGE_FIELDS, contentsNoun as contentsNounFor, contentsVerb as contentsVerbFor, type GalleryContents } from "@/lib/deliveryEmail";
import { getProjectInvoiceAmount, getProjectPayerId } from "@/lib/data";
import type { Client, DeliveryFile, DeliveryFileStage, DeliverySelection, DeliveryStatus, Project } from "@/lib/types";
import { ArrowLeft, Plus, Upload, Download, Copy, Trash2, Eye, Lock, ExternalLink, Check, X, Play, Image as ImageIcon, HardDrive, Pencil } from "lucide-react";
import { DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy, arrayMove, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

const PUBLIC_BASE = typeof window !== "undefined" ? window.location.origin : "https://slate.sdubmedia.com";

// One draggable photo tile. Drag to reorder (mouse: move ~6px; touch: press &
// hold ~0.2s, so normal scrolling still works). The tile's own buttons stop the
// drag from starting so taps still delete / mark / pick a thumbnail.
function SortablePhoto({ id, children, dimmed, outlined }: { id: string; children: React.ReactNode; dimmed?: boolean; outlined?: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : dimmed ? 0.45 : 1,
    zIndex: isDragging ? 30 : undefined,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative group aspect-square bg-white/[0.02] rounded-lg overflow-hidden cursor-grab active:cursor-grabbing ${
        outlined ? "border-2 border-[#0088ff]" : "border border-white/10"
      }`}
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
  // Grouped by WHO the shoot is for, not by how the gallery is presented.
  //
  // This used to split on downloadOnly, which conflated two unrelated things:
  // "download only" is a presentation choice, and real estate is a kind of
  // client. A client gallery set to download-only was therefore filed under
  // Real Estate — Color War, a Live Event for a church, sat there for exactly
  // that reason. Same test the dashboard uses: the client is an agent, or the
  // shoot is billed to a brokerage.
  const clientsById = useMemo(() => Object.fromEntries(data.clients.map(c => [c.id, c])), [data.clients]);
  const isRealEstate = (d: typeof galleries[number]) => {
    const project = d.projectId ? data.projects.find(p => p.id === d.projectId) : null;
    if (!project) return false;
    if (clientsById[project.clientId]?.clientType === "agent") return true;
    return clientsById[getProjectPayerId(project, clientsById)]?.clientType === "broker";
  };
  const reGalleries = galleries.filter(isRealEstate);
  const clientGalleries = galleries.filter(d => !isRealEstate(d));

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
            {d.selectionLimit > 0 && <span>{pickCount} pick{pickCount === 1 ? "" : "s"} of {d.selectionLimit}</span>}
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
  selectionMinimum: number;
  perExtraPhotoCents: number;
  buyAllFlatCents: number;
  expiresAt: string | null;
  status: DeliveryStatus;
  coverFileId: string | null;
  coverStoragePath: string;
  coverFocal: string;
  coverFocalX: number;
  coverFocalY: number;
  coverWidth: number;
  coverHeight: number;
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
  const [showAllProjects, setShowAllProjects] = useState(false);

  /** The jobs you'd plausibly be building a gallery for.
   *
   *  This was `data.projects.slice(0, 50)` against a list the context loads
   *  in ascending date order — so it offered the FIFTY OLDEST jobs, and
   *  silently dropped everything after. Of 67 projects here, 56 are already
   *  delivered; the eight that actually need a gallery were all past the cut.
   *
   *  Delivered and cancelled jobs are hidden and the newest comes first.
   *  Nothing is truncated, and "show every project" is one click away — a
   *  filter that can hide the row you need is the same bug in a nicer hat. */
  const projectOptions = useMemo(() => {
    const withGallery = new Set(
      data.deliveries.map(d => d.projectId).filter((x): x is string => !!x),
    );
    return [...data.projects]
      .filter(p => showAllProjects || (p.status !== "delivered" && p.status !== "cancelled"))
      .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
      .map(p => ({ project: p, hasGallery: withGallery.has(p.id) }));
  }, [data.projects, data.deliveries, showAllProjects]);

  const hiddenCount = data.projects.length - projectOptions.length;

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
          className="w-full bg-white/[0.03] border border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#0088ff]"
        >
          <option value="">— No project —</option>
          {projectOptions.map(({ project, hasGallery }) => (
            <option key={project.id} value={project.id}>
              {projectLabel(project, data.clients)}{hasGallery ? " · already has a gallery" : ""}
            </option>
          ))}
        </select>
        <div className="flex items-center justify-between gap-2 mt-1.5 mb-4">
          <p className="text-[10px] text-slate-500 min-w-0">
            {showAllProjects
              ? `All ${projectOptions.length} projects, newest first.`
              : `${projectOptions.length} shoot${projectOptions.length === 1 ? "" : "s"} still to deliver.`}
          </p>
          {(hiddenCount > 0 || showAllProjects) && (
            <button
              type="button"
              onClick={() => setShowAllProjects(v => !v)}
              className="text-[10px] text-[#0088ff] hover:underline shrink-0"
            >
              {showAllProjects ? "Just the undelivered" : `Show all ${data.projects.length}`}
            </button>
          )}
        </div>

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
              selectionMinimum: 0,
              perExtraPhotoCents: Math.round((parseFloat(perExtraDollars) || 0) * 100),
              buyAllFlatCents: Math.round((parseFloat(flatDollars) || 0) * 100),
              expiresAt: expiresAt || null,
              status: "draft",
              coverFileId: null, coverStoragePath: "", coverFocal: "point", coverFocalX: 50, coverFocalY: 50, coverWidth: 0, coverHeight: 0,
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
  const { data, updateDelivery, deleteDelivery, setDeliveryStatus, registerDeliveryFile, updateDeliveryFile, deleteDeliveryFile, reorderDeliveryFiles, markSelectionEdited, removeDeliverySelection, addInvoice, refresh } = useApp();
  const { effectiveProfile, allProfiles } = useAuth();
  /** An editor opens this to see which frames were picked and download them —
   *  not to rename the gallery, change the password, reorder it or delete a
   *  client's photos. RLS already grants staff SELECT only (plus marking a
   *  pick edited), so a hidden button would fail anyway; hiding it means they
   *  don't hit an error to find that out. */
  const readOnly = effectiveProfile?.role === "staff";
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
  /** Set by Stop. Checked between files, and passed down so the transfer in
   *  flight aborts too — otherwise "stop" means "after this 50MB photo",
   *  which on a slow line is not stopping. */
  const cancelUploadRef = useRef(false);
  const [stopping, setStopping] = useState(false);
  /** Tiles ticked for bulk delete, and the anchor shift-click ranges from. */
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [pickAnchor, setPickAnchor] = useState<string | null>(null);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  /** Which half of the job a drag-and-drop lands in. Explicit rather than
   *  inferred: "am I uploading proofs or finals" is the question that has no
   *  answer today, and guessing it wrong puts the client's rejects in their
   *  delivery. Seeded from the phase, changeable before you drop. */
  const [uploadStageOverride, setUploadStageOverride] = useState<DeliveryFileStage | null>(null);
  const [fileViewOverride, setFileViewOverride] = useState<"proofs" | "finals" | null>(null);
  const [pwOpen, setPwOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [signedUrls, setSignedUrls] = useState<Map<string, string>>(new Map());
  // Parallel map of thumbnail URLs (videos only). Keyed by file id.
  const [thumbUrls, setThumbUrls] = useState<Map<string, string>>(new Map());
  // File whose thumbnail the user is currently picking (or null when closed).
  const [thumbnailPickerFileId, setThumbnailPickerFileId] = useState<string | null>(null);
  // Non-null while the delivery email is being composed.
  const [composer, setComposer] = useState<{ contents: GalleryContents; subject: string; body: string; proofs?: boolean } | null>(null);
  // True while the picks download is being signed/zipped.
  const [downloadingPicks, setDownloadingPicks] = useState(false);
  // Inline rename of a delivered file. The name is what the client sees in the
  // gallery and what they get on disk, so this is the label, not the R2 key.
  const [renamingFileId, setRenamingFileId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");

  function startRename(f: DeliveryFile) {
    setRenamingFileId(f.id);
    // Editing without the extension — it's noise, and renameFile() puts it back.
    setRenameDraft(baseNameOf(f.originalName));
  }

  async function commitRename(f: DeliveryFile) {
    setRenamingFileId(null);
    const next = renameFile(f.originalName, renameDraft);
    if (!next) { toast.error("That name won't work", { description: "Give it at least one normal character." }); return; }
    if (next === f.originalName) return;
    try {
      await updateDeliveryFile(f.id, { originalName: next });
      toast.success("Renamed", { description: next });
    } catch (err) {
      toast.error("Couldn't rename", { description: err instanceof Error ? err.message : "Try again" });
    }
  }
  const [activeTab, setActiveTab] = useState<"photos" | "general" | "cover" | "privacy" | "selections">("photos");

  const delivery = data.deliveries.find(d => d.id === id);
  const files = useMemo(
    () => data.deliveryFiles.filter(f => f.deliveryId === id).sort((a, b) => a.position - b.position),
    [data.deliveryFiles, id]
  );

  // Drag-to-reorder: mouse drags after a small move; touch needs a short press
  // (so the gallery still scrolls normally on phones).
  /** Only ticks that still have a tile. A file deleted by its own trash button
   *  leaves its id behind, and a toolbar reading "3 selected" over two photos
   *  is a lie that becomes a wrong delete count. */
  const pickedIds = useMemo(() => files.filter(f => picked.has(f.id)).map(f => f.id), [files, picked]);

  // Switching galleries starts clean — carrying a selection across would put
  // the toolbar over a grid it doesn't belong to.
  useEffect(() => { setPicked(new Set()); setPickAnchor(null); }, [id]);

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
    const all = Array.from(fileList);

    // Raws are no longer turned away — the JPEG the camera embeds inside them
    // is pulled out and used as the browsable copy, while the raw itself is
    // stored alongside for the editor to download. Extraction happens per file
    // inside the loop, because it's the only place we learn whether a
    // particular file actually carries a usable preview.
    const list = all;
    if (list.length === 0) return;
    cancelUploadRef.current = false;
    setStopping(false);
    setUploading({ done: 0, total: list.length, pct: 0, name: "" });
    let done = 0, failed = 0, stopped = false;
    for (const rawFile of list) {
      // Between files: the clean stopping point. Everything already uploaded
      // stays — those are finished files, not half of anything.
      if (cancelUploadRef.current) { stopped = true; break; }
      try {
        // A raw can't be shown by any browser, so what gets displayed is the
        // JPEG the camera wrote inside it for its own back screen. The raw is
        // then always kept as the original — that's the entire point of
        // uploading raws, so it doesn't wait on the keep-originals switch.
        const isRaw = isRawFile(rawFile.name);
        let rawPreviewWidth: number | null = null;
        let rawPreviewHeight: number | null = null;
        let file: File;
        if (isRaw) {
          setUploading({ done, total: list.length, pct: 0, name: `Reading ${rawFile.name}…` });
          const extracted = await extractRawPreview(rawFile);
          if (!extracted.preview) {
            // Named, not silently dropped: with 198 files you need to know
            // which one, and "some failed" is useless.
            toast.error(`No preview inside ${rawFile.name}`, {
              description: extracted.reason === "no-jpeg-found"
                ? "This camera doesn't embed a JPEG we can find. Export a JPEG for this frame."
                : "The embedded image wouldn't decode. Export a JPEG for this frame.",
            });
            failed++; done++;
            setUploading({ done, total: list.length, pct: 0, name: "" });
            continue;
          }
          file = extracted.preview;
          rawPreviewWidth = extracted.width;
          rawPreviewHeight = extracted.height;
        } else {
          // iPhone HEIC → JPEG so it displays; full quality, full resolution.
          file = await toUploadableImage(rawFile);
        }
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
            // Only accept real numbers. A codec the browser can't decode gives
            // 0x0, and storing that as if it were true is what makes a tile the
            // wrong shape — better to leave it unknown than record a lie.
            if (meta.width > 0 && meta.height > 0) {
              width = meta.width;
              height = meta.height;
            }
            durationSeconds = meta.duration > 0 ? meta.duration : null;
            autoThumbBlob = meta.thumbBlob;
          }
        } else if (isRaw) {
          // Already measured while decoding the embedded preview.
          width = rawPreviewWidth;
          height = rawPreviewHeight;
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
          primaryStoragePath = await uploadFileMultipart(id, file, accessToken, onPct, () => cancelUploadRef.current);
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
          await putFileWithProgress(uploadData.uploadUrl, file, onPct, () => cancelUploadRef.current);
          primaryStoragePath = uploadData.storagePath;
        }

        // 2a. Portrait work: keep the untouched original next to the
        // compressed copy. `file` above has been re-encoded to JPEG at 80%
        // (fast galleries, right for real estate); `rawFile` is exactly what
        // came off the card, EXIF and colour profile intact. Only stills — a
        // video is never re-encoded, so its "original" is the same bytes.
        let originalStoragePath = "";
        let originalSizeBytes = 0;
        // A raw is kept unconditionally: it IS the deliverable for the editor,
        // and the browsable copy is only a stand-in. Everything else follows
        // the gallery's keep-originals switch. Not for staff: an editor hands
        // back finished files (the shoot's raws are already here), and the
        // crew registration route has nowhere to record an original anyway.
        if (!readOnly && (isRaw || delivery?.keepOriginals) && !isVideo && rawFile !== file) {
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
          if (readOnly) {
            // Staff can't write delivery_files under RLS (SELECT-only since
            // 2026-08-18-staff-assigned-galleries). Same route as the project
            // sheet's crew upload: service-role after verifying assignment.
            // Stage defaults to 'final' server-side, which is the only stage
            // staff uploads.
            const regRes = await fetch("/api/crew-register-file", {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
              body: JSON.stringify({
                deliveryId: id,
                storagePath: primaryStoragePath,
                originalName: file.name,
                sizeBytes: file.size,
                width, height,
                mimeType: file.type,
                position: files.length + done,
                mediaType: isVideo ? "video" : "image",
                thumbnailStoragePath,
                durationSeconds,
              }),
            });
            const regBody = await regRes.json().catch(() => ({ error: "Failed" }));
            if (!regRes.ok) throw new Error(regBody.error || "Couldn't save the photo");
          } else {
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
              stage: uploadStage,
            });
          }
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
        // Pressing Stop aborts the transfer in flight, which surfaces here as
        // an error. It isn't one — don't count it as a failure and don't throw
        // a red toast at someone for doing what they asked for.
        if (cancelUploadRef.current) { stopped = true; break; }
        console.error(`Upload failed: ${rawFile.name}`, err);
        toast.error(`Failed: ${rawFile.name}`, { description: err instanceof Error ? err.message : "Try again" });
        failed++;
        done++;
        setUploading({ done, total: list.length, pct: 0, name: "" });
      }
    }
    setUploading(null);
    setStopping(false);
    cancelUploadRef.current = false;
    // This used to say "Upload complete" unconditionally, so a run where every
    // single file failed still ended on a green success toast. Say what
    // actually happened.
    const attempted = stopped ? done : list.length;
    const added = attempted - failed;
    if (stopped) {
      const left = list.length - attempted;
      toast.info("Upload stopped", {
        description: `${added} file${added === 1 ? "" : "s"} uploaded${failed ? `, ${failed} failed` : ""}. ${left} not started — drop the same files again to carry on.`,
      });
    } else if (failed === 0) {
      toast.success("Upload complete", { description: `${added} file${added === 1 ? "" : "s"} added.` });
    } else if (added === 0) {
      toast.error("Nothing uploaded", { description: `All ${failed} file${failed === 1 ? "" : "s"} failed.` });
    } else {
      toast.warning("Partly uploaded", { description: `${added} added, ${failed} failed.` });
    }
    if (readOnly && added > 0) {
      // Crew registration bypasses AppContext, so the new rows aren't in local
      // state yet — pull them in so the grid shows what was just uploaded.
      await refresh();
      // One ping for the whole batch — the owner previews, then delivers.
      try {
        const sess = await supabase.auth.getSession();
        await fetch("/api/notify-gallery-finals", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${sess.data.session?.access_token || ""}` },
          body: JSON.stringify({ deliveryId: id, count: added }),
        });
      } catch (e) {
        console.warn("Owner notification failed — files are uploaded", e);
      }
    }
  }

  /** Tick a tile. Shift extends from the last one ticked, the way every file
   *  browser behaves — culling 400 frames one click at a time is not a job. */
  function togglePick(fileId: string, shiftKey: boolean) {
    setPicked(prev => {
      const next = new Set(prev);
      if (shiftKey && pickAnchor) {
        // Ranges span what's on screen. Anchoring into a hidden half would
        // select tiles you can't see and then delete them.
        const a = gridFiles.findIndex(f => f.id === pickAnchor);
        const b = gridFiles.findIndex(f => f.id === fileId);
        if (a >= 0 && b >= 0) {
          // The anchor's own state decides the range's, so shift-clicking after
          // an untick clears a run instead of re-selecting it.
          const selecting = prev.has(pickAnchor);
          for (let i = Math.min(a, b); i <= Math.max(a, b); i++) {
            if (selecting) next.add(gridFiles[i].id); else next.delete(gridFiles[i].id);
          }
          return next;
        }
      }
      if (next.has(fileId)) next.delete(fileId); else next.add(fileId);
      return next;
    });
    setPickAnchor(fileId);
  }

  async function handleDeletePicked() {
    const ids = pickedIds;
    if (ids.length === 0) return;
    if (!(await confirm({
      title: `Delete ${ids.length} file${ids.length === 1 ? "" : "s"}?`,
      description: "This removes them from the client gallery too. It can't be undone.",
      destructive: true,
      confirmLabel: `Delete ${ids.length}`,
    }))) return;

    setBulkDeleting(true);
    const sess = await supabase.auth.getSession();
    const accessToken = sess.data.session?.access_token || "";
    let failed = 0;
    // Four at a time: a few hundred sequential round trips is a minute of
    // staring at a spinner, and R2 doesn't need protecting from four.
    const queue = [...ids];
    await Promise.all(Array.from({ length: Math.min(4, queue.length) }, async () => {
      for (;;) {
        const fileId = queue.shift();
        if (fileId === undefined) return;
        try {
          await fetch("/api/deliveries", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
            body: JSON.stringify({ action: "delete-file", fileId }),
          });
          await deleteDeliveryFile(fileId);
        } catch { failed++; }
      }
    }));
    setBulkDeleting(false);
    setPicked(new Set());
    setPickAnchor(null);
    const gone = ids.length - failed;
    if (failed === 0) toast.success(`Deleted ${gone} file${gone === 1 ? "" : "s"}`);
    else if (gone === 0) toast.error("Nothing deleted", { description: `All ${failed} failed.` });
    else toast.warning("Partly deleted", { description: `${gone} removed, ${failed} failed.` });
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

  /** Where this gallery is in the job. Derived, not stored — a second source
   *  of truth for something already implied by the limit, the submission and
   *  the files would only drift. */
  const proofs = files.filter(f => f.stage === "proof");
  const finals = files.filter(f => f.stage !== "proof");
  const phase: "collecting" | "picking" | "editing" | "done" =
    !proofingEnabled ? "done"
    : delivery.status === "delivered" ? "done"
    : delivery.submittedAt ? "editing"
    : proofs.length > 0 ? "picking"
    : "collecting";

  // Which half you're looking at. Follows the phase unless you say otherwise:
  // while proofs are being loaded or picked you want the proofs, afterwards
  // you want what's going out — but only once something HAS come back. With
  // zero finals the finals view is an empty grid, and (before the toggle fix
  // below) adding proofs after submission left the owner staring at "No
  // finished files here yet" with no way to reach 256 proofs.
  const fileView: "proofs" | "finals" =
    fileViewOverride ?? ((phase === "editing" || phase === "done") && finals.length > 0 ? "finals" : "proofs");

  /** The green button means "invite her to choose" until she has, and
   *  "deliver the finished work" after. Two different actions that were one
   *  button labelled for the second. */
  const sendProofsPhase = proofingEnabled && !delivery.submittedAt;
  const finalsToDeliver = proofingEnabled ? finals : files;

  // Default the drop target to whatever this phase is for. Before the client
  // has picked, you're adding proofs; after, you're adding finished files.
  const uploadStage: DeliveryFileStage = readOnly
    ? "final"
    : uploadStageOverride ?? (!proofingEnabled ? "final" : phase === "editing" || phase === "done" ? "final" : "proof");

  /** What the grid shows.
   *
   *  An editor opening a 198-frame proofing gallery needs the fifteen she's
   *  working on, not all 198 — "download only those raws" is the entire ask.
   *  So for staff the proofs narrow to what the client actually chose, while
   *  finals stay whole (that's her own output).
   *
   *  The owner sees everything, split into two tabs, because he needs to know
   *  what he loaded as well as what came back. */
  const pickedFileIds = new Set(selections.map(s2 => s2.fileId));
  const visibleProofs = readOnly ? proofs.filter(f => pickedFileIds.has(f.id)) : proofs;

  /** Hand the editor (or owner) the client's picks at full quality — the raw
   *  original when the gallery kept one. Photos zip in the browser like the
   *  public gallery's download-all; past the memory budget (or for videos)
   *  each file streams straight to disk instead. Fresh URLs are signed per
   *  click so nothing here expires mid-batch. */
  async function downloadPicks() {
    const pickFiles = files.filter(f => pickedFileIds.has(f.id));
    if (pickFiles.length === 0) return;
    setDownloadingPicks(true);
    try {
      const sess = await supabase.auth.getSession();
      const accessToken = sess.data.session?.access_token || "";
      const res = await fetch("/api/deliveries", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ action: "signed-urls", deliveryId: id, fileIds: pickFiles.map(f => f.id) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't prepare the download");
      const dlById = new Map<string, string>(
        ((data.urls || []) as { id: string; url: string; downloadUrl?: string }[]).map(u => [u.id, u.downloadUrl || u.url]),
      );
      const items = pickFiles
        .map(f => ({ f, dl: dlById.get(f.id) || "" }))
        .filter(x => x.dl);
      const videos = items.filter(x => x.f.mediaType === "video");
      const photos = items.filter(x => x.f.mediaType !== "video");
      // Same budget as the public gallery: zipping happens in memory, and a
      // batch of raw originals can easily pass it — stream those one by one.
      const ZIP_BUDGET_BYTES = 300 * 1024 * 1024;
      const photoBytes = photos.reduce((s, x) => s + (x.f.originalSizeBytes || x.f.sizeBytes || 0), 0);
      for (const v of videos) {
        streamToDisk(v.dl);
        await new Promise(r => setTimeout(r, 800));
      }
      if (photos.length > 0 && photoBytes > ZIP_BUDGET_BYTES) {
        toast.message(`Saving ${photos.length} files one by one`, { description: "This set is too big to zip in the browser." });
        for (const p of photos) {
          streamToDisk(p.dl);
          await new Promise(r => setTimeout(r, 600));
        }
      } else if (photos.length > 0) {
        await zipToDisk(
          photos.map(x => ({ name: x.f.originalName, url: x.dl })),
          `${(delivery?.title || "gallery").replace(/[^\w-]+/g, "_")}-picks.zip`,
        );
      }
    } catch (err) {
      toast.error("Download failed", { description: err instanceof Error ? err.message : "Try again" });
    } finally {
      setDownloadingPicks(false);
    }
  }
  const hasBothStages = proofs.length > 0 && finals.length > 0;
  const gridFiles = !proofingEnabled ? files
    : fileView === "proofs" ? visibleProofs
    : finals;
  const project = data.projects.find(p => p.id === delivery.projectId);
  const agentClient = project ? data.clients.find(c => c.id === project.clientId) : null;
  // "Agent" is real-estate language and reads as a mistake on a portrait,
  // school or business shoot. Use the client's own name where we have it, and
  // only fall back to "agent" when they actually are one.
  const clientNoun = agentClient?.company
    || (agentClient?.clientType === "agent" ? "the agent" : "the client");
  const clientNounGeneric = agentClient?.clientType === "agent" ? "the agent" : "the client";
  const hasBroker = agentClient?.clientType === "agent" && !!agentClient.brokerId;

  /** Who the email goes to.
   *
   *  A client created from a booking usually has no email on its record — but
   *  if they've been given a login, Slate knows it. Falling back to that turns
   *  a dead end (Send greyed out, nothing to click but Cancel) into a
   *  prefilled field. The server does the same lookup, so this only ever
   *  agrees with where the mail was going to go anyway. */
  const composerRecipient =
    (agentClient?.email || "").trim()
    || (agentClient ? (allProfiles.find(p => p.clientIds?.includes(agentClient.id))?.email || "") : "");


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
  // Opens the composer rather than a yes/no box. A confirmation could only
  // tell you what was about to go out; this lets you read it and change it,
  // which is what "preview before you send" has to mean.
  /** Before she's picked, the green button is not "deliver" — pressing that
   *  would mark the gallery delivered, lock the hearts and tell her the work
   *  was done. What you actually want at this point is to invite her to
   *  choose. Same composer, different meaning, and status stays 'sent'. */
  const sendProofsForPicking = () => {
    const contents = { photoCount: proofs.length, videoCount: 0 };
    setComposer({
      contents,
      subject: `Your proofs are ready to view — {{gallery_title}}`,
      body:
        `Hi {{first_name}},\n\n` +
        `Your proofs from {{gallery_title}} are ready. Have a look through and heart the ${delivery.selectionLimit} you'd like edited, then press Submit.\n\n` +
        `They're previews for choosing from, so they aren't downloadable — the finished files come after.\n\n` +
        `Thank you!`,
      proofs: true,
    });
  };

  const deliverToAgent = () => {
    const contents = {
      photoCount: files.filter(f => f.mediaType !== "video").length,
      videoCount: files.filter(f => f.mediaType === "video").length,
    };
    const org = data.organization;
    setComposer({
      contents,
      subject: (org?.deliveryEmailSubject || "").trim() || defaultSubject(contents),
      body: (org?.deliveryEmailBody || "").trim() || defaultBody(contents),
    });
  };

  // Runs after the composer's Send. Everything below is what the old one-tap
  // deliver did; only the confirmation step changed.
  const sendDelivery = async (subject: string, body: string, to: string, proofsOnly?: boolean) => {
    setComposer(null);
    // 'sent', not 'delivered'. Delivered locks the hearts (see isLocked on the
    // public page) and tells her the job is finished — the opposite of asking
    // her to choose.
    await setDeliveryStatus(id, proofsOnly ? "sent" : "delivered");
    if (proofsOnly) { notifyGallery("agent", { subject, body, to }); return; }
    notifyGallery("agent", { subject, body, to });
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

  const notifyGallery = async (recipient: "agent" | "broker", email?: { subject: string; body: string; to?: string }) => {
    try {
      const token = await getAuthToken();
      const res = await fetch("/api/notify-gallery-ready", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        // Omitted entirely when not composing, so the server falls back to the
        // org default and then the built-in wording.
        body: JSON.stringify({ deliveryId: id, recipient, ...(email || {}) }),
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
            ) : readOnly ? (
              <h1 className="text-2xl font-bold truncate min-w-0" style={{ fontFamily: "'Space Grotesk', system-ui" }}>{delivery.title}</h1>
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
        {!readOnly && (
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={copyLink} className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 border border-white/10 rounded-lg hover:bg-white/[0.04]"><Copy className="w-3 h-3" /> Copy link</button>
          <a href={publicUrl} target="_blank" rel="noopener" className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 border border-white/10 rounded-lg hover:bg-white/[0.04]"><ExternalLink className="w-3 h-3" /> Preview</a>
          <button onClick={() => setPwOpen(true)} className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 border border-white/10 rounded-lg hover:bg-white/[0.04]"><Lock className="w-3 h-3" /> {delivery.hasPassword ? "Change password" : "Set password"}</button>
        </div>
        )}
      </div>

      {/* Tabs — Pixieset-style left nav (collapsed to top tabs on mobile) */}
      <div className="flex items-center gap-1 mb-6 border-b border-white/10 overflow-x-auto -mx-1 px-1">
        {(readOnly
          ? (["photos", "selections"] as const)
          : (["photos", "general", "cover", "privacy", "selections"] as const)
        ).map(t => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={`px-4 py-2.5 text-xs font-semibold uppercase tracking-wider whitespace-nowrap border-b-2 transition-colors ${
              activeTab === t ? "border-[#0088ff] text-white" : "border-transparent text-slate-400 hover:text-white"
            }`}
          >
            {t === "photos"
              ? (proofingEnabled
                  ? `${fileView === "proofs" ? (readOnly ? "Her picks" : "Proofs") : "Finals"} (${gridFiles.length})`
                  : `Photos (${files.length})`)
              : t === "general" ? "General"
              : t === "cover" ? "Cover"
              : t === "privacy" ? "Privacy"
              : `Selections${selections.length > 0 ? ` (${selections.length})` : ""}`}
          </button>
        ))}
      </div>

      {activeTab === "photos" && (
        <>
          {/* One-tap deliver, right where the photos are. Owner only — the
              server refuses staff anyway (notify-gallery-ready is owner-gated,
              and RLS blocks the status write), so showing an editor a green
              "Deliver to client" button could only mislead. */}
          {!readOnly && (
          <div className="mb-6">
            {delivery.status === "delivered" ? (
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-emerald-300 flex items-center gap-2"><Check className="w-4 h-4 shrink-0" /> Delivered — {clientNoun} has been notified</span>
                <button onClick={() => notifyGallery("agent")} className="text-xs px-3 py-1.5 border border-emerald-500/30 rounded-lg hover:bg-emerald-500/10 whitespace-nowrap">Re-notify</button>
              </div>
            ) : (
              <button
                onClick={sendProofsPhase ? sendProofsForPicking : deliverToAgent}
                disabled={(sendProofsPhase ? proofs.length === 0 : finalsToDeliver.length === 0) || charging}
                className="w-full bg-emerald-600 text-white rounded-lg py-3 px-4 font-semibold flex items-center justify-center gap-2 hover:bg-emerald-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ImageIcon className="w-5 h-5 shrink-0" />
                {sendProofsPhase
                  ? (proofs.length === 0
                      ? "Load proofs, then send for picking"
                      : `Send ${proofs.length} proof${proofs.length === 1 ? "" : "s"} to ${clientNoun} to pick from`)
                  : (finalsToDeliver.length === 0
                      ? (proofingEnabled ? "Upload the finished files, then deliver" : "Upload photos, then deliver")
                      : `Deliver ${finalsToDeliver.length} ${proofingEnabled ? "final" : "photo"}${finalsToDeliver.length === 1 ? "" : "s"} to ${clientNoun}`)}
              </button>
            )}
          </div>
          )}
          {/* Archive to Google Drive — owner only, same as the server's gate */}
          {!readOnly && files.length > 0 && data.organization?.googleDriveEmail && (
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
          <ProofingPanel
            selectionMinimum={delivery.selectionMinimum ?? 0}
            selectionLimit={delivery.selectionLimit}
            perExtraPhotoCents={delivery.perExtraPhotoCents}
            buyAllFlatCents={delivery.buyAllFlatCents}
            downloadOnly={delivery.downloadOnly ?? false}
            photoCount={files.filter(f => f.mediaType !== "video").length}
            pickedCount={selections.length}
            onUpdate={(patch) => updateDelivery(id, patch)}
          />
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
          <PresentationPanel
            downloadOnly={delivery.downloadOnly ?? false}
            viewOnly={delivery.viewOnly ?? false}
            hasCover={!!delivery.coverFileId}
            onUpdate={(v) => updateDelivery(id, { downloadOnly: v })}
            onUpdateViewOnly={(v) => updateDelivery(id, { viewOnly: v })}
          />
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
            <>
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 mb-4">
                <p className="text-sm">
                  <strong>{delivery.clientName || "Client"}</strong>
                  {delivery.clientEmail && <span className="text-slate-400"> · {delivery.clientEmail}</span>}
                  <span className="text-slate-500"> · submitted {new Date(delivery.submittedAt).toLocaleDateString()}</span>
                </p>
                <p className="text-xs text-slate-400 mt-1">{selections.length} pick{selections.length === 1 ? "" : "s"} {selections.some(s => s.isPaid) && "· includes paid extras"}</p>
              </div>
              <PicksList
                selections={selections}
                files={files}
                signedUrls={signedUrls}
                onToggleEdited={(selId, edited) => markSelectionEdited(selId, edited)}
                onRemove={readOnly ? undefined : async (selId) => {
                  const file = files.find(f => f.id === selections.find(s => s.id === selId)?.fileId);
                  if (!(await confirm({
                    title: "Remove this pick?",
                    description: `${file?.originalName || "This photo"} comes off her list. Her gallery unlocks by itself so she can choose a replacement — the photo stays in the proofs.`,
                    destructive: true,
                    confirmLabel: "Remove pick",
                  }))) return;
                  try {
                    await removeDeliverySelection(selId);
                    const remaining = selections.length - 1;
                    const room = Math.max(0, delivery.selectionLimit - remaining);
                    toast.success("Pick removed", {
                      description: room > 0
                        ? `${remaining} left — she can now choose ${room} more from the same link.`
                        : `${remaining} left.`,
                    });
                  } catch (err) {
                    toast.error("Couldn't remove the pick", { description: err instanceof Error ? err.message : "Try again" });
                  }
                }}
              />
            </>
          ) : (
            <p className="text-sm text-slate-500 py-8 text-center">No selections submitted yet.</p>
          )}
        </>
      )}

      {activeTab === "photos" && (
      <>
      {readOnly && (
        <p className="text-xs text-slate-400 mb-4 rounded-lg border border-white/10 bg-white/[0.02] px-4 py-3">
          {phase === "editing"
            ? <>The client picked <strong>{selections.length}</strong>. Download them below — a raw shoot hands back the raw file — then drag the finished versions here to add them as finals. You can't change or remove the client's photos.</>
            : <>You're viewing this gallery for a job you're assigned to. Picked photos are outlined — open <strong>Selections</strong> for the list and filenames.</>}
        </p>
      )}

      {/* Where this job is, and what happens next. The single most useful
          thing a proofing gallery can say: without it, "drag photos here" is
          the same instruction whether you're loading 400 proofs or 15 finished
          files, and getting it wrong puts the client's rejects in their
          delivery. */}
      {!readOnly && proofingEnabled && (
        <div className="mb-4 rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            {([
              ["collecting", "1. Load proofs"],
              ["picking", "2. Client picks"],
              ["editing", "3. Edit + upload finals"],
              ["done", "4. Delivered"],
            ] as const).map(([key, label], i) => {
              const order = ["collecting", "picking", "editing", "done"];
              const at = order.indexOf(phase);
              const isNow = key === phase;
              const isPast = order.indexOf(key) < at;
              return (
                <span
                  key={key}
                  className={`text-[11px] px-2.5 py-1 rounded-full border ${
                    isNow ? "bg-[#0088ff] border-[#0088ff] text-white font-semibold"
                    : isPast ? "border-emerald-500/40 text-emerald-400"
                    : "border-white/10 text-slate-500"
                  }`}
                >
                  {isPast ? "✓ " : ""}{label}
                </span>
              );
            })}
          </div>
          <p className="text-xs text-slate-400">
            {phase === "collecting" && <>Load the shots she'll choose from. She can pick <strong>{delivery.selectionLimit}</strong>. Raws are fine — the gallery shows the preview inside them and keeps the raw for your editor.</>}
            {phase === "picking" && <><strong>{proofs.length}</strong> proof{proofs.length === 1 ? "" : "s"} loaded. Send her the link — you'll get an email and a push when she submits her {delivery.selectionLimit}.</>}
            {phase === "editing" && <>She picked <strong>{selections.length}</strong>. Your editor can open this gallery and download those raws. Upload the finished files here as <strong>Finals</strong>, then deliver.</>}
            {phase === "done" && <>Delivered. The client sees the {finals.length} final file{finals.length === 1 ? "" : "s"}.</>}
          </p>
        </div>
      )}

      {/* Upload zone — drag-drop OR click to browse.
          The editor gets it too, but only ever adding finals: the database
          policy pins her inserts to stage='final', so proofs stay the owner's.
          Hiding the switch matches what she's actually allowed to do. */}
      {(!readOnly || phase === "editing") && (
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
        {proofingEnabled && !readOnly && (
          <div className="mb-3 flex flex-wrap items-center justify-center gap-2">
            <span className="text-[10px] uppercase tracking-wider text-slate-500">Adding</span>
            {(["proof", "final"] as const).map(st => (
              <button
                key={st}
                onClick={(e) => { e.stopPropagation(); setUploadStageOverride(st); }}
                disabled={!!uploading}
                className={`text-xs px-3 py-1.5 rounded-lg border font-semibold disabled:opacity-40 ${
                  uploadStage === st
                    ? "bg-[#0088ff] border-[#0088ff] text-white"
                    : "border-white/15 text-slate-300 hover:bg-white/[0.06]"
                }`}
              >
                {st === "proof" ? "Proofs — she picks from these" : "Finals — she receives these"}
              </button>
            ))}
          </div>
        )}
        <Upload className="w-8 h-8 mx-auto mb-2 text-slate-500" />
        <p className="text-sm text-slate-300 mb-3">
          {dragOver
            ? (proofingEnabled ? `Drop to add ${uploadStage === "proof" ? "proofs" : "finals"}` : "Drop to upload")
            : readOnly ? "Drag the finished files here, or click to browse"
            : "Drag photos or videos here, or click to browse"}
        </p>
        <p className="text-[11px] text-slate-500 mb-3">
          Videos: .mp4, .mov, .m4v · up to 5 GB each. Photos: JPEG, PNG, HEIC · up to 50 MB each.
          <br />Camera raws welcome — the gallery shows the preview inside them and keeps the raw for your editor.
        </p>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={!!uploading}
          className="inline-flex items-center gap-2 px-4 py-2 bg-[#0088ff] text-white rounded-lg font-semibold text-sm hover:bg-[#0066dd] disabled:opacity-50"
        >
          {uploading
            ? `Uploading ${uploading.done} / ${uploading.total}…`
            : proofingEnabled ? `Choose ${uploadStage === "proof" ? "proofs" : "finals"}` : "Choose files"}
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
            <div className="flex flex-wrap items-center justify-between gap-2 mt-1.5">
              <p className="text-[10px] text-slate-500 min-w-0">
                {stopping
                  ? "Stopping…"
                  : `${uploading.done} of ${uploading.total} · keep this tab open until it finishes.`}
              </p>
              <button
                onClick={(e) => { e.stopPropagation(); cancelUploadRef.current = true; setStopping(true); }}
                disabled={stopping}
                className="text-[10px] px-2.5 py-1 rounded border border-white/15 text-white hover:bg-white/[0.06] disabled:opacity-40 shrink-0"
              >
                {stopping ? "Stopping…" : "Stop"}
              </button>
            </div>
          </div>
        )}
      </div>
      )}

      {/* File grid. The Proofs/Finals toggle also shows through the whole
          editing phase even before any final exists — that's when the owner
          adds late proofs and downloads picks, both dead ends without it. */}
      {proofingEnabled && (hasBothStages || readOnly || phase === "editing" || phase === "done") && (
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <button
            onClick={() => setFileViewOverride("proofs")}
            className={`text-xs px-3 py-1.5 rounded-lg border ${fileView === "proofs" ? "bg-white/10 border-white/25 text-white font-semibold" : "border-white/10 text-slate-400 hover:bg-white/[0.04]"}`}
          >
            {readOnly ? `Her picks (${visibleProofs.length})` : `Proofs (${proofs.length})`}
          </button>
          <button
            onClick={() => setFileViewOverride("finals")}
            className={`text-xs px-3 py-1.5 rounded-lg border ${fileView === "finals" ? "bg-white/10 border-white/25 text-white font-semibold" : "border-white/10 text-slate-400 hover:bg-white/[0.04]"}`}
          >
            Finals ({finals.length})
          </button>
          {fileView === "proofs" && selections.length > 0 && (
            <button
              onClick={downloadPicks}
              disabled={downloadingPicks}
              className="text-xs px-3 py-1.5 rounded-lg border border-white/10 hover:bg-white/[0.04] inline-flex items-center gap-1.5 disabled:opacity-50"
              title="Full-quality files — a raw shoot hands back the raw"
            >
              <Download className="w-3 h-3" />
              {downloadingPicks ? "Preparing…" : `Download her ${selections.length} pick${selections.length === 1 ? "" : "s"}`}
            </button>
          )}
          {readOnly && fileView === "proofs" && (
            <span className="text-[11px] text-slate-500">Download these, edit, then add them back as finals.</span>
          )}
        </div>
      )}

      {gridFiles.length === 0 ? (
        <p className="text-center text-sm text-slate-500 py-8">
          {!proofingEnabled ? "No photos or videos yet."
            : fileView === "finals" ? "No finished files here yet."
            : readOnly ? "She hasn't submitted her picks yet."
            : "No proofs loaded yet."}
        </p>
      ) : (
        <>
        {pickedIds.length > 0 && (
          <div className="sticky top-0 z-20 -mx-1 mb-3 px-3 py-2 rounded-lg bg-[#0a0e17] border border-white/15 flex flex-wrap items-center justify-between gap-2 shadow-lg">
            <span className="text-sm text-white min-w-0">
              <strong>{pickedIds.length}</strong> selected
            </span>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                onClick={() => setPicked(new Set(gridFiles.map(f => f.id)))}
                className="text-xs px-2.5 py-1.5 rounded border border-white/15 hover:bg-white/[0.06]"
              >
                Select all {gridFiles.length}
              </button>
              <button
                onClick={() => { setPicked(new Set()); setPickAnchor(null); }}
                className="text-xs px-2.5 py-1.5 rounded border border-white/15 hover:bg-white/[0.06]"
              >
                Clear
              </button>
              <button
                onClick={handleDeletePicked}
                disabled={bulkDeleting}
                className="text-xs px-3 py-1.5 rounded bg-red-500 text-white font-semibold hover:bg-red-600 disabled:opacity-50"
              >
                {bulkDeleting ? "Deleting…" : `Delete ${pickedIds.length}`}
              </button>
            </div>
          </div>
        )}
        <DndContext sensors={dragSensors} collisionDetection={closestCenter} onDragEnd={handlePhotoDragEnd}>
        <SortableContext items={gridFiles.map(f => f.id)} strategy={rectSortingStrategy}>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {gridFiles.map((f) => {
            const sel = selections.find(s => s.fileId === f.id);
            const isVideo = f.mediaType === "video";
            const thumb = thumbUrls.get(f.id);
            const photo = signedUrls.get(f.id);
            const isPicked = picked.has(f.id);
            // The editor's version of "which ones": an outline on the frames
            // the client chose, so the grid itself answers the question.
            const clientPicked = !!sel;
            return (
              <SortablePhoto key={f.id} id={f.id} dimmed={picked.size > 0 && !isPicked}>
                {/* Top-left: the other three corners already hold Mark edited,
                    Thumbnail and Delete. stopPropagation on pointerdown so the
                    tick doesn't start a drag. */}
                {!readOnly && (
                <button
                  onClick={(e) => { e.stopPropagation(); togglePick(f.id, e.shiftKey); }}
                  onPointerDown={(e) => e.stopPropagation()}
                  aria-label={isPicked ? "Deselect" : "Select"}
                  className={`absolute top-2 left-2 z-10 w-6 h-6 rounded flex items-center justify-center border transition-colors ${
                    isPicked
                      ? "bg-[#0088ff] border-[#0088ff] text-white"
                      : "bg-black/50 border-white/40 text-transparent hover:border-white opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100"
                  }`}
                >
                  <Check className="w-3.5 h-3.5" />
                </button>
                )}
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
                    {renamingFileId === f.id ? (
                      // pointer-events-auto: the caption bar is inert so it
                      // doesn't eat drags, so anything interactive inside it
                      // has to switch them back on.
                      <input
                        autoFocus
                        value={renameDraft}
                        onChange={(e) => setRenameDraft(e.target.value)}
                        onPointerDown={(e) => e.stopPropagation()}
                        onBlur={() => commitRename(f)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") { e.preventDefault(); (e.target as HTMLInputElement).blur(); }
                          // Escape must clear the id BEFORE blur fires, or the
                          // blur handler saves the very edit being cancelled.
                          if (e.key === "Escape") { e.preventDefault(); setRenamingFileId(null); setRenameDraft(""); }
                        }}
                        className="pointer-events-auto min-w-0 flex-1 bg-black/70 border border-white/30 rounded px-1.5 py-0.5 text-[11px] text-white outline-none focus:border-[#0088ff]"
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => startRename(f)}
                        onPointerDown={(e) => e.stopPropagation()}
                        title={`${f.originalName} — click to rename`}
                        className="pointer-events-auto group/name flex items-center gap-1 min-w-0 text-left"
                      >
                        <span className="text-[10px] text-white/95 font-medium truncate min-w-0">
                          {baseNameOf(f.originalName)}
                        </span>
                        <Pencil className="w-2.5 h-2.5 text-white/70 shrink-0 opacity-0 group-hover/name:opacity-100 [@media(hover:none)]:opacity-70" />
                      </button>
                    )}
                    {isVideo && f.durationSeconds != null && renamingFileId !== f.id && (
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
                {!readOnly && (
                <button
                  onClick={() => handleDeleteFile(f.id)}
                  onPointerDown={(e) => e.stopPropagation()}
                  className="absolute bottom-2 right-2 p-1.5 bg-black/60 hover:bg-red-500 text-white rounded opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100"
                  aria-label="Delete"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
                )}
              </SortablePhoto>
            );
          })}
        </div>
        </SortableContext>
        </DndContext>
        </>
      )}

      {/* Video thumbnail picker — opens when admin clicks "Thumbnail" on a video tile */}
      {composer && (
        <DeliveryEmailComposer
          contents={composer.contents}
          subject={composer.subject}
          body={composer.body}
          recipient={composerRecipient}
          recipientName={agentClient?.contactName || agentClient?.company || ""}
          galleryTitle={delivery.title || "your gallery"}
          galleryUrl={delivery.slug ? `${window.location.origin}/g/${delivery.slug}` : `${window.location.origin}/deliver/${delivery.token}`}
          alsoBroker={hasBroker}
          onCancel={() => setComposer(null)}
          proofs={composer.proofs}
          onSend={(subject, body, to) => sendDelivery(subject, body, to, composer.proofs)}
        />
      )}

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
  delivery: { id: string; title: string; coverFileId: string | null; coverStoragePath: string; coverFocal?: string; coverFocalX?: number; coverFocalY?: number; coverLayout: CoverLayoutId; coverFont: string; coverSubtitle: string | null; coverDate: string | null; slug: string | null };
  files: Array<{ id: string; originalName: string }>;
  signedUrls: Map<string, string>;
  onUpdate: (patch: { coverFileId?: string | null; coverStoragePath?: string; coverFocal?: string; coverFocalX?: number; coverFocalY?: number; coverWidth?: number; coverHeight?: number; coverLayout?: CoverLayoutId; coverFont?: string; coverSubtitle?: string | null; coverDate?: string | null; slug?: string | null }) => Promise<void>;
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
  const pickedCoverUrl = coverFile ? signedUrls.get(coverFile.id) : undefined;
  const [ownCoverUrl, setOwnCoverUrl] = useState("");
  const [uploadingCover, setUploadingCover] = useState(false);
  // An uploaded cover takes precedence, matching what the client sees.
  const shownCoverUrl = ownCoverUrl || pickedCoverUrl;

  // Fetch a viewable URL for the delivery's own cover object. It isn't a
  // delivery_files row, so it isn't in signedUrls with everything else.
  useEffect(() => {
    let cancelled = false;
    const path = delivery.coverStoragePath;
    if (!path) { setOwnCoverUrl(""); return; }
    (async () => {
      try {
        const token = await getAuthToken();
        const r = await fetch("/api/deliveries", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ action: "cover-url", deliveryId: delivery.id }),
        });
        const j = await r.json();
        if (!cancelled && r.ok && j.url) setOwnCoverUrl(j.url);
      } catch (err) {
        console.warn("Couldn't load the cover preview", err);
      }
    })();
    return () => { cancelled = true; };
  }, [delivery.coverStoragePath, delivery.id]);

  // NOTE: deliberately does NOT run the file through toUploadableImage. Every
  // gallery photo is re-encoded to JPEG at 80% so galleries stay light, which
  // is the right trade for a grid of thumbnails and the wrong one for a
  // full-screen hero — that re-encode is exactly why the cover looked soft.
  async function uploadCover(file: File) {
    setUploadingCover(true);
    try {
      const dims = await readImageDims(file).catch(() => ({ width: null, height: null }));
      const token = await getAuthToken();
      const res = await fetch("/api/delivery-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          deliveryId: delivery.id, fileName: file.name,
          contentType: file.type || "image/jpeg", sizeBytes: file.size, kind: "cover",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      await putFileWithProgress(data.uploadUrl, file, () => {});
      await onUpdate({
        coverStoragePath: data.storagePath,
        coverWidth: dims.width ?? 0,
        coverHeight: dims.height ?? 0,
      });
      toast.success("Cover updated");
    } catch (err) {
      toast.error("Couldn't upload the cover", { description: err instanceof Error ? err.message : "Try again" });
    } finally {
      setUploadingCover(false);
    }
  }

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
            imageUrl={shownCoverUrl}
            title={delivery.title}
            meta={[delivery.coverDate, delivery.coverSubtitle].filter(Boolean).join(" · ")}
            fontValue={delivery.coverFont}
            size="lg"
            showCta
          />
          <p className="text-[10px] text-slate-500 mt-2 text-center">This is what your client sees.</p>
        </div>
      </div>

      {/* Cover image */}
      {delivery.coverLayout !== "minimal" && (
        <div className="mb-4">
          <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-2">Cover photo</label>
          <button
            onClick={() => setPickerOpen(true)}
            disabled={files.length === 0 && !ownCoverUrl}
            className="w-full aspect-[3/1] bg-white/[0.03] border border-white/10 rounded-lg overflow-hidden hover:border-white/20 disabled:opacity-50 flex items-center justify-center text-xs text-slate-500"
          >
            {shownCoverUrl ? (
              <img src={shownCoverUrl} alt="" className="w-full h-full object-cover" />
            ) : files.length === 0 ? (
              "Upload a cover, or add photos first"
            ) : (
              `Pick a cover (defaults to first photo)`
            )}
          </button>
          {/* Uploading the cover separately is the only way to have one that
              is full quality AND survives deleting the photo it came from:
              gallery photos are re-encoded to 80% on upload, and a cover
              picked from them is just a reference to a row that can go away. */}
          <div className="flex items-center gap-3 mt-2">
            <label className="text-xs text-[#0088ff] hover:text-[#0088ff]/80 cursor-pointer">
              {uploadingCover ? "Uploading…" : ownCoverUrl ? "Replace cover image" : "Upload a cover image"}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={uploadingCover}
                onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) uploadCover(f); }}
              />
            </label>
            {ownCoverUrl && (
              <button
                onClick={() => onUpdate({ coverStoragePath: "", coverWidth: 0, coverHeight: 0 })}
                className="text-xs text-slate-400 hover:text-white"
              >
                Remove
              </button>
            )}
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            {ownCoverUrl
              ? "Using an uploaded cover — full quality, and it stays even if you delete photos from the gallery."
              : "A cover picked from the gallery uses the compressed copy and disappears if that photo is deleted."}
          </p>

          {/* Click the photo to choose the point that must stay in frame.
              Stored as percentages and applied with object-position, so the
              same point holds on a phone, an iPad and a wide desktop — which
              a top/centre/bottom setting can never do. */}
          <div className="mt-3">
            <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1">Cover focal point</label>
            {shownCoverUrl ? (
              <>
                <div
                  className="relative w-full rounded-lg overflow-hidden cursor-crosshair border border-white/10"
                  onClick={(e) => {
                    const r = e.currentTarget.getBoundingClientRect();
                    const x = Math.round(((e.clientX - r.left) / r.width) * 100);
                    const y = Math.round(((e.clientY - r.top) / r.height) * 100);
                    onUpdate({ coverFocal: "point", coverFocalX: Math.min(100, Math.max(0, x)), coverFocalY: Math.min(100, Math.max(0, y)) });
                  }}
                >
                  <img src={shownCoverUrl} alt="" className="w-full max-h-64 object-contain bg-black" />
                  {(delivery.coverFocal || "point") !== "contain" && (
                    <span
                      className="absolute w-6 h-6 -ml-3 -mt-3 rounded-full border-2 border-white shadow pointer-events-none"
                      style={{
                        left: `${delivery.coverFocalX ?? 50}%`,
                        top: `${delivery.coverFocalY ?? 50}%`,
                        boxShadow: "0 0 0 2px rgba(0,0,0,0.5)",
                      }}
                    />
                  )}
                </div>
                <div className="flex items-center justify-between mt-2">
                  <p className="text-[11px] text-slate-500">
                    {(delivery.coverFocal || "point") === "contain"
                      ? "Showing the whole photo — nothing is cropped."
                      : "Click the photo to move the point that stays in frame."}
                  </p>
                  <button
                    type="button"
                    onClick={() => onUpdate({ coverFocal: (delivery.coverFocal || "point") === "contain" ? "point" : "contain" })}
                    className="text-xs text-slate-400 hover:text-white shrink-0"
                  >
                    {(delivery.coverFocal || "point") === "contain" ? "Crop to fill" : "Show whole photo"}
                  </button>
                </div>
              </>
            ) : (
              <p className="text-[11px] text-slate-500">Set a cover first, then pick the point to keep in frame.</p>
            )}
          </div>
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
  const { data, addDeliveryCollection, updateDeliveryCollection } = useApp();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  // The slug IS the public URL (/c/:slug is the only route to a collection),
  // yet collections were created slug-less with no way to set one — grouping
  // worked, the landing page was unreachable. Same editor pattern as the
  // gallery's vanity URL above.
  const selected = data.deliveryCollections.find(c => c.id === collectionId) || null;
  const [collSlug, setCollSlug] = useState(selected?.slug || "");
  useEffect(() => { setCollSlug(selected?.slug || ""); }, [selected?.slug]);

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
                // Slug from the name so the landing page has a URL from birth.
                const c = await addDeliveryCollection({ name: newName.trim(), slug: slugify(newName) || null, coverSubtitle: null });
                await onUpdate(c.id);
                setCreating(false);
                setNewName("");
                toast.success(`Collection "${c.name}" created${c.slug ? ` — /c/${c.slug}` : ""}`);
              } catch (err) {
                toast.error("Couldn't create", { description: err instanceof Error ? err.message : "" });
              }
            }}
            className="px-3 py-2 bg-[#0088ff] text-white rounded-lg text-sm font-semibold whitespace-nowrap"
          >Create</button>
          <button onClick={() => { setCreating(false); setNewName(""); }} className="text-xs text-slate-400 hover:text-white">Cancel</button>
        </div>
      )}
      {selected && (
        <div className="mt-3">
          <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1">Collection URL</label>
          <div className="flex items-stretch gap-0">
            <span className="bg-white/[0.03] border border-r-0 border-white/10 rounded-l-lg px-3 py-2 text-sm text-slate-500">/c/</span>
            <input
              type="text"
              value={collSlug}
              onChange={(e) => setCollSlug(slugify(e.target.value))}
              onBlur={async () => {
                if (collSlug !== (selected.slug || "")) {
                  try {
                    await updateDeliveryCollection(selected.id, { slug: collSlug || null });
                    if (collSlug) toast.success(`URL set: /c/${collSlug}`);
                  } catch (err) {
                    const msg = err instanceof Error ? err.message : "";
                    if (msg.includes("duplicate") || msg.includes("unique")) {
                      toast.error("That URL is already taken — try a different slug");
                    } else {
                      toast.error("Couldn't save URL", { description: msg });
                    }
                    setCollSlug(selected.slug || "");
                  }
                }
              }}
              placeholder="portfolio"
              className="flex-1 bg-white/[0.03] border border-white/10 rounded-r-lg px-3 py-2 text-sm text-white placeholder-slate-600 outline-none focus:border-[#0088ff]"
            />
            {selected.slug && (
              <button
                onClick={async () => { await navigator.clipboard.writeText(`${window.location.origin}/c/${selected.slug}`); toast.success("Link copied"); }}
                className="ml-2 text-xs px-3 border border-white/10 rounded-lg hover:bg-white/[0.04] inline-flex items-center gap-1.5 shrink-0"
              >
                <Copy className="w-3 h-3" /> Copy
              </button>
            )}
          </div>
          <p className="text-[10px] text-slate-500 mt-1">The public landing page listing every gallery in this collection. Only galleries marked sent (or beyond) appear.</p>
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

/**
 * How many photos the client may pick, changeable at any time.
 *
 * The whole proofing flow already existed — hearts on the public gallery, a
 * running "3 of 15 picked", a submit that refuses to go over — but the number
 * could only be set on the create form. Once a gallery existed there was no
 * way to change it, which is the one thing you actually need: the count gets
 * negotiated after the client has seen the shoot, not before.
 *
 * Committed on blur, not per keystroke, so clearing the box to retype doesn't
 * momentarily save a limit of 0 and turn proofing off underneath the client.
 */
/**
 * Which photos she picked, by the filename they came off the card with.
 *
 * The tab used to say "15 picks" and stop there. That number is useless on
 * its own: the shoot is 400 raws sitting in Lightroom, and the answer you
 * need is WHICH fifteen. The grid marks them, but scrolling 400 tiles hunting
 * for highlights is not a workflow.
 *
 * So: the list, with the original filenames, and a button that copies them.
 * Paste into Lightroom's filename filter and you have her selects.
 */
function PicksList({
  selections,
  files,
  signedUrls,
  onToggleEdited,
  onRemove,
}: {
  selections: DeliverySelection[];
  files: DeliveryFile[];
  signedUrls: Map<string, string>;
  onToggleEdited: (selectionId: string, edited: boolean) => void;
  /** Owner only — absent in the staff (read-only) view. */
  onRemove?: (selectionId: string) => void;
}) {
  const byId = useMemo(() => new Map(files.map(f => [f.id, f])), [files]);
  const rows = useMemo(
    () => selections
      .map(sel => ({ sel, file: byId.get(sel.fileId) }))
      .filter((r): r is { sel: DeliverySelection; file: DeliveryFile } => !!r.file)
      // Natural order, so DSC_9 sorts before DSC_10 the way a card reader lists them.
      .sort((a, b) => a.file.originalName.localeCompare(b.file.originalName, undefined, { numeric: true })),
    [selections, byId],
  );

  // A pick whose file has since been deleted still counts — say so rather
  // than quietly showing a shorter list than the count above.
  const missing = selections.length - rows.length;
  const editedCount = rows.filter(r => !!r.sel.editedAt).length;

  const copyNames = async () => {
    const text = rows.map(r => r.file.originalName).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`Copied ${rows.length} filename${rows.length === 1 ? "" : "s"}`);
    } catch {
      toast.error("Couldn't copy", { description: "Your browser blocked clipboard access." });
    }
  };

  if (rows.length === 0 && missing === 0) return null;

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5 mb-6">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider min-w-0">
          Her picks — {editedCount} of {rows.length} edited
        </h3>
        <button
          onClick={copyNames}
          className="text-xs px-3 py-1.5 border border-white/10 rounded-lg hover:bg-white/[0.04] shrink-0"
          title="Copy the original filenames to paste into Lightroom"
        >
          Copy filenames
        </button>
      </div>
      {missing > 0 && (
        <p className="text-[11px] text-amber-400/90 mb-3">
          {missing} pick{missing === 1 ? " refers" : "s refer"} to {missing === 1 ? "a photo" : "photos"} no longer in this gallery.
        </p>
      )}
      <div className="divide-y divide-white/5">
        {rows.map(({ sel, file }) => {
          const url = signedUrls.get(file.id);
          return (
            <div key={sel.id} className="flex items-center gap-3 py-2 min-w-0">
              <div className="w-12 h-12 rounded bg-white/[0.03] overflow-hidden shrink-0">
                {url && <img src={url} alt="" className="w-full h-full object-cover" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-white font-mono truncate">{file.originalName}</p>
                {sel.isPaid && <p className="text-[10px] text-emerald-400">paid extra</p>}
              </div>
              <button
                onClick={() => onToggleEdited(sel.id, !sel.editedAt)}
                className={`text-[10px] px-2 py-1 rounded font-semibold shrink-0 ${
                  sel.editedAt ? "bg-emerald-500 text-white" : "bg-white/10 text-white hover:bg-white/20"
                }`}
              >
                {sel.editedAt ? "Edited" : "Mark edited"}
              </button>
              {onRemove && (
                <button
                  onClick={() => onRemove(sel.id)}
                  className="p-1 text-slate-500 hover:text-red-400 shrink-0"
                  title="Remove this pick — she'll be able to choose a replacement"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ProofingPanel({
  selectionLimit,
  selectionMinimum,
  perExtraPhotoCents,
  buyAllFlatCents,
  downloadOnly,
  photoCount,
  pickedCount,
  onUpdate,
}: {
  selectionLimit: number;
  selectionMinimum: number;
  perExtraPhotoCents: number;
  buyAllFlatCents: number;
  downloadOnly: boolean;
  photoCount: number;
  pickedCount: number;
  onUpdate: (patch: { selectionLimit?: number; selectionMinimum?: number; perExtraPhotoCents?: number; buyAllFlatCents?: number; downloadOnly?: boolean }) => Promise<void>;
}) {
  const [limit, setLimit] = useState(String(selectionLimit || ""));
  const [minimum, setMinimum] = useState(String(selectionMinimum || ""));
  const [perExtra, setPerExtra] = useState(perExtraPhotoCents ? String(perExtraPhotoCents / 100) : "");
  const [flat, setFlat] = useState(buyAllFlatCents ? String(buyAllFlatCents / 100) : "");
  useEffect(() => { setLimit(String(selectionLimit || "")); }, [selectionLimit]);
  useEffect(() => { setMinimum(String(selectionMinimum || "")); }, [selectionMinimum]);
  useEffect(() => { setPerExtra(perExtraPhotoCents ? String(perExtraPhotoCents / 100) : ""); }, [perExtraPhotoCents]);
  useEffect(() => { setFlat(buyAllFlatCents ? String(buyAllFlatCents / 100) : ""); }, [buyAllFlatCents]);

  const on = selectionLimit > 0 && !downloadOnly;
  const paidExtras = perExtraPhotoCents > 0 || buyAllFlatCents > 0;

  const commit = async (patch: Parameters<typeof onUpdate>[0], label: string) => {
    try { await onUpdate(patch); toast.success(label); }
    catch (e) { toast.error("Couldn't save", { description: e instanceof Error ? e.message : "Try again" }); }
  };

  const saveLimit = () => {
    const n = parseInt(limit, 10) || 0;
    if (n === selectionLimit) return;
    // Turning proofing on means turning download-only off — a download-only
    // gallery hides the hearts, so a limit alone would do nothing visible.
    commit(
      n > 0 && downloadOnly ? { selectionLimit: n, downloadOnly: false } : { selectionLimit: n },
      n > 0 ? `Client can pick ${n}` : "Picking turned off",
    );
  };

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5 mb-6">
      <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Photo picking</h3>
      <p className="text-xs text-slate-500 mb-3">
        Let the client heart the shots they want edited. Leave blank or 0 to turn it off and just deliver everything.
      </p>

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0">
          <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1">How many they can pick</label>
          <input
            type="text"
            inputMode="numeric"
            value={limit}
            onChange={(e) => setLimit(e.target.value.replace(/[^\d]/g, ""))}
            onBlur={saveLimit}
            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
            placeholder="15"
            className="w-28 bg-white/[0.03] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-[#0088ff]"
          />
        </div>
        {on && (
          <div className="min-w-0">
            <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1">Fewest they can send</label>
            <input
              type="text"
              inputMode="numeric"
              value={minimum}
              onChange={(e) => setMinimum(e.target.value.replace(/[^\d]/g, ""))}
              onBlur={() => {
                let n = parseInt(minimum, 10) || 0;
                if (n > selectionLimit) n = selectionLimit;   // a floor above the ceiling can never be met
                if (n !== selectionMinimum) commit({ selectionMinimum: n }, n > 0 ? `They can send from ${n}` : "They must use all " + selectionLimit);
                setMinimum(String(n || ""));
              }}
              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
              placeholder="all"
              className="w-28 bg-white/[0.03] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-[#0088ff]"
            />
          </div>
        )}
        {on && (
          <p className="text-xs text-slate-400 pb-2">
            of <strong className="text-white">{photoCount}</strong> photo{photoCount === 1 ? "" : "s"}
            {pickedCount > 0 && <> · <strong className="text-white">{pickedCount}</strong> picked so far</>}
          </p>
        )}
      </div>
      {on && (
        <p className="text-[11px] text-slate-500 mt-2">
          {selectionMinimum > 0 && selectionMinimum < selectionLimit
            ? <>They can send once they've chosen <strong className="text-slate-300">{selectionMinimum}</strong>, then come back for the remaining {selectionLimit - selectionMinimum} whenever they like — until you start editing.</>
            : <>They must use the whole allowance of <strong className="text-slate-300">{selectionLimit}</strong> before they can send. Set a lower number here to let them send some now and the rest later.</>}
        </p>
      )}

      {on && (
        <div className="mt-4 pt-4 border-t border-white/10">
          <p className="text-xs text-slate-400 mb-2">
            {paidExtras
              ? "They can go over and pay for the extras."
              : `A hard stop at ${selectionLimit} — they can't submit more.`}
          </p>
          <p className="text-[10px] text-slate-500 mb-3">Set a price to let them buy extras instead. Leave both blank for a hard cap.</p>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1">Per extra photo ($)</label>
              <input
                type="text"
                inputMode="decimal"
                value={perExtra}
                onChange={(e) => setPerExtra(e.target.value.replace(/[^\d.]/g, ""))}
                onBlur={() => {
                  const cents = Math.round((parseFloat(perExtra) || 0) * 100);
                  if (cents !== perExtraPhotoCents) commit({ perExtraPhotoCents: cents }, cents ? `Extras at $${(cents / 100).toFixed(2)} each` : "Per-photo price cleared");
                }}
                placeholder="0.00"
                className="w-28 bg-white/[0.03] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-[#0088ff]"
              />
            </div>
            <div>
              <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1">Or buy all ($)</label>
              <input
                type="text"
                inputMode="decimal"
                value={flat}
                onChange={(e) => setFlat(e.target.value.replace(/[^\d.]/g, ""))}
                onBlur={() => {
                  const cents = Math.round((parseFloat(flat) || 0) * 100);
                  if (cents !== buyAllFlatCents) commit({ buyAllFlatCents: cents }, cents ? `Buy-all at $${(cents / 100).toFixed(2)}` : "Buy-all price cleared");
                }}
                placeholder="0.00"
                className="w-28 bg-white/[0.03] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-[#0088ff]"
              />
            </div>
          </div>
        </div>
      )}

      {selectionLimit > 0 && downloadOnly && (
        <p className="text-[11px] text-amber-400/90 mt-3">
          This gallery is set to download-only, which hides the hearts — the limit won't do anything until you switch that off under Privacy.
        </p>
      )}
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

/** Compose the delivery email: read it, edit it, then send.
 *
 *  Replaces a yes/no confirmation, which could only describe what was about to
 *  go out. The preview renders the same merge fields the server will, so what
 *  you read is what the client gets. */
/**
 * A field that shows merge fields as chips instead of {{braces}}.
 *
 * The tokens are still what gets saved and sent — they have to be, the server
 * substitutes them — but nobody should have to read "{{gallery_title}}" to
 * work out their own email says the gallery's name.
 *
 * Uncontrolled on purpose: the HTML is written once on mount and never again
 * from props. Re-rendering a contenteditable from state on every keystroke
 * puts the caret back at the start, which is the classic way this breaks.
 */
function ChipField({
  value,
  onChange,
  multiline,
  placeholder,
  registerInsert,
}: {
  value: string;
  onChange: (next: string) => void;
  multiline?: boolean;
  placeholder?: string;
  /** Hands the parent a way to drop a token in at the caret. The field is
   *  uncontrolled, so setting state alone wouldn't show anything. */
  registerInsert?: (fn: (token: string) => void) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const initial = useRef(value);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.innerHTML = toChips(initial.current);
  }, []);

  /** Read the text back with chips turned into their tokens. */
  const readOut = (): string => {
    const el = ref.current;
    if (!el) return "";
    const walk = (node: Node): string => {
      if (node.nodeType === Node.TEXT_NODE) return node.textContent || "";
      const e = node as HTMLElement;
      if (e.dataset?.token) return e.dataset.token;
      if (e.tagName === "BR") return "\n";
      let out = "";
      e.childNodes.forEach(c => { out += walk(c); });
      // A div is a line in a contenteditable.
      if (e.tagName === "DIV" && e !== el) out = "\n" + out;
      return out;
    };
    let out = "";
    el.childNodes.forEach(c => { out += walk(c); });
    return out.replace(/\u00a0/g, " ");
  };

  useEffect(() => {
    if (!registerInsert) return;
    registerInsert((token: string) => {
      const el = ref.current;
      if (!el) return;
      el.focus();
      const sel = window.getSelection();
      // No caret in this field yet — put it at the end rather than dropping
      // the token into whatever was last focused.
      if (!sel || sel.rangeCount === 0 || !el.contains(sel.anchorNode)) {
        const r = document.createRange();
        r.selectNodeContents(el);
        r.collapse(false);
        sel?.removeAllRanges();
        sel?.addRange(r);
      }
      document.execCommand("insertHTML", false, toChips(token) + "&nbsp;");
      onChange(readOut());
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-multiline={multiline ? "true" : "false"}
      data-placeholder={placeholder}
      onInput={() => onChange(readOut())}
      onBlur={() => onChange(readOut())}
      // Chips are atomic — a token half-deleted is a token that silently
      // stops substituting, which you'd only find out about in the client's
      // inbox. Paste lands as plain text for the same reason.
      onPaste={(e) => {
        e.preventDefault();
        const text = e.clipboardData.getData("text/plain");
        document.execCommand("insertText", false, text);
      }}
      className={`w-full bg-white/[0.03] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-[#0088ff] chip-field ${
        multiline ? "min-h-[9rem] max-h-[18rem] overflow-y-auto whitespace-pre-wrap" : "whitespace-nowrap overflow-x-auto"
      }`}
    />
  );
}

/** {{token}} → an inline chip carrying the token on a data attribute. */
function toChips(text: string): string {
  const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return esc(text)
    .replace(/\{\{([a-z_]+)\}\}/g, (match, field: string) => {
      const known = MERGE_FIELDS.find(f => f.token === `{{${field}}}`);
      if (!known) return match;   // unknown token stays visible rather than vanishing
      const label = field.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
      return `<span class="email-chip" contenteditable="false" data-token="{{${field}}}">${label}</span>`;
    })
    .replace(/\n/g, "<br>");
}

function DeliveryEmailComposer({
  contents, subject: initialSubject, body: initialBody,
  recipient, recipientName, galleryTitle, galleryUrl, alsoBroker, proofs, onCancel, onSend,
}: {
  contents: GalleryContents;
  subject: string;
  body: string;
  recipient: string;
  recipientName: string;
  galleryTitle: string;
  galleryUrl: string;
  alsoBroker: boolean;
  /** Proofs read differently: nothing is downloadable and the ask is to
   *  choose, so the button in the preview must not promise a download. */
  proofs?: boolean;
  onCancel: () => void;
  onSend: (subject: string, body: string, to: string) => Promise<void>;
}) {
  const [subject, setSubject] = useState(initialSubject);
  const [body, setBody] = useState(initialBody);
  const [to, setTo] = useState(recipient);
  const [sending, setSending] = useState(false);
  const insertIntoBody = useRef<(token: string) => void>(() => {});

  // The name the merge field will actually resolve to, so the preview can't
  // flatter itself with a name the send won't have.
  const firstName = (recipientName || "").trim().split(/\s+/)[0] || "there";
  const merged = { firstName, galleryTitle, galleryUrl, contents };
  const previewSubject = applyMerge(subject, merged);
  const previewBody = applyMerge(body, merged);

  const send = async () => {
    if (!to.trim() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to.trim())) { toast.error("That doesn't look like an email address"); return; }
    if (!subject.trim() || !body.trim()) { toast.error("Subject and message can't be empty"); return; }
    setSending(true);
    try { await onSend(subject, body, to.trim()); }
    finally { setSending(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
      <div className="bg-[#0e1116] border border-white/10 rounded-2xl w-full max-w-3xl my-8">
        <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">Send this gallery</h2>
          <button onClick={onCancel} className="text-slate-400 hover:text-white p-1"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-5 space-y-4">
          {/* Editable, not a label. A client record with no email address on
              it — which is every client created from a booking rather than
              typed in — left this modal with nothing but Cancel: Send was
              disabled and there was no way to say who to send it to. */}
          <div>
            <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1">To</label>
            <input
              type="email"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="name@example.com"
              className="w-full bg-white/[0.03] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-[#0088ff]"
            />
            {!recipient && (
              <p className="text-[11px] text-amber-400/90 mt-1">
                No email saved on this client — type one here, and add it to their record so next time it's filled in.
              </p>
            )}
            {alsoBroker && <p className="text-[11px] text-slate-500 mt-1">The brokerage is notified too.</p>}
          </div>

          <div>
            <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1">Subject</label>
            <ChipField value={subject} onChange={setSubject} placeholder="Subject" />
          </div>

          <div>
            <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1">Message</label>
            <ChipField
              value={body}
              onChange={setBody}
              multiline
              placeholder="Write your message…"
              registerInsert={(fn) => { insertIntoBody.current = fn; }}
            />
            <div className="flex flex-wrap gap-1.5 mt-2">
              {MERGE_FIELDS.map(f => (
                <button
                  key={f.token}
                  type="button"
                  onClick={() => insertIntoBody.current(f.token)}
                  title={f.label}
                  className="text-[10px] px-2 py-1 rounded border border-white/10 text-slate-400 hover:text-white hover:border-white/25 font-mono"
                >{f.token}</button>
              ))}
            </div>
            <p className="text-[11px] text-slate-500 mt-2">
              The download button is added automatically underneath — you don't need to paste the link unless you want it in the text too.
            </p>
          </div>

          {/* Rendered the way the client will see it. */}
          <div>
            <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1">Preview</label>
            <div className="rounded-lg bg-white p-5 text-[#1e293b]">
              <p className="text-[11px] text-slate-500 mb-3 pb-3 border-b border-slate-200">
                <strong className="text-slate-700">Subject:</strong> {previewSubject}
              </p>
              <h1 className="text-[20px] font-bold text-[#0088ff] mb-2">
                {previewSubject}
              </h1>
              {previewBody.split(/\n{2,}/).map((para, i) => (
                <p key={i} className="text-[14px] leading-relaxed mb-2 whitespace-pre-line">
                  {/* A pasted gallery URL reads as a wall of characters in the
                      middle of a friendly note. Same link, said in words. */}
                  {para.split(/(https?:\/\/\S+)/g).map((chunk, j) =>
                    /^https?:\/\//.test(chunk)
                      ? <a key={j} href={chunk} className="text-[#0088ff] underline">{proofs ? "Open your proofs" : "Open your gallery"}</a>
                      : <span key={j}>{chunk}</span>,
                  )}
                </p>
              ))}
              <span className="inline-block mt-3 bg-[#0088ff] text-white px-5 py-2.5 rounded-md text-[13px] font-semibold">
                {proofs ? "View & choose" : "View & download"}
              </span>
            </div>
          </div>
        </div>

        <div className="px-5 py-4 border-t border-white/10 flex items-center justify-between gap-3">
          <p className="text-[11px] text-slate-500">
            This can't be unsent — putting the gallery back to draft doesn't take the link away.
          </p>
          <div className="flex gap-2 shrink-0">
            <button onClick={onCancel} className="text-xs px-3 py-2 border border-white/10 rounded-lg text-slate-300 hover:bg-white/[0.04]">Cancel</button>
            <button
              onClick={send}
              disabled={sending || !to.trim()}
              className="text-xs px-4 py-2 rounded-lg bg-[#0088ff] text-white font-semibold disabled:opacity-40"
            >{sending ? "Sending…" : "Send"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function PresentationPanel({ downloadOnly, viewOnly, hasCover, onUpdate, onUpdateViewOnly }: { downloadOnly: boolean; viewOnly: boolean; hasCover: boolean; onUpdate: (v: boolean) => Promise<void>; onUpdateViewOnly: (v: boolean) => Promise<void> }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5 mb-6">
      <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Presentation</h3>
      <label className="flex items-start gap-3 cursor-pointer mb-4">
        <input
          type="checkbox"
          checked={viewOnly}
          onChange={(e) => onUpdateViewOnly(e.target.checked)}
          className="mt-1 w-4 h-4 accent-[#0088ff]"
        />
        <span>
          <span className="text-sm text-white font-medium block">View only (portfolio)</span>
          <span className="text-xs text-slate-500">
            Visitors browse, nothing downloads — the download buttons disappear and the server withholds the file links.
            For sending work samples to prospects. Pair it with the logo watermark below if you want your mark on every image.
          </span>
        </span>
      </label>
      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={downloadOnly}
          onChange={(e) => onUpdate(e.target.checked)}
          className="mt-1 w-4 h-4 accent-[#0088ff]"
        />
        <span>
          <span className="text-sm text-white font-medium block">Download only</span>
          <span className="text-xs text-slate-500">
            The stripped-back layout built for real estate: the client lands straight on the files, with no proofing or
            selections. Turn it off for the full client gallery. Galleries created from a real estate shoot start with
            this on — until now there was no way to change it, so a wedding created that way silently swallowed its cover.
            {!hasCover && " No cover is set on this gallery, so there's no cover screen either way."}
          </span>
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

/** `isCancelled` lets Stop kill the transfer in flight rather than waiting for
 *  it to finish. Without it, stopping a 400-photo drop means "after this one",
 *  and on a slow line that's a long way from stopping. */
function putFileWithProgress(
  url: string,
  file: File,
  onProgress: (pct: number) => void,
  isCancelled?: () => boolean,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let userStopped = false;
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", file.type);

    // Polled rather than event-driven: there's no signal to listen to, and a
    // half-second lag on a button press nobody can perceive.
    const watch = setInterval(() => {
      if (isCancelled?.()) { userStopped = true; xhr.abort(); }
    }, 400);

    // Same stall detection as the multipart path. This used to have an
    // ontimeout handler and never set xhr.timeout, so the handler was dead
    // code and a stalled connection hung here forever — no error, no progress,
    // no way out but reloading the page.
    let stall: ReturnType<typeof setTimeout>;
    const armStall = () => {
      clearTimeout(stall);
      stall = setTimeout(() => xhr.abort(), STALL_TIMEOUT_MS);
    };
    const settle = (fn: () => void) => { clearTimeout(stall); clearInterval(watch); fn(); };

    xhr.upload.onprogress = (e) => {
      armStall();
      if (e.lengthComputable) onProgress(Math.min(99, Math.round((e.loaded / e.total) * 100)));
    };
    xhr.onload = () => settle(() => {
      if (xhr.status >= 200 && xhr.status < 300) { onProgress(100); resolve(); }
      else reject(new Error(`R2 upload failed: ${xhr.status}`));
    });
    xhr.onerror = () => settle(() => reject(new Error("Network error during upload — check your connection")));
    xhr.onabort = () => settle(() => reject(new Error(
      userStopped ? "Upload stopped" : `Upload stalled — no data for ${STALL_TIMEOUT_MS / 1000}s`,
    )));
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
  /** Stop, mid-file. Stopping a multipart upload is the one case where the
   *  existing no-abort rule is exactly what you want: the parts stay in R2 and
   *  the record stays on disk, so dropping the same file again resumes from
   *  here rather than re-sending gigabytes. */
  isCancelled?: () => boolean,
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
      let userStopped = false;
      xhr.open("PUT", urlMap.get(partNumber)!);
      const watch = setInterval(() => {
        if (isCancelled?.()) { userStopped = true; xhr.abort(); }
      }, 400);

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
      const settle = (fn: () => void) => { clearTimeout(stall); clearInterval(watch); fn(); };

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
      xhr.onabort = () => settle(() => reject(new Error(
        userStopped ? "Upload stopped" : `Part ${partNumber} stalled — no data for ${STALL_TIMEOUT_MS / 1000}s`,
      )));
      armStall();
      xhr.send(blob);
    });

    const queue = [...numbers];
    const CONCURRENCY = 4; // enough to saturate a domestic upstream, few enough not to starve each other
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
      for (;;) {
        if (isCancelled?.()) return;
        const partNumber = queue.shift();
        if (partNumber === undefined) return;
        const start = (partNumber - 1) * partSize;
        const blob = file.slice(start, Math.min(start + partSize, file.size));
        // Retry the individual part rather than the whole file — the entire
        // reason for doing it this way.
        let lastErr: unknown;
        for (let attempt = 0; attempt < 3; attempt++) {
          try { await putPart(partNumber, blob); lastErr = null; break; }
          catch (e) {
            lastErr = e; sent[partNumber - 1] = 0; report();
            // Don't burn three attempts and six seconds retrying something the
            // user just cancelled.
            if (isCancelled?.()) break;
            await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
          }
        }
        if (lastErr) throw lastErr;
      }
    }));

    // Sends the file size, not a part count: the server derives how many parts
    // there should be and how big each must be, then checks R2 against that.
    // A client that has just failed shouldn't get a vote on whether the upload
    // is complete.
    // Completing here would assemble whatever parts happened to land and
    // hand back a truncated file that looks fine until it's played. The
    // record stays on disk instead, so re-dropping resumes.
    if (isCancelled?.()) throw new Error("Upload stopped");
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
          // Read the metadata BEFORE cleanup() and hold it in locals.
          //
          // cleanup() removes the src and calls load(), which resets the media
          // element: videoWidth and videoHeight go to 0 and duration to NaN.
          // This used to resolve with `video.videoWidth` read inside the
          // toBlob callback, i.e. after cleanup had already run — so every
          // video ever uploaded was stored as 0x0 with no duration, even
          // though the thumbnail captured just above came out at full size.
          // The gallery then fell back to a 3:2 guess and videos were the only
          // tile with the wrong shape.
          const vw = video.videoWidth;
          const vh = video.videoHeight;
          const vdur = video.duration;

          const canvas = document.createElement("canvas");
          canvas.width = vw;
          canvas.height = vh;
          const ctx = canvas.getContext("2d");
          if (!ctx) { cleanup(); resolve(null); return; }
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          canvas.toBlob((blob) => {
            cleanup();
            if (!blob) { resolve(null); return; }
            resolve({
              width: vw,
              height: vh,
              duration: Number.isFinite(vdur) ? Math.round(vdur) : 0,
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
/** Kick off a browser download of a presigned attachment URL. Same trick as
 *  the public gallery: an <a> click streams to disk without loading the file
 *  into memory. */
function streamToDisk(url: string) {
  const a = document.createElement("a");
  a.href = url;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** Fetch a set of files and hand back one zip. Mirrors the public gallery's
 *  zipPhotos (JSZip lazy-loaded from CDN, batches of 4 so R2 isn't hammered);
 *  duplicated here because that one is welded to the gallery's FileItem shape. */
async function zipToDisk(items: { name: string; url: string }[], filename: string) {
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
  const batchSize = 4;
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    await Promise.all(batch.map(async (it) => {
      const r = await fetch(it.url);
      if (!r.ok) throw new Error(`Failed to fetch ${it.name}`);
      zip.file(it.name, await r.blob());
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
