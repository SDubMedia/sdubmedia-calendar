// ============================================================
// ContractorInvoicesPage — Admin view of all contractor invoices
// Owner/Partner can see every invoice created by 1099 crew
// ============================================================

import { useState, useMemo } from "react";
import { useApp } from "@/contexts/AppContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, FileText, User } from "lucide-react";
import { pdf } from "@react-pdf/renderer";
import ContractorInvoicePDF from "@/components/ContractorInvoicePDF";
import type { ContractorInvoice } from "@/lib/types";

function formatCurrency(n: number): string {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function ContractorInvoicesPage() {
  const { data } = useApp();
  const [filterCrew, setFilterCrew] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");

  // Crew members who have contractor invoices
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

  const getCrewName = (id: string) => data.crewMembers.find(c => c.id === id)?.name ?? "Unknown";

  const handleDownload = async (inv: ContractorInvoice) => {
    const blob = await pdf(<ContractorInvoicePDF invoice={inv} />).toBlob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${inv.invoiceNumber}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
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
            <SelectItem value="sent">Sent</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <div className="bg-secondary rounded-lg p-4">
          <div className="text-xs text-muted-foreground uppercase tracking-wider">Total Invoices</div>
          <div className="text-2xl font-bold mt-1 tabular-nums" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            {filteredInvoices.length}
          </div>
        </div>
        <div className="bg-secondary rounded-lg p-4">
          <div className="text-xs text-muted-foreground uppercase tracking-wider">Total Amount</div>
          <div className="text-2xl font-bold mt-1 text-primary tabular-nums" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            {formatCurrency(totalAmount)}
          </div>
        </div>
        <div className="bg-secondary rounded-lg p-4">
          <div className="text-xs text-muted-foreground uppercase tracking-wider">Crew Members</div>
          <div className="text-2xl font-bold mt-1 tabular-nums" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            {crewWithInvoices.length}
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
          {filteredInvoices.map(inv => (
            <div key={inv.id} className="bg-secondary rounded-lg p-4 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm">{inv.invoiceNumber}</span>
                  <Badge className={inv.status === "sent" ? "bg-green-500/20 text-green-300 border-green-500/30" : "bg-amber-500/20 text-amber-300 border-amber-500/30"}>
                    {inv.status}
                  </Badge>
                </div>
                <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                  <User className="w-3 h-3" />
                  <span className="font-medium text-foreground">{getCrewName(inv.crewMemberId)}</span>
                  <span>→</span>
                  <span>{inv.recipientName}</span>
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {new Date(inv.periodStart + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })} – {new Date(inv.periodEnd + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  {" · "}{inv.lineItems.length} item{inv.lineItems.length !== 1 ? "s" : ""}
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-lg font-bold tabular-nums text-primary" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                  {formatCurrency(inv.total)}
                </span>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDownload(inv)} title="Download PDF">
                  <Download className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
