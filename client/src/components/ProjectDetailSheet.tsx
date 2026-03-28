// ============================================================
// ProjectDetailSheet — Slide-in panel for project details
// Design: Dark Cinematic Studio
// ============================================================

import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Calendar, Clock, MapPin, User, Camera, Film, Edit3, Trash2, CheckCircle2, ExternalLink
} from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import type { Project, ProjectStatus, EpisodeStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import ProjectDialog from "./ProjectDialog";
import PhotoEditorCalculator from "./PhotoEditorCalculator";
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

export default function ProjectDetailSheet({ project, onClose }: Props) {
  const { data, updateProject, deleteProject, updateEpisode, fetchEpisodes } = useApp();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const client = data.clients.find((c) => c.id === project.clientId);
  const location = data.locations.find((l) => l.id === project.locationId);
  const pType = data.projectTypes.find((pt) => pt.id === project.projectTypeId);

  const getCrewName = (id: string) => data.crewMembers.find((c) => c.id === id)?.name ?? "Unknown";

  const totalCrewHrs = project.crew.reduce((s, c) => s + Number(c.hoursWorked || 0), 0);
  const totalPostHrs = project.postProduction.reduce((s, c) => s + Number(c.hoursWorked || 0), 0);
  const totalHrs = totalCrewHrs + totalPostHrs;

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
                  )}>
                    {STATUS_LABELS[project.status]}
                  </Badge>
                </div>
              </div>
              <div className="flex items-center gap-1 mr-8">
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={() => setEditOpen(true)}>
                  <Edit3 className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => setDeleteOpen(true)}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </SheetHeader>

          <div className="space-y-5">
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
                <div className="text-sm font-medium truncate">{client?.company ?? "—"}</div>
                {client?.contactName && <div className="text-xs text-muted-foreground">{client.contactName}</div>}
              </div>
              <div className="bg-secondary rounded-lg p-3 space-y-1">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <MapPin className="w-3.5 h-3.5" /> Location
                </div>
                <div className="text-sm font-medium truncate">{location?.name ?? "—"}</div>
                {mapsUrl && (
                  <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary flex items-center gap-1 hover:underline">
                    Open in Maps <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            </div>

            {/* Retainer Summary */}
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

            {/* Crew */}
            {project.crew.length > 0 && (
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
            )}

            {/* Post Production */}
            {project.postProduction.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider">
                  <Film className="w-3.5 h-3.5" /> Post Production
                </div>
                <div className="space-y-1.5">
                  {project.postProduction.map((entry, i) => (
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
            )}

            {/* Photo Editor Billing Calculator */}
            {photoEditorEntry && client && (
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
              {STATUS_NEXT[project.status] && (
                <Button onClick={advanceStatus} className="bg-primary text-primary-foreground hover:bg-primary/90 gap-2 w-full">
                  <CheckCircle2 className="w-4 h-4" />
                  {STATUS_NEXT_LABEL[project.status]}
                </Button>
              )}
              <Button variant="outline" onClick={() => setEditOpen(true)} className="w-full border-border">
                Edit Project
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Edit dialog */}
      <ProjectDialog open={editOpen} onClose={() => setEditOpen(false)} project={project} />

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
