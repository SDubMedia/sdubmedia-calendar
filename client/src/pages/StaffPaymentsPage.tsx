// ============================================================
// StaffPaymentsPage — owner-only. Log and review direct payments to
// crew members, tied to a specific project. Complements the
// staff-submitted Contractor Invoices flow: here the OWNER records a
// payment proactively (e.g. "paid Antonio $200 for the June 6 wedding")
// without waiting on a submitted invoice. The contractor-invoice review
// page warns when a project here was already paid, to avoid double-paying.
// ============================================================

import { useMemo, useState } from "react";
import { useScopedData as useApp } from "@/hooks/useScopedData";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DollarSign, Trash2, User, Plus } from "lucide-react";
import { toast } from "sonner";
import LogCrewPaymentDialog from "@/components/LogCrewPaymentDialog";
import type { CrewPayment, ContractorPaymentMethod } from "@/lib/types";

const METHOD_LABELS: Record<ContractorPaymentMethod, string> = {
  venmo: "Venmo",
  zelle: "Zelle",
  check: "Check",
  cash: "Cash",
  bank_transfer: "Bank Transfer",
  stripe: "Stripe",
  other: "Other",
};

function formatCurrency(n: number): string {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function StaffPaymentsPage() {
  const { data, addCrewPayment, deleteCrewPayment } = useApp();
  const [dialogOpen, setDialogOpen] = useState(false);

  const payments = useMemo(
    () => [...data.crewPayments].sort((a, b) => b.paidAt.localeCompare(a.paidAt)),
    [data.crewPayments],
  );
  const totalPaid = payments.reduce((s, p) => s + p.amount, 0);

  const crewName = (id: string) => data.crewMembers.find(c => c.id === id)?.name || "Unknown";
  const projectLabel = (id: string): string => {
    const p = data.projects.find(x => x.id === id);
    if (!p) return "Unknown project";
    const typeName = data.projectTypes.find(t => t.id === p.projectTypeId)?.name ?? "Project";
    const dateStr = new Date(p.date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    return `${typeName} · ${dateStr}`;
  };

  async function handleConfirm(input: Omit<CrewPayment, "id" | "createdAt">) {
    try {
      const created = await addCrewPayment(input);
      toast.success(`Logged ${formatCurrency(created.amount)} to ${crewName(created.crewMemberId)}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to log payment");
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
            Record what you've paid each crew member, per project.
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)} className="gap-1.5">
          <Plus className="w-4 h-4" /> Log Payment
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 sm:max-w-md">
        <div className="bg-secondary rounded-lg p-4">
          <div className="text-xs text-muted-foreground uppercase tracking-wider">Payments Logged</div>
          <div className="text-2xl font-bold mt-1 tabular-nums" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            {payments.length}
          </div>
        </div>
        <div className="bg-secondary rounded-lg p-4">
          <div className="text-xs text-muted-foreground uppercase tracking-wider">Total Paid</div>
          <div className="text-2xl font-bold mt-1 text-green-300 tabular-nums" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            {formatCurrency(totalPaid)}
          </div>
        </div>
      </div>

      {/* Payment list */}
      {payments.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <DollarSign className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <div className="text-sm">No payments logged yet.</div>
          <div className="text-xs mt-1">Click “Log Payment” to record one.</div>
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
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-lg font-bold tabular-nums text-green-300" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                  {formatCurrency(p.amount)}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleDelete(p)}
                  className="text-muted-foreground hover:text-red-400"
                  title="Remove payment"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <LogCrewPaymentDialog
        crewMembers={data.crewMembers}
        projects={data.projects}
        projectTypes={data.projectTypes}
        locations={data.locations}
        crewPayments={data.crewPayments}
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onConfirm={handleConfirm}
      />
    </div>
  );
}
