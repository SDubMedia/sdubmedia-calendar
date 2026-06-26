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
import { DollarSign } from "lucide-react";
import { getCrewMemberProjectPay, getCrewProjectPaid, getCrewProjectRemaining } from "@/lib/data";
import {
  PAYMENT_METHOD_LABELS as METHOD_LABELS,
  type CrewMember, type CrewPayment, type ContractorPaymentMethod, type Project, type ProjectType, type Location,
} from "@/lib/types";

interface Props {
  crewMembers: CrewMember[];
  projects: Project[];
  projectTypes: ProjectType[];
  locations: Location[];
  crewPayments: CrewPayment[];
  open: boolean;
  onClose: () => void;
  onConfirm: (input: Omit<CrewPayment, "id" | "createdAt">) => Promise<void>;
  // When set + the member has Stripe payouts enabled + method is Stripe, the
  // confirm button sends a REAL ACH payout (recorded server-side) instead of
  // just logging a manual payment.
  onStripePay?: (input: Omit<CrewPayment, "id" | "createdAt">) => Promise<void>;
  // Send / open the crew member's Stripe direct-deposit setup link.
  onSetupStripe?: (crewMemberId: string) => Promise<void>;
  // Optional pre-target — when opened from an outstanding-balance row, jump
  // straight to that member + project instead of starting blank.
  initialCrewMemberId?: string;
  initialProjectId?: string;
}

function todayLocal(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export default function LogCrewPaymentDialog({
  crewMembers, projects, projectTypes, locations, crewPayments, open, onClose, onConfirm,
  onStripePay, onSetupStripe, initialCrewMemberId, initialProjectId,
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
      const cm = initialCrewMemberId || "";
      const pj = initialCrewMemberId ? (initialProjectId || "") : "";
      setCrewMemberId(cm);
      setProjectId(pj);
      // Pre-fill amount with the remaining balance when a project is targeted.
      let amt = "";
      let meth: ContractorPaymentMethod = "venmo";
      if (cm) {
        const cmObj = crewMembers.find(c => c.id === cm);
        if (cmObj?.preferredPaymentMethod) meth = cmObj.preferredPaymentMethod;
        if (pj) {
          const p = projects.find(x => x.id === pj);
          if (p) {
            const rem = getCrewProjectRemaining(p, cm, crewPayments);
            amt = rem ? String(Math.round(rem * 100) / 100) : "";
          }
        }
      }
      setAmount(amt);
      setMethod(meth);
      setPaidDate(todayLocal());
      setReference("");
      setNote("");
      setSaving(false);
    }
    wasOpen.current = open;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const crewMember = crewMembers.find(c => c.id === crewMemberId) || null;

  // Projects this crew member worked (on-site or post) that still have a
  // balance owing — fully-paid projects drop off so you can't over-pay, but
  // partially-paid ones stay (with their remaining balance) so you can finish
  // paying them.
  const memberProjects = crewMemberId
    ? projects
        .filter(p =>
          ((p.crew || []).some(e => e.crewMemberId === crewMemberId) ||
           (p.postProduction || []).some(e => e.crewMemberId === crewMemberId)) &&
          getCrewProjectRemaining(p, crewMemberId, crewPayments) > 0)
        .sort((a, b) => b.date.localeCompare(a.date))
    : [];

  const selectedProject = projects.find(p => p.id === projectId) || null;
  const selectedOwed = selectedProject ? getCrewMemberProjectPay(selectedProject, crewMemberId) : 0;
  const selectedPaid = selectedProject ? getCrewProjectPaid(crewPayments, crewMemberId, selectedProject.id) : 0;
  const selectedRemaining = selectedProject ? getCrewProjectRemaining(selectedProject, crewMemberId, crewPayments) : 0;

  const fmt = (n: number) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const projectLabel = (p: Project): string => {
    const typeName = projectTypes.find(t => t.id === p.projectTypeId)?.name ?? "Project";
    const locName = locations.find(l => l.id === p.locationId)?.name;
    const dateStr = new Date(p.date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    const rem = getCrewProjectRemaining(p, crewMemberId, crewPayments);
    const owed = getCrewMemberProjectPay(p, crewMemberId);
    // Show remaining when it's a partial (less than full owed), so look-alike
    // recurring projects are distinguishable and you see what's left.
    const balTag = rem > 0 && rem < owed ? ` · ${fmt(rem)} left` : "";
    return `${typeName}${locName ? ` · ${locName}` : ""} · ${dateStr}${balTag}`;
  };

  // Role this member held on the selected project (for display/snapshot).
  const memberRole = (p: Project): string => {
    const c = (p.crew || []).find(e => e.crewMemberId === crewMemberId);
    if (c) return c.role;
    const post = (p.postProduction || []).find(e => e.crewMemberId === crewMemberId);
    return post?.role || "";
  };

  // When a project is picked, prefill amount with the remaining balance.
  function selectProject(id: string) {
    setProjectId(id);
    const p = memberProjects.find(x => x.id === id);
    if (p) {
      const rem = getCrewProjectRemaining(p, crewMemberId, crewPayments);
      setAmount(rem ? String(Math.round(rem * 100) / 100) : "");
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


  const parsedAmount = parseFloat(amount);
  const canSave = !!crewMemberId && !!projectId && !isNaN(parsedAmount) && parsedAmount > 0 && !!paidDate;

  // Stripe path: real ACH payout when the member is set up; setup prompt if not.
  const isStripePay = method === "stripe" && !!crewMember?.stripePayoutsEnabled && !!onStripePay;
  const stripeNeedsSetup = method === "stripe" && !crewMember?.stripePayoutsEnabled;

  async function confirm() {
    if (!canSave || !selectedProject) return; // validate BEFORE setSaving
    setSaving(true);
    try {
      const input = {
        crewMemberId,
        projectId,
        role: memberRole(selectedProject) || undefined,
        amount: parsedAmount,
        paymentMethod: method,
        paidAt: new Date(paidDate + "T12:00:00").toISOString(),
        reference: reference.trim() || undefined,
        note: note.trim() || undefined,
      };
      // Real payout records the crew_payment server-side; manual log uses onConfirm.
      if (isStripePay) await onStripePay!(input);
      else await onConfirm(input);
      onClose();
    } catch {
      // The handler already surfaced the error (toast); keep the dialog open so
      // the owner can retry or switch methods.
    } finally {
      setSaving(false);
    }
  }

  async function sendSetupLink() {
    if (!crewMemberId || !onSetupStripe) return;
    setSaving(true);
    try { await onSetupStripe(crewMemberId); } finally { setSaving(false); }
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
                  <div className="px-3 py-2 text-xs text-muted-foreground">No unpaid projects for this member.</div>
                ) : memberProjects.map(p => (
                  <SelectItem key={p.id} value={p.id}>{projectLabel(p)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {crewMemberId && memberProjects.length === 0 && (
              <p className="text-[11px] text-muted-foreground">
                Nothing outstanding — every project for this member is fully paid.
              </p>
            )}
          </div>

          {/* Owed / paid / remaining for the selected project. */}
          {selectedProject && (
            <div className="rounded-md border border-border bg-secondary/40 p-2.5 text-xs flex items-center justify-between">
              <span className="text-muted-foreground">Owed {fmt(selectedOwed)}{selectedPaid > 0 ? ` · paid ${fmt(selectedPaid)}` : ""}</span>
              <span className="font-semibold text-foreground">{fmt(selectedRemaining)} left</span>
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
            {isStripePay && (
              <p className="text-[11px] text-emerald-600 dark:text-emerald-400">
                This sends a real ACH deposit to {crewMember?.name || "their"} bank (~1–2 business days).
              </p>
            )}
            {stripeNeedsSetup && (
              <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-2.5 text-xs space-y-2">
                <p className="text-amber-600 dark:text-amber-300">
                  {crewMember?.name || "This person"} hasn't set up direct deposit yet — send a setup link, or pick another method to just log the payment.
                </p>
                {onSetupStripe && crewMemberId && (
                  <Button type="button" variant="outline" size="sm" disabled={saving} onClick={sendSetupLink}>
                    Send setup link
                  </Button>
                )}
              </div>
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
            {saving ? (isStripePay ? "Paying…" : "Saving…") : isStripePay ? `Pay ${fmt(parsedAmount || 0)} via Stripe` : "Log Payment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
