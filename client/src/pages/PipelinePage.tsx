// ============================================================
// PipelinePage — CRM pipeline dashboard for client lifecycle
// Full lifecycle: Inquiry → Follow-up → Proposal → Signed → Paid → Delivered
// ============================================================

import { useState, useMemo, type ReactNode } from "react";
import { useLocation } from "wouter";
import { useScopedData as useApp } from "@/hooks/useScopedData";
import type { PipelineStage, Proposal, Contract, PipelineLead } from "@/lib/types";
import { DEFAULT_PIPELINE_STAGES } from "@/lib/types";
import { formatDayLong, isoDate } from "@/lib/dates";
import { classifyFollowUp, isOpenLead, pipelineValueByStage, totalPipelineValue, LOST_REASONS, type FollowUpStatus } from "@/lib/pipelineInsights";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateField } from "@/components/DateTimeField";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Users, X, Send } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import ReShootPipeline from "@/components/ReShootPipeline";
import { nanoid } from "nanoid";
import { defaultDepositMilestones } from "@/lib/proposalDefaults";
import { getAuthToken } from "@/lib/supabase";

const COLOR_MAP: Record<string, string> = {
  blue: "text-blue-400 bg-blue-500/10 border-blue-500/30",
  cyan: "text-cyan-400 bg-cyan-500/10 border-cyan-500/30",
  indigo: "text-indigo-400 bg-indigo-500/10 border-indigo-500/30",
  amber: "text-amber-400 bg-amber-500/10 border-amber-500/30",
  green: "text-green-400 bg-green-500/10 border-green-500/30",
  emerald: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
  orange: "text-orange-400 bg-orange-500/10 border-orange-500/30",
  purple: "text-purple-400 bg-purple-500/10 border-purple-500/30",
  pink: "text-pink-400 bg-pink-500/10 border-pink-500/30",
  zinc: "text-zinc-400 bg-zinc-500/10 border-zinc-500/30",
  red: "text-red-400 bg-red-500/10 border-red-500/30",
  yellow: "text-yellow-400 bg-yellow-500/10 border-yellow-500/30",
};

interface PipelineEntry {
  id: string;
  type: "lead" | "proposal" | "contract_draft";
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
  contractId?: string;
  viewedAt?: string | null;
  total?: number;
  draftAge?: number;        // for contract_draft cards: days since draft was created (for the aging indicator)
  paymentLateDays?: number; // max days-late across unpaid past-due milestones on the underlying contract
  paymentLateAmount?: number; // dollar amount of the most-overdue unpaid milestone (for badge tooltip)
  // Website form submissions fold the visitor's own message into the lead's
  // `description`. Carried through so the detail dialog can show it — without
  // this the message is captured to the DB but unreadable anywhere in the app.
  description?: string;
  createdAt?: string;
  // Lead-only CRM fields (undefined on proposal/contract_draft rows)
  expectedValue?: number;
  followUpDate?: string | null;
  followUpNote?: string;
  followUpStatus?: FollowUpStatus | null;
  closedOutcome?: "" | "won" | "lost";
  closedAt?: string | null;
  lostReason?: string;
  lostReasonNote?: string;
}

/** Full ISO timestamp into a readable "Jul 29, 2026, 6:36 PM". `formatDayLong`
 *  only handles bare YYYY-MM-DD, so it can't be reused for created_at. */
function formatReceived(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

/** One label/value row. Stacks under 640px so long emails don't overflow the card. */
function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="py-1.5 sm:grid sm:grid-cols-[6.5rem_1fr] sm:gap-3 sm:items-start">
      <span className="block text-xs text-muted-foreground sm:pt-0.5">{label}</span>
      <div className="text-sm text-foreground min-w-0 break-words">{children}</div>
    </div>
  );
}

/**
 * Detail view for a pipeline row. Started read-only (its original job: render
 * the website visitor's message, which was captured but unreadable); for
 * leads it now also edits the CRM fields — expected value, follow-up,
 * won/lost close-out.
 *
 * Edit state is plain useState seeded from props, and the CALL SITE remounts
 * this dialog per lead via `key={entry.id}`. That's the whole
 * concurrency story: realtime updates to AppContext can't reach an open
 * dialog (the entry prop is a snapshot), so in-progress edits can't be wiped
 * (the CLAUDE.md form-reset rule, satisfied with zero effects). A concurrent
 * edit of the same field from another device loses to the last Save —
 * acceptable for a single-owner CRM.
 */
function EntryDetailDialog({
  entry, stageLabel, onClose, updateLead,
}: {
  entry: PipelineEntry | null;
  stageLabel: string;
  onClose: () => void;
  updateLead: (id: string, patch: Partial<PipelineLead>) => Promise<void>;
}) {
  const isLead = entry?.type === "lead";
  const [valueStr, setValueStr] = useState(() => (entry?.expectedValue ?? 0) > 0 ? String(entry!.expectedValue) : "");
  const [followUpDate, setFollowUpDate] = useState(() => entry?.followUpDate ?? "");
  const [followUpNote, setFollowUpNote] = useState(() => entry?.followUpNote ?? "");
  const [lostPickerOpen, setLostPickerOpen] = useState(false);
  const [lostReason, setLostReason] = useState("");
  const [lostNote, setLostNote] = useState("");
  const [saving, setSaving] = useState(false);
  if (!entry) return null;

  const parsedValue = parseFloat(valueStr) || 0;
  const dirty = isLead && (
    parsedValue !== (entry.expectedValue ?? 0)
    || (followUpDate || null) !== (entry.followUpDate ?? null)
    || followUpNote !== (entry.followUpNote ?? "")
  );

  const saveDetails = async () => {
    if (valueStr.trim() !== "" && Number.isNaN(parseFloat(valueStr))) {
      toast.error("Expected value must be a number");
      return;
    }
    setSaving(true);
    try {
      const dateChanged = (followUpDate || null) !== (entry.followUpDate ?? null);
      await updateLead(entry.id, {
        expectedValue: parsedValue,
        followUpDate: followUpDate || null,
        followUpNote,
        recentActivity: dateChanged && followUpDate ? `Follow-up set for ${formatDayLong(followUpDate)}` : "Details updated",
        recentActivityAt: new Date().toISOString(),
      });
      toast.success("Saved");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save");
    } finally {
      setSaving(false);
    }
  };

  const closeOut = async (patch: Partial<PipelineLead>, doneMsg: string) => {
    setSaving(true);
    try {
      await updateLead(entry.id, patch);
      toast.success(doneMsg);
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save");
    } finally {
      setSaving(false);
    }
  };

  const markWon = () => closeOut({
    closedOutcome: "won", closedAt: new Date().toISOString(),
    recentActivity: "Marked won", recentActivityAt: new Date().toISOString(),
  }, "Marked won 🎉");

  const markLost = () => {
    if (!lostReason) return;
    void closeOut({
      closedOutcome: "lost", closedAt: new Date().toISOString(),
      lostReason, lostReasonNote: lostNote.trim(),
      recentActivity: `Marked lost — ${lostReason}`, recentActivityAt: new Date().toISOString(),
    }, "Marked lost");
  };

  const reopen = () => closeOut({
    closedOutcome: "", closedAt: null, lostReason: "", lostReasonNote: "",
    recentActivity: "Reopened", recentActivityAt: new Date().toISOString(),
  }, "Reopened");
  const mailto = entry.email
    ? `mailto:${entry.email}?subject=${encodeURIComponent(`Re: your inquiry${entry.projectType ? ` — ${entry.projectType}` : ""}`)}`
    : "";
  return (
    <Dialog open={!!entry} onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="bg-card border-border text-foreground max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle style={{ fontFamily: "'Space Grotesk', sans-serif" }} className="break-words pr-6">
            {entry.name || "Untitled"}
          </DialogTitle>
        </DialogHeader>

        <div className="divide-y divide-border/50">
          <DetailRow label="Stage">
            <span className="text-xs">{stageLabel}</span>
          </DetailRow>
          {entry.createdAt && <DetailRow label="Received">{formatReceived(entry.createdAt)}</DetailRow>}
          {entry.email && (
            <DetailRow label="Email">
              <a href={`mailto:${entry.email}`} className="text-blue-400 hover:text-blue-300 underline break-all">{entry.email}</a>
            </DetailRow>
          )}
          {entry.phone && (
            <DetailRow label="Phone">
              <a href={`tel:${entry.phone.replace(/[^\d+]/g, "")}`} className="text-blue-400 hover:text-blue-300 underline">{entry.phone}</a>
            </DetailRow>
          )}
          {entry.projectType && <DetailRow label="Project type">{entry.projectType}</DetailRow>}
          {entry.eventDate && <DetailRow label="Event date">{formatDayLong(entry.eventDate)}</DetailRow>}
          {entry.location && <DetailRow label="Location">{entry.location}</DetailRow>}
          {entry.leadSource && <DetailRow label="Source">{entry.leadSource}</DetailRow>}
          {!isLead && entry.total != null && entry.total > 0 && <DetailRow label="Total">${entry.total.toFixed(2)}</DetailRow>}
          {isLead && entry.closedOutcome === "won" && (
            <DetailRow label="Outcome">
              <span className="inline-flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">Won</span>
              {entry.closedAt && <span className="text-xs text-muted-foreground ml-2">{formatReceived(entry.closedAt)}</span>}
            </DetailRow>
          )}
          {isLead && entry.closedOutcome === "lost" && (
            <DetailRow label="Outcome">
              <span className="inline-flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded bg-zinc-500/20 text-zinc-300 border border-zinc-500/40">
                Lost{entry.lostReason ? ` — ${entry.lostReason}` : ""}
              </span>
              {entry.lostReasonNote && <p className="text-xs text-muted-foreground mt-1">{entry.lostReasonNote}</p>}
            </DetailRow>
          )}
        </div>

        {/* Lead CRM fields — value, follow-up, close-out */}
        {isLead && (
          <div className="rounded-lg border border-border bg-background/40 p-3 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Expected value ($)</Label>
                <Input type="text" inputMode="decimal" value={valueStr} onChange={e => setValueStr(e.target.value)} className="bg-secondary border-border" placeholder="0" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Follow up on</Label>
                <DateField value={followUpDate} onChange={setFollowUpDate} className="bg-secondary border-border" />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Follow-up note</Label>
              <Input value={followUpNote} onChange={e => setFollowUpNote(e.target.value)} className="bg-secondary border-border" placeholder='e.g. "said call after Labor Day"' />
            </div>

            {entry.closedOutcome === "" && !lostPickerOpen && (
              <div className="flex gap-2 pt-1">
                <Button size="sm" variant="outline" className="flex-1 border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10" onClick={markWon} disabled={saving}>
                  Mark won
                </Button>
                <Button size="sm" variant="outline" className="flex-1 border-border text-muted-foreground hover:text-foreground" onClick={() => setLostPickerOpen(true)} disabled={saving}>
                  Mark lost
                </Button>
              </div>
            )}
            {entry.closedOutcome === "" && lostPickerOpen && (
              <div className="space-y-2 pt-1">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Why was it lost?</Label>
                    <Select value={lostReason} onValueChange={setLostReason}>
                      <SelectTrigger className="bg-secondary border-border"><SelectValue placeholder="Pick a reason" /></SelectTrigger>
                      <SelectContent>
                        {LOST_REASONS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Note (optional)</Label>
                    <Input value={lostNote} onChange={e => setLostNote(e.target.value)} className="bg-secondary border-border" />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" className="flex-1" onClick={() => { setLostPickerOpen(false); setLostReason(""); setLostNote(""); }} disabled={saving}>Cancel</Button>
                  <Button size="sm" variant="destructive" className="flex-1" onClick={markLost} disabled={saving || !lostReason}>Confirm lost</Button>
                </div>
              </div>
            )}
            {entry.closedOutcome !== "" && (
              <Button size="sm" variant="outline" className="w-full" onClick={reopen} disabled={saving}>Reopen</Button>
            )}
          </div>
        )}

        <div className="mt-1">
          <span className="block text-xs text-muted-foreground mb-1.5">Message</span>
          {entry.description ? (
            <div className="rounded-lg border border-border bg-background/40 p-3 max-h-64 overflow-y-auto">
              <p className="text-sm whitespace-pre-wrap break-words">{entry.description}</p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground italic">No message was included.</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Close</Button>
          {mailto && (
            <Button variant={dirty ? "outline" : "default"} asChild>
              <a href={mailto}>Reply by email</a>
            </Button>
          )}
          {isLead && (
            <Button onClick={saveDetails} disabled={!dirty || saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function PipelinePage() {
  const { data, addClient, addProposal, addPipelineLead, updatePipelineLead, deletePipelineLead } = useApp();
  const [, setLocation] = useLocation();
  const stages = data.organization?.pipelineStages?.length ? data.organization.pipelineStages : DEFAULT_PIPELINE_STAGES;
  const [activeStage, setActiveStage] = useState<string>("all");
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [detailEntry, setDetailEntry] = useState<PipelineEntry | null>(null);

  // Send proposal dialog
  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const [sendLeadId, setSendLeadId] = useState<string>("");
  const [sendTemplateId, setSendTemplateId] = useState<string>("");
  const [sending, setSending] = useState(false);

  // New lead form
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newType, setNewType] = useState("");
  const [newDate, setNewDate] = useState("");
  const [newSource, setNewSource] = useState("");
  const [newValue, setNewValue] = useState("");

  // Merge pipeline_leads + proposals into unified entries
  const entries = useMemo<PipelineEntry[]>(() => {
    const result: PipelineEntry[] = [];

    // Index contracts by proposalId so we can attach payment-lateness info
    // to the corresponding pipeline card. Only signed contracts (client_signed
    // or completed) can have overdue payments; drafts/voided don't.
    const liveContractsByProposalId = new Map(
      data.contracts
        .filter(c => c.proposalId && (c.status === "client_signed" || c.status === "completed"))
        .map(c => [c.proposalId as string, c]),
    );

    // Add pipeline leads
    const todayIso = isoDate(new Date());
    for (const lead of data.pipelineLeads) {
      const late = lead.proposalId
        ? computePaymentLateness(liveContractsByProposalId.get(lead.proposalId))
        : null;
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
        paymentLateDays: late?.days,
        paymentLateAmount: late?.amount,
        description: lead.description,
        createdAt: lead.createdAt,
        // total feeds the existing $ renderers (row + dialog) with zero new markup
        total: lead.expectedValue > 0 ? lead.expectedValue : undefined,
        expectedValue: lead.expectedValue,
        followUpDate: lead.followUpDate,
        followUpNote: lead.followUpNote,
        // A closed lead's follow-up is moot — don't badge it
        followUpStatus: lead.closedOutcome === "" ? classifyFollowUp(lead.followUpDate, todayIso) : null,
        closedOutcome: lead.closedOutcome,
        closedAt: lead.closedAt,
        lostReason: lead.lostReason,
        lostReasonNote: lead.lostReasonNote,
      });
    }

    // Add proposals that aren't linked to a lead. Skip proposals that have
    // a draft contract awaiting approval — those surface as contract_draft
    // cards in the "Awaiting Approval" column instead.
    const linkedProposalIds = new Set(data.pipelineLeads.map(l => l.proposalId).filter(Boolean));
    const proposalIdsWithDraftContract = new Set(
      data.contracts.filter(c => c.status === "draft" && c.proposalId).map(c => c.proposalId as string),
    );
    for (const prop of data.proposals) {
      if (linkedProposalIds.has(prop.id)) continue;
      if (proposalIdsWithDraftContract.has(prop.id)) continue;
      const client = data.clients.find(c => c.id === prop.clientId);
      const late = computePaymentLateness(liveContractsByProposalId.get(prop.id));
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
        paymentLateDays: late?.days,
        paymentLateAmount: late?.amount,
        createdAt: prop.createdAt,
      });
    }

    // Add auto-generated draft contracts as their own card type. These
    // surface in "Awaiting Approval" and link directly to the approval UI.
    const now = Date.now();
    for (const contract of data.contracts) {
      if (contract.status !== "draft" || !contract.proposalId) continue;
      const prop = data.proposals.find(p => p.id === contract.proposalId);
      if (!prop) continue;
      const client = data.clients.find(c => c.id === prop.clientId);
      const ageDays = (now - new Date(contract.createdAt).getTime()) / (1000 * 60 * 60 * 24);
      result.push({
        id: `contract-${contract.id}`,
        type: "contract_draft",
        name: client?.contactName || contract.title,
        email: contract.clientEmail || prop.clientEmail,
        phone: client?.phone || "",
        projectType: "",
        eventDate: null,
        location: "",
        leadSource: prop.leadSource || "",
        pipelineStage: "awaiting_approval",
        recentActivity: ageDays < 1
          ? "Draft contract just created"
          : ageDays < 3
          ? `Draft created ${Math.floor(ageDays)} day${Math.floor(ageDays) === 1 ? "" : "s"} ago`
          : `Draft pending ${Math.floor(ageDays)} days — needs review`,
        proposalId: prop.id,
        contractId: contract.id,
        total: prop.total,
        draftAge: ageDays,
        createdAt: contract.createdAt,
      });
    }

    return result;
  }, [data.pipelineLeads, data.proposals, data.clients, data.contracts]);

  // Won/lost leads leave the working board; a toggle brings them back.
  const [showClosed, setShowClosed] = useState(false);
  const openEntries = useMemo(() => entries.filter(e => !e.closedOutcome), [entries]);
  const closedCount = entries.length - openEntries.length;

  // Stage counts — open work only, so the buckets match the default view
  const stageCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of stages) counts[s.id] = 0;
    for (const e of openEntries) counts[e.pipelineStage] = (counts[e.pipelineStage] || 0) + 1;
    return counts;
  }, [openEntries, stages]);

  // Dollars in play per stage: open leads' expected value + unlinked proposals.
  const stageValues = useMemo(() => {
    const linkedProposalIds = new Set(data.pipelineLeads.map(l => l.proposalId).filter(Boolean));
    return pipelineValueByStage(
      data.pipelineLeads.filter(isOpenLead),
      data.proposals.filter(p => !linkedProposalIds.has(p.id)),
    );
  }, [data.pipelineLeads, data.proposals]);
  const valueInPlay = useMemo(() => totalPipelineValue(stageValues), [stageValues]);

  // Filtered entries
  const filtered = useMemo(() => {
    const pool = showClosed ? entries : openEntries;
    if (activeStage === "all") return pool;
    return pool.filter(e => e.pipelineStage === activeStage);
  }, [entries, openEntries, showClosed, activeStage]);

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
      expectedValue: parseFloat(newValue) || 0,
      followUpDate: null,
      followUpNote: "",
      closedOutcome: "",
      closedAt: null,
      lostReason: "",
      lostReasonNote: "",
    });
    toast.success("Lead added");
    setAddDialogOpen(false);
    setNewName(""); setNewEmail(""); setNewPhone(""); setNewType(""); setNewDate(""); setNewSource(""); setNewValue("");
  }

  async function changeStage(entry: PipelineEntry, newStage: PipelineStage) {
    if (entry.type === "lead") {
      await updatePipelineLead(entry.id, { pipelineStage: newStage, recentActivity: `Moved to ${newStage}`, recentActivityAt: new Date().toISOString() });
    }
    // For proposals, we'd update the proposal's pipelineStage
    toast.success(`Moved to ${stages.find(s => s.id === newStage)?.label}`);
  }

  async function deleteLead(id: string) {
    try {
      await deletePipelineLead(id);
      toast.success("Lead removed");
    } catch (e: any) {
      toast.error(e.message || "Failed to delete");
    }
  }

  function openSendProposal(leadId: string) {
    setSendLeadId(leadId);
    setSendTemplateId("");
    setSendDialogOpen(true);
  }

  async function sendProposalToLead() {
    const lead = data.pipelineLeads.find(l => l.id === sendLeadId);
    if (!lead) return;
    if (!lead.email) { toast.error("Lead has no email"); return; }
    setSending(true);

    try {
      // Find or create client
      let clientId = lead.clientId;
      if (!clientId) {
        const client = await addClient({
          company: lead.name, contactName: lead.name, email: lead.email, phone: lead.phone,
          address: "", city: "", state: "", zip: "",
          billingModel: "per_project" as any, billingRatePerHour: 0, perProjectRate: 0,
          projectTypeRates: [], allowedProjectTypeIds: [], defaultProjectTypeId: "", roleBillingMultipliers: [],
        });
        clientId = client.id;
        await updatePipelineLead(lead.id, { clientId });
      }

      // Get template data
      const tpl = sendTemplateId ? data.proposalTemplates.find(t => t.id === sendTemplateId) : null;

      // Create proposal
      const proposal = await addProposal({
        clientId,
        projectId: null,
        title: tpl?.name || `Proposal for ${lead.name}`,
        pages: tpl?.pages || [],
        packages: tpl?.packages || [],
        selectedPackageId: null,
        selectedPackageIds: [],
        paymentMilestones: defaultDepositMilestones(data.organization),
        sendHistory: [],
        inboundReplies: [],
        expiresAt: null,
        pipelineStage: "proposal_sent",
        viewedAt: null,
        leadSource: lead.leadSource,
        contractTemplateId: tpl?.contractTemplateId ?? null,
        lineItems: tpl?.lineItems || [],
        subtotal: 0, taxRate: 0, taxAmount: 0, total: 0,
        contractContent: tpl?.contractContent || "",
        paymentConfig: tpl?.paymentConfig || { option: "none", depositPercent: 0, depositAmount: 0 },
        status: "sent",
        sentAt: new Date().toISOString(),
        acceptedAt: null, completedAt: null,
        clientSignature: null, ownerSignature: null,
        invoiceId: null, stripeSessionId: null, paidAt: null,
        clientEmail: lead.email,
        viewToken: nanoid(32),
        notes: "",
      });

      // Send the email
      const token = await getAuthToken();
      const proposalUrl = `${window.location.origin}/proposal/${proposal.viewToken}`;
      const orgName = data.organization?.name || "";
      await fetch("/api/send-proposal-email", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          to: lead.email,
          proposalUrl,
          proposalTitle: proposal.title,
          total: proposal.total,
          paymentOption: proposal.paymentConfig.option,
          depositPercent: proposal.paymentConfig.depositPercent,
          orgName,
        }),
      });

      // Update lead
      await updatePipelineLead(lead.id, {
        pipelineStage: "proposal_sent",
        proposalId: proposal.id,
        recentActivity: "Proposal sent",
        recentActivityAt: new Date().toISOString(),
      });

      toast.success(`Proposal sent to ${lead.email}`);
      setSendDialogOpen(false);
    } catch (e: any) {
      toast.error(e.message || "Failed to send proposal");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-border bg-card/50">
        <div>
          <h1 className="text-xl font-semibold text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            Event Pipeline
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {openEntries.length} open · {filtered.length} shown
            {valueInPlay > 0 && <span className="text-emerald-400"> · ${valueInPlay.toLocaleString("en-US", { maximumFractionDigits: 0 })} in play</span>}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {closedCount > 0 && (
            <button
              onClick={() => setShowClosed(v => !v)}
              className={cn(
                "text-xs px-3 py-1.5 rounded-lg border transition-colors",
                showClosed ? "border-primary text-primary bg-primary/10" : "border-border text-muted-foreground hover:text-foreground"
              )}
            >
              {showClosed ? "Hide closed" : `Show closed (${closedCount})`}
            </button>
          )}
          <Button onClick={() => setAddDialogOpen(true)} className="gap-2">
            <Plus className="w-4 h-4" /> Add Lead
          </Button>
        </div>
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
            <div className="text-lg font-bold">{openEntries.length}</div>
            <div>All</div>
          </button>
          {stages.map(s => (
            <button
              key={s.id}
              onClick={() => setActiveStage(s.id)}
              className={cn(
                "px-3 py-2 rounded-lg border text-xs font-medium transition-colors min-w-[70px] text-center",
                activeStage === s.id ? `border ${COLOR_MAP[s.color] || COLOR_MAP.blue}` : "border-border text-muted-foreground hover:text-foreground"
              )}
            >
              <div className="text-lg font-bold">{stageCounts[s.id] || 0}</div>
              <div className="truncate">{s.label}</div>
              {(stageValues.get(s.id) ?? 0) > 0 && (
                <div className="text-[10px] font-mono text-emerald-400/80 mt-0.5">
                  ${(stageValues.get(s.id) ?? 0).toLocaleString("en-US", { maximumFractionDigits: 0 })}
                </div>
              )}
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
                const stage = stages.find(s => s.id === entry.pipelineStage);
                return (
                  <tr
                    key={entry.id}
                    onClick={() => setDetailEntry(entry)}
                    className="border-b border-border/50 hover:bg-card/30 transition-colors cursor-pointer"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-foreground">{entry.name}</span>
                        {entry.paymentLateDays != null && entry.paymentLateDays > 0 && (
                          <span
                            className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-500/20 text-red-300 border border-red-500/40 tabular-nums"
                            title={`Payment of $${(entry.paymentLateAmount ?? 0).toFixed(2)} is ${entry.paymentLateDays} days past due`}
                          >
                            {entry.paymentLateDays}d late
                          </span>
                        )}
                        {entry.followUpStatus?.kind === "overdue" && (
                          <span
                            className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-500/20 text-red-300 border border-red-500/40 tabular-nums"
                            title={entry.followUpNote || `Follow-up was due ${entry.followUpStatus.daysOverdue} day${entry.followUpStatus.daysOverdue === 1 ? "" : "s"} ago`}
                          >
                            {entry.followUpStatus.daysOverdue}d follow-up
                          </span>
                        )}
                        {entry.followUpStatus?.kind === "due_today" && (
                          <span
                            className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40"
                            title={entry.followUpNote || "Follow-up scheduled for today"}
                          >
                            Follow up today
                          </span>
                        )}
                        {entry.closedOutcome === "won" && (
                          <span className="inline-flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">Won</span>
                        )}
                        {entry.closedOutcome === "lost" && (
                          <span className="inline-flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded bg-zinc-500/20 text-zinc-300 border border-zinc-500/40" title={entry.lostReasonNote || undefined}>
                            Lost{entry.lostReason ? ` — ${entry.lostReason}` : ""}
                          </span>
                        )}
                      </div>
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
                          onClick={e => e.stopPropagation()}
                          onChange={e => changeStage(entry, e.target.value as PipelineStage)}
                          className={cn("text-[10px] font-semibold px-2 py-1 rounded border bg-transparent", COLOR_MAP[stage?.color || "blue"] || COLOR_MAP.blue)}
                        >
                          {stages.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                        </select>
                      ) : (
                        <span className={cn("text-[10px] font-semibold px-2 py-1 rounded border", COLOR_MAP[stage?.color || "blue"] || COLOR_MAP.blue)}>
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
                      {entry.type === "lead" && !entry.proposalId && (
                        <button onClick={e => { e.stopPropagation(); openSendProposal(entry.id); }} className="p-1 text-blue-400 hover:text-blue-300" title="Send Proposal">
                          <Send className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {entry.type === "lead" && (
                        <button onClick={e => { e.stopPropagation(); deleteLead(entry.id); }} className="p-1 text-muted-foreground hover:text-destructive">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {entry.type === "contract_draft" && entry.contractId && (
                        <button
                          onClick={e => { e.stopPropagation(); setLocation(`/contracts/${entry.contractId}/review`); }}
                          className={cn(
                            "px-2 py-1 text-[10px] font-semibold rounded border",
                            (entry.draftAge ?? 0) >= 3
                              ? "bg-red-500/10 text-red-400 border-red-500/30"
                              : (entry.draftAge ?? 0) >= 1
                              ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
                              : "bg-green-500/10 text-green-400 border-green-500/30"
                          )}
                          title="Review draft contract"
                        >
                          Review
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {/* Real Estate shoot pipeline — a second board under the event pipeline */}
        <div className="border-t border-border px-4 sm:px-6 py-5">
          <ReShootPipeline heading="Real Estate" />
        </div>
      </div>

      {/* Lead / entry detail — the only place the visitor's message is
          readable, and where a lead's CRM fields are edited. The key remounts
          the dialog per entry so its edit state seeds fresh from props — see
          the concurrency note on EntryDetailDialog. */}
      <EntryDetailDialog
        key={detailEntry?.id ?? "none"}
        entry={detailEntry}
        stageLabel={stages.find(s => s.id === detailEntry?.pipelineStage)?.label || detailEntry?.pipelineStage || ""}
        onClose={() => setDetailEntry(null)}
        updateLead={updatePipelineLead}
      />

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
                <DateField value={newDate} onChange={setNewDate} className="bg-secondary border-border" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Lead Source</Label>
                <Input value={newSource} onChange={e => setNewSource(e.target.value)} className="bg-secondary border-border" placeholder="e.g. Instagram" />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Expected Value ($)</Label>
              <Input type="text" inputMode="decimal" value={newValue} onChange={e => setNewValue(e.target.value)} className="bg-secondary border-border" placeholder="What this job would be worth if it books" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAddDialogOpen(false)}>Cancel</Button>
            <Button onClick={createLead}>Add Lead</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Send Proposal Dialog */}
      <Dialog open={sendDialogOpen} onOpenChange={setSendDialogOpen}>
        <DialogContent className="bg-card border-border text-foreground max-w-sm">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Send Proposal</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {(() => {
              const lead = data.pipelineLeads.find(l => l.id === sendLeadId);
              return lead ? (
                <div className="bg-secondary/50 rounded-lg p-3">
                  <p className="text-sm font-medium text-foreground">{lead.name}</p>
                  <p className="text-xs text-muted-foreground">{lead.email}</p>
                </div>
              ) : null;
            })()}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Template</Label>
              <Select value={sendTemplateId} onValueChange={setSendTemplateId}>
                <SelectTrigger className="bg-secondary border-border"><SelectValue placeholder="Select a template..." /></SelectTrigger>
                <SelectContent className="bg-popover border-border">
                  {data.proposalTemplates.map(t => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {data.proposalTemplates.length === 0 && (
                <p className="text-[10px] text-muted-foreground">No templates yet. Create one in Sales → Proposals → Templates.</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSendDialogOpen(false)}>Cancel</Button>
            <Button onClick={sendProposalToLead} disabled={sending} className="gap-2">
              <Send className="w-4 h-4" />
              {sending ? "Sending..." : "Send Proposal"}
            </Button>
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

/**
 * Walk a contract's payment_milestones, find the most-overdue unpaid one,
 * and return how many days late it is + its amount. Returns null if the
 * contract has no overdue unpaid milestones (or no contract at all).
 */
function computePaymentLateness(contract: Contract | undefined): { days: number; amount: number } | null {
  if (!contract) return null;
  const milestones = contract.paymentMilestones;
  if (!Array.isArray(milestones) || milestones.length === 0) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayMs = today.getTime();

  // Quickly compute the contract total from fixed milestones (used to
  // resolve percent milestone amounts).
  let total = 0;
  for (const m of milestones) {
    if (m.type === "fixed") total += Number(m.fixedAmount ?? 0);
  }

  let maxDaysLate = 0;
  let maxDaysAmount = 0;
  for (const m of milestones) {
    if (m.paidAt) continue;
    if (m.dueType === "at_signing") continue;
    let dueIso: string | null = null;
    if (m.dueType === "absolute_date") dueIso = m.dueDate || null;
    else if (m.dueType === "relative_days" && contract.clientSignedAt) {
      const d = new Date(contract.clientSignedAt);
      d.setDate(d.getDate() + (m.dueDays ?? 0));
      dueIso = d.toISOString().slice(0, 10);
    }
    if (!dueIso) continue;
    const dueMs = new Date(dueIso + "T00:00:00").getTime();
    const daysLate = Math.floor((todayMs - dueMs) / 86_400_000);
    if (daysLate <= 0) continue;
    const amount = m.type === "percent"
      ? Math.round(total * (m.percent ?? 0) / 100 * 100) / 100
      : Number(m.fixedAmount ?? 0);
    if (daysLate > maxDaysLate) {
      maxDaysLate = daysLate;
      maxDaysAmount = amount;
    }
  }
  return maxDaysLate > 0 ? { days: maxDaysLate, amount: maxDaysAmount } : null;
}
