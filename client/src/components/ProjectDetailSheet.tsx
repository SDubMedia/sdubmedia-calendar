// ============================================================
// ProjectDetailSheet — Slide-in panel for project details
// Design: Dark Cinematic Studio
// ============================================================

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "wouter";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Calendar, Clock, MapPin, User, Camera, Film, Edit3, Trash2, CheckCircle2, ExternalLink, DollarSign, Timer, Car, Send, X
} from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import { useAuth } from "@/contexts/AuthContext";
import type { Project, ProjectStatus, EpisodeStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { getProjectWorkedHours, getProjectInvoiceAmount } from "@/lib/data";
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

const STATUS_LABELS: Record<ProjectStatus, string> = {
  upcoming: "Upcoming",
  filming_done: "Filming Done",
  in_editing: "In Editing",
  completed: "Completed",
  cancelled: "Cancelled",
};

const STATUS_NEXT: Partial<Record<ProjectStatus, ProjectStatus>> = {
  upcoming: "filming_done",
  filming_done: "in_editing",
  in_editing: "completed",
};

const STATUS_NEXT_LABEL: Partial<Record<ProjectStatus, string>> = {
  upcoming: "Mark Filming Done",
  filming_done: "Move to Editing",
  in_editing: "Mark Completed",
};

// Map project status → episode status for sync
const PROJECT_TO_EPISODE_STATUS: Partial<Record<ProjectStatus, EpisodeStatus>> = {
  upcoming: "scheduled",
  filming_done: "filming",
  in_editing: "editing",
  completed: "delivered",
};

interface Props {
  project: Project;
  onClose: () => void;
}

export default function ProjectDetailSheet({ project: projectProp, onClose }: Props) {
  const { data, updateProject, deleteProject, updateEpisode, fetchEpisodes, addInvoice, updateInvoice } = useApp();
  const [, setLocation] = useLocation();
  const { effectiveProfile } = useAuth();
  const isOwner = effectiveProfile?.role === "owner";
  const isClient = effectiveProfile?.role === "client";
  // Always read the latest project from context so status updates reflect immediately
  const project = data.projects.find(p => p.id === projectProp.id) ?? projectProp;
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [invoiceEmail, setInvoiceEmail] = useState("");
  const [invoiceMessage, setInvoiceMessage] = useState("");
  const [sendingInvoice, setSendingInvoice] = useState(false);
  const [clientSheetOpen, setClientSheetOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [generatingPreview, setGeneratingPreview] = useState(false);

  const client = data.clients.find((c) => c.id === project.clientId);
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

  const advanceStatus = async () => {
    const next = STATUS_NEXT[project.status];
    if (next) {
      await updateProject(project.id, { status: next });
      toast.success(`Status updated to ${STATUS_LABELS[next]}`);

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
    toast.success(newPaidDate ? "Marked as paid" : "Marked as unpaid");
  };

  const formatMoney = (n: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);

  // Build invoice draft for just this project (one-day period).
  // Pass empty existingInvoices so we always generate line items — we'll warn about duplicates on click.
  const invoiceDraft = client
    ? buildInvoice(client, [project], data.projectTypes, data.locations, [], project.date, project.date, data.organization)
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
    setInvoiceEmail(client.email || "");
    setInvoiceMessage("");
    setInvoiceOpen(true);
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

  const handleCreateAndSendInvoice = async () => {
    if (!client || !invoiceDraft) return;
    if (!invoiceEmail) { toast.error("Recipient email required"); return; }

    setSendingInvoice(true);
    try {
      const draft = { ...invoiceDraft };
      draft.invoiceNumber = await generateInvoiceNumberFromDB(supabase);
      const created = await addInvoice(draft);

      // Generate PDF and send
      const blob = await pdf(<InvoicePDF invoice={created} />).toBlob();
      const formData = new FormData();
      formData.append("pdf", blob, `${created.invoiceNumber}.pdf`);
      formData.append("invoiceId", created.id);
      formData.append("recipientEmail", invoiceEmail);
      formData.append("subject", `Invoice ${created.invoiceNumber} from Slate by SDub Media`);
      formData.append("message", invoiceMessage);
      formData.append("invoiceNumber", created.invoiceNumber);
      formData.append("total", String(created.total));
      formData.append("clientName", created.clientInfo.contactName || created.clientInfo.company || "");

      const token = await getAuthToken();
      const res = await fetch("/api/send-invoice", { method: "POST", body: formData, headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed to send" }));
        throw new Error(err.error || "Failed to send");
      }

      await updateInvoice(created.id, { status: "sent" });
      toast.success(`Invoice ${created.invoiceNumber} sent to ${invoiceEmail}`);
      setInvoiceOpen(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to send invoice");
    } finally {
      setSendingInvoice(false);
    }
  };

  const mapsUrl = location
    ? `https://maps.google.com/?q=${encodeURIComponent(`${location.address}, ${location.city}, ${location.state} ${location.zip}`)}`
    : null;

  return (
    <>
      <Sheet open={true} onOpenChange={(o) => !o && onClose()}>
        <SheetContent className="w-full sm:w-[720px] sm:max-w-[720px] bg-card border-border text-foreground overflow-y-auto overflow-x-hidden max-h-[100dvh]">
          <SheetHeader className="pb-4">
            <div className="flex items-start justify-between">
              <div>
                <SheetTitle className="text-lg" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                  {pType?.name ?? "Project"}
                </SheetTitle>
                <div className="mt-1">
                  <Badge className={cn("text-xs",
                    project.status === "upcoming" && "bg-blue-500/20 text-blue-300 border-blue-500/30",
                    project.status === "filming_done" && "bg-purple-500/20 text-purple-300 border-purple-500/30",
                    project.status === "in_editing" && "bg-amber-500/20 text-amber-300 border-amber-500/30",
                    project.status === "completed" && "bg-green-500/20 text-green-300 border-green-500/30",
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

            {/* Retainer Summary (owner only) */}
            {isOwner && (
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
                          <div className="text-sm font-medium tabular-nums">{Number(entry.hoursWorked ?? 0).toFixed(2)} hrs</div>
                          <div className="text-xs text-muted-foreground">${Number(entry.payRatePerHour ?? 0).toFixed(0)}/hr</div>
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
                const editorRate = project.editorBilling?.perImageRate ?? 6;

                // Calculate projected pay
                let projectedPay = 0;
                if (myCrewEntry) projectedPay += Number(myCrewEntry.hoursWorked ?? 0) * Number(myCrewEntry.payRatePerHour ?? 0);
                if (myPostEntry) {
                  if (isPhotoEditor) {
                    projectedPay += project.editorBilling!.imageCount * editorRate;
                  } else {
                    projectedPay += Number(myPostEntry.hoursWorked ?? 0) * Number(myPostEntry.payRatePerHour ?? 0);
                  }
                }

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

            {/* Deliverables */}
            {project.deliverableUrl && (
              <div className="space-y-2">
                <div className="text-xs text-muted-foreground uppercase tracking-wider">Deliverables</div>
                <a
                  href={project.deliverableUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-primary hover:text-primary/80 bg-primary/10 border border-primary/20 rounded-md p-3 transition-colors"
                >
                  <ExternalLink className="w-4 h-4 shrink-0" />
                  View Deliverables
                </a>
              </div>
            )}

            <Separator className="bg-border" />

            {/* Actions */}
            <div className="flex flex-col gap-2">
              {!isClient && STATUS_NEXT[project.status] && (
                <Button onClick={advanceStatus} className="bg-primary text-primary-foreground hover:bg-primary/90 gap-2 w-full">
                  <CheckCircle2 className="w-4 h-4" />
                  {STATUS_NEXT_LABEL[project.status]}
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
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Create & Send Invoice dialog */}
      <AlertDialog open={invoiceOpen} onOpenChange={setInvoiceOpen}>
        <AlertDialogContent className="bg-card border-border text-foreground max-w-lg">
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

              <div>
                <label className="text-xs text-muted-foreground uppercase tracking-wider block mb-1">Recipient Email</label>
                <input
                  type="email"
                  value={invoiceEmail}
                  onChange={e => setInvoiceEmail(e.target.value)}
                  placeholder="client@example.com"
                  className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
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
            </div>
          )}

          <AlertDialogFooter className="gap-2 flex-col sm:flex-row">
            <AlertDialogCancel className="border-border" disabled={sendingInvoice}>Cancel</AlertDialogCancel>
            <Button
              variant="outline"
              onClick={handlePreviewInvoice}
              disabled={generatingPreview || sendingInvoice}
              className="gap-2 border-border"
            >
              {generatingPreview ? "Generating..." : "Preview PDF"}
            </Button>
            <AlertDialogAction
              onClick={handleCreateAndSendInvoice}
              disabled={sendingInvoice || !invoiceEmail}
              className="bg-primary text-primary-foreground hover:bg-primary/90 gap-2"
            >
              {sendingInvoice ? "Sending..." : <><Send className="w-4 h-4" /> Create &amp; Send</>}
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
