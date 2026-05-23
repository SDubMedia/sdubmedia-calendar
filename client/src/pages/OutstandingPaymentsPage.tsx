// ============================================================
// OutstandingPaymentsPage — every contract with at least one unpaid
// past-due milestone, sorted by days-late descending. Owner / partner
// only. Source of truth for "who owes me money right now".
// ============================================================

import { useMemo, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { useLocation } from "wouter";
import { AlertCircle, ExternalLink, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

interface OverduePayment {
  contractId: string;
  contractTitle: string;
  clientName: string;
  clientEmail: string;
  milestoneId: string;
  milestoneLabel: string;
  amount: number;
  dueDate: string | null;       // ISO YYYY-MM-DD
  daysLate: number;
}

export default function OutstandingPaymentsPage() {
  const { data } = useApp();
  const [, setLocation] = useLocation();
  const [sending, setSending] = useState<string | null>(null);

  async function sendReminder(row: OverduePayment) {
    const key = `${row.contractId}-${row.milestoneId}`;
    if (sending) return;
    setSending(key);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) { toast.error("Not signed in"); return; }
      const resp = await fetch("/api/send-payment-reminder", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ contractId: row.contractId, milestoneId: row.milestoneId }),
      });
      const body = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        toast.error(body.error || "Failed to send reminder");
        return;
      }
      toast.success(`Reminder sent to ${row.clientEmail}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send reminder");
    } finally {
      setSending(null);
    }
  }

  const rows = useMemo<OverduePayment[]>(() => {
    const out: OverduePayment[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayMs = today.getTime();

    for (const contract of data.contracts) {
      // Only signed contracts can have legitimately overdue payments.
      // Drafts/voided/sent-but-unsigned are skipped.
      if (contract.status !== "client_signed" && contract.status !== "completed") continue;
      const milestones = contract.paymentMilestones;
      if (!Array.isArray(milestones) || milestones.length === 0) continue;

      // Sum of fixed milestones — used as the base for percent resolution.
      let total = 0;
      for (const m of milestones) {
        if (m.type === "fixed") total += Number(m.fixedAmount ?? 0);
      }

      const proposal = contract.proposalId
        ? data.proposals.find(p => p.id === contract.proposalId)
        : null;
      const client = contract.clientId
        ? data.clients.find(c => c.id === contract.clientId)
        : (proposal?.clientId ? data.clients.find(c => c.id === proposal.clientId) : null);
      const clientName = client?.contactName || client?.company || contract.clientEmail || contract.title;

      for (let i = 0; i < milestones.length; i++) {
        const m = milestones[i];
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
        out.push({
          contractId: contract.id,
          contractTitle: contract.title,
          clientName,
          clientEmail: contract.clientEmail || client?.email || "",
          milestoneId: m.id || `ms_${i}`,
          milestoneLabel: m.label || "Payment",
          amount,
          dueDate: dueIso,
          daysLate,
        });
      }
    }
    return out.sort((a, b) => b.daysLate - a.daysLate);
  }, [data.contracts, data.proposals, data.clients]);

  const totalOwed = rows.reduce((sum, r) => sum + r.amount, 0);

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-border bg-card/50">
        <h1 className="text-xl font-semibold text-foreground flex items-center gap-2" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
          <AlertCircle className="w-5 h-5 text-red-400" />
          Outstanding Payments
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {rows.length === 0
            ? "Nothing past due. Nice."
            : <>
              <span className="text-foreground font-medium">{rows.length}</span> overdue payment{rows.length === 1 ? "" : "s"} ·{" "}
              <span className="text-red-400 font-medium tabular-nums">${totalOwed.toFixed(2)}</span> outstanding
            </>}
        </p>
      </div>

      <div className="flex-1 overflow-auto p-3 sm:p-6">
        {rows.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <AlertCircle className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No payments are past due.</p>
            <p className="text-xs mt-1">As payments come due, contracts with unpaid milestones will appear here.</p>
          </div>
        ) : (
          <div className="overflow-x-auto bg-card border border-border rounded-lg">
            <table className="w-full text-sm">
              <thead className="bg-secondary/40 border-b border-border">
                <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Client</th>
                  <th className="px-4 py-3 font-medium hidden md:table-cell">Contract</th>
                  <th className="px-4 py-3 font-medium hidden sm:table-cell">Milestone</th>
                  <th className="px-4 py-3 font-medium hidden md:table-cell">Due</th>
                  <th className="px-4 py-3 font-medium text-right">Late</th>
                  <th className="px-4 py-3 font-medium text-right">Amount</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={`${r.contractId}-${i}`} className="border-b border-border/50 hover:bg-secondary/20 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-medium text-foreground">{r.clientName}</div>
                      {r.clientEmail && <div className="text-[11px] text-muted-foreground">{r.clientEmail}</div>}
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell text-xs text-muted-foreground">{r.contractTitle}</td>
                    <td className="px-4 py-3 hidden sm:table-cell text-xs text-muted-foreground">{r.milestoneLabel}</td>
                    <td className="px-4 py-3 hidden md:table-cell text-xs text-muted-foreground tabular-nums">{r.dueDate || "—"}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={cn(
                        "inline-block text-[11px] font-bold px-2 py-0.5 rounded border tabular-nums",
                        r.daysLate >= 30 ? "bg-red-500/20 text-red-300 border-red-500/40"
                          : r.daysLate >= 7 ? "bg-orange-500/20 text-orange-300 border-orange-500/40"
                          : "bg-amber-500/20 text-amber-300 border-amber-500/40",
                      )}>
                        {r.daysLate}d
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-foreground tabular-nums">
                      ${r.amount.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => sendReminder(r)}
                          disabled={sending === `${r.contractId}-${r.milestoneId}` || !r.clientEmail}
                          className="p-1.5 text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
                          title={r.clientEmail ? "Send reminder email now" : "No client email on file"}
                        >
                          <Send className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setLocation(`/contracts/${r.contractId}/review`)}
                          className="p-1.5 text-muted-foreground hover:text-foreground"
                          title="Open contract"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
