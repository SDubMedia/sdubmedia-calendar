// ============================================================
// ContractorInvoicesPage — Admin view of all contractor invoices.
// Owner/Partner sees every invoice submitted by 1099 crew, can
// download as PDF, and can mark paid (recording method + date).
// Slate doesn't process payment — admin pays outside Slate, then
// records the fact here.
// ============================================================

import { useState, useMemo } from "react";
import { useScopedData as useApp } from "@/hooks/useScopedData";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, FileText, User, CheckCircle2 } from "lucide-react";
import { pdf } from "@react-pdf/renderer";
import ContractorInvoicePDF from "@/components/ContractorInvoicePDF";
import MarkPaidDialog from "@/components/MarkPaidDialog";
import type { ContractorInvoice, ContractorPaymentMethod } from "@/lib/types";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const METHOD_LABELS: Record<string, string> = {
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

export default function ContractorInvoicesPage() {
  const { data, updateContractorInvoice } = useApp();
  const [filterCrew, setFilterCrew] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [payingInvoice, setPayingInvoice] = useState<ContractorInvoice | null>(null);

  const crewWithInvoices = useMemo(() => {
    const ids = new Set(data.contractorInvoices.map(inv => inv.crewMemberId));
    return data.crewMembers.filter(c => ids.has(c.id));
  }, [data.contractorInvoices, data.crewMembers]);

  const filteredInvoices = useMemo(() => {
    return data.contractorInvoices
      .filter(inv => filterCrew === "all" || inv.crewMemberId === filterCrew)
      .filter(inv => filterStatus === "all" || inv.status === filterStatus)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [data.contractorInvoices, filterCrew, filterStatus]);

  const totalAmount = filteredInvoices.reduce((s, inv) => s + inv.total, 0);
  const totalPaid = useMemo(
    () => data.contractorInvoices.filter(i => i.status === "paid").reduce((s, i) => s + i.total, 0),
    [data.contractorInvoices],
  );
  const totalOutstanding = useMemo(
    () => data.contractorInvoices.filter(i => i.status === "sent").reduce((s, i) => s + i.total, 0),
    [data.contractorInvoices],
  );

  const getCrew = (id: string) => data.crewMembers.find(c => c.id === id) || null;

  const handleDownload = async (inv: ContractorInvoice) => {
    const blob = await pdf(<ContractorInvoicePDF invoice={inv} />).toBlob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${inv.invoiceNumber}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  };

  async function confirmPaid(method: ContractorPaymentMethod, reference: string) {
    if (!payingInvoice) return;
    try {
      await updateContractorInvoice(payingInvoice.id, {
        status: "paid",
        paidAt: new Date().toISOString(),
        paymentMethod: method,
        paymentReference: reference,
      });
      toast.success(`Marked ${payingInvoice.invoiceNumber} paid`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to mark paid");
    }
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
          Contractor Invoices
        </h1>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <Select value={filterCrew} onValueChange={setFilterCrew}>
          <SelectTrigger className="w-[200px] bg-secondary border-border">
            <SelectValue placeholder="All Crew" />
          </SelectTrigger>
          <SelectContent className="bg-popover border-border">
            <SelectItem value="all">All Crew</SelectItem>
            {crewWithInvoices.map(c => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[150px] bg-secondary border-border">
            <SelectValue placeholder="All Status" />
          </SelectTrigger>
          <SelectContent className="bg-popover border-border">
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="sent">Submitted</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-secondary rounded-lg p-4">
          <div className="text-xs text-muted-foreground uppercase tracking-wider">Total Invoices</div>
          <div className="text-2xl font-bold mt-1 tabular-nums" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            {filteredInvoices.length}
          </div>
        </div>
        <div className="bg-secondary rounded-lg p-4">
          <div className="text-xs text-muted-foreground uppercase tracking-wider">Filtered Total</div>
          <div className="text-2xl font-bold mt-1 text-primary tabular-nums" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            {formatCurrency(totalAmount)}
          </div>
        </div>
        <div className="bg-secondary rounded-lg p-4">
          <div className="text-xs text-muted-foreground uppercase tracking-wider">Outstanding</div>
          <div className="text-2xl font-bold mt-1 text-amber-300 tabular-nums" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            {formatCurrency(totalOutstanding)}
          </div>
        </div>
        <div className="bg-secondary rounded-lg p-4">
          <div className="text-xs text-muted-foreground uppercase tracking-wider">Total Paid</div>
          <div className="text-2xl font-bold mt-1 text-green-300 tabular-nums" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            {formatCurrency(totalPaid)}
          </div>
        </div>
      </div>

      {/* Invoice list */}
      {filteredInvoices.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <div className="text-sm">No contractor invoices yet.</div>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredInvoices.map(inv => {
            const crew = getCrew(inv.crewMemberId);
            return (
              <div key={inv.id} className="bg-secondary rounded-lg p-4 flex items-center justify-between gap-4 flex-wrap sm:flex-nowrap">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{inv.invoiceNumber}</span>
                    <Badge className={cn(
                      inv.status === "paid" && "bg-green-500/20 text-green-300 border-green-500/30",
                      inv.status === "sent" && "bg-blue-500/20 text-blue-300 border-blue-500/30",
                      inv.status === "draft" && "bg-amber-500/20 text-amber-300 border-amber-500/30",
                    )}>
                      {inv.status === "sent" ? "submitted" : inv.status}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                    <User className="w-3 h-3" />
                    <span className="font-medium text-foreground">{crew?.name || "Unknown"}</span>
                    <span>→</span>
                    <span>{inv.recipientName}</span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {new Date(inv.periodStart + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })} – {new Date(inv.periodEnd + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    {" · "}{inv.lineItems.length} item{inv.lineItems.length !== 1 ? "s" : ""}
                  </div>
                  {inv.status === "paid" && inv.paidAt && (
                    <div className="text-xs text-green-300 mt-1">
                      Paid {new Date(inv.paidAt).toLocaleDateString()} via {inv.paymentMethod ? METHOD_LABELS[inv.paymentMethod] : "—"}
                      {inv.paymentReference ? ` · ${inv.paymentReference}` : ""}
                    </div>
                  )}
                  {/* Surface contractor's preferred method when there's
                      one set and the invoice hasn't been paid yet — saves
                      the admin from clicking into the staff member to
                      look up where to send the money. */}
                  {inv.status === "sent" && crew?.preferredPaymentMethod && (
                    <div className="text-xs text-muted-foreground mt-1">
                      Wants: {METHOD_LABELS[crew.preferredPaymentMethod]}
                      {crew.preferredPaymentDetails ? ` · ${crew.preferredPaymentDetails}` : ""}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-lg font-bold tabular-nums text-primary" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                    {formatCurrency(inv.total)}
                  </span>
                  {inv.status === "sent" && (
                    <Button size="sm" onClick={() => setPayingInvoice(inv)} className="bg-green-600 text-white hover:bg-green-500 gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Mark Paid
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDownload(inv)} title="Download PDF">
                    <Download className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {payingInvoice && (
        <MarkPaidDialog
          invoice={payingInvoice}
          crewMember={getCrew(payingInvoice.crewMemberId)}
          open={!!payingInvoice}
          onClose={() => setPayingInvoice(null)}
          onConfirm={confirmPaid}
        />
      )}
    </div>
  );
}
