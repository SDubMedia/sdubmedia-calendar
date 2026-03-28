// ============================================================
// ClientReportsPage — Client-facing reports (hours only, no internal data)
// Monthly and annual project summaries with CSV download
// ============================================================

import { useState, useMemo } from "react";
import { useApp } from "@/contexts/AppContext";
import { getProjectBillableHours, getProjectInvoiceAmount } from "@/lib/data";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import { downloadCSV } from "@/lib/csv";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function formatCurrency(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(n);
}

function formatHours(h: number) {
  return h % 1 === 0 ? `${h}h` : `${h.toFixed(1)}h`;
}

export default function ClientReportsPage() {
  const { data } = useApp();
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [view, setView] = useState<"monthly" | "annual">("monthly");

  const prevMonth = () => {
    if (month === 0) { setMonth(11); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 11) { setMonth(0); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  };

  // Monthly projects
  const monthlyProjects = useMemo(() => {
    return data.projects.filter(p => {
      const d = new Date(p.date + "T00:00:00");
      return d.getFullYear() === year && d.getMonth() === month;
    }).sort((a, b) => a.date.localeCompare(b.date));
  }, [data.projects, year, month]);

  // Monthly summary
  const monthlySummary = useMemo(() => {
    let totalHours = 0;
    let totalAmount = 0;
    const rows = monthlyProjects.map(p => {
      const client = data.clients.find(c => c.id === p.clientId);
      const pType = data.projectTypes.find(t => t.id === p.projectTypeId);
      const loc = data.locations.find(l => l.id === p.locationId);
      const { totalBillable } = client ? getProjectBillableHours(p, client) : { totalBillable: 0 };
      const amount = client ? getProjectInvoiceAmount(p, client) : 0;
      totalHours += totalBillable;
      totalAmount += amount;
      return {
        date: p.date,
        type: pType?.name || "Project",
        location: loc?.name || "",
        status: p.status,
        hours: totalBillable,
        amount,
      };
    });
    return { rows, totalHours, totalAmount };
  }, [monthlyProjects, data.clients, data.projectTypes, data.locations]);

  // Annual projects
  const annualProjects = useMemo(() => {
    return data.projects.filter(p => {
      const d = new Date(p.date + "T00:00:00");
      return d.getFullYear() === year;
    });
  }, [data.projects, year]);

  // Annual summary by month
  const annualSummary = useMemo(() => {
    const months: { month: string; projectCount: number; hours: number; amount: number }[] = [];
    let yearTotalHours = 0;
    let yearTotalAmount = 0;
    for (let m = 0; m < 12; m++) {
      const monthProjects = annualProjects.filter(p => {
        const d = new Date(p.date + "T00:00:00");
        return d.getMonth() === m;
      });
      let hours = 0;
      let amount = 0;
      monthProjects.forEach(p => {
        const client = data.clients.find(c => c.id === p.clientId);
        if (client) {
          hours += getProjectBillableHours(p, client).totalBillable;
          amount += getProjectInvoiceAmount(p, client);
        }
      });
      yearTotalHours += hours;
      yearTotalAmount += amount;
      months.push({ month: MONTH_NAMES[m], projectCount: monthProjects.length, hours, amount });
    }
    return { months, yearTotalHours, yearTotalAmount };
  }, [annualProjects, data.clients]);

  const handleDownloadMonthly = () => {
    downloadCSV(monthlySummary.rows.map(r => ({
      Date: r.date,
      Type: r.type,
      Location: r.location,
      Status: r.status,
      "Billable Hours": r.hours,
      Amount: r.amount,
    })), `report-${MONTH_NAMES[month]}-${year}`);
  };

  const handleDownloadAnnual = () => {
    downloadCSV(annualSummary.months.map(m => ({
      Month: m.month,
      Projects: m.projectCount,
      "Billable Hours": m.hours,
      Amount: m.amount,
    })), `annual-report-${year}`);
  };

  const STATUS_LABELS: Record<string, string> = {
    upcoming: "Upcoming",
    filming_done: "Filmed",
    in_editing: "In Editing",
    completed: "Completed",
  };

  const STATUS_COLORS: Record<string, string> = {
    upcoming: "text-blue-300",
    filming_done: "text-yellow-300",
    in_editing: "text-purple-300",
    completed: "text-green-300",
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-border bg-card/50">
        <div>
          <h1 className="text-xl font-semibold text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            Reports
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Your project hours and billing summary</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setView("monthly")}
            className={cn("px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
              view === "monthly" ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"
            )}
          >
            Monthly
          </button>
          <button
            onClick={() => setView("annual")}
            className={cn("px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
              view === "annual" ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"
            )}
          >
            Annual
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-3 sm:p-6 space-y-5">
        {view === "monthly" ? (
          <>
            {/* Month navigator */}
            <div className="flex items-center justify-between">
              <button onClick={prevMonth} className="p-2 text-muted-foreground hover:text-foreground"><ChevronLeft className="w-5 h-5" /></button>
              <h2 className="text-lg font-semibold text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                {MONTH_NAMES[month]} {year}
              </h2>
              <button onClick={nextMonth} className="p-2 text-muted-foreground hover:text-foreground"><ChevronRight className="w-5 h-5" /></button>
            </div>

            {/* Summary cards */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-card border border-border rounded-lg p-4 text-center">
                <p className="text-2xl font-semibold text-foreground">{formatHours(monthlySummary.totalHours)}</p>
                <p className="text-xs text-muted-foreground mt-1">Total Hours</p>
              </div>
              <div className="bg-card border border-border rounded-lg p-4 text-center">
                <p className="text-2xl font-semibold text-foreground">{formatCurrency(monthlySummary.totalAmount)}</p>
                <p className="text-xs text-muted-foreground mt-1">Total Billed</p>
              </div>
            </div>

            {/* Project list */}
            <div className="bg-card border border-border rounded-lg">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <h3 className="text-sm font-semibold text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                  Projects ({monthlySummary.rows.length})
                </h3>
                <button onClick={handleDownloadMonthly} className="flex items-center gap-1 text-xs text-primary hover:text-primary/80">
                  <Download className="w-3.5 h-3.5" /> Download CSV
                </button>
              </div>
              <div className="divide-y divide-border">
                {monthlySummary.rows.length === 0 ? (
                  <div className="p-6 text-center text-sm text-muted-foreground">No projects this month</div>
                ) : (
                  monthlySummary.rows.map((r, i) => (
                    <div key={i} className="px-4 py-3 flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-foreground">{r.type}</span>
                          <span className={cn("text-[10px] font-medium", STATUS_COLORS[r.status] || "text-muted-foreground")}>
                            {STATUS_LABELS[r.status] || r.status}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {new Date(r.date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                          {r.location && ` — ${r.location}`}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-semibold text-foreground">{formatHours(r.hours)}</p>
                        <p className="text-[10px] text-muted-foreground">{formatCurrency(r.amount)}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Year navigator */}
            <div className="flex items-center justify-between">
              <button onClick={() => setYear(y => y - 1)} className="p-2 text-muted-foreground hover:text-foreground"><ChevronLeft className="w-5 h-5" /></button>
              <h2 className="text-lg font-semibold text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                {year}
              </h2>
              <button onClick={() => setYear(y => y + 1)} className="p-2 text-muted-foreground hover:text-foreground"><ChevronRight className="w-5 h-5" /></button>
            </div>

            {/* Annual summary cards */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-card border border-border rounded-lg p-4 text-center">
                <p className="text-2xl font-semibold text-foreground">{formatHours(annualSummary.yearTotalHours)}</p>
                <p className="text-xs text-muted-foreground mt-1">Total Hours ({year})</p>
              </div>
              <div className="bg-card border border-border rounded-lg p-4 text-center">
                <p className="text-2xl font-semibold text-foreground">{formatCurrency(annualSummary.yearTotalAmount)}</p>
                <p className="text-xs text-muted-foreground mt-1">Total Billed ({year})</p>
              </div>
            </div>

            {/* Monthly breakdown */}
            <div className="bg-card border border-border rounded-lg">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <h3 className="text-sm font-semibold text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                  Monthly Breakdown
                </h3>
                <button onClick={handleDownloadAnnual} className="flex items-center gap-1 text-xs text-primary hover:text-primary/80">
                  <Download className="w-3.5 h-3.5" /> Download CSV
                </button>
              </div>
              <div className="divide-y divide-border">
                {annualSummary.months.map((m, i) => (
                  <button
                    key={i}
                    onClick={() => { setMonth(i); setView("monthly"); }}
                    className="w-full px-4 py-3 flex items-center justify-between hover:bg-secondary/30 transition-colors text-left"
                  >
                    <div>
                      <span className="text-sm font-medium text-foreground">{m.month}</span>
                      <p className="text-xs text-muted-foreground">{m.projectCount} project{m.projectCount !== 1 ? "s" : ""}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold text-foreground">{formatHours(m.hours)}</p>
                      <p className="text-[10px] text-muted-foreground">{formatCurrency(m.amount)}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
