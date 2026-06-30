// ============================================================
// ProjectDetailSheet — Slide-in panel for project details
// Design: Dark Cinematic Studio
// ============================================================

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "wouter";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { DateField, TimeField } from "@/components/DateTimeField";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Calendar, Clock, MapPin, User, Camera, Film, Edit3, Trash2, CheckCircle2, ExternalLink, DollarSign, Timer, Car, Send, X, Mail, Building2, Image as ImageIcon, Upload
} from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import { buildProjectMailto } from "@/lib/projectMailto";
import { useAuth } from "@/contexts/AuthContext";
import type { Project, ProjectStatus, EpisodeStatus, Invoice } from "@/lib/types";
import { NEXT_STATUS, NEXT_STATUS_LABEL, canAdvanceProjectStatus } from "@/lib/projectStatusFlow";
import { cn } from "@/lib/utils";
import { getProjectWorkedHours, getProjectInvoiceAmount, getProjectPayerId, getCrewMemberProjectPay } from "@/lib/data";
import { buildInvoice, generateInvoiceNumberFromDB } from "@/lib/invoice";
import { supabase, getAuthToken } from "@/lib/supabase";
import { pdf } from "@react-pdf/renderer";
import { toast } from "sonner";
import ProjectDialog from "./ProjectDialog";
import PhotoEditorCalculator from "./PhotoEditorCalculator";
import InvoicePDF from "./InvoicePDF";
import ClientProfileSheet from "./ClientProfileSheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

function fmtDur(min: number): string {
  const h = Math.floor(min / 60), m = min % 60;
  return [h ? `${h} hr` : "", m ? `${m} min` : ""].filter(Boolean).join(" ") || "0 min";
}

const STATUS_LABELS: Record<ProjectStatus, string> = {
  tentative: "Tentative",
  upcoming: "Upcoming",
  filming_done: "Filming Done",
  in_editing: "In Editing",
  editing_done: "Editing Done",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

// Map project status → episode status for sync. delivered keeps
// the same downstream meaning as the old "completed".
const PROJECT_TO_EPISODE_STATUS: Partial<Record<ProjectStatus, EpisodeStatus>> = {
  upcoming: "scheduled",
  filming_done: "filming",
  in_editing: "editing",
  editing_done: "editing",
  delivered: "delivered",
};

interface Props {
  project: Project;
  onClose: () => void;
}

export default function ProjectDetailSheet({ project: projectProp, onClose }: Props) {
  const { data, updateProject, deleteProject, updateEpisode, fetchEpisodes, addInvoice, updateInvoice, createReShootGallery, refresh } = useApp();
  const [, setLocation] = useLocation();
  const { effectiveProfile, allProfiles } = useAuth();
  const isOwner = effectiveProfile?.role === "owner";
  const isClient = effectiveProfile?.role === "client";
  // Staff (crew) see what they're paid, never what the client is billed.
  const isStaff = effectiveProfile?.role === "staff";
  // Always read the latest project from context so status updates reflect immediately
  const project = data.projects.find(p => p.id === projectProp.id) ?? projectProp;
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [restoring, setRestoring] = useState(false);
  // Reschedule modal state.
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleStartTime, setRescheduleStartTime] = useState("");
  const [rescheduleEndTime, setRescheduleEndTime] = useState("");
  const [rescheduling, setRescheduling] = useState(false);
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [invoiceEmail, setInvoiceEmail] = useState("");
  const [invoiceMessage, setInvoiceMessage] = useState("");
  const [sendingInvoice, setSendingInvoice] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [copyingLink, setCopyingLink] = useState(false);
  // Owner-selected payment methods for THIS invoice. Resets each time
  // the dialog opens. Default = whatever the org has configured.
  const [invoicePaymentMethods, setInvoicePaymentMethods] = useState<("stripe" | "venmo")[]>([]);
  const [deliverablesOpen, setDeliverablesOpen] = useState(false);
  const [deliverablesEmail, setDeliverablesEmail] = useState("");
  const [deliverablesSubject, setDeliverablesSubject] = useState("");
  const [deliverablesMessage, setDeliverablesMessage] = useState("");
  const [sendingDeliverables, setSendingDeliverables] = useState(false);
  const [clientSheetOpen, setClientSheetOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [generatingPreview, setGeneratingPreview] = useState(false);

  const client = data.clients.find((c) => c.id === project.clientId);
  // Invoices go to the PAYER — for an agent's shoot that's their broker, not the
  // agent. (Deliverables + reschedule notices still go to `client`, the agent.)
  const clientsById = Object.fromEntries(data.clients.map((c) => [c.id, c]));
  const invoiceClient = data.clients.find((c) => c.id === getProjectPayerId(project, clientsById)) ?? client;
  // For an agent's shoot, which brokerage they're under (shown without opening Edit).
  const agentBroker = client?.clientType === "agent" && client.brokerId ? clientsById[client.brokerId] : null;
  // Flat-rate / service-priced shoots aren't billed by the hour, so the
  // "retainer hours" summary is meaningless and gets hidden.
  const isFlatBilled = (project.billingModel ?? client?.billingModel) === "per_project"
    || (project.projectRate ?? 0) > 0
    || (project.services?.length ?? 0) > 0;
  const projectGallery = data.deliveries.find(d => d.projectId === project.id);
  const [creatingGallery, setCreatingGallery] = useState(false);

  // Photographer "on my way": the assigned shooter (or owner) can check in within
  // an hour of the start; it notifies the agent and locks their edit/cancel.
  const myCrewId = effectiveProfile?.crewMemberId || "";
  const isAssignedShooter = !!myCrewId && (project.crew || []).some(c => c.crewMemberId === myCrewId);
  // Assigned crew in a qualifying role (photographer/videographer on the shoot,
  // or an editor in post) can upload the finals straight into this property's
  // gallery — owner still controls delivering it to the client.
  const canCrewUpload = isStaff && !!myCrewId && (
    (project.crew || []).some(c => c.crewMemberId === myCrewId && /photograph|videograph/i.test(c.role || "")) ||
    (project.postProduction || []).some(c => c.crewMemberId === myCrewId && /editor/i.test(c.role || ""))
  );
  const crewPhotoInputRef = useRef<HTMLInputElement>(null);
  const [crewUploading, setCrewUploading] = useState<{ done: number; total: number } | null>(null);

  // Upload finals to this project's gallery as assigned crew. Mirrors the owner
  // flow but goes through crew-scoped endpoints (RLS blocks direct writes).
  async function handleCrewUpload(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const list = Array.from(fileList);
    setCrewUploading({ done: 0, total: list.length });
    try {
      const token = await getAuthToken();
      const ens = await fetch("/api/crew-gallery-ensure", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ projectId: project.id }),
      });
      const ensBody = await ens.json().catch(() => ({ error: "Failed" }));
      if (!ens.ok) throw new Error(ensBody.error || "Couldn't open the gallery");
      const deliveryId = ensBody.deliveryId as string;

      const readDims = (file: File) => new Promise<{ width: number; height: number }>((resolve) => {
        if (!file.type.startsWith("image/")) return resolve({ width: 0, height: 0 });
        const img = new Image();
        img.onload = () => { resolve({ width: img.naturalWidth, height: img.naturalHeight }); URL.revokeObjectURL(img.src); };
        img.onerror = () => resolve({ width: 0, height: 0 });
        img.src = URL.createObjectURL(file);
      });

      const startPos = data.deliveryFiles.filter(f => f.deliveryId === deliveryId).length;
      let done = 0, failed = 0;
      for (const file of list) {
        try {
          const isVideo = file.type.startsWith("video/");
          const { width, height } = await readDims(file);
          const up = await fetch("/api/delivery-upload", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ deliveryId, fileName: file.name, contentType: file.type, sizeBytes: file.size }),
          });
          const upData = await up.json();
          if (!up.ok) throw new Error(upData.error || "Upload failed");
          const put = await fetch(upData.uploadUrl, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
          if (!put.ok) throw new Error(`Upload failed (${put.status})`);
          await fetch("/api/crew-register-file", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({
              deliveryId, storagePath: upData.storagePath, originalName: file.name, sizeBytes: file.size,
              width, height, mimeType: file.type, position: startPos + done,
              mediaType: isVideo ? "video" : "image",
            }),
          });
          done++;
        } catch (e) {
          failed++;
          toast.error(`Failed: ${file.name}`, { description: e instanceof Error ? e.message : "Try again" });
        }
        setCrewUploading({ done: done + failed, total: list.length });
      }
      await refresh();
      if (done > 0) toast.success(`Uploaded ${done} file${done === 1 ? "" : "s"} to the gallery`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't upload");
    } finally {
      setCrewUploading(null);
    }
  }
  const shootStartMs = (() => {
    if (!project.date || !project.startTime) return null;
    const [y, m, d] = project.date.split("-").map(Number);
    const [hh, mm] = project.startTime.split(":").map(Number);
    return new Date(y, (m || 1) - 1, d || 1, hh || 0, mm || 0).getTime();
  })();
  const nowMs = Date.now();
  const canCheckIn = (isOwner || isAssignedShooter) && !project.onTheWayAt && project.status !== "cancelled"
    && shootStartMs !== null && nowMs >= shootStartMs - 60 * 60 * 1000 && nowMs <= shootStartMs + 4 * 60 * 60 * 1000;
  const [markingOnWay, setMarkingOnWay] = useState(false);
  const markOnTheWay = async () => {
    setMarkingOnWay(true);
    try {
      const token = await getAuthToken();
      const res = await fetch("/api/notify-on-the-way", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ projectId: project.id }),
      });
      const body = await res.json().catch(() => ({ error: "Failed" }));
      if (!res.ok) throw new Error(body.error || "Couldn't send");
      await updateProject(project.id, { onTheWayAt: body.onTheWayAt });
      toast.success(body.emailed || body.pushed ? "Agent notified you're on the way" : "Marked on the way (no agent contact on file)");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't mark on the way");
    } finally {
      setMarkingOnWay(false);
    }
  };
  const location = data.locations.find((l) => l.id === project.locationId);
  const pType = data.projectTypes.find((pt) => pt.id === project.projectTypeId);

  const getCrewName = (id: string) => data.crewMembers.find((c) => c.id === id)?.name ?? "Unknown";

  const { crewHours: totalCrewHrs, postHours: totalPostHrs, totalHours: totalHrs } = getProjectWorkedHours(project);
  const myCrewMemberId = effectiveProfile?.crewMemberId || "";

  // Tracked time from timer
  const trackedEntries = data.timeEntries?.filter(t => t.projectId === project.id && t.endTime) || [];
  const totalTrackedMinutes = trackedEntries.reduce((s, t) => s + (t.durationMinutes || 0), 0);
  const trackedHours = Math.floor(totalTrackedMinutes / 60);
  const trackedMins = Math.round(totalTrackedMinutes % 60);
  const trackedDisplay = trackedHours > 0 ? `${trackedHours}h ${trackedMins}m` : `${trackedMins}m`;

  // Invoice amount
  const invoiceAmount = client ? getProjectInvoiceAmount(project, client) : 0;

  // Mileage to location
  const myDistance = project.locationId && myCrewMemberId
    ? data.crewLocationDistances.find(d => d.crewMemberId === myCrewMemberId && d.locationId === project.locationId)
    : null;

  // Detect photo editor in post-production for the billing calculator
  const photoEditorEntry = project.postProduction.find(
    (e) => e.role === "Photo Editor"
  );
  const photoEditorName = photoEditorEntry ? getCrewName(photoEditorEntry.crewMemberId) : null;

  const submitRestore = async () => {
    setRestoring(true);
    try {
      await updateProject(project.id, {
        status: "upcoming",
        cancellationReason: "",
        cancelledAt: null,
      });
      toast.success("Project restored to Upcoming");
      setRestoreOpen(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to restore project");
    } finally {
      setRestoring(false);
    }
  };

  // Reschedule: bumps the project's date (and optionally time) on the
  // calendar, then opens a mailto: with a "moved from previousDate to
  // newDate" message pre-filled. Owner can edit + send from their own
  // email account so the conversation stays threaded.
  const submitReschedule = async () => {
    if (!rescheduleDate) { toast.error("Pick a new date"); return; }
    setRescheduling(true);
    const previousDate = project.date;
    try {
      await updateProject(project.id, {
        date: rescheduleDate,
        startTime: rescheduleStartTime || project.startTime,
        endTime: rescheduleEndTime || project.endTime,
      });
      toast.success("Project rescheduled");
      setRescheduleOpen(false);
      // Open the user's email app with the reschedule message.
      if (client?.email) {
        const url = buildProjectMailto({
          to: client.email,
          orgName: data.organization?.name || "",
          ownerName: data.organization?.businessInfo?.ownerName || "",
          clientName: client.contactName || client.company || "",
          projectType: pType?.name || "Project",
          date: rescheduleDate,
          startTime: rescheduleStartTime || project.startTime,
          endTime: rescheduleEndTime || project.endTime,
          location: location?.name || "",
          cancelled: false,
          rescheduledFromDate: previousDate,
        });
        window.location.assign(url);
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to reschedule");
    } finally {
      setRescheduling(false);
    }
  };

  const submitCancel = async () => {
    setCancelling(true);
    try {
      await updateProject(project.id, {
        status: "cancelled",
        cancellationReason: cancelReason.trim(),
        cancelledAt: new Date().toISOString(),
      });
      toast.success("Project cancelled");
      setCancelOpen(false);
      setCancelReason("");
    } catch (err: any) {
      toast.error(err.message || "Failed to cancel project");
    } finally {
      setCancelling(false);
    }
  };

  const advanceStatus = async () => {
    const next = NEXT_STATUS[project.status];
    if (!next) return;
    try {
      // Staff can't write the projects table directly (RLS), so assigned crew
      // go through the server, which verifies they're on this job. Owner/partner
      // update directly.
      if (isStaff) {
        const token = await getAuthToken();
        const res = await fetch("/api/crew-update-status", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ projectId: project.id, status: next }),
        });
        const body = await res.json().catch(() => ({ error: "Failed" }));
        if (!res.ok) throw new Error(body.error || "Couldn't update status");
        await refresh();
      } else {
        await updateProject(project.id, { status: next });
      }
      toast.success(`Status updated to ${STATUS_LABELS[next]}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update status");
      return;
    }

    // Sync linked episode status
    const episodeStatus = PROJECT_TO_EPISODE_STATUS[next];
    if (episodeStatus) {
      try {
        // Find all series and check for linked episodes
        for (const s of data.series) {
          const episodes = await fetchEpisodes(s.id);
          const linked = episodes.find(e => e.projectId === project.id);
          if (linked) {
            await updateEpisode(linked.id, { status: episodeStatus });
            toast.success(`Episode "${linked.title}" → ${episodeStatus}`);
            break;
          }
        }
      } catch {
        // Episode sync is best-effort
      }
    }
  };

  // Open the shoot's photo gallery (upload → deliver), creating it on demand if
  // one doesn't exist yet. Lands on the delivery's upload screen.
  const openOrCreateGallery = async () => {
    if (projectGallery) { onClose(); setLocation(`/deliveries/${projectGallery.id}`); return; }
    setCreatingGallery(true);
    try {
      const g = await createReShootGallery(project.id, location?.name || client?.company || "Real Estate Shoot");
      onClose();
      if (g) setLocation(`/deliveries/${g.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't create the gallery");
    } finally {
      setCreatingGallery(false);
    }
  };

  const handleDelete = async () => {
    try {
      await deleteProject(project.id);
      toast.success("Project deleted");
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete project");
    }
  };

  const togglePaid = async () => {
    const newPaidDate = project.paidDate ? null : new Date().toISOString().slice(0, 10);
    await updateProject(project.id, { paidDate: newPaidDate });

    // Sync the linked invoice's status. The reverse path (invoice marked
    // paid → project marked paid) already works; this closes the loop for
    // when the owner marks paid from the project sheet (e.g. after a
    // Venmo payment, where there's no Stripe webhook to flip the invoice).
    const linkedInvoice = data.invoices.find(inv =>
      inv.status !== "void" && inv.lineItems.some(li => li.projectId === project.id)
    );
    if (linkedInvoice) {
      try {
        if (newPaidDate) {
          // Only flip drafts/sent → paid. Already-paid stays paid.
          if (linkedInvoice.status !== "paid") {
            await updateInvoice(linkedInvoice.id, { status: "paid", paidDate: newPaidDate });
          }
        } else {
          // Undoing the paid mark — revert the invoice unless it's been
          // explicitly voided in the meantime.
          if (linkedInvoice.status === "paid") {
            await updateInvoice(linkedInvoice.id, { status: "sent", paidDate: null });
          }
        }
      } catch {
        // Non-fatal — project state is the source of truth, invoice will
        // resync on next open / page reload.
      }
    }

    toast.success(newPaidDate ? "Marked as paid" : "Marked as unpaid");
  };

  const formatMoney = (n: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);

  // Build invoice draft for just this project (one-day period).
  // Pass empty existingInvoices so we always generate line items — we'll warn about duplicates on click.
  const invoiceDraft = invoiceClient
    ? buildInvoice(invoiceClient, [project], data.projectTypes, data.locations, [], project.date, project.date, data.organization, data.clients)
    : null;

  // Find any existing invoice that already contains this project
  const existingInvoice = data.invoices.find(inv =>
    inv.status !== "void" && inv.lineItems.some(li => li.projectId === project.id)
  );

  const openInvoiceDialog = () => {
    if (!client) { toast.error("Project has no client"); return; }
    if (project.status === "upcoming") {
      toast.error("Can't invoice upcoming projects — mark filming done first");
      return;
    }
    if (existingInvoice) {
      toast.error(`Already on invoice ${existingInvoice.invoiceNumber} (${existingInvoice.status})`);
      return;
    }
    if (!invoiceDraft || invoiceDraft.lineItems.length === 0) {
      toast.error("No billable hours or flat rate on this project");
      return;
    }
    // Default the recipient to the PAYER (broker for an agent's shoot), falling
    // back to a login email attached to that payer.
    setInvoiceEmail(
      invoiceClient?.email
      || (invoiceClient ? allProfiles.find(u => u.role === "client" && u.clientIds.includes(invoiceClient.id))?.email || "" : "")
      || resolvedClientEmail
    );
    setInvoiceMessage("");
    // Default payment methods: whichever ones are configured on the org.
    // If neither is configured, leave empty — the dialog will show a
    // "configure payment methods in Settings" hint.
    const defaults: ("stripe" | "venmo")[] = [];
    if (data.organization?.stripeAccountId) defaults.push("stripe");
    if (data.organization?.businessInfo?.venmoUsername) defaults.push("venmo");
    setInvoicePaymentMethods(defaults);
    setInvoiceOpen(true);
  };

  const togglePaymentMethod = (method: "stripe" | "venmo") => {
    setInvoicePaymentMethods(prev =>
      prev.includes(method) ? prev.filter(m => m !== method) : [...prev, method]
    );
  };

  const handlePreviewInvoice = async () => {
    if (!invoiceDraft) return;
    setGeneratingPreview(true);
    try {
      // Generate a fake invoice object for preview (real number assigned on send)
      const previewInvoice = {
        ...invoiceDraft,
        id: "preview",
        invoiceNumber: "INV-PREVIEW",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const blob = await pdf(<InvoicePDF invoice={previewInvoice} />).toBlob();
      const url = URL.createObjectURL(blob);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(url);
    } catch (err: any) {
      toast.error(err.message || "Failed to generate preview");
    } finally {
      setGeneratingPreview(false);
    }
  };

  const closePreview = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
  };

  // Close the preview with Escape key
  useEffect(() => {
    if (!previewUrl) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        closePreview();
      }
    };
    window.addEventListener("keydown", handleKey, true);
    return () => window.removeEventListener("keydown", handleKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewUrl]);

  // Random URL-safe token for the public invoice link. Same shape as
  // the proposal/contract sign tokens already used elsewhere.
  const makeViewToken = () => Math.random().toString(36).slice(2, 12) + Math.random().toString(36).slice(2, 12);

  // Common save-the-draft path. Returns the persisted Invoice. Generates
  // an invoice number and a view_token (always — even drafts get a token
  // so the "Preview client view" button works without a separate save).
  const persistInvoice = async (): Promise<{ id: string; invoiceNumber: string; viewToken: string; total: number; clientName: string; invoice: Invoice } | null> => {
    if (!client || !invoiceDraft) return null;
    const draft = { ...invoiceDraft };
    draft.invoiceNumber = await generateInvoiceNumberFromDB(supabase);
    draft.paymentMethods = invoicePaymentMethods.length > 0 ? invoicePaymentMethods : ["stripe"];
    draft.viewToken = makeViewToken();
    const created = await addInvoice(draft);
    return {
      id: created.id,
      invoiceNumber: created.invoiceNumber,
      viewToken: created.viewToken,
      total: created.total,
      clientName: created.clientInfo.contactName || created.clientInfo.company || "",
      invoice: created,
    };
  };

  const handleSaveDraft = async () => {
    if (!client || !invoiceDraft) return;
    setSavingDraft(true);
    try {
      const created = await persistInvoice();
      if (!created) return;
      toast.success(`Invoice ${created.invoiceNumber} saved as draft`);
      setInvoiceOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save draft");
    } finally {
      setSavingDraft(false);
    }
  };

  const handleSaveAndCopyLink = async () => {
    if (!client || !invoiceDraft) return;
    setCopyingLink(true);
    try {
      const created = await persistInvoice();
      if (!created) return;
      const url = `${window.location.origin}/invoice/${created.viewToken}`;
      try {
        await navigator.clipboard.writeText(url);
        toast.success(`Link copied — ${created.invoiceNumber}`, { description: "Paste it into a text or message." });
      } catch {
        // Some browsers block clipboard without user gesture chain — show the URL instead.
        toast.success(`Invoice ${created.invoiceNumber} saved`, { description: url });
      }
      setInvoiceOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save invoice");
    } finally {
      setCopyingLink(false);
    }
  };

  const handleCreateAndSendInvoice = async () => {
    if (!client || !invoiceDraft) return;
    if (!invoiceEmail) { toast.error("Recipient email required"); return; }

    setSendingInvoice(true);
    try {
      const created = await persistInvoice();
      if (!created) return;
      const publicUrl = `${window.location.origin}/invoice/${created.viewToken}`;

      // Generate PDF + send. Pass the public URL so the email can render
      // a "Pay this invoice" CTA in addition to the PDF attachment.
      // Use the invoice persistInvoice already returns — data.invoices state
      // hasn't refreshed yet this tick, so a .find() here returns undefined
      // and react-pdf chokes ("r.document.props" null error).
      const blob = await pdf(<InvoicePDF invoice={created.invoice} />).toBlob();
      const formData = new FormData();
      formData.append("pdf", blob, `${created.invoiceNumber}.pdf`);
      formData.append("invoiceId", created.id);
      formData.append("recipientEmail", invoiceEmail);
      formData.append("subject", `Invoice ${created.invoiceNumber} from Slate by SDub Media`);
      formData.append("message", invoiceMessage);
      formData.append("invoiceNumber", created.invoiceNumber);
      formData.append("total", String(created.total));
      formData.append("clientName", created.clientName);
      formData.append("publicUrl", publicUrl);

      const token = await getAuthToken();
      const res = await fetch("/api/send-invoice", { method: "POST", body: formData, headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed to send" }));
        throw new Error(err.error || "Failed to send");
      }

      await updateInvoice(created.id, { status: "sent" });
      toast.success(`Invoice ${created.invoiceNumber} sent to ${invoiceEmail}`);
      setInvoiceOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send invoice");
    } finally {
      setSendingInvoice(false);
    }
  };

  const handlePreviewClientView = async () => {
    // Persist with a token, then open the public URL in a new tab. Same
    // page the client will see — payment buttons reflect the checkboxes.
    if (!client || !invoiceDraft) return;
    setSavingDraft(true);
    try {
      const created = await persistInvoice();
      if (!created) return;
      const url = `${window.location.origin}/invoice/${created.viewToken}`;
      window.open(url, "_blank", "noopener");
      toast.success(`Preview opened — ${created.invoiceNumber}`);
      setInvoiceOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't generate preview");
    } finally {
      setSavingDraft(false);
    }
  };

  // If the client record has no email but a Slate user has been attached
  // to this client, fall back to that user's email. Resolves the case where
  // the owner created a user (with email) attached to a client whose
  // dedicated email field on the Clients page is still blank.
  const attachedUserEmail = client && !client.email
    ? allProfiles.find(u => u.role === "client" && u.clientIds.includes(client.id))?.email || ""
    : "";
  const resolvedClientEmail = client?.email || attachedUserEmail || "";

  const openDeliverablesDialog = () => {
    if (!project.deliverableUrl) {
      toast.error("Add a Google Drive (or other) deliverable link to this project first");
      return;
    }
    if (!client) return;
    const projectTypeName = pType?.name || "your project";
    const greeting = client.contactName ? `Hi ${client.contactName.split(" ")[0]},` : "Hi,";
    const defaultMessage = `${greeting}\n\nYour ${projectTypeName.toLowerCase()} deliverables are ready to view and download. Click the button below to open the folder.`;
    setDeliverablesEmail(resolvedClientEmail);
    setDeliverablesSubject("Your project deliverables are ready");
    setDeliverablesMessage(defaultMessage);
    setDeliverablesOpen(true);
  };

  const handleSendDeliverables = async () => {
    if (!project.deliverableUrl) { toast.error("No deliverable link on this project"); return; }
    if (!deliverablesEmail || !deliverablesEmail.includes("@")) { toast.error("Valid recipient email required"); return; }
    setSendingDeliverables(true);
    try {
      const token = await getAuthToken();
      const res = await fetch("/api/send-deliverables-email", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          projectId: project.id,
          toEmail: deliverablesEmail,
          subject: deliverablesSubject,
          message: deliverablesMessage,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed to send" }));
        throw new Error(err.error || "Failed to send");
      }
      toast.success(`Deliverables link sent to ${deliverablesEmail}`);
      setDeliverablesOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send deliverables");
    } finally {
      setSendingDeliverables(false);
    }
  };

  const mapsUrl = location
    ? `https://maps.google.com/?q=${encodeURIComponent(`${location.address}, ${location.city}, ${location.state} ${location.zip}`)}`
    : null;

  return (
    <>
      <Sheet open={true} onOpenChange={(o) => !o && onClose()}>
        <SheetContent className="w-full sm:w-[720px] sm:max-w-[720px] bg-card border-border text-foreground overflow-y-auto overflow-x-hidden max-h-[100dvh]" style={{ paddingTop: "max(1.5rem, env(safe-area-inset-top))", paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}>
          <SheetHeader className="pb-4">
            <div className="flex items-start justify-between">
              <div>
                <SheetTitle className="text-lg" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                  {pType?.name ?? "Project"}
                </SheetTitle>
                <div className="mt-1">
                  <Badge className={cn("text-xs",
                    project.status === "tentative" && "bg-amber-400/15 text-amber-300 border border-dashed border-amber-400/40",
                    project.status === "upcoming" && "bg-blue-500/20 text-blue-300 border-blue-500/30",
                    project.status === "filming_done" && "bg-purple-500/20 text-purple-300 border-purple-500/30",
                    project.status === "in_editing" && "bg-amber-500/20 text-amber-300 border-amber-500/30",
                    project.status === "editing_done" && "bg-teal-500/20 text-teal-300 border-teal-500/30",
                    project.status === "delivered" && "bg-green-500/20 text-green-300 border-green-500/30",
                    project.status === "cancelled" && "bg-red-500/20 text-red-300 border-red-500/30",
                  )}>
                    {STATUS_LABELS[project.status]}
                  </Badge>
                  {project.paidDate && (
                    <Badge className="text-xs bg-green-500/20 text-green-300 border-green-500/30">
                      Paid
                    </Badge>
                  )}
                </div>
              </div>
              {isOwner && (
                <div className="flex items-center gap-1 mr-8">
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={() => setEditOpen(true)}>
                    <Edit3 className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => setDeleteOpen(true)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              )}
            </div>
          </SheetHeader>

          <div className="space-y-5">
            {/* Cancellation banner — read-only, shown only on cancelled projects */}
            {project.status === "cancelled" && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-red-300">Cancelled{project.cancelledAt ? ` · ${new Date(project.cancelledAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}` : ""}</p>
                {project.cancellationReason && (
                  <p className="text-sm text-red-100/90 mt-1.5 whitespace-pre-wrap">{project.cancellationReason}</p>
                )}
              </div>
            )}

            {/* Agent status banner — the lifecycle at a glance, with a hero
                "view photos" action once the gallery is delivered. */}
            {isClient && project.status !== "cancelled" && (() => {
              const galleryReady = projectGallery?.status === "delivered";
              const editing = project.status === "filming_done" || project.status === "in_editing" || project.status === "editing_done";
              const dateStr = project.date ? new Date(project.date + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }) : "";
              if (galleryReady) {
                return (
                  <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 space-y-3">
                    <div className="flex items-center gap-2 text-sm font-semibold text-emerald-600 dark:text-emerald-300"><ImageIcon className="w-4 h-4" /> Your photos are ready</div>
                    <a href={`/deliver/${projectGallery!.token}`} target="_blank" rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 w-full bg-emerald-600 text-white rounded-md py-2.5 text-sm font-medium hover:bg-emerald-700 transition-colors">
                      <ImageIcon className="w-4 h-4" /> View &amp; download photos
                    </a>
                  </div>
                );
              }
              if (project.onTheWayAt) {
                return (
                  <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 flex items-center gap-2 text-sm font-medium text-emerald-600 dark:text-emerald-300">
                    <Car className="w-4 h-4 shrink-0" /> Your photographer is on the way
                  </div>
                );
              }
              if (editing) {
                return (
                  <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-3 flex items-center gap-2 text-sm font-medium text-blue-600 dark:text-blue-300">
                    <Film className="w-4 h-4 shrink-0" /> Shot — your photos are being edited. We'll let you know when they're ready.
                  </div>
                );
              }
              return (
                <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-3 flex items-center gap-2 text-sm font-medium text-blue-600 dark:text-blue-300">
                  <CheckCircle2 className="w-4 h-4 shrink-0" /> Confirmed{dateStr ? ` — ${dateStr}` : ""}
                </div>
              );
            })()}

            {/* Date, Time, Client, Location */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-secondary rounded-lg p-3 space-y-1">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Calendar className="w-3.5 h-3.5" /> Date
                </div>
                <div className="text-sm font-medium">
                  {new Date(project.date + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "long", day: "numeric", year: "numeric" })}
                </div>
              </div>
              <div className="bg-secondary rounded-lg p-3 space-y-1">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Clock className="w-3.5 h-3.5" /> Time
                </div>
                <div className="text-sm font-medium">{project.startTime} – {project.endTime}</div>
              </div>
              <div className="bg-secondary rounded-lg p-3 space-y-1">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <User className="w-3.5 h-3.5" /> Client
                </div>
                {client ? (
                  <button
                    onClick={() => setClientSheetOpen(true)}
                    className="text-sm font-medium truncate block w-full text-left hover:text-primary transition-colors cursor-pointer"
                  >
                    {client.company}
                  </button>
                ) : (
                  <div className="text-sm font-medium truncate">—</div>
                )}
                {client?.contactName && <div className="text-xs text-muted-foreground">{client.contactName}</div>}
                {agentBroker && <div className="text-xs text-primary flex items-center gap-1 mt-0.5"><Building2 className="w-3 h-3 flex-shrink-0" />{agentBroker.company}</div>}
              </div>
              <div className="bg-secondary rounded-lg p-3 space-y-1">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <MapPin className="w-3.5 h-3.5" /> Location
                </div>
                <div className="text-sm font-medium truncate">{location?.name ?? "—"}</div>
                <div className="flex items-center gap-3">
                  {mapsUrl && (
                    <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary flex items-center gap-1 hover:underline">
                      Open in Maps <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                  {myDistance && (
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Car className="w-3 h-3" /> {myDistance.distanceMiles} mi ({(myDistance.distanceMiles * 2).toFixed(1)} mi round trip)
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* What's included — the booked service pieces (all roles). */}
            {(project.services?.length ?? 0) > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider">
                  <Camera className="w-3.5 h-3.5" /> What's included
                </div>
                <div className="space-y-1.5">
                  {project.services!.map((s, i) => (
                    <div key={i} className="flex items-center justify-between gap-3 bg-secondary rounded-md px-3 py-2">
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{s.label}</div>
                        {(s.durationMinutes ?? 0) > 0 && <div className="text-xs text-muted-foreground">{fmtDur(s.durationMinutes!)} on-site</div>}
                      </div>
                      {!isStaff && <div className="text-sm font-medium tabular-nums shrink-0">${Number(s.price || 0).toFixed(0)}</div>}
                    </div>
                  ))}
                </div>
                {/* Agent: who pays for these pieces. */}
                {isClient && (
                  agentBroker ? (
                    <p className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1"><Building2 className="w-3 h-3 shrink-0" /> Billed to {agentBroker.company} — you won't be charged.</p>
                  ) : (
                    <p className="text-xs text-muted-foreground">Billed to your card on file.</p>
                  )
                )}
              </div>
            )}

            {/* Products / software (owner only — these carry internal cost). */}
            {isOwner && (project.products?.length ?? 0) > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider">
                  <Film className="w-3.5 h-3.5" /> Products
                </div>
                <div className="space-y-1.5">
                  {project.products!.map((p, i) => (
                    <div key={i} className="flex items-center justify-between gap-3 bg-secondary rounded-md px-3 py-2">
                      <div className="text-sm font-medium truncate">{p.name}</div>
                      <div className="text-sm text-muted-foreground tabular-nums shrink-0">${Number(p.cost || 0).toFixed(0)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Retainer Summary (owner only) — hidden for flat-rate shoots */}
            {isOwner && !isFlatBilled && (
              <div className="bg-primary/10 border border-primary/20 rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground uppercase tracking-wider">Total Retainer Hours</span>
                  <span className="text-xl font-bold text-primary tabular-nums" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                    {Number(totalHrs ?? 0).toFixed(2)} hrs
                  </span>
                </div>
                <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                  <span>Filming: {Number(totalCrewHrs ?? 0).toFixed(2)} hrs</span>
                  <span>Post: {Number(totalPostHrs ?? 0).toFixed(2)} hrs</span>
                </div>
              </div>
            )}

            {/* Billing & Tracked Time (owner only) */}
            {isOwner && (<><div className="grid grid-cols-2 gap-3">
              <div className="bg-secondary rounded-lg p-3 space-y-1">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <DollarSign className="w-3.5 h-3.5" /> Billed Amount
                </div>
                <div className="text-sm font-bold text-amber-400">
                  {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(invoiceAmount)}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {client?.billingModel === "per_project" ? "Flat rate" : `${totalHrs.toFixed(1)} hrs billed`}
                </div>
              </div>
              <div className="bg-secondary rounded-lg p-3 space-y-1">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Timer className="w-3.5 h-3.5" /> Tracked Time
                </div>
                <div className="text-sm font-bold text-foreground">
                  {totalTrackedMinutes > 0 ? trackedDisplay : "—"}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {trackedEntries.length > 0 ? `${trackedEntries.length} session${trackedEntries.length !== 1 ? "s" : ""}` : "No time tracked"}
                </div>
              </div>
            </div>

            {/* Tracked time breakdown by person */}
            {trackedEntries.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-xs text-muted-foreground uppercase tracking-wider">Time Log</div>
                {trackedEntries.map(t => {
                  const member = data.crewMembers.find(c => c.id === t.crewMemberId);
                  const mins = t.durationMinutes || 0;
                  const h = Math.floor(mins / 60);
                  const m = Math.round(mins % 60);
                  return (
                    <div key={t.id} className="flex items-center justify-between bg-secondary/50 rounded-md px-3 py-2 text-xs">
                      <div>
                        <span className="text-foreground font-medium">{member?.name || "Unknown"}</span>
                        <span className="text-muted-foreground ml-2">{new Date(t.startTime).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                        {t.autoStopped && <span className="text-amber-400 ml-1">(auto-stopped)</span>}
                      </div>
                      <span className="font-mono text-foreground">{h > 0 ? `${h}h ${m}m` : `${m}m`}</span>
                    </div>
                  );
                })}
              </div>
            )}

            </>)}

            {/* Crew */}
            {isOwner ? (
              project.crew.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider">
                    <Camera className="w-3.5 h-3.5" /> Crew
                  </div>
                  <div className="space-y-1.5">
                    {project.crew.map((entry, i) => (
                      <div key={i} className="flex items-center justify-between bg-secondary rounded-md px-3 py-2">
                        <div>
                          <div className="text-sm font-medium">{getCrewName(entry.crewMemberId)}</div>
                          <div className="text-xs text-muted-foreground">{entry.role}</div>
                        </div>
                        <div className="text-right">
                          {entry.payType === "flat" ? (
                            <>
                              <div className="text-sm font-medium tabular-nums">${Number(entry.flatAmount ?? 0).toFixed(0)}</div>
                              <div className="text-xs text-muted-foreground">flat</div>
                            </>
                          ) : (
                            <>
                              <div className="text-sm font-medium tabular-nums">{Number(entry.hoursWorked ?? 0).toFixed(2)} hrs</div>
                              <div className="text-xs text-muted-foreground">${Number(entry.payRatePerHour ?? 0).toFixed(0)}/hr</div>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            ) : (
              (() => {
                const myCrewEntry = project.crew.find(c => c.crewMemberId === myCrewMemberId);
                const myPostEntry = project.postProduction.find(c => c.crewMemberId === myCrewMemberId);
                const isPhotoEditor = myPostEntry?.role === "Photo Editor" && project.editorBilling;

                // Projected pay — same helper Staff Payments uses, so real-estate
                // flat per-piece payouts (shoot → shooter, edit → editor) and the
                // hourly / photo-editor models all resolve consistently.
                const projectedPay = getCrewMemberProjectPay(project, myCrewMemberId);

                return (myCrewEntry || myPostEntry) ? (
                  <div className="bg-primary/10 border border-primary/20 rounded-lg p-4">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider mb-2">
                      <DollarSign className="w-3.5 h-3.5" /> Your Assignment
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-medium text-foreground">
                          {myCrewEntry?.role}{myCrewEntry && myPostEntry ? " + " : ""}{myPostEntry?.role}
                        </div>
                        {isPhotoEditor && (
                          <div className="text-xs text-muted-foreground mt-0.5">{project.editorBilling!.imageCount} images</div>
                        )}
                      </div>
                      <div className="text-xl font-bold text-primary" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                        {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(projectedPay)}
                      </div>
                    </div>
                  </div>
                ) : null;
              })()
            )}

            {/* Post Production (owner only — staff pay is shown above) */}
            {isOwner && project.postProduction.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider">
                  <Film className="w-3.5 h-3.5" /> Post Production
                </div>
                <div className="space-y-1.5">
                  {project.postProduction.map((entry, i) => {
                    const isPhotoEditorWithBilling = entry.role === "Photo Editor" && project.editorBilling;
                    const editorRate = project.editorBilling?.perImageRate ?? 6;
                    return (
                      <div key={i} className="flex items-center justify-between bg-secondary rounded-md px-3 py-2">
                        <div>
                          <div className="text-sm font-medium">{getCrewName(entry.crewMemberId)}</div>
                          <div className="text-xs text-muted-foreground">{entry.role}</div>
                        </div>
                        <div className="text-right">
                          {isPhotoEditorWithBilling ? (
                            <>
                              <div className="text-sm font-medium tabular-nums">
                                ${(project.editorBilling!.imageCount * editorRate).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {project.editorBilling!.imageCount} images x ${editorRate}/img
                              </div>
                            </>
                          ) : entry.payType === "flat" ? (
                            <>
                              <div className="text-sm font-medium tabular-nums">${Number(entry.flatAmount ?? 0).toFixed(0)}</div>
                              <div className="text-xs text-muted-foreground">flat</div>
                            </>
                          ) : (
                            <>
                              <div className="text-sm font-medium tabular-nums">{Number(entry.hoursWorked ?? 0).toFixed(2)} hrs</div>
                              <div className="text-xs text-muted-foreground">${Number(entry.payRatePerHour ?? 0).toFixed(0)}/hr</div>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Photo Editor Billing Calculator (owner only) */}
            {isOwner && photoEditorEntry && client && (
              <PhotoEditorCalculator
                project={project}
                client={client}
                editorName={photoEditorName!}
              />
            )}

            {/* Edit Types */}
            {project.editTypes.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider">
                  <Edit3 className="w-3.5 h-3.5" /> Edit Types
                </div>
                <div className="flex flex-wrap gap-2">
                  {project.editTypes.map((et) => (
                    <Badge key={et} variant="outline" className="text-xs border-border text-muted-foreground">{et}</Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Notes */}
            {project.notes && (
              <div className="space-y-2">
                <div className="text-xs text-muted-foreground uppercase tracking-wider">Notes</div>
                <p className="text-sm text-foreground bg-secondary rounded-md p-3">{project.notes}</p>
              </div>
            )}

            {/* Deliverables — photo gallery and/or an external link. */}
            {(project.deliverableUrl || projectGallery) && (
              <div className="space-y-2">
                <div className="text-xs text-muted-foreground uppercase tracking-wider">Deliverables</div>
                {projectGallery && (
                  projectGallery.status === "delivered" ? (
                    <a
                      href={`/deliver/${projectGallery.token}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between gap-2 text-sm text-primary hover:text-primary/80 bg-primary/10 border border-primary/20 rounded-md p-3 transition-colors"
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <ImageIcon className="w-4 h-4 shrink-0" />
                        <span className="truncate">{projectGallery.title || "Photo gallery"}</span>
                      </span>
                      <span className="text-xs text-emerald-300 shrink-0">View</span>
                    </a>
                  ) : (
                    // Not delivered yet — show it's coming, but not a dead link.
                    <div className="flex items-center justify-between gap-2 text-sm bg-secondary border border-border rounded-md p-3">
                      <span className="flex items-center gap-2 min-w-0 text-muted-foreground">
                        <ImageIcon className="w-4 h-4 shrink-0" />
                        <span className="truncate">{projectGallery.title || "Photo gallery"}</span>
                      </span>
                      <span className="text-xs text-muted-foreground shrink-0">{isOwner ? "Not delivered yet" : "Photos in progress"}</span>
                    </div>
                  )
                )}
                {project.deliverableUrl && (
                  <a
                    href={project.deliverableUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-sm text-primary hover:text-primary/80 bg-primary/10 border border-primary/20 rounded-md p-3 transition-colors"
                  >
                    <ExternalLink className="w-4 h-4 shrink-0" />
                    View Deliverables
                  </a>
                )}
              </div>
            )}

            <Separator className="bg-border" />

            {/* Actions */}
            <div className="flex flex-col gap-2">
              {/* Advance-status button — gated by role on the project.
                  Filming-camera roles can advance through filming;
                  Editor roles can advance through editing/delivery.
                  Owner / partner can always advance. */}
              {(() => {
                if (isClient) return null;
                const myCrewMemberId = effectiveProfile?.crewMemberId
                  || data.crewMembers.find(c => c.email === effectiveProfile?.email)?.id;
                const myProjectRoles: string[] = [];
                if (myCrewMemberId) {
                  (project.crew || []).forEach(e => { if (e.crewMemberId === myCrewMemberId) myProjectRoles.push(e.role); });
                  (project.postProduction || []).forEach(e => { if (e.crewMemberId === myCrewMemberId) myProjectRoles.push(e.role); });
                }
                const allowed = canAdvanceProjectStatus(project.status, effectiveProfile?.role, myProjectRoles);
                if (!allowed) return null;
                return (
                  <Button onClick={advanceStatus} className="bg-primary text-primary-foreground hover:bg-primary/90 gap-2 w-full">
                    <CheckCircle2 className="w-4 h-4" />
                    {NEXT_STATUS_LABEL[project.status]}
                  </Button>
                );
              })()}
              {canCheckIn && (
                <Button onClick={markOnTheWay} disabled={markingOnWay} className="w-full gap-2 bg-emerald-600 text-white hover:bg-emerald-700">
                  <Car className="w-4 h-4" />
                  {markingOnWay ? "Notifying…" : "I'm on my way — notify agent"}
                </Button>
              )}
              {project.onTheWayAt && (
                <div className="w-full text-xs text-emerald-600 dark:text-emerald-400 flex items-center justify-center gap-1.5 py-1">
                  <Car className="w-3.5 h-3.5" /> Agent notified you're on the way
                </div>
              )}
              {/* Assigned crew: upload finals straight into this property's gallery. */}
              {canCrewUpload && (
                <>
                  <input ref={crewPhotoInputRef} type="file" accept="image/*,video/*" multiple className="hidden" onChange={(e) => { handleCrewUpload(e.target.files); e.currentTarget.value = ""; }} />
                  <Button onClick={() => crewPhotoInputRef.current?.click()} disabled={!!crewUploading} className="w-full gap-2 bg-emerald-600 text-white hover:bg-emerald-700">
                    <Upload className="w-4 h-4" />
                    {crewUploading ? `Uploading ${crewUploading.done}/${crewUploading.total}…` : "Upload final photos"}
                  </Button>
                  <p className="text-[11px] text-muted-foreground text-center -mt-1">Goes into this property's gallery. Your owner delivers it to the client.</p>
                </>
              )}
              {isOwner && (
                <Button
                  onClick={openOrCreateGallery}
                  disabled={creatingGallery}
                  className="w-full gap-2 bg-emerald-600 text-white hover:bg-emerald-700"
                >
                  <ImageIcon className="w-4 h-4" />
                  {creatingGallery ? "Creating…" : projectGallery ? "Open gallery to deliver photos" : "Upload & deliver photos"}
                </Button>
              )}
              {isOwner && (
                <Button
                  variant="outline"
                  onClick={togglePaid}
                  className={cn("w-full gap-2", project.paidDate ? "border-green-500/50 text-green-300" : "border-border")}
                >
                  <DollarSign className="w-4 h-4" />
                  {project.paidDate ? "Paid — Click to Undo" : "Mark as Paid"}
                </Button>
              )}
              {isOwner && !project.paidDate && existingInvoice && (
                <Button
                  variant="outline"
                  onClick={() => { onClose(); setLocation("/invoices"); }}
                  className="w-full gap-2 border-green-500/40 text-green-300 hover:bg-green-500/10"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  {`Already on ${existingInvoice.invoiceNumber}`}
                </Button>
              )}
              {isOwner && !project.paidDate && !existingInvoice && (
                <Button
                  variant="outline"
                  onClick={openInvoiceDialog}
                  className="w-full gap-2 border-primary/40 text-primary hover:bg-primary/10"
                >
                  <Send className="w-4 h-4" />
                  {invoiceDraft && invoiceDraft.lineItems.length > 0
                    ? `Create & Send Invoice (${formatMoney(invoiceDraft.total)})`
                    : "Create & Send Invoice"}
                </Button>
              )}
              {isOwner && (
                <Button variant="outline" onClick={() => setEditOpen(true)} className="w-full border-border">
                  Edit Project
                </Button>
              )}
              {isOwner && project.deliverableUrl && (
                <Button
                  variant="outline"
                  onClick={openDeliverablesDialog}
                  className="w-full border-border gap-2 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10"
                >
                  <Send className="w-4 h-4" />
                  Send Client Deliverables
                </Button>
              )}
              {isOwner && client?.email && (
                <Button
                  variant="outline"
                  onClick={() => {
                    const url = buildProjectMailto({
                      to: client.email,
                      orgName: data.organization?.name || "",
                      ownerName: data.organization?.businessInfo?.ownerName || "",
                      clientName: client.contactName || client.company || "",
                      projectType: pType?.name || "Project",
                      date: project.date,
                      startTime: project.startTime,
                      endTime: project.endTime,
                      location: location?.name || "",
                      cancelled: project.status === "cancelled",
                      cancellationReason: project.cancellationReason || "",
                    });
                    window.location.assign(url);
                  }}
                  className="w-full border-border gap-2"
                  title="Open your email app with a pre-filled confirmation message"
                >
                  <Mail className="w-4 h-4" />
                  {project.status === "cancelled" ? "Email cancellation to client" : "Email project details to client"}
                </Button>
              )}
              {isOwner && project.status !== "cancelled" && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setRescheduleDate(project.date);
                    setRescheduleStartTime(project.startTime);
                    setRescheduleEndTime(project.endTime);
                    setRescheduleOpen(true);
                  }}
                  className="w-full border-border gap-2"
                >
                  <Calendar className="w-4 h-4" />
                  Reschedule Project
                </Button>
              )}
              {isOwner && project.status !== "cancelled" && (
                <Button
                  variant="outline"
                  onClick={() => { setCancelReason(""); setCancelOpen(true); }}
                  className="w-full border-red-500/40 text-red-300 hover:bg-red-500/10 hover:text-red-200 gap-2"
                >
                  <X className="w-4 h-4" />
                  Cancel Project
                </Button>
              )}
              {isOwner && project.status === "cancelled" && (
                <Button
                  variant="outline"
                  onClick={() => setRestoreOpen(true)}
                  className="w-full border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10 hover:text-emerald-200 gap-2"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Restore Project
                </Button>
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Restore (uncancel) project confirm */}
      <AlertDialog open={restoreOpen} onOpenChange={setRestoreOpen}>
        <AlertDialogContent className="bg-card border-border text-foreground max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Restore this project?</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              The project will move back to Upcoming and start counting toward invoices, hours, and partner splits again. The previous cancellation reason will be cleared. You can advance the status from the detail sheet.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={restoring}>Keep cancelled</AlertDialogCancel>
            <AlertDialogAction
              onClick={submitRestore}
              disabled={restoring}
              className="bg-emerald-600 text-white hover:bg-emerald-700"
            >
              {restoring ? "Restoring…" : "Restore project"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reschedule project — date+time picker, then opens client mailto:
          with reschedule message pre-filled. */}
      <AlertDialog open={rescheduleOpen} onOpenChange={setRescheduleOpen}>
        <AlertDialogContent className="bg-card border-border text-foreground max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Reschedule project</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              Pick a new date and time. After saving, your email app will open with a "moved to" message pre-filled for {client?.contactName || "the client"}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">New date</label>
              <DateField
                value={rescheduleDate}
                onChange={setRescheduleDate}
                className="w-full"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Start</label>
                <TimeField
                  value={rescheduleStartTime}
                  onChange={setRescheduleStartTime}
                  className="w-full"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">End</label>
                <TimeField
                  value={rescheduleEndTime}
                  onChange={setRescheduleEndTime}
                  className="w-full"
                />
              </div>
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Back</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); submitReschedule(); }}
              disabled={rescheduling || !rescheduleDate}
            >
              {rescheduling ? "Saving…" : "Save & email client"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cancel project confirm — captures the reason and stamps cancelled_at */}
      <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <AlertDialogContent className="bg-card border-border text-foreground max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Cancel this project?</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              The project will move to Cancelled status and stop counting toward invoices, hours, and partner splits. It still appears on the calendar (in red) and on reports under Cancelled Projects.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1.5 py-2">
            <label className="text-xs text-muted-foreground">Reason for cancellation</label>
            <textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="e.g. client postponed, weather, scope changed"
              rows={3}
              className="w-full bg-secondary border border-border rounded-md px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelling}>Keep project</AlertDialogCancel>
            <AlertDialogAction
              onClick={submitCancel}
              disabled={cancelling}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              {cancelling ? "Cancelling…" : "Cancel project"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Create & Send Invoice dialog */}
      <AlertDialog open={invoiceOpen} onOpenChange={setInvoiceOpen}>
        <AlertDialogContent className="bg-card border-border text-foreground max-w-lg max-h-[90dvh] overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle>Create &amp; Send Invoice</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              A new invoice will be created for this project and emailed to the client.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {invoiceDraft && (
            <div className="space-y-4 my-2">
              {/* Line items preview */}
              <div className="bg-secondary/30 border border-border rounded-md p-3 space-y-2">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">Line Items</div>
                {invoiceDraft.lineItems.map((li, i) => (
                  <div key={i} className="flex justify-between text-sm">
                    <span className="text-foreground">{li.description}</span>
                    <span className="text-foreground font-mono">{formatMoney(li.amount)}</span>
                  </div>
                ))}
                <div className="border-t border-border pt-2 flex justify-between text-sm font-semibold">
                  <span>Total</span>
                  <span className="font-mono">{formatMoney(invoiceDraft.total)}</span>
                </div>
              </div>

              {invoiceClient && (
                <div className="bg-secondary/30 border border-border rounded-md p-3">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Sending to</div>
                  <div className="text-sm text-foreground font-medium">
                    {invoiceClient.company || invoiceClient.contactName || "Client"}
                  </div>
                  {invoiceClient.id !== project.clientId && client && (
                    <div className="text-xs text-muted-foreground">Billed for {client.company} (agent)</div>
                  )}
                </div>
              )}

              <div>
                <label className="text-xs text-muted-foreground uppercase tracking-wider block mb-1">Recipient Email</label>
                <input
                  type="email"
                  value={invoiceEmail}
                  onChange={e => setInvoiceEmail(e.target.value)}
                  placeholder="client@example.com"
                  className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
                {invoiceClient && !invoiceEmail && (
                  <p className="text-xs text-amber-300/90 mt-1.5">
                    No email on file for {invoiceClient.company || invoiceClient.contactName || "this client"}. Type one above, or add it on the Clients page.
                  </p>
                )}
              </div>

              <div>
                <label className="text-xs text-muted-foreground uppercase tracking-wider block mb-1">Optional Message</label>
                <textarea
                  value={invoiceMessage}
                  onChange={e => setInvoiceMessage(e.target.value)}
                  placeholder="Add a personal note..."
                  rows={3}
                  className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                />
              </div>

              {/* Payment methods the client will see on the public page */}
              <div className="bg-secondary/30 border border-border rounded-md p-3 space-y-2">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">Payment Methods Visible to Client</div>
                {(() => {
                  const stripeConnected = !!data.organization?.stripeAccountId;
                  const venmoConfigured = !!data.organization?.businessInfo?.venmoUsername;
                  return (
                    <>
                      <label className={cn("flex items-start gap-2 text-sm", !stripeConnected && "opacity-50")}>
                        <input
                          type="checkbox"
                          checked={invoicePaymentMethods.includes("stripe")}
                          onChange={() => togglePaymentMethod("stripe")}
                          disabled={!stripeConnected}
                          className="mt-0.5 rounded border-border"
                        />
                        <span>
                          <span className="text-foreground font-medium">Stripe Checkout</span>
                          <span className="block text-[11px] text-muted-foreground">
                            {stripeConnected ? "Card payment, auto-confirmed" : "Not connected — set up in Settings → Stripe"}
                          </span>
                        </span>
                      </label>
                      <label className={cn("flex items-start gap-2 text-sm", !venmoConfigured && "opacity-50")}>
                        <input
                          type="checkbox"
                          checked={invoicePaymentMethods.includes("venmo")}
                          onChange={() => togglePaymentMethod("venmo")}
                          disabled={!venmoConfigured}
                          className="mt-0.5 rounded border-border"
                        />
                        <span>
                          <span className="text-foreground font-medium">Venmo</span>
                          <span className="block text-[11px] text-muted-foreground">
                            {venmoConfigured ? `@${data.organization?.businessInfo?.venmoUsername} — manual confirmation required` : "No username set — add one in Settings"}
                          </span>
                        </span>
                      </label>
                      {!stripeConnected && !venmoConfigured && (
                        <p className="text-[11px] text-amber-300/90">No payment methods configured yet. Add at least one in Settings or send the invoice without an online payment option.</p>
                      )}
                    </>
                  );
                })()}
              </div>

              {/* Preview the public client-facing page */}
              <button
                type="button"
                onClick={handlePreviewClientView}
                disabled={savingDraft || copyingLink || sendingInvoice}
                className="text-xs text-primary hover:text-primary/80 underline-offset-2 hover:underline disabled:opacity-50"
              >
                Preview client view ↗
              </button>
            </div>
          )}

          <AlertDialogFooter className="gap-2 flex-col sm:flex-row">
            <AlertDialogCancel className="border-border" disabled={sendingInvoice || savingDraft || copyingLink}>Cancel</AlertDialogCancel>
            <Button
              variant="outline"
              onClick={handlePreviewInvoice}
              disabled={generatingPreview || sendingInvoice || savingDraft || copyingLink}
              className="gap-2 border-border"
              title="Preview the PDF that will be attached to the email"
            >
              {generatingPreview ? "Generating…" : "Preview PDF"}
            </Button>
            <Button
              variant="outline"
              onClick={handleSaveDraft}
              disabled={sendingInvoice || savingDraft || copyingLink}
              className="gap-2 border-border"
            >
              {savingDraft ? "Saving…" : "Save Draft"}
            </Button>
            <Button
              variant="outline"
              onClick={handleSaveAndCopyLink}
              disabled={sendingInvoice || savingDraft || copyingLink}
              className="gap-2 border-primary/40 text-primary hover:bg-primary/10"
            >
              {copyingLink ? "Saving…" : "Save & Copy Link"}
            </Button>
            <AlertDialogAction
              onClick={handleCreateAndSendInvoice}
              disabled={sendingInvoice || savingDraft || copyingLink || !invoiceEmail}
              className="bg-primary text-primary-foreground hover:bg-primary/90 gap-2"
            >
              {sendingInvoice ? "Sending…" : <><Send className="w-4 h-4" /> Save & Send</>}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Send Client Deliverables dialog */}
      <AlertDialog open={deliverablesOpen} onOpenChange={setDeliverablesOpen}>
        <AlertDialogContent className="bg-card border-border text-foreground max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>Send Client Deliverables</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              Email a download link to the client. They&apos;ll see simple instructions for opening the folder.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-4 my-2">
            {client && (
              <div className="bg-secondary/30 border border-border rounded-md p-3">
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Sending to</div>
                <div className="text-sm text-foreground font-medium">
                  {client.contactName || client.company || "Client"}
                </div>
                {client.company && client.contactName && (
                  <div className="text-xs text-muted-foreground">{client.company}</div>
                )}
              </div>
            )}

            {project.deliverableUrl && (
              <div className="bg-secondary/30 border border-border rounded-md p-3">
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Link</div>
                <div className="text-xs text-emerald-300 font-mono break-all">{project.deliverableUrl}</div>
              </div>
            )}

            <div>
              <label className="text-xs text-muted-foreground uppercase tracking-wider block mb-1">Recipient Email</label>
              <input
                type="email"
                value={deliverablesEmail}
                onChange={e => setDeliverablesEmail(e.target.value)}
                placeholder="client@example.com"
                className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
              {client && !client.email && (
                <p className="text-xs text-amber-300/90 mt-1.5">
                  No email on file for {client.contactName || client.company || "this client"}. Type one above, or add it on the Clients page.
                </p>
              )}
            </div>

            <div>
              <label className="text-xs text-muted-foreground uppercase tracking-wider block mb-1">Subject</label>
              <input
                type="text"
                value={deliverablesSubject}
                onChange={e => setDeliverablesSubject(e.target.value)}
                className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <div>
              <label className="text-xs text-muted-foreground uppercase tracking-wider block mb-1">Message</label>
              <textarea
                value={deliverablesMessage}
                onChange={e => setDeliverablesMessage(e.target.value)}
                rows={4}
                className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
              />
            </div>
          </div>

          <AlertDialogFooter className="gap-2 flex-col sm:flex-row">
            <AlertDialogCancel className="border-border" disabled={sendingDeliverables}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleSendDeliverables}
              disabled={sendingDeliverables || !deliverablesEmail}
              className="bg-emerald-500 text-white hover:bg-emerald-600 gap-2"
            >
              {sendingDeliverables ? "Sending..." : <><Send className="w-4 h-4" /> Send</>}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* PDF Preview Modal — portalled to body so it escapes the Sheet/AlertDialog focus traps.
          pointer-events-auto is required because Radix AlertDialog sets pointer-events: none on body. */}
      {previewUrl && createPortal(
        <div
          className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4 pointer-events-auto"
          onClick={closePreview}
        >
          <div
            className="bg-card border border-border rounded-lg w-full max-w-4xl h-[90vh] flex flex-col shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h3 className="text-sm font-semibold text-foreground">Invoice Preview</h3>
              <button
                onClick={closePreview}
                className="text-muted-foreground hover:text-foreground p-1.5 rounded hover:bg-secondary transition-colors"
                aria-label="Close preview"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <iframe src={previewUrl} className="flex-1 w-full rounded-b-lg" title="Invoice Preview" />
          </div>
        </div>,
        document.body
      )}

      {/* Edit dialog */}
      <ProjectDialog open={editOpen} onClose={() => setEditOpen(false)} project={project} />

      {/* Client profile panel — opened from the client field */}
      <ClientProfileSheet client={client || null} open={clientSheetOpen} onOpenChange={setClientSheetOpen} />

      {/* Delete confirmation */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent className="bg-card border-border text-foreground">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Project?</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              This will permanently delete "{pType?.name ?? "this project"}". This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-border">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
