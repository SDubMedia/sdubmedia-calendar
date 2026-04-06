// ============================================================
// PipelinePage — CRM pipeline dashboard for client lifecycle
// Full lifecycle: Inquiry → Follow-up → Proposal → Signed → Paid → Delivered
// ============================================================

import { useState, useMemo } from "react";
import { useApp } from "@/contexts/AppContext";
import type { PipelineLead, PipelineStage, Proposal } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Users, Eye, Send, CheckCircle, DollarSign, Clapperboard, Package, Star, Archive, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const STAGES: { key: PipelineStage; label: string; icon: any; color: string }[] = [
  { key: "inquiry", label: "Inquiry", icon: Users, color: "text-blue-400 bg-blue-500/10 border-blue-500/30" },
  { key: "follow_up", label: "Follow-up", icon: Send, color: "text-cyan-400 bg-cyan-500/10 border-cyan-500/30" },
  { key: "proposal_sent", label: "Proposal Sent", icon: Eye, color: "text-indigo-400 bg-indigo-500/10 border-indigo-500/30" },
  { key: "proposal_signed", label: "Signed", icon: CheckCircle, color: "text-amber-400 bg-amber-500/10 border-amber-500/30" },
  { key: "retainer_paid", label: "Retainer Paid", icon: DollarSign, color: "text-green-400 bg-green-500/10 border-green-500/30" },
  { key: "final_payment", label: "Final Payment", icon: DollarSign, color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30" },
  { key: "in_production", label: "In Production", icon: Clapperboard, color: "text-orange-400 bg-orange-500/10 border-orange-500/30" },
  { key: "delivered", label: "Delivered", icon: Package, color: "text-purple-400 bg-purple-500/10 border-purple-500/30" },
  { key: "review", label: "Review", icon: Star, color: "text-pink-400 bg-pink-500/10 border-pink-500/30" },
  { key: "archived", label: "Archived", icon: Archive, color: "text-zinc-400 bg-zinc-500/10 border-zinc-500/30" },
];

interface PipelineEntry {
  id: string;
  type: "lead" | "proposal";
  name: string;
  email: string;
  phone: string;
  projectType: string;
  eventDate: string | null;
  location: string;
  leadSource: string;
  pipelineStage: PipelineStage;
  recentActivity: string;
  proposalId?: string;
  viewedAt?: string | null;
  total?: number;
}

export default function PipelinePage() {
  const { data, addPipelineLead, updatePipelineLead, deletePipelineLead } = useApp();
  const [activeStage, setActiveStage] = useState<PipelineStage | "all">("all");
  const [addDialogOpen, setAddDialogOpen] = useState(false);

  // New lead form
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newType, setNewType] = useState("");
  const [newDate, setNewDate] = useState("");
  const [newSource, setNewSource] = useState("");

  // Merge pipeline_leads + proposals into unified entries
  const entries = useMemo<PipelineEntry[]>(() => {
    const result: PipelineEntry[] = [];

    // Add pipeline leads
    for (const lead of data.pipelineLeads) {
      result.push({
        id: lead.id,
        type: "lead",
        name: lead.name,
        email: lead.email,
        phone: lead.phone,
        projectType: lead.projectType,
        eventDate: lead.eventDate,
        location: lead.location,
        leadSource: lead.leadSource,
        pipelineStage: lead.pipelineStage,
        recentActivity: lead.recentActivity,
        proposalId: lead.proposalId || undefined,
      });
    }

    // Add proposals that aren't linked to a lead
    const linkedProposalIds = new Set(data.pipelineLeads.map(l => l.proposalId).filter(Boolean));
    for (const prop of data.proposals) {
      if (linkedProposalIds.has(prop.id)) continue;
      const client = data.clients.find(c => c.id === prop.clientId);
      result.push({
        id: `prop-${prop.id}`,
        type: "proposal",
        name: client?.contactName || prop.title,
        email: prop.clientEmail,
        phone: client?.phone || "",
        projectType: "",
        eventDate: null,
        location: "",
        leadSource: prop.leadSource || "",
        pipelineStage: prop.pipelineStage || mapStatusToStage(prop.status),
        recentActivity: getProposalActivity(prop),
        proposalId: prop.id,
        viewedAt: prop.viewedAt,
        total: prop.total,
      });
    }

    return result;
  }, [data.pipelineLeads, data.proposals, data.clients]);

  // Stage counts
  const stageCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of STAGES) counts[s.key] = 0;
    for (const e of entries) counts[e.pipelineStage] = (counts[e.pipelineStage] || 0) + 1;
    return counts;
  }, [entries]);

  // Filtered entries
  const filtered = useMemo(() => {
    if (activeStage === "all") return entries;
    return entries.filter(e => e.pipelineStage === activeStage);
  }, [entries, activeStage]);

  async function createLead() {
    if (!newName.trim()) { toast.error("Name required"); return; }
    await addPipelineLead({
      clientId: null,
      name: newName.trim(),
      email: newEmail.trim(),
      phone: newPhone.trim(),
      projectType: newType.trim(),
      eventDate: newDate || null,
      location: "",
      description: "",
      leadSource: newSource.trim(),
      pipelineStage: "inquiry",
      proposalId: null,
      recentActivity: "Created",
      recentActivityAt: new Date().toISOString(),
    });
    toast.success("Lead added");
    setAddDialogOpen(false);
    setNewName(""); setNewEmail(""); setNewPhone(""); setNewType(""); setNewDate(""); setNewSource("");
  }

  async function changeStage(entry: PipelineEntry, newStage: PipelineStage) {
    if (entry.type === "lead") {
      await updatePipelineLead(entry.id, { pipelineStage: newStage, recentActivity: `Moved to ${newStage}`, recentActivityAt: new Date().toISOString() });
    }
    // For proposals, we'd update the proposal's pipelineStage
    toast.success(`Moved to ${STAGES.find(s => s.key === newStage)?.label}`);
  }

  async function deleteLead(id: string) {
    try {
      await deletePipelineLead(id);
      toast.success("Lead removed");
    } catch (e: any) {
      toast.error(e.message || "Failed to delete");
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-border bg-card/50">
        <div>
          <h1 className="text-xl font-semibold text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            Pipeline
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">{entries.length} total · {filtered.length} shown</p>
        </div>
        <Button onClick={() => setAddDialogOpen(true)} className="gap-2">
          <Plus className="w-4 h-4" /> Add Lead
        </Button>
      </div>

      {/* Stage buckets */}
      <div className="px-4 sm:px-6 py-3 border-b border-border overflow-x-auto">
        <div className="flex gap-2 min-w-max">
          <button
            onClick={() => setActiveStage("all")}
            className={cn(
              "px-3 py-2 rounded-lg border text-xs font-medium transition-colors min-w-[70px] text-center",
              activeStage === "all" ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"
            )}
          >
            <div className="text-lg font-bold">{entries.length}</div>
            <div>All</div>
          </button>
          {STAGES.map(s => (
            <button
              key={s.key}
              onClick={() => setActiveStage(s.key)}
              className={cn(
                "px-3 py-2 rounded-lg border text-xs font-medium transition-colors min-w-[70px] text-center",
                activeStage === s.key ? `border ${s.color}` : "border-border text-muted-foreground hover:text-foreground"
              )}
            >
              <div className="text-lg font-bold">{stageCounts[s.key] || 0}</div>
              <div className="truncate">{s.label}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No entries in this stage.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-card/30 text-xs text-muted-foreground">
                <th className="text-left px-4 py-2 font-medium">Name</th>
                <th className="text-left px-4 py-2 font-medium hidden sm:table-cell">Contact</th>
                <th className="text-left px-4 py-2 font-medium hidden md:table-cell">Type</th>
                <th className="text-left px-4 py-2 font-medium hidden md:table-cell">Date</th>
                <th className="text-left px-4 py-2 font-medium hidden lg:table-cell">Source</th>
                <th className="text-left px-4 py-2 font-medium">Stage</th>
                <th className="text-left px-4 py-2 font-medium hidden sm:table-cell">Activity</th>
                <th className="text-right px-4 py-2 font-medium w-10"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(entry => {
                const stage = STAGES.find(s => s.key === entry.pipelineStage);
                return (
                  <tr key={entry.id} className="border-b border-border/50 hover:bg-card/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-medium text-foreground">{entry.name}</div>
                      {entry.total != null && entry.total > 0 && (
                        <span className="text-[10px] font-mono text-muted-foreground">${entry.total.toFixed(2)}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <div className="text-xs text-muted-foreground">{entry.email}</div>
                      {entry.phone && <div className="text-xs text-muted-foreground">{entry.phone}</div>}
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell text-xs text-muted-foreground">{entry.projectType || "—"}</td>
                    <td className="px-4 py-3 hidden md:table-cell text-xs text-muted-foreground">{entry.eventDate || "TBD"}</td>
                    <td className="px-4 py-3 hidden lg:table-cell text-xs text-muted-foreground">{entry.leadSource || "—"}</td>
                    <td className="px-4 py-3">
                      {entry.type === "lead" ? (
                        <select
                          value={entry.pipelineStage}
                          onChange={e => changeStage(entry, e.target.value as PipelineStage)}
                          className={cn("text-[10px] font-semibold px-2 py-1 rounded border bg-transparent", stage?.color)}
                        >
                          {STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                        </select>
                      ) : (
                        <span className={cn("text-[10px] font-semibold px-2 py-1 rounded border", stage?.color)}>
                          {stage?.label}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <span className="text-xs text-muted-foreground">
                        {entry.viewedAt ? "Viewed" : entry.recentActivity || "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {entry.type === "lead" && (
                        <button onClick={() => deleteLead(entry.id)} className="p-1 text-muted-foreground hover:text-destructive">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Add Lead Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="bg-card border-border text-foreground max-w-md">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Add Lead</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Name</Label>
                <Input value={newName} onChange={e => setNewName(e.target.value)} className="bg-secondary border-border" placeholder="Full name" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Email</Label>
                <Input value={newEmail} onChange={e => setNewEmail(e.target.value)} className="bg-secondary border-border" placeholder="email@example.com" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Phone</Label>
                <Input value={newPhone} onChange={e => setNewPhone(e.target.value)} className="bg-secondary border-border" placeholder="(optional)" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Project Type</Label>
                <Input value={newType} onChange={e => setNewType(e.target.value)} className="bg-secondary border-border" placeholder="e.g. Wedding" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Event Date</Label>
                <Input type="date" value={newDate} onChange={e => setNewDate(e.target.value)} className="bg-secondary border-border" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Lead Source</Label>
                <Input value={newSource} onChange={e => setNewSource(e.target.value)} className="bg-secondary border-border" placeholder="e.g. Instagram" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAddDialogOpen(false)}>Cancel</Button>
            <Button onClick={createLead}>Add Lead</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Helper: map old proposal status to pipeline stage
function mapStatusToStage(status: string): PipelineStage {
  switch (status) {
    case "draft": return "inquiry";
    case "sent": return "proposal_sent";
    case "accepted": return "proposal_signed";
    case "completed": return "delivered";
    case "void": return "archived";
    default: return "inquiry";
  }
}

function getProposalActivity(p: Proposal): string {
  if (p.paidAt) return "Paid";
  if (p.completedAt) return "Completed";
  if (p.acceptedAt) return "Accepted";
  if (p.viewedAt) return "Viewed";
  if (p.sentAt) return "Sent";
  return "Draft";
}
