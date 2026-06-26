// ============================================================
// StaffPaymentsPage — owner-only. Log and review direct payments to
// crew members, tied to a specific project. Complements the
// staff-submitted Contractor Invoices flow: here the OWNER records a
// payment proactively (e.g. "paid Antonio $200 for the June 6 wedding")
// without waiting on a submitted invoice.
//
// Two halves:
//   • Outstanding — who's still owed, per project (owed − already paid).
//   • Logged — the history of payments recorded, editable.
// The owner's own crew entries are excluded (you don't owe yourself).
// ============================================================

import { useMemo, useState } from "react";
import { useScopedData as useApp } from "@/hooks/useScopedData";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DollarSign, Trash2, Pencil, User, Plus, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import LogCrewPaymentDialog from "@/components/LogCrewPaymentDialog";
import EditCrewPaymentDialog from "@/components/EditCrewPaymentDialog";
import { getCrewMemberProjectPay, getCrewProjectPaid, getCrewProjectRemaining } from "@/lib/data";
import { getAuthToken } from "@/lib/supabase";
import { PAYMENT_METHOD_LABELS as METHOD_LABELS, type CrewPayment, type Project } from "@/lib/types";

function formatCurrency(n: number): string {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

interface OutstandingItem {
  project: Project;
  crewMemberId: string;
  owed: number;
  paid: number;
  remaining: number;
}

export default function StaffPaymentsPage() {
  const { data, addCrewPayment, updateCrewPayment, deleteCrewPayment, refresh } = useApp();
  const { profile } = useAuth();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [preTarget, setPreTarget] = useState<{ crewMemberId: string; projectId: string } | null>(null);
  const [editPayment, setEditPayment] = useState<CrewPayment | null>(null);

  // The owner's own linked crew member — exclude from "what you owe" (you
  // don't pay yourself). Fall back to email match if no direct link.
  const ownerEmail = profile?.email?.trim().toLowerCase() || "";
  const ownerCrewId = profile?.crewMemberId
    || data.crewMembers.find(c => c.email && c.email.trim().toLowerCase() === ownerEmail && ownerEmail !== "")?.id
    || "";

  const crewName = (id: string) => data.crewMembers.find(c => c.id === id)?.name || "Unknown";
  const projectLabel = (id: string): string => {
    const p = data.projects.find(x => x.id === id);
    if (!p) return "Unknown project";
    const typeName = data.projectTypes.find(t => t.id === p.projectTypeId)?.name ?? "Project";
    const dateStr = new Date(p.date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    return `${typeName} · ${dateStr}`;
  };

  const payments = useMemo(
    () => [...data.crewPayments].sort((a, b) => b.paidAt.localeCompare(a.paidAt)),
    [data.crewPayments],
  );
  const totalPaid = payments.reduce((s, p) => s + p.amount, 0);

  // Outstanding: every (member, project) with a balance still owing.
  const outstanding = useMemo<OutstandingItem[]>(() => {
    const items: OutstandingItem[] = [];
    for (const p of data.projects) {
      if (p.status === "cancelled") continue;
      const memberIds = new Set<string>();
      (p.crew || []).forEach(e => { if (e.role !== "Travel") memberIds.add(e.crewMemberId); });
      (p.postProduction || []).forEach(e => { if (e.role !== "Travel") memberIds.add(e.crewMemberId); });
      for (const mid of Array.from(memberIds)) {
        if (mid === ownerCrewId) continue; // don't owe yourself
        const remaining = getCrewProjectRemaining(p, mid, data.crewPayments);
        if (remaining > 0) {
          items.push({
            project: p,
            crewMemberId: mid,
            owed: getCrewMemberProjectPay(p, mid),
            paid: getCrewProjectPaid(data.crewPayments, mid, p.id),
            remaining,
          });
        }
      }
    }
    return items.sort((a, b) => b.project.date.localeCompare(a.project.date));
  }, [data.projects, data.crewPayments, ownerCrewId]);

  const totalOwed = outstanding.reduce((s, o) => s + o.remaining, 0);

  function openLogBlank() {
    setPreTarget(null);
    setDialogOpen(true);
  }
  function openLogFor(crewMemberId: string, projectId: string) {
    setPreTarget({ crewMemberId, projectId });
    setDialogOpen(true);
  }

  async function handleConfirm(input: Omit<CrewPayment, "id" | "createdAt">) {
    try {
      const created = await addCrewPayment(input);
      toast.success(`Logged ${formatCurrency(created.amount)} to ${crewName(created.crewMemberId)}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to log payment");
    }
  }

  // Real ACH payout via Stripe. The endpoint moves the money AND records the
  // crew_payment, so we just refresh after. Rethrows so the dialog stays open
  // on failure.
  async function handleStripePay(input: Omit<CrewPayment, "id" | "createdAt">) {
    try {
      const token = await getAuthToken();
      const res = await fetch("/api/crew-payout-pay", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          crewMemberId: input.crewMemberId,
          amount: input.amount,
          projectId: input.projectId,
          role: input.role,
          note: input.note,
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      const body = await res.json().catch(() => ({ error: "Payout failed" }));
      if (!res.ok) throw new Error(body.error || "Payout failed");
      toast.success(`Paid ${formatCurrency(input.amount)} to ${crewName(input.crewMemberId)} via Stripe`);
      if (body.warning) toast.warning(body.warning);
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Payout failed");
      throw err;
    }
  }

  // Owner creates the crew member's Stripe onboarding link and copies it to send.
  async function handleSetupStripe(crewMemberId: string) {
    try {
      const token = await getAuthToken();
      const res = await fetch("/api/crew-payout-onboard", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ crewMemberId, returnUrl: `${window.location.origin}/staff-payments` }),
      });
      const body = await res.json().catch(() => ({ error: "Failed" }));
      if (!res.ok || !body.url) throw new Error(body.error || "Couldn't create setup link");
      await navigator.clipboard.writeText(body.url).catch(() => { /* clipboard may be blocked */ });
      toast.success(`Setup link copied — send it to ${crewName(crewMemberId)} to finish their direct deposit.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't create setup link");
    }
  }

  async function handleSaveEdit(id: string, patch: Partial<CrewPayment>) {
    try {
      await updateCrewPayment(id, patch);
      toast.success("Payment updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update payment");
    }
  }

  async function handleDelete(p: CrewPayment) {
    try {
      await deleteCrewPayment(p.id);
      toast.success("Payment removed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove payment");
    }
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            Staff Payments
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Track what you've paid each crew member — and what you still owe — per project.
          </p>
        </div>
        <Button onClick={openLogBlank} className="gap-1.5">
          <Plus className="w-4 h-4" /> Log Payment
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <div className="bg-secondary rounded-lg p-4">
          <div className="text-xs text-muted-foreground uppercase tracking-wider">Still Owed</div>
          <div className="text-2xl font-bold mt-1 text-amber-300 tabular-nums" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            {formatCurrency(totalOwed)}
          </div>
        </div>
        <div className="bg-secondary rounded-lg p-4">
          <div className="text-xs text-muted-foreground uppercase tracking-wider">Total Paid</div>
          <div className="text-2xl font-bold mt-1 text-green-300 tabular-nums" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            {formatCurrency(totalPaid)}
          </div>
        </div>
        <div className="bg-secondary rounded-lg p-4">
          <div className="text-xs text-muted-foreground uppercase tracking-wider">Payments Logged</div>
          <div className="text-2xl font-bold mt-1 tabular-nums" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            {payments.length}
          </div>
        </div>
      </div>

      {/* ===== Outstanding (still owe) ===== */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Still to pay</h2>
        {outstanding.length === 0 ? (
          <div className="bg-secondary/50 rounded-lg p-6 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-green-400" /> Everyone's paid up — nothing outstanding.
          </div>
        ) : (
          <div className="space-y-2">
            {outstanding.map(o => (
              <div key={`${o.crewMemberId}::${o.project.id}`} className="bg-secondary rounded-lg p-4 flex items-center justify-between gap-4 flex-wrap sm:flex-nowrap">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <User className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="font-medium text-sm">{crewName(o.crewMemberId)}</span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">{projectLabel(o.project.id)}</div>
                  {o.paid > 0 && (
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      {formatCurrency(o.paid)} of {formatCurrency(o.owed)} paid
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <div className="text-right">
                    <div className="text-lg font-bold tabular-nums text-amber-300" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                      {formatCurrency(o.remaining)}
                    </div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">owed</div>
                  </div>
                  <Button size="sm" onClick={() => openLogFor(o.crewMemberId, o.project.id)} className="gap-1 bg-green-600 text-white hover:bg-green-500">
                    <DollarSign className="w-3.5 h-3.5" /> Pay
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ===== Logged payments ===== */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Logged payments</h2>
        {payments.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <DollarSign className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <div className="text-sm">No payments logged yet.</div>
          </div>
        ) : (
          <div className="space-y-3">
            {payments.map(p => (
              <div key={p.id} className="bg-secondary rounded-lg p-4 flex items-center justify-between gap-4 flex-wrap sm:flex-nowrap">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <User className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="font-medium text-sm">{crewName(p.crewMemberId)}</span>
                    {p.role && <Badge className="bg-secondary text-muted-foreground border-border">{p.role}</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">{projectLabel(p.projectId)}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Paid {new Date(p.paidAt).toLocaleDateString()} via {METHOD_LABELS[p.paymentMethod] || p.paymentMethod}
                    {p.reference ? ` · ${p.reference}` : ""}
                  </div>
                  {p.note && <div className="text-xs text-muted-foreground mt-0.5 italic">{p.note}</div>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-lg font-bold tabular-nums text-green-300" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                    {formatCurrency(p.amount)}
                  </span>
                  <Button size="sm" variant="ghost" onClick={() => setEditPayment(p)} className="text-muted-foreground hover:text-foreground" title="Edit payment">
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => handleDelete(p)} className="text-muted-foreground hover:text-red-400" title="Remove payment">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <LogCrewPaymentDialog
        crewMembers={data.crewMembers}
        projects={data.projects}
        projectTypes={data.projectTypes}
        locations={data.locations}
        crewPayments={data.crewPayments}
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setPreTarget(null); }}
        onConfirm={handleConfirm}
        onStripePay={handleStripePay}
        onSetupStripe={handleSetupStripe}
        initialCrewMemberId={preTarget?.crewMemberId}
        initialProjectId={preTarget?.projectId}
      />

      <EditCrewPaymentDialog
        payment={editPayment}
        crewName={editPayment ? crewName(editPayment.crewMemberId) : ""}
        projectLabel={editPayment ? projectLabel(editPayment.projectId) : ""}
        open={!!editPayment}
        onClose={() => setEditPayment(null)}
        onSave={handleSaveEdit}
      />
    </div>
  );
}
