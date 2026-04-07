// ============================================================
// ClientReportsPage — Client-facing reports (hours only, no internal data)
// Monthly and annual project summaries with CSV download
// ============================================================

import { useState, useMemo } from "react";
import { useApp } from "@/contexts/AppContext";
import { getBillableHours, getProjectBillableHours, getProjectInvoiceAmount } from "@/lib/data";
import { ChevronLeft, ChevronRight, Download, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { downloadCSV } from "@/lib/csv";
import ReportPreview from "@/components/ReportPreview";

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
  const [preview, setPreview] = useState<{ title: string; html: string } | null>(null);

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

  // Determine if this is a per-project client (client portal shows one client)
  const currentClient = data.clients[0] || null;
  const isPerProject = currentClient?.billingModel === "per_project";

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
    downloadCSV(monthlySummary.rows.map(r => {
      const base: Record<string, any> = {
        Date: r.date,
        Type: r.type,
        Location: r.location,
        Status: r.status,
      };
      if (!isPerProject) base["Billable Hours"] = r.hours;
      base.Amount = r.amount;
      return base;
    }), `report-${MONTH_NAMES[month]}-${year}`);
  };

  const handleDownloadAnnual = () => {
    downloadCSV(annualSummary.months.map(m => {
      const base: Record<string, any> = {
        Month: m.month,
        Projects: m.projectCount,
      };
      if (!isPerProject) base["Billable Hours"] = m.hours;
      base.Amount = m.amount;
      return base;
    }), `annual-report-${year}`);
  };

  function generateReport() {
    if (!currentClient) return;
    const monthName = MONTH_NAMES[month];
    const yr = year;
    const clientProjects = monthlyProjects;

    const totalProductionHours = clientProjects.reduce((s, p) =>
      s + getProjectBillableHours(p, currentClient).crewBillable, 0);
    const totalEditorHours = clientProjects.reduce((s, p) =>
      s + getProjectBillableHours(p, currentClient).postBillable, 0);
    const totalHours = totalProductionHours + totalEditorHours;
    const totalInvoice = clientProjects.reduce((s, p) => s + getProjectInvoiceAmount(p, currentClient), 0);

    const clientPrefix = currentClient.company.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 3);
    const reportNum = `${clientPrefix}-${yr}-${String(month + 1).padStart(2, "0")}-001`;
    const lastDay = new Date(yr, month + 1, 0).getDate();
    const periodStart = `${monthName.slice(0, 3)} 1, ${yr}`;
    const periodEnd = `${monthName.slice(0, 3)} ${lastDay}, ${yr}`;
    const issueDate = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

    const filmingDates = clientProjects.map(p =>
      new Date(p.date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    );
    const locationSet = new Map<string, string>();
    clientProjects.forEach(p => {
      const loc = data.locations.find(l => l.id === p.locationId);
      if (loc) locationSet.set(loc.id, `${loc.name} ${loc.address} ${loc.city}, ${loc.state} ${loc.zip}`);
    });
    const crewSet = new Map<string, string[]>();
    clientProjects.forEach(p => {
      [...(p.crew || []), ...(p.postProduction || [])].forEach(e => {
        const member = data.crewMembers.find(c => c.id === e.crewMemberId);
        if (member && !crewSet.has(member.id)) crewSet.set(member.id, [member.name, e.role]);
      });
    });
    const allDeliverables = new Set<string>();
    clientProjects.forEach(p => (p.editTypes || []).forEach(et => allDeliverables.add(et)));

    const projectCards = clientProjects.map(p => {
      const type = data.projectTypes.find(t => t.id === p.projectTypeId)?.name || "";
      const loc = data.locations.find(l => l.id === p.locationId);
      const { crewBillable, postBillable, totalBillable } = getProjectBillableHours(p, currentClient);
      const dateStr = new Date(p.date + "T00:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
      const projRate = getProjectInvoiceAmount(p, currentClient);

      return `
        <div style="border:1px solid #e5e5e5;border-radius:8px;margin-bottom:16px;overflow:hidden;">
          <div style="display:flex;justify-content:space-between;align-items:center;padding:16px;background:#f8fafc;">
            <div><div style="font-weight:700;font-size:14px;">${type}</div><div style="color:#666;font-size:12px;">${dateStr}</div></div>
            <div style="text-align:right;">
              ${isPerProject
                ? `<div style="font-weight:700;font-size:14px;">${formatCurrency(projRate)}</div><div style="color:#666;font-size:11px;">Flat Rate</div>`
                : `<div style="font-weight:700;font-size:14px;">${totalBillable.toFixed(2)} hrs</div><div style="color:#666;font-size:11px;">Production: ${crewBillable.toFixed(2)} · Editing: ${postBillable.toFixed(2)}</div>`
              }
            </div>
          </div>
          ${loc ? `<div style="padding:12px 16px;font-size:12px;border-top:1px solid #e5e5e5;"><span style="color:#888;">Location: </span>${loc.name}, ${loc.address} ${loc.city}, ${loc.state} ${loc.zip}</div>` : ""}
        </div>
      `;
    }).join("");

    const crewList = Array.from(crewSet.values()).map(([name, role]) => `${name} (${role})`).join(", ");
    const locationsList = Array.from(locationSet.values()).join("; ");
    const deliverablesList = Array.from(allDeliverables).map(d => `<li>${d}</li>`).join("");

    setPreview({ title: `Client Report — ${currentClient.company} ${monthName} ${yr}`, html: `
      <div class="invoice-header">
        <h1>${isPerProject ? "Project Activity Report" : "Hourly Activity Report & Project Invoice"}</h1>
        <div class="meta-grid">
          <div><div class="meta-label">Report #</div><div class="meta-value">${reportNum}</div></div>
          <div><div class="meta-label">Report Period</div><div class="meta-value">${periodStart} - ${periodEnd}</div></div>
          <div><div class="meta-label">Issue Date</div><div class="meta-value">${issueDate}</div></div>
        </div>
      </div>

      <div class="section">
        <div class="section-header">${isPerProject ? "Project Summary" : "Hours Summary"}</div>
        <div class="section-body">
          ${isPerProject ? `
          <div class="hours-row"><span>Projects</span><span>${clientProjects.length}</span></div>
          <div class="hours-row highlight"><span>Total Billed</span><span class="hours-value">${formatCurrency(totalInvoice)}</span></div>
          ` : `
          <div class="hours-row"><span>Production Hours Used</span><span>${totalProductionHours.toFixed(1)} hrs</span></div>
          <div class="hours-row"><span>Editor Hours Used</span><span>${totalEditorHours.toFixed(1)} hrs</span></div>
          <div class="hours-row total"><span>Total Hours Used</span><span>${totalHours.toFixed(1)} hrs</span></div>
          <div class="hours-row highlight"><span>Total Value of Hours Used</span><span class="hours-value">${formatCurrency(totalInvoice)}</span></div>
          `}
        </div>
      </div>

      <div class="section">
        <div class="section-header">Payment Summary</div>
        <div class="payment-box">
          <div class="amount-due">
            <span class="label">Amount Due</span>
            <span class="value">${formatCurrency(totalInvoice)}</span>
          </div>
          <div class="calc">${isPerProject
            ? `${clientProjects.length} project${clientProjects.length !== 1 ? "s" : ""}`
            : `${totalHours.toFixed(1)} hrs × $${Number(currentClient.billingRatePerHour).toFixed(0)}/hr`
          }</div>
        </div>
      </div>

      <div class="section">
        <div class="section-header">Service Provider & Client</div>
        <div class="section-body">
          <div class="provider-grid">
            <div><div class="col-label">Service Provider</div><div class="col-value">${data.organization?.name || "SDub Media"}</div></div>
            <div><div class="col-label">Client</div><div class="col-value">${currentClient.company}</div></div>
          </div>
        </div>
      </div>

      <div class="section">
        <div class="section-header">Project Snapshot</div>
        <div class="section-body">
          <div class="snapshot-grid">
            <div><div class="snapshot-label">Filming Date(s)</div><div class="snapshot-value">${filmingDates.join(", ") || "—"}</div></div>
            <div><div class="snapshot-label">Location(s)</div><div class="snapshot-value">${locationsList || "—"}</div></div>
          </div>
          <div><div class="snapshot-label">Crew</div><div class="snapshot-value">${crewList || "—"}</div></div>
        </div>
      </div>

      ${deliverablesList ? `
      <div class="section">
        <div class="section-header">Deliverables</div>
        <div class="section-body"><ul class="deliverables-list">${deliverablesList}</ul></div>
      </div>
      ` : ""}

      <h2 style="font-size:18px;font-weight:700;margin:28px 0 16px;border:none;">Projects & Activity</h2>
      ${projectCards || "<p>No projects this period</p>"}
    ` });
  }

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
                {isPerProject ? (
                  <>
                    <p className="text-2xl font-semibold text-foreground">{monthlySummary.rows.length}</p>
                    <p className="text-xs text-muted-foreground mt-1">Projects</p>
                  </>
                ) : (
                  <>
                    <p className="text-2xl font-semibold text-foreground">{formatHours(monthlySummary.totalHours)}</p>
                    <p className="text-xs text-muted-foreground mt-1">Total Hours</p>
                  </>
                )}
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
                <div className="flex items-center gap-3">
                  <button onClick={generateReport} className="flex items-center gap-1 text-xs text-primary hover:text-primary/80">
                    <FileText className="w-3.5 h-3.5" /> View Report
                  </button>
                  <button onClick={handleDownloadMonthly} className="flex items-center gap-1 text-xs text-primary hover:text-primary/80">
                    <Download className="w-3.5 h-3.5" /> Download CSV
                  </button>
                </div>
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
                        {isPerProject ? (
                          <p className="text-sm font-semibold text-foreground">{formatCurrency(r.amount)}</p>
                        ) : (
                          <>
                            <p className="text-sm font-semibold text-foreground">{formatHours(r.hours)}</p>
                            <p className="text-[10px] text-muted-foreground">{formatCurrency(r.amount)}</p>
                          </>
                        )}
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
                {isPerProject ? (
                  <>
                    <p className="text-2xl font-semibold text-foreground">{annualProjects.length}</p>
                    <p className="text-xs text-muted-foreground mt-1">Total Projects ({year})</p>
                  </>
                ) : (
                  <>
                    <p className="text-2xl font-semibold text-foreground">{formatHours(annualSummary.yearTotalHours)}</p>
                    <p className="text-xs text-muted-foreground mt-1">Total Hours ({year})</p>
                  </>
                )}
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
                      {isPerProject ? (
                        <p className="text-sm font-semibold text-foreground">{formatCurrency(m.amount)}</p>
                      ) : (
                        <>
                          <p className="text-sm font-semibold text-foreground">{formatHours(m.hours)}</p>
                          <p className="text-[10px] text-muted-foreground">{formatCurrency(m.amount)}</p>
                        </>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Report Preview Overlay */}
      {preview && (
        <ReportPreview
          title={preview.title}
          html={preview.html}
          onClose={() => setPreview(null)}
        />
      )}
    </div>
  );
}
