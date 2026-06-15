// ============================================================
// LogCrewPaymentDialog — owner records a direct payment to a crew
// member for a specific project, WITHOUT waiting on a submitted
// contractor invoice. Slate doesn't move money — this is the owner's
// record of who was paid, how, when, and for which project. The amount
// pre-fills to what that member is owed on the chosen project.
// ============================================================

import { useEffect, useRef, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DollarSign, AlertTriangle } from "lucide-react";
import { getCrewMemberProjectPay } from "@/lib/data";
import type {
  CrewMember, CrewPayment, ContractorPaymentMethod, Project, ProjectType, Location,
} from "@/lib/types";

const METHOD_LABELS: Record<ContractorPaymentMethod, string> = {
  venmo: "Venmo",
  zelle: "Zelle",
  check: "Check",
  cash: "Cash",
  bank_transfer: "Bank Transfer (ACH)",
  stripe: "Stripe Transfer",
  other: "Other",
};

interface Props {
  crewMembers: CrewMember[];
  projects: Project[];
  projectTypes: ProjectType[];
  locations: Location[];
  crewPayments: CrewPayment[];
  open: boolean;
  onClose: () => void;
  onConfirm: (input: Omit<CrewPayment, "id" | "createdAt">) => Promise<void>;
}

function todayLocal(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export default function LogCrewPaymentDialog({
  crewMembers, projects, projectTypes, locations, crewPayments, open, onClose, onConfirm,
}: Props) {
  const [crewMemberId, setCrewMemberId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<ContractorPaymentMethod>("venmo");
  const [paidDate, setPaidDate] = useState(todayLocal());
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  // Reset only on an open transition — not on every render/realtime tick,
  // which would wipe the form mid-edit (project convention).
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current) {
      setCrewMemberId("");
      setProjectId("");
      setAmount("");
      setMethod("venmo");
      setPaidDate(todayLocal());
      setReference("");
      setNote("");
      setSaving(false);
    }
    wasOpen.current = open;
  }, [open]);

  const crewMember = crewMembers.find(c => c.id === crewMemberId) || null;

  // Projects this crew member actually worked (on-site or post).
  const memberProjects = crewMemberId
    ? projects
        .filter(p =>
          (p.crew || []).some(e => e.crewMemberId === crewMemberId) ||
          (p.postProduction || []).some(e => e.crewMemberId === crewMemberId))
        .sort((a, b) => b.date.localeCompare(a.date))
    : [];

  const selectedProject = memberProjects.find(p => p.id === projectId) || null;

  const projectLabel = (p: Project): string => {
    const typeName = projectTypes.find(t => t.id === p.projectTypeId)?.name ?? "Project";
    const locName = locations.find(l => l.id === p.locationId)?.name;
    const dateStr = new Date(p.date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    return `${typeName}${locName ? ` · ${locName}` : ""} · ${dateStr}`;
  };

  // Role this member held on the selected project (for display/snapshot).
  const memberRole = (p: Project): string => {
    const c = (p.crew || []).find(e => e.crewMemberId === crewMemberId);
    if (c) return c.role;
    const post = (p.postProduction || []).find(e => e.crewMemberId === crewMemberId);
    return post?.role || "";
  };

  // When a project is picked, prefill amount with what they're owed.
  function selectProject(id: string) {
    setProjectId(id);
    const p = memberProjects.find(x => x.id === id);
    if (p) {
      const owed = getCrewMemberProjectPay(p, crewMemberId);
      setAmount(owed ? String(owed) : "");
      if (crewMember?.preferredPaymentMethod) setMethod(crewMember.preferredPaymentMethod);
    }
  }

  // When the crew member changes, reset project-dependent fields.
  function selectCrewMember(id: string) {
    setCrewMemberId(id);
    setProjectId("");
    setAmount("");
    const cm = crewMembers.find(c => c.id === id);
    if (cm?.preferredPaymentMethod) setMethod(cm.preferredPaymentMethod);
  }

  const alreadyLogged = crewMemberId && projectId
    ? crewPayments.some(cp => cp.crewMemberId === crewMemberId && cp.projectId === projectId)
    : false;

  const parsedAmount = parseFloat(amount);
  const canSave = !!crewMemberId && !!projectId && !isNaN(parsedAmount) && parsedAmount > 0 && !!paidDate;

  async function confirm() {
    if (!canSave || !selectedProject) return; // validate BEFORE setSaving
    setSaving(true);
    try {
      await onConfirm({
        crewMemberId,
        projectId,
        role: memberRole(selectedProject) || undefined,
        amount: parsedAmount,
        paymentMethod: method,
        paidAt: new Date(paidDate + "T12:00:00").toISOString(),
        reference: reference.trim() || undefined,
        note: note.trim() || undefined,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            <DollarSign className="w-5 h-5 text-green-500" />
            Log a staff payment
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-foreground">Crew member</Label>
            <Select value={crewMemberId} onValueChange={selectCrewMember}>
              <SelectTrigger className="bg-secondary border-border">
                <SelectValue placeholder="Choose a crew member" />
              </SelectTrigger>
              <SelectContent className="bg-popover border-border">
                {crewMembers.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-foreground">Project</Label>
            <Select value={projectId} onValueChange={selectProject} disabled={!crewMemberId}>
              <SelectTrigger className="bg-secondary border-border">
                <SelectValue placeholder={crewMemberId ? "Choose a project" : "Pick a crew member first"} />
              </SelectTrigger>
              <SelectContent className="bg-popover border-border">
                {memberProjects.length === 0 ? (
                  <div className="px-3 py-2 text-xs text-muted-foreground">No projects for this member.</div>
                ) : memberProjects.map(p => (
                  <SelectItem key={p.id} value={p.id}>{projectLabel(p)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {alreadyLogged && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs text-amber-300 flex items-start gap-2">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>A direct payment is already logged for this person on this project. Logging another will record a second payment.</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-foreground">Amount</Label>
              <Input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="decimal"
                type="text"
                placeholder="0.00"
                className="bg-secondary border-border tabular-nums"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-foreground">Date paid</Label>
              <Input
                value={paidDate}
                onChange={(e) => setPaidDate(e.target.value)}
                type="date"
                className="bg-secondary border-border"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-foreground">Payment method</Label>
            <Select value={method} onValueChange={(v) => setMethod(v as ContractorPaymentMethod)}>
              <SelectTrigger className="bg-secondary border-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-popover border-border">
                {(Object.keys(METHOD_LABELS) as ContractorPaymentMethod[]).map(k => (
                  <SelectItem key={k} value={k}>{METHOD_LABELS[k]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {crewMember?.preferredPaymentMethod && (
              <p className="text-[11px] text-muted-foreground">
                Prefers {METHOD_LABELS[crewMember.preferredPaymentMethod]}
                {crewMember.preferredPaymentDetails ? ` · ${crewMember.preferredPaymentDetails}` : ""}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-foreground">Reference / note <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Check #, transaction ID, etc."
              className="bg-secondary border-border"
            />
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Note (optional)"
              className="bg-secondary border-border"
            />
          </div>
        </div>

        <DialogFooter className="flex-col-reverse sm:flex-row gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={confirm} disabled={saving || !canSave} className="bg-green-600 text-white hover:bg-green-500">
            {saving ? "Saving..." : "Log Payment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
