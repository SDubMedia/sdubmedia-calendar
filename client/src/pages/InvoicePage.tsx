// ============================================================
// InvoicePage — Retainer tracking & invoice management
// Design: Dark Cinematic Studio
// Retainer Math: Single source of truth via calcBalanceAtEndOfMonth
// ============================================================

import { useState, useMemo } from "react";
import { ChevronLeft, ChevronRight, Plus, DollarSign, TrendingDown, TrendingUp, AlertTriangle, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useApp } from "@/contexts/AppContext";
import { calcBalanceAtEndOfMonth, calcHoursPaid, calcHoursUsed } from "@/lib/data";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export default function InvoicePage() {
  const { data, addPayment, deletePayment } = useApp();
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [selectedClientId, setSelectedClientId] = useState(data.clients[0]?.id ?? "");
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [payHours, setPayHours] = useState("25");
  const [payDate, setPayDate] = useState(today.toISOString().split("T")[0]);
  const [payNotes, setPayNotes] = useState("");

  const client = data.clients.find((c) => c.id === selectedClientId);

  const prevMonth = () => {
    if (month === 0) { setYear(y => y - 1); setMonth(11); } else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 11) { setYear(y => y + 1); setMonth(0); } else setMonth(m => m + 1);
  };

  // Monthly summary
  const monthlySummary = useMemo(() => {
    if (!client) return null;

    // Balance at end of PREVIOUS month
    let prevYear = year, prevMonth2 = month - 1;
    if (prevMonth2 < 0) { prevMonth2 = 11; prevYear--; }
    const startingBalance = calcBalanceAtEndOfMonth(client, data.projects, data.retainerPayments, prevYear, prevMonth2);

    const paidThisMonth = calcHoursPaid(data.retainerPayments, client.id, year, month);
    const usedThisMonth = calcHoursUsed(data.projects, client.id, year, month);
    const endingBalance = startingBalance + paidThisMonth - usedThisMonth;
    const refillNeeded = Math.max(0, client.monthlyHours - endingBalance);

    return {
      startingBalance: Math.round(startingBalance * 100) / 100,
      paidThisMonth: Math.round(paidThisMonth * 100) / 100,
      usedThisMonth: Math.round(usedThisMonth * 100) / 100,
      endingBalance: Math.round(endingBalance * 100) / 100,
      refillNeeded: Math.round(refillNeeded * 100) / 100,
      isOverused: endingBalance < 0,
      isLow: endingBalance >= 0 && endingBalance < client.monthlyHours * 0.2,
    };
  }, [client, data.projects, data.retainerPayments, year, month]);

  // YTD summary
  const ytdSummary = useMemo(() => {
    if (!client) return null;
    const currentYear = year;
    let totalPaid = 0, totalUsed = 0;
    for (let m = 0; m <= 11; m++) {
      totalPaid += calcHoursPaid(data.retainerPayments, client.id, currentYear, m);
      totalUsed += calcHoursUsed(data.projects, client.id, currentYear, m);
    }
    const currentBalance = calcBalanceAtEndOfMonth(client, data.projects, data.retainerPayments, year, month);
    return {
      totalPaid: Math.round(totalPaid * 100) / 100,
      totalUsed: Math.round(totalUsed * 100) / 100,
      currentBalance: Math.round(currentBalance * 100) / 100,
      additionalHoursNeeded: Math.max(0, Math.round((client.monthlyHours - currentBalance) * 100) / 100),
    };
  }, [client, data.projects, data.retainerPayments, year, month]);

  // Payment history for this client
  const payments = data.retainerPayments
    .filter((p) => p.clientId === selectedClientId)
    .sort((a, b) => b.date.localeCompare(a.date));

  // Projects this month for this client
  const monthProjects = useMemo(() => {
    return data.projects.filter((p) => {
      if (p.clientId !== selectedClientId) return false;
      const d = new Date(p.date);
      return d.getFullYear() === year && d.getMonth() === month;
    });
  }, [data.projects, selectedClientId, year, month]);

  const handleAddPayment = () => {
    if (!selectedClientId || !payHours || parseFloat(payHours) <= 0) {
      toast.error("Please enter valid hours");
      return;
    }
    addPayment({
      clientId: selectedClientId,
      date: payDate,
      hours: parseFloat(payHours),
      notes: payNotes,
    });
    toast.success("Payment recorded");
    setPaymentDialogOpen(false);
    setPayHours("25");
    setPayNotes("");
  };

  const getProjectType = (id: string) => data.projectTypes.find((pt) => pt.id === id);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card/50">
        <div>
          <h1 className="text-xl font-semibold text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Retainer Tracker</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Track client retainer hours and payments</p>
        </div>
        <div className="flex items-center gap-3">
          {data.clients.length > 1 && (
            <Select value={selectedClientId} onValueChange={setSelectedClientId}>
              <SelectTrigger className="w-52 bg-secondary border-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-popover border-border">
                {data.clients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.company}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button onClick={() => setPaymentDialogOpen(true)} className="bg-primary text-primary-foreground hover:bg-primary/90 gap-2">
            <Plus className="w-4 h-4" /> Record Payment
          </Button>
        </div>
      </div>

      {!client ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          <p>No clients found. Add a client first.</p>
        </div>
      ) : (
        <div className="flex-1 overflow-auto p-6 space-y-6">
          {/* Client info */}
          <div className="bg-card border border-border rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{client.company}</h2>
                <p className="text-sm text-muted-foreground">{client.contactName} · {client.phone}</p>
              </div>
              <div className="text-right">
                <div className="text-xs text-muted-foreground">Monthly Retainer</div>
                <div className="text-2xl font-bold text-primary tabular-nums" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                  {client.monthlyHours} hrs
                </div>
              </div>
            </div>
          </div>

          {/* Month navigation */}
          <div className="flex items-center justify-between">
            <button onClick={prevMonth} className="p-1.5 rounded hover:bg-white/8 text-muted-foreground hover:text-foreground transition-colors">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <h2 className="text-base font-semibold text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              {MONTH_NAMES[month]} {year}
            </h2>
            <button onClick={nextMonth} className="p-1.5 rounded hover:bg-white/8 text-muted-foreground hover:text-foreground transition-colors">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Monthly stats */}
          {monthlySummary && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard label="Starting Balance" value={`${Number(monthlySummary.startingBalance ?? 0).toFixed(2)} hrs`} icon={<DollarSign className="w-4 h-4" />} />
                <StatCard label="Paid This Month" value={`+${Number(monthlySummary.paidThisMonth ?? 0).toFixed(2)} hrs`} icon={<TrendingUp className="w-4 h-4" />} positive />
                <StatCard label="Used This Month" value={`-${Number(monthlySummary.usedThisMonth ?? 0).toFixed(2)} hrs`} icon={<TrendingDown className="w-4 h-4" />} negative />
                <StatCard
                  label="Ending Balance"
                  value={`${Number(monthlySummary.endingBalance ?? 0).toFixed(2)} hrs`}
                  icon={monthlySummary.isOverused ? <AlertTriangle className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
                  negative={monthlySummary.isOverused}
                  positive={!monthlySummary.isOverused && !monthlySummary.isLow}
                  warning={monthlySummary.isLow && !monthlySummary.isOverused}
                />
              </div>

              {/* Status banner */}
              {monthlySummary.isOverused && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 flex items-center gap-3">
                  <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
                  <div>
                    <div className="text-sm font-medium text-red-300">Retainer Overused</div>
                    <div className="text-xs text-muted-foreground">
                      Client owes {Math.abs(Number(monthlySummary.endingBalance ?? 0)).toFixed(2)} additional hours. Bill immediately.
                    </div>
                  </div>
                </div>
              )}
              {monthlySummary.refillNeeded > 0 && !monthlySummary.isOverused && (
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 flex items-center gap-3">
                  <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
                  <div>
                    <div className="text-sm font-medium text-amber-300">Refill Needed for Next Month</div>
                    <div className="text-xs text-muted-foreground">
                      Invoice {Number(monthlySummary.refillNeeded ?? 0).toFixed(2)} hrs to start next month at {client.monthlyHours} hrs.
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Projects this month */}
          {monthProjects.length > 0 && (
            <div className="bg-card border border-border rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-border">
                <h3 className="text-sm font-semibold text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                  Projects This Month
                </h3>
              </div>
              <div className="divide-y divide-border">
                {monthProjects.map((p) => {
                  const crewHrs = p.crew.reduce((s, c) => s + (c.hoursDeducted || 0), 0);
                  const postHrs = p.postProduction.reduce((s, c) => s + (c.hoursDeducted || 0), 0);
                  const total = crewHrs + postHrs;
                  return (
                    <div key={p.id} className="px-4 py-3 flex items-center justify-between">
                      <div>
                        <div className="text-sm text-foreground">{getProjectType(p.projectTypeId)?.name ?? "Project"}</div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(p.date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })} · {p.startTime}–{p.endTime}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-medium tabular-nums text-foreground">-{Number(total ?? 0).toFixed(2)} hrs</div>
                        <div className="text-xs text-muted-foreground">
                          {crewHrs > 0 && `${Number(crewHrs ?? 0).toFixed(2)} filming`}
                          {crewHrs > 0 && postHrs > 0 && " + "}
                          {postHrs > 0 && `${Number(postHrs ?? 0).toFixed(2)} post`}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* YTD Summary */}
          {ytdSummary && (
            <div className="bg-card border border-border rounded-lg p-4">
              <h3 className="text-sm font-semibold text-foreground mb-4" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                Year-to-Date Summary ({year})
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <div className="text-xs text-muted-foreground">Total Paid YTD</div>
                  <div className="text-lg font-bold text-foreground tabular-nums" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{Number(ytdSummary.totalPaid ?? 0).toFixed(2)} hrs</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Total Used YTD</div>
                  <div className="text-lg font-bold text-foreground tabular-nums" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{Number(ytdSummary.totalUsed ?? 0).toFixed(2)} hrs</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Current Balance</div>
                  <div className={cn("text-lg font-bold tabular-nums", (ytdSummary.currentBalance ?? 0) < 0 ? "text-red-400" : "text-green-400")} style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                    {Number(ytdSummary.currentBalance ?? 0).toFixed(2)} hrs
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Hrs to Invoice Now</div>
                  <div className="text-lg font-bold text-primary tabular-nums" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                    {Number(ytdSummary.additionalHoursNeeded ?? 0).toFixed(2)} hrs
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Payment History */}
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-border">
              <h3 className="text-sm font-semibold text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Payment History</h3>
            </div>
            {payments.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground text-sm">No payments recorded yet.</div>
            ) : (
              <div className="divide-y divide-border">
                {payments.map((p) => (
                  <div key={p.id} className="px-4 py-3 flex items-center justify-between">
                    <div>
                      <div className="text-sm text-foreground">
                        {new Date(p.date + "T00:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                      </div>
                      {p.notes && <div className="text-xs text-muted-foreground">{p.notes}</div>}
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-sm font-medium text-green-400 tabular-nums">+{Number(p.hours ?? 0).toFixed(2)} hrs</div>
                      <button onClick={() => { deletePayment(p.id); toast.success("Payment removed"); }} className="text-muted-foreground hover:text-destructive transition-colors text-xs">
                        ×
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Record Payment Dialog */}
      <Dialog open={paymentDialogOpen} onOpenChange={(o) => !o && setPaymentDialogOpen(false)}>
        <DialogContent className="bg-card border-border text-foreground max-w-sm">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Record Payment</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {data.clients.length > 1 && (
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Client</Label>
                <Select value={selectedClientId} onValueChange={setSelectedClientId}>
                  <SelectTrigger className="bg-secondary border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border-border">
                    {data.clients.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.company}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Date</Label>
              <Input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} className="bg-secondary border-border" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Hours Paid</Label>
              <Input type="number" value={payHours} onChange={(e) => setPayHours(e.target.value)} className="bg-secondary border-border" placeholder="25" step="0.5" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Notes (optional)</Label>
              <Textarea value={payNotes} onChange={(e) => setPayNotes(e.target.value)} className="bg-secondary border-border resize-none" rows={2} placeholder="e.g. March retainer" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPaymentDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleAddPayment} className="bg-primary text-primary-foreground hover:bg-primary/90">Record Payment</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---- Stat Card ----
function StatCard({ label, value, icon, positive, negative, warning }: {
  label: string;
  value: string;
  icon: React.ReactNode;
  positive?: boolean;
  negative?: boolean;
  warning?: boolean;
}) {
  return (
    <div className="bg-card border border-border rounded-lg p-3">
      <div className="flex items-center gap-2 mb-2">
        <div className={cn("w-6 h-6 rounded flex items-center justify-center",
          positive && "bg-green-500/15 text-green-400",
          negative && "bg-red-500/15 text-red-400",
          warning && "bg-amber-500/15 text-amber-400",
          !positive && !negative && !warning && "bg-primary/15 text-primary"
        )}>
          {icon}
        </div>
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <div className={cn("text-lg font-bold tabular-nums",
        positive && "text-green-400",
        negative && "text-red-400",
        warning && "text-amber-400",
        !positive && !negative && !warning && "text-foreground"
      )} style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
        {value}
      </div>
    </div>
  );
}
