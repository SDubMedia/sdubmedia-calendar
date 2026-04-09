// ============================================================
// ProjectDialog — Create / Edit project modal
// Design: Dark Cinematic Studio
// Billing Model: Hourly — crew entries track hours worked + pay rate per hour
// ============================================================

import { useState, useEffect, useMemo, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2, ArrowLeft } from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import type { Project, ProjectCrewEntry, ProjectPostEntry, EditType, ProjectStatus, Client } from "@/lib/types";
import { toast } from "sonner";

const EDIT_TYPES: EditType[] = [
  "Social Vertical", "Social Horizontal", "Podcast Edit",
  "Full Edit", "Highlight Reel", "Raw Footage",
];

interface Props {
  open: boolean;
  onClose: () => void;
  project?: Project;
  defaultDate?: string;
  defaultClientId?: string;
  defaultNotes?: string;
  onCreated?: (project: Project) => void;
}

const emptyCrewEntry = (): ProjectCrewEntry => ({
  crewMemberId: "",
  role: "",
  hoursWorked: 0,
  payRatePerHour: 0,
});

const emptyPostEntry = (): ProjectPostEntry => ({
  crewMemberId: "",
  role: "",
  hoursWorked: 0,
  payRatePerHour: 0,
});

export default function ProjectDialog({ open, onClose, project, defaultDate, defaultClientId, defaultNotes, onCreated }: Props) {
  const { data, addProject, updateProject } = useApp();
  const isEdit = !!project;

  const [clientId, setClientId] = useState(project?.clientId ?? defaultClientId ?? data.clients[0]?.id ?? "");
  const [projectTypeId, setProjectTypeId] = useState(project?.projectTypeId ?? "");
  const [locationId, setLocationId] = useState(project?.locationId ?? "");
  const [date, setDate] = useState(project?.date ?? defaultDate ?? "");
  const [startTime, setStartTime] = useState(project?.startTime ?? "09:00");
  const [endTime, setEndTime] = useState(project?.endTime ?? "11:00");
  const [status, setStatus] = useState<ProjectStatus>(project?.status ?? "upcoming");
  const [crew, setCrew] = useState<ProjectCrewEntry[]>(project?.crew ?? [emptyCrewEntry()]);
  const [postProduction, setPostProduction] = useState<ProjectPostEntry[]>(project?.postProduction ?? [emptyPostEntry()]);
  const [editTypes, setEditTypes] = useState<EditType[]>(project?.editTypes ?? []);
  const [notes, setNotes] = useState(project?.notes ?? defaultNotes ?? "");
  const [deliverableUrl, setDeliverableUrl] = useState(project?.deliverableUrl ?? "");
  const [projectRate, setProjectRate] = useState<number | null>(project?.projectRate ?? null);

  const wasOpen = useRef(false);
  useEffect(() => {
    // Only reset form state when dialog transitions from closed → open
    if (open && !wasOpen.current) {
      setClientId(project?.clientId ?? data.clients[0]?.id ?? "");
      setProjectTypeId(project?.projectTypeId ?? "");
      setLocationId(project?.locationId ?? "");
      setDate(project?.date ?? defaultDate ?? "");
      setStartTime(project?.startTime ?? "09:00");
      setEndTime(project?.endTime ?? "11:00");
      setStatus(project?.status ?? "upcoming");
      setCrew(project?.crew?.length ? project.crew : [emptyCrewEntry()]);
      setPostProduction(project?.postProduction?.length ? project.postProduction : [emptyPostEntry()]);
      setEditTypes(project?.editTypes ?? []);
      setNotes(project?.notes ?? "");
      setDeliverableUrl(project?.deliverableUrl ?? "");
      // For new projects, pre-fill project rate from client default
      if (project?.projectRate != null) {
        setProjectRate(project.projectRate);
      } else if (!project) {
        const client = data.clients.find(c => c.id === (defaultClientId ?? data.clients[0]?.id));
        if (client?.billingModel === "per_project") {
          setProjectRate(client.perProjectRate || 0);
        } else {
          setProjectRate(null);
        }
      } else {
        setProjectRate(null);
      }
    }
    wasOpen.current = open;
  }, [open, project, defaultDate, defaultClientId, data.clients]);

  const toggleEditType = (et: EditType) => {
    setEditTypes((prev) => prev.includes(et) ? prev.filter((x) => x !== et) : [...prev, et]);
  };

  // Get the selected client and filter project types based on client settings
  const selectedClient = useMemo(() => data.clients.find(c => c.id === clientId), [data.clients, clientId]);

  const availableProjectTypes = useMemo(() => {
    if (selectedClient?.allowedProjectTypeIds?.length) {
      return data.projectTypes.filter(pt => selectedClient.allowedProjectTypeIds.includes(pt.id));
    }
    return data.projectTypes;
  }, [data.projectTypes, selectedClient]);

  // When client changes, auto-select default project type and pre-fill project rate
  const handleClientChange = (newClientId: string) => {
    setClientId(newClientId);
    const client = data.clients.find(c => c.id === newClientId);
    if (client?.defaultProjectTypeId) {
      setProjectTypeId(client.defaultProjectTypeId);
    } else {
      setProjectTypeId("");
    }
    if (client?.billingModel === "per_project") {
      setProjectRate(client.perProjectRate || 0);
    } else {
      setProjectRate(null);
    }
  };

  // When project type changes for per_project clients, check for type-specific rate
  const handleProjectTypeChange = (newTypeId: string) => {
    setProjectTypeId(newTypeId);
    if (selectedClient?.billingModel === "per_project") {
      const typeRate = selectedClient.projectTypeRates?.find(r => r.projectTypeId === newTypeId);
      if (typeRate) {
        setProjectRate(typeRate.rate);
      } else if (!isEdit) {
        setProjectRate(selectedClient.perProjectRate || 0);
      }
    }
  };

  // When a crew member is selected, reset role and rate; when role is selected, auto-fill rate from staff profile
  const updateCrewEntry = (idx: number, field: keyof ProjectCrewEntry, value: string | number) => {
    setCrew((prev) => prev.map((e, i) => {
      if (i !== idx) return e;
      const updated = { ...e, [field]: value };
      if (field === "crewMemberId") {
        // Reset role and rate when person changes
        updated.role = "";
        updated.payRatePerHour = 0;
      }
      if (field === "role") {
        // Auto-fill pay rate from staff profile for the selected role
        const member = data.crewMembers.find(c => c.id === e.crewMemberId);
        const rr = member?.roleRates?.find(r => r.role === value);
        if (rr) updated.payRatePerHour = rr.payRatePerHour;
      }
      return updated;
    }));
  };

  const updatePostEntry = (idx: number, field: keyof ProjectPostEntry, value: string | number) => {
    setPostProduction((prev) => prev.map((e, i) => {
      if (i !== idx) return e;
      const updated = { ...e, [field]: value };
      if (field === "crewMemberId") {
        updated.role = "";
        updated.payRatePerHour = 0;
      }
      if (field === "role") {
        const member = data.crewMembers.find(c => c.id === e.crewMemberId);
        const rr = member?.roleRates?.find(r => r.role === value);
        if (rr) updated.payRatePerHour = rr.payRatePerHour;
      }
      return updated;
    }));
  };

  const handleSave = async () => {
    if (!clientId || !date || !projectTypeId) {
      toast.error("Please fill in client, project type, and date");
      return;
    }
    const payload: Omit<Project, "id" | "createdAt"> = {
      clientId, projectTypeId, locationId: locationId || "", date, startTime, endTime, status,
      crew: crew.filter((c) => c.crewMemberId),
      postProduction: postProduction.filter((c) => c.crewMemberId),
      editorBilling: project?.editorBilling ?? null,
      projectRate: selectedClient?.billingModel === "per_project" ? projectRate : null,
      editTypes, notes, deliverableUrl,
    };
    try {
      if (isEdit && project) {
        await updateProject(project.id, payload);
        toast.success("Project updated");
      } else {
        const newProject = await addProject(payload);
        toast.success("Project created");
        if (onCreated) onCreated(newProject);
      }
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Failed to save project");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="fixed !inset-0 !top-0 !left-0 !translate-x-0 !translate-y-0 !max-w-none !w-full !rounded-none overflow-x-hidden bg-card border-border text-foreground sm:!inset-auto sm:!top-[50%] sm:!left-[50%] sm:!translate-x-[-50%] sm:!translate-y-[-50%] sm:!w-[calc(100vw-2rem)] sm:!max-w-[900px] sm:!h-auto sm:!max-h-[90dvh] sm:!rounded-lg"
        style={{
          height: "100%",
          maxHeight: "100%",
          overflowY: "auto",
          WebkitOverflowScrolling: "touch",
          paddingTop: "max(1rem, env(safe-area-inset-top))",
          paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
        }}
      >
        <DialogHeader>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="sm:hidden -ml-1 p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <DialogTitle style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              {isEdit ? "Edit Project" : "New Project"}
            </DialogTitle>
          </div>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Row 1: Client + Project Type */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Client</Label>
              <Select value={clientId} onValueChange={handleClientChange}>
                <SelectTrigger className="bg-secondary border-border">
                  <SelectValue placeholder="Select client" />
                </SelectTrigger>
                <SelectContent className="bg-popover border-border">
                  {data.clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.company}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Project Type</Label>
              <Select value={projectTypeId} onValueChange={handleProjectTypeChange}>
                <SelectTrigger className="bg-secondary border-border">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent className="bg-popover border-border">
                  {availableProjectTypes.map((pt) => (
                    <SelectItem key={pt.id} value={pt.id}>{pt.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Row 2: Date + Times */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="bg-secondary border-border" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Start Time</Label>
              <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="bg-secondary border-border" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">End Time</Label>
              <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="bg-secondary border-border" />
            </div>
          </div>

          {/* Row 3: Location + Status */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Location</Label>
              <Select value={locationId} onValueChange={setLocationId}>
                <SelectTrigger className="bg-secondary border-border">
                  <SelectValue placeholder="Select location" />
                </SelectTrigger>
                <SelectContent className="bg-popover border-border">
                  {data.locations.map((l) => (
                    <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as ProjectStatus)}>
                <SelectTrigger className="bg-secondary border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-popover border-border">
                  <SelectItem value="upcoming">Upcoming</SelectItem>
                  <SelectItem value="filming_done">Filming Done</SelectItem>
                  <SelectItem value="in_editing">In Editing</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Project Rate (per-project billing clients only) */}
          {selectedClient?.billingModel === "per_project" && (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Project Rate ($)</Label>
              <Input
                type="number"
                min="0"
                step="25"
                value={projectRate ?? ""}
                onChange={(e) => setProjectRate(parseFloat(e.target.value) || 0)}
                className="bg-secondary border-border"
                placeholder="e.g. 300"
              />
              <p className="text-[10px] text-muted-foreground">
                Flat rate billed to client for this project. Crew entries below are for internal cost tracking only.
              </p>
            </div>
          )}

          {/* Crew (Filming) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground uppercase tracking-wider">Crew — Filming</Label>
              <Button variant="ghost" size="sm" onClick={() => setCrew((p) => [...p, emptyCrewEntry()])} className="h-7 text-xs gap-1 text-primary hover:text-primary">
                <Plus className="w-3 h-3" /> Add
              </Button>
            </div>
            <div className="hidden sm:grid grid-cols-[1fr_1fr_70px_80px_28px] gap-2 text-[10px] text-muted-foreground px-0.5 mb-1">
              <span>Person</span><span>Role</span><span>Hours</span><span>Pay/hr ($)</span><span />
            </div>
            {crew.map((entry, idx) => (
              <div key={idx} className="flex flex-col gap-2 sm:grid sm:grid-cols-[1fr_1fr_70px_80px_28px] sm:gap-2 sm:items-center bg-secondary/50 sm:bg-transparent rounded-lg p-2 sm:p-0">
                <div className="flex gap-2">
                  <Select value={entry.crewMemberId} onValueChange={(v) => updateCrewEntry(idx, "crewMemberId", v)}>
                    <SelectTrigger className="bg-secondary border-border h-8 text-xs">
                      <SelectValue placeholder="Person" />
                    </SelectTrigger>
                    <SelectContent className="bg-popover border-border">
                      {data.crewMembers.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={entry.role}
                    onValueChange={(v) => updateCrewEntry(idx, "role", v)}
                    disabled={!entry.crewMemberId}
                  >
                    <SelectTrigger className="bg-secondary border-border h-8 text-xs">
                      <SelectValue placeholder="Role" />
                    </SelectTrigger>
                    <SelectContent className="bg-popover border-border">
                      {(data.crewMembers.find(c => c.id === entry.crewMemberId)?.roleRates ?? []).map((rr) => (
                        <SelectItem key={rr.role} value={rr.role}>{rr.role}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <button onClick={() => setCrew((p) => p.filter((_, i) => i !== idx))} className="text-muted-foreground hover:text-destructive transition-colors sm:order-last shrink-0">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="flex gap-2 sm:contents">
                  <div className="flex-1 sm:flex-none">
                    <Label className="text-[10px] text-muted-foreground sm:hidden">Hours</Label>
                    <Input type="number" placeholder="0" min="0" step="0.5" value={entry.hoursWorked || ""} onChange={(e) => updateCrewEntry(idx, "hoursWorked", parseFloat(e.target.value) || 0)} className="bg-secondary border-border h-8 text-xs" />
                  </div>
                  <div className="flex-1 sm:flex-none">
                    <Label className="text-[10px] text-muted-foreground sm:hidden">Pay/hr ($)</Label>
                    <Input type="number" placeholder="0.00" min="0" step="5" value={entry.payRatePerHour || ""} onChange={(e) => updateCrewEntry(idx, "payRatePerHour", parseFloat(e.target.value) || 0)} className="bg-secondary border-border h-8 text-xs" />
                  </div>
                  <button onClick={() => setCrew((p) => p.filter((_, i) => i !== idx))} className="text-muted-foreground hover:text-destructive transition-colors hidden sm:block shrink-0 self-end mb-1">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
            {/* Running total for crew */}
            {crew.some(e => e.crewMemberId) && (
              <div className="text-xs text-right text-muted-foreground pr-8">
                Crew total: <span className="text-purple-300 font-medium">
                  ${crew.reduce((s, e) => s + (Number(e.hoursWorked) * Number(e.payRatePerHour)), 0).toFixed(2)}
                </span>
              </div>
            )}
          </div>

          {/* Post Production */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground uppercase tracking-wider">Post Production</Label>
              <Button variant="ghost" size="sm" onClick={() => setPostProduction((p) => [...p, emptyPostEntry()])} className="h-7 text-xs gap-1 text-primary hover:text-primary">
                <Plus className="w-3 h-3" /> Add
              </Button>
            </div>
            <div className="hidden sm:grid grid-cols-[1fr_1fr_70px_80px_28px] gap-2 text-[10px] text-muted-foreground px-0.5 mb-1">
              <span>Person</span><span>Role</span><span>Hours</span><span>Pay/hr ($)</span><span />
            </div>
            {postProduction.map((entry, idx) => (
              <div key={idx} className="flex flex-col gap-2 sm:grid sm:grid-cols-[1fr_1fr_70px_80px_28px] sm:gap-2 sm:items-center bg-secondary/50 sm:bg-transparent rounded-lg p-2 sm:p-0">
                <div className="flex gap-2">
                  <Select value={entry.crewMemberId} onValueChange={(v) => updatePostEntry(idx, "crewMemberId", v)}>
                    <SelectTrigger className="bg-secondary border-border h-8 text-xs">
                      <SelectValue placeholder="Person" />
                    </SelectTrigger>
                    <SelectContent className="bg-popover border-border">
                      {data.crewMembers.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={entry.role}
                    onValueChange={(v) => updatePostEntry(idx, "role", v)}
                    disabled={!entry.crewMemberId}
                  >
                    <SelectTrigger className="bg-secondary border-border h-8 text-xs">
                      <SelectValue placeholder="Role" />
                    </SelectTrigger>
                    <SelectContent className="bg-popover border-border">
                      {(data.crewMembers.find(c => c.id === entry.crewMemberId)?.roleRates ?? []).map((rr) => (
                        <SelectItem key={rr.role} value={rr.role}>{rr.role}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <button onClick={() => setPostProduction((p) => p.filter((_, i) => i !== idx))} className="text-muted-foreground hover:text-destructive transition-colors sm:order-last shrink-0">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="flex gap-2 sm:contents">
                  <div className="flex-1 sm:flex-none">
                    <Label className="text-[10px] text-muted-foreground sm:hidden">Hours</Label>
                    <Input type="number" placeholder="0" min="0" step="0.5" value={entry.hoursWorked || ""} onChange={(e) => updatePostEntry(idx, "hoursWorked", parseFloat(e.target.value) || 0)} className="bg-secondary border-border h-8 text-xs" />
                  </div>
                  <div className="flex-1 sm:flex-none">
                    <Label className="text-[10px] text-muted-foreground sm:hidden">Pay/hr ($)</Label>
                    <Input type="number" placeholder="0.00" min="0" step="5" value={entry.payRatePerHour || ""} onChange={(e) => updatePostEntry(idx, "payRatePerHour", parseFloat(e.target.value) || 0)} className="bg-secondary border-border h-8 text-xs" />
                  </div>
                  <button onClick={() => setPostProduction((p) => p.filter((_, i) => i !== idx))} className="text-muted-foreground hover:text-destructive transition-colors hidden sm:block shrink-0 self-end mb-1">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
            {postProduction.some(e => e.crewMemberId) && (
              <div className="text-xs text-right text-muted-foreground pr-8">
                Post total: <span className="text-purple-300 font-medium">
                  ${postProduction.reduce((s, e) => s + (Number(e.hoursWorked) * Number(e.payRatePerHour)), 0).toFixed(2)}
                </span>
              </div>
            )}
          </div>

          {/* Edit Types */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">Edit Types</Label>
            <div className="flex flex-wrap gap-2">
              {EDIT_TYPES.map((et) => (
                <button
                  key={et}
                  onClick={() => toggleEditType(et)}
                  className={`px-2.5 py-1 rounded text-xs border transition-colors ${
                    editTypes.includes(et)
                      ? "bg-primary/20 border-primary/50 text-primary"
                      : "border-border text-muted-foreground hover:border-primary/30 hover:text-foreground"
                  }`}
                >
                  {et}
                </button>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any notes about this project..." className="bg-secondary border-border resize-none" rows={3} />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Deliverable Link</Label>
            <Input value={deliverableUrl} onChange={(e) => setDeliverableUrl(e.target.value)} placeholder="Google Drive link to final deliverables..." className="bg-secondary border-border" />
          </div>
        </div>

        <DialogFooter className="sticky bottom-0 bg-card pt-4 pb-2 -mx-6 px-6 border-t border-border sm:relative sm:border-0 sm:mx-0 sm:px-0 sm:pt-0 sm:pb-0">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} className="bg-primary text-primary-foreground hover:bg-primary/90">
            {isEdit ? "Save Changes" : "Create Project"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
