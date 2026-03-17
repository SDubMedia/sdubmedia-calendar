// ============================================================
// Reports Page — Earnings, Monthly, Client Reports
// Design: Dark Cinematic Studio | Amber accent on charcoal
// Billing Model: Hourly — client billed at flat rate, crew paid individually
// ============================================================

import { useState, useMemo } from "react";
import { useApp } from "@/contexts/AppContext";
import type { Project, Client, AppData } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Eye, BarChart2, DollarSign, Users, TrendingUp, Calendar } from "lucide-react";
import ReportPreview from "@/components/ReportPreview";

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = [CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2];
const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December"
];

function formatHours(h: number) {
  return h % 1 === 0 ? `${h}h` : `${h.toFixed(1)}h`;
}

function formatCurrency(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(n);
}

function getProjectHours(project: Project) {
  const crewHours = (project.crew || []).reduce((s, c) => s + Number(c.hoursWorked ?? 0), 0);
  const postHours = (project.postProduction || []).reduce((s, c) => s + Number(c.hoursWorked ?? 0), 0);
  return { crewHours, postHours, totalHours: crewHours + postHours };
}

function getProjectCrewCost(project: Project) {
  return [...(project.crew || []), ...(project.postProduction || [])].reduce(
    (s, e) => s + Number(e.hoursWorked ?? 0) * Number(e.payRatePerHour ?? 0), 0
  );
}

// Preview state type
interface ReportPreviewState {
  title: string;
  html: string;
}

interface ClientBillingStat {
  client: Client;
  projectCount: number;
  totalHours: number;
  invoiceAmount: number;
  crewCost: number;
  margin: number;
}

export default function ReportsPage() {
  const { data, loading } = useApp();
  const [selectedYear, setSelectedYear] = useState(String(CURRENT_YEAR));
  const [selectedMonth, setSelectedMonth] = useState(String(new Date().getMonth() + 1));
  const [selectedClientId, setSelectedClientId] = useState<string>("all");
  const [preview, setPreview] = useState<ReportPreviewState | null>(null);

  // ---- Derived data ----
  const filteredProjects = useMemo(() => {
    return data.projects.filter(p => {
      const [y] = p.date.split("-");
      const yearMatch = y === selectedYear;
      const clientMatch = selectedClientId === "all" || p.clientId === selectedClientId;
      return yearMatch && clientMatch;
    });
  }, [data.projects, selectedYear, selectedClientId]);

  const monthlyProjects = useMemo(() => {
    return filteredProjects.filter(p => {
      const m = parseInt(p.date.split("-")[1]);
      return m === parseInt(selectedMonth);
    });
  }, [filteredProjects, selectedMonth]);

  // ---- Billing stats per client ----
  const clientBillingStats = useMemo((): ClientBillingStat[] => {
    return data.clients.map(client => {
      const clientProjects = filteredProjects.filter(p => p.clientId === client.id);
      const totalHours = clientProjects.reduce((s, p) => s + getProjectHours(p).totalHours, 0);
      const crewCost = clientProjects.reduce((s, p) => s + getProjectCrewCost(p), 0);
      const invoiceAmount = totalHours * Number(client.billingRatePerHour ?? 0);
      const margin = invoiceAmount - crewCost;
      return { client, projectCount: clientProjects.length, totalHours, invoiceAmount, crewCost, margin };
    });
  }, [data.clients, filteredProjects]);

  // ---- Monthly stats ----
  const monthlyStats = useMemo(() => {
    return MONTHS.map((month, idx) => {
      const monthNum = idx + 1;
      const projects = filteredProjects.filter(p => parseInt(p.date.split("-")[1]) === monthNum);
      const totalHours = projects.reduce((s, p) => s + getProjectHours(p).totalHours, 0);
      const invoiceAmount = projects.reduce((s, p) => {
        const client = data.clients.find(c => c.id === p.clientId);
        return s + getProjectHours(p).totalHours * Number(client?.billingRatePerHour ?? 0);
      }, 0);
      return { month, monthNum, projects: projects.length, totalHours, invoiceAmount };
    });
  }, [filteredProjects, data.clients]);

  // ---- Report generators ----
  function generateEarningsReport() {
    const totalProjects = filteredProjects.length;
    const totalHoursUsed = filteredProjects.reduce((s, p) => s + getProjectHours(p).totalHours, 0);
    const totalInvoice = clientBillingStats.reduce((s, r) => s + r.invoiceAmount, 0);

    const monthlyRows = monthlyStats.map(m => `
      <tr>
        <td>${m.month}</td>
        <td>${m.projects}</td>
        <td>${formatHours(m.totalHours)}</td>
        <td>${formatCurrency(m.invoiceAmount)}</td>
      </tr>
    `).join("");

    const clientRows = clientBillingStats.map(s => `
      <tr>
        <td>${s.client.company}</td>
        <td>${s.projectCount}</td>
        <td>${formatHours(s.totalHours)}</td>
        <td>${formatCurrency(s.invoiceAmount)}</td>
        <td>${formatCurrency(s.crewCost)}</td>
        <td>${formatCurrency(s.margin)}</td>
      </tr>
    `).join("");

    setPreview({ title: `Earnings Report ${selectedYear}`, html: `
      <h1>Earnings Report — ${selectedYear}</h1>
      <p class="subtitle">Generated ${new Date().toLocaleDateString()} · SDub Media</p>
      <div class="stat-grid">
        <div class="stat-box"><div class="stat-label">Total Projects</div><div class="stat-value">${totalProjects}</div></div>
        <div class="stat-box"><div class="stat-label">Total Hours</div><div class="stat-value">${formatHours(totalHoursUsed)}</div></div>
        <div class="stat-box"><div class="stat-label">Total Invoice</div><div class="stat-value">${formatCurrency(totalInvoice)}</div></div>
      </div>
      <h2>Monthly Breakdown</h2>
      <table>
        <thead><tr><th>Month</th><th>Projects</th><th>Hours</th><th>Invoice Amount</th></tr></thead>
        <tbody>${monthlyRows}</tbody>
        <tfoot><tr class="total-row"><td>Total</td><td>${totalProjects}</td><td>${formatHours(totalHoursUsed)}</td><td>${formatCurrency(totalInvoice)}</td></tr></tfoot>
      </table>
      <h2>Client Summary</h2>
      <table>
        <thead><tr><th>Client</th><th>Projects</th><th>Hours</th><th>Invoice</th><th>Crew Cost</th><th>Margin</th></tr></thead>
        <tbody>${clientRows}</tbody>
      </table>
    ` });
  }

  function generateClientReport(clientId: string) {
    const client = data.clients.find(c => c.id === clientId);
    if (!client) return;

    const monthNum = parseInt(selectedMonth);
    const monthName = MONTHS[monthNum - 1];
    const yr = parseInt(selectedYear);

    // Filter projects for this client in the selected month
    const clientProjects = filteredProjects
      .filter(p => p.clientId === clientId && parseInt(p.date.split("-")[1]) === monthNum)
      .sort((a, b) => b.date.localeCompare(a.date));

    // Calculate hours
    const totalProductionHours = clientProjects.reduce((s, p) =>
      s + (p.crew || []).reduce((cs, c) => cs + Number(c.hoursWorked ?? 0), 0), 0);
    const totalEditorHours = clientProjects.reduce((s, p) =>
      s + (p.postProduction || []).reduce((ps, e) => ps + Number(e.hoursWorked ?? 0), 0), 0);
    const totalHours = totalProductionHours + totalEditorHours;
    const totalInvoice = totalHours * Number(client.billingRatePerHour ?? 0);

    // Report number
    const clientPrefix = client.company.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 3);
    const reportNum = `${clientPrefix}-${yr}-${String(monthNum).padStart(2, "0")}-001`;

    // Report period
    const lastDay = new Date(yr, monthNum, 0).getDate();
    const periodStart = `${monthName.slice(0, 3)} 1, ${yr}`;
    const periodEnd = `${monthName.slice(0, 3)} ${lastDay}, ${yr}`;
    const issueDate = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

    // Collect all filming dates, locations, crew, and deliverables
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

    // Build project cards
    const projectCards = clientProjects.map(p => {
      const type = data.projectTypes.find(t => t.id === p.projectTypeId)?.name || "";
      const loc = data.locations.find(l => l.id === p.locationId);
      const crewHours = (p.crew || []).reduce((s, c) => s + Number(c.hoursWorked ?? 0), 0);
      const postHours = (p.postProduction || []).reduce((s, e) => s + Number(e.hoursWorked ?? 0), 0);
      const projTotal = crewHours + postHours;
      const dateStr = new Date(p.date + "T00:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

      const locationHtml = loc ? `
        <div class="project-meta-label">Filming Location</div>
        <div class="project-meta-value">${loc.address} ${loc.city}, ${loc.state} ${loc.zip}</div>
      ` : "";

      const deliverables = (p.editTypes || []).map(et => `<li>${et}</li>`).join("");
      const deliverablesHtml = deliverables ? `
        <div class="project-meta-label">Deliverables</div>
        <ul class="deliverables-list">${deliverables}</ul>
      ` : "";

      const crewEntries = (p.crew || []).map(e => {
        const member = data.crewMembers.find(c => c.id === e.crewMemberId);
        return `
          <div class="crew-entry">
            <div><div class="crew-role">Filming</div><div class="crew-name">${member?.name ?? "Unknown"}</div></div>
            <div class="crew-hours">${Number(e.hoursWorked).toFixed(2)} hrs</div>
          </div>
        `;
      }).join("");

      const postEntries = (p.postProduction || []).map(e => {
        const member = data.crewMembers.find(c => c.id === e.crewMemberId);
        return `
          <div class="crew-entry">
            <div><div class="crew-role">Editing</div><div class="crew-name">${member?.name ?? "Unknown"}</div></div>
            <div class="crew-hours">${Number(e.hoursWorked).toFixed(2)} hrs</div>
          </div>
        `;
      }).join("");

      return `
        <div class="project-card">
          <div class="project-card-header">
            <div>
              <div class="project-name">${type}</div>
              <div class="project-date">${dateStr}</div>
            </div>
            <div style="text-align: right;">
              <div class="hours-badge">${projTotal.toFixed(2)} hrs</div>
              <div class="hours-detail">Production: ${crewHours.toFixed(2)}</div>
              <div class="hours-detail">Editing: ${postHours.toFixed(2)}</div>
            </div>
          </div>
          <hr class="project-card-divider" />
          <div class="project-card-body">
            ${locationHtml}
            ${deliverablesHtml}
            <div style="margin-top: 16px;">
              ${crewEntries}
              ${postEntries}
            </div>
          </div>
        </div>
      `;
    }).join("");

    const crewList = Array.from(crewSet.values()).map(([name, role]) => `${name} (${role})`).join(", ");
    const locationsList = Array.from(locationSet.values()).join("; ");
    const deliverablesList = Array.from(allDeliverables).map(d => `<li>${d}</li>`).join("");

    setPreview({ title: `Client Report — ${client.company} ${monthName} ${yr}`, html: `
      <!-- Header Banner -->
      <div class="invoice-header">
        <h1>Hourly Activity Report & Project Invoice</h1>
        <div class="meta-grid">
          <div><div class="meta-label">Report #</div><div class="meta-value">${reportNum}</div></div>
          <div><div class="meta-label">Report Period</div><div class="meta-value">${periodStart} - ${periodEnd}</div></div>
          <div><div class="meta-label">Issue Date</div><div class="meta-value">${issueDate}</div></div>
        </div>
      </div>

      <!-- Hours Summary -->
      <div class="section">
        <div class="section-header">Hours Summary</div>
        <div class="section-body">
          <div class="hours-row"><span>Production Hours Used</span><span>${totalProductionHours.toFixed(1)} hrs</span></div>
          <div class="hours-row"><span>Editor Hours Used</span><span>${totalEditorHours.toFixed(1)} hrs</span></div>
          <div class="hours-row total"><span>Total Hours Used</span><span>${totalHours.toFixed(1)} hrs</span></div>
          <div class="hours-row highlight"><span>Total Value of Hours Used</span><span class="hours-value">${formatCurrency(totalInvoice)}</span></div>
        </div>
      </div>

      <!-- Payment Summary -->
      <div class="section">
        <div class="section-header">Payment Summary</div>
        <div class="payment-box">
          <div class="amount-due">
            <span class="label">Amount Due</span>
            <span class="value">${formatCurrency(totalInvoice)}</span>
          </div>
          <div class="calc">${totalHours.toFixed(1)} hrs × $${Number(client.billingRatePerHour).toFixed(0)}/hr</div>
          <div class="note">Make checks payable to Showcase Photography if additional charges apply.</div>
        </div>
      </div>

      <!-- Service Provider & Client -->
      <div class="section">
        <div class="section-header">Service Provider & Client</div>
        <div class="section-body">
          <div class="provider-grid">
            <div><div class="col-label">Service Provider</div><div class="col-value">Showcase Photography</div></div>
            <div><div class="col-label">Client</div><div class="col-value">${client.company}</div></div>
          </div>
        </div>
      </div>

      <!-- Project Snapshot -->
      <div class="section">
        <div class="section-header">Project Snapshot</div>
        <div class="section-body">
          <div class="snapshot-grid">
            <div><div class="snapshot-label">Filming Date(s)</div><div class="snapshot-value">${filmingDates.join(", ")}</div></div>
            <div><div class="snapshot-label">Location(s)</div><div class="snapshot-value">${locationsList || "—"}</div></div>
          </div>
          <div><div class="snapshot-label">Crew</div><div class="snapshot-value">${crewList || "—"}</div></div>
        </div>
      </div>

      <!-- Scope of Work & Deliverables -->
      <div class="section">
        <div class="section-header">Scope of Work & Deliverables</div>
        <div class="section-body">
          <ul class="deliverables-list">${deliverablesList || "<li>No deliverables listed</li>"}</ul>
        </div>
      </div>

      <!-- Projects & Activity -->
      <h2 style="font-size: 18px; font-weight: 700; margin: 28px 0 16px; border: none;">Projects & Activity</h2>
      ${projectCards || "<p>No projects this period</p>"}

      <!-- Footer -->
      <div class="report-footer">
        <p><strong>Revision Policy:</strong> Two rounds of revisions included</p>
        <p><strong>Carryover Policy:</strong> Unused hours carry over to the next month</p>
        <div class="contact">Questions? ${client.email || client.phone || "(contact not provided)"}</div>
      </div>
    ` });
  }

  function generateMonthlyReport() {
    const projects = monthlyProjects;
    const totalHours = projects.reduce((s, p) => s + getProjectHours(p).totalHours, 0);
    const monthName = MONTHS[parseInt(selectedMonth) - 1];

    const projectRows = projects.map(p => {
      const client = data.clients.find(c => c.id === p.clientId);
      const type = data.projectTypes.find(t => t.id === p.projectTypeId)?.name || "";
      const loc = data.locations.find(l => l.id === p.locationId)?.name || "";
      const { crewHours, postHours, totalHours: th } = getProjectHours(p);
      const crewCost = getProjectCrewCost(p);
      const invoiceAmt = th * Number(client?.billingRatePerHour ?? 0);
      const statusMap: Record<string,string> = { upcoming: "badge-blue", in_editing: "badge-amber", completed: "badge-green", filming_done: "badge-gray" };
      const statusBadge = statusMap[p.status] || "badge-gray";
      return `
        <tr>
          <td>${p.date}</td>
          <td>${client?.company || ""}</td>
          <td>${type}</td>
          <td>${loc}</td>
          <td>${formatHours(crewHours)}</td>
          <td>${formatHours(postHours)}</td>
          <td>${formatHours(th)}</td>
          <td>${formatCurrency(invoiceAmt)}</td>
          <td>${formatCurrency(crewCost)}</td>
          <td><span class="badge ${statusBadge}">${p.status.replace(/_/g," ")}</span></td>
        </tr>
      `;
    }).join("");

    const totalInvoice = projects.reduce((s, p) => {
      const client = data.clients.find(c => c.id === p.clientId);
      return s + getProjectHours(p).totalHours * Number(client?.billingRatePerHour ?? 0);
    }, 0);
    const totalCrewCost = projects.reduce((s, p) => s + getProjectCrewCost(p), 0);

    setPreview({ title: `Monthly Report — ${monthName} ${selectedYear}`, html: `
      <h1>Monthly Production Report</h1>
      <p class="subtitle">${monthName} ${selectedYear} · SDub Media</p>
      <div class="stat-grid">
        <div class="stat-box"><div class="stat-label">Total Projects</div><div class="stat-value">${projects.length}</div></div>
        <div class="stat-box"><div class="stat-label">Total Hours</div><div class="stat-value">${formatHours(totalHours)}</div></div>
        <div class="stat-box"><div class="stat-label">Invoice Amount</div><div class="stat-value">${formatCurrency(totalInvoice)}</div></div>
      </div>
      <h2>Projects</h2>
      <table>
        <thead><tr><th>Date</th><th>Client</th><th>Type</th><th>Location</th><th>Crew Hrs</th><th>Post Hrs</th><th>Total</th><th>Invoice</th><th>Crew Cost</th><th>Status</th></tr></thead>
        <tbody>${projectRows || "<tr><td colspan='10'>No projects this month</td></tr>"}</tbody>
        <tfoot><tr class="total-row"><td colspan="6">Total</td><td>${formatHours(totalHours)}</td><td>${formatCurrency(totalInvoice)}</td><td>${formatCurrency(totalCrewCost)}</td><td></td></tr></tfoot>
      </table>
    ` });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-muted-foreground text-sm">Loading reports...</p>
        </div>
      </div>
    );
  }

  const ytdHours = filteredProjects.reduce((s, p) => s + getProjectHours(p).totalHours, 0);
  const ytdInvoice = clientBillingStats.reduce((s, r) => s + r.invoiceAmount, 0);

  return (
    <>
    {preview && (
      <ReportPreview
        title={preview.title}
        html={preview.html}
        onClose={() => setPreview(null)}
      />
    )}
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
          Reports
        </h1>
        <p className="text-muted-foreground text-sm mt-1">Preview and export production reports as PDFs</p>
      </div>

      {/* Filters */}
      <Card className="bg-card border-border">
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-wrap gap-3 items-center">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Year:</span>
              <Select value={selectedYear} onValueChange={setSelectedYear}>
                <SelectTrigger className="w-24 h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {YEARS.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Month:</span>
              <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                <SelectTrigger className="w-32 h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTHS.map((m, i) => <SelectItem key={i+1} value={String(i+1)}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Client:</span>
              <Select value={selectedClientId} onValueChange={setSelectedClientId}>
                <SelectTrigger className="w-48 h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Clients</SelectItem>
                  {data.clients.map(c => <SelectItem key={c.id} value={c.id}>{c.company}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="bg-card border-border">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 mb-1">
              <BarChart2 className="w-4 h-4 text-primary" />
              <span className="text-xs text-muted-foreground uppercase tracking-wide">YTD Projects</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{filteredProjects.length}</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="w-4 h-4 text-primary" />
              <span className="text-xs text-muted-foreground uppercase tracking-wide">YTD Hours</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{formatHours(ytdHours)}</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 mb-1">
              <Users className="w-4 h-4 text-primary" />
              <span className="text-xs text-muted-foreground uppercase tracking-wide">This Month</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{monthlyProjects.length}</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="w-4 h-4 text-primary" />
              <span className="text-xs text-muted-foreground uppercase tracking-wide">YTD Invoice</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{formatCurrency(ytdInvoice)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Report tabs */}
      <Tabs defaultValue="earnings">
        <TabsList className="bg-muted">
          <TabsTrigger value="earnings">Earnings Report</TabsTrigger>
          <TabsTrigger value="monthly">Monthly Report</TabsTrigger>
          <TabsTrigger value="client">Client Reports</TabsTrigger>
        </TabsList>

        {/* ---- Earnings Report ---- */}
        <TabsContent value="earnings" className="mt-4 space-y-4">
          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Annual Earnings Summary — {selectedYear}</CardTitle>
                <Button size="sm" onClick={generateEarningsReport} className="gap-2">
                  <Eye className="w-4 h-4" />
                  Preview Report
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 px-3 text-muted-foreground font-medium text-xs uppercase tracking-wide">Month</th>
                      <th className="text-right py-2 px-3 text-muted-foreground font-medium text-xs uppercase tracking-wide">Projects</th>
                      <th className="text-right py-2 px-3 text-muted-foreground font-medium text-xs uppercase tracking-wide">Hours</th>
                      <th className="text-right py-2 px-3 text-muted-foreground font-medium text-xs uppercase tracking-wide">Invoice</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthlyStats.map(m => (
                      <tr key={m.monthNum} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                        <td className="py-2 px-3 text-foreground">{m.month}</td>
                        <td className="py-2 px-3 text-right text-muted-foreground">{m.projects}</td>
                        <td className="py-2 px-3 text-right text-foreground">{formatHours(m.totalHours)}</td>
                        <td className="py-2 px-3 text-right text-amber-400 font-medium">{formatCurrency(m.invoiceAmount)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-border">
                      <td className="py-2 px-3 font-bold text-foreground">Total</td>
                      <td className="py-2 px-3 text-right font-bold text-foreground">{filteredProjects.length}</td>
                      <td className="py-2 px-3 text-right font-bold text-foreground">{formatHours(ytdHours)}</td>
                      <td className="py-2 px-3 text-right font-bold text-amber-400">{formatCurrency(ytdInvoice)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---- Monthly Report ---- */}
        <TabsContent value="monthly" className="mt-4 space-y-4">
          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">
                  {MONTHS[parseInt(selectedMonth) - 1]} {selectedYear} — {monthlyProjects.length} projects
                </CardTitle>
                <Button size="sm" onClick={generateMonthlyReport} className="gap-2">
                  <Eye className="w-4 h-4" />
                  Preview Report
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {monthlyProjects.length === 0 ? (
                <p className="text-muted-foreground text-sm text-center py-8">No projects this month</p>
              ) : (
                <div className="space-y-3">
                  {monthlyProjects.map(p => {
                    const client = data.clients.find(c => c.id === p.clientId);
                    const type = data.projectTypes.find(t => t.id === p.projectTypeId);
                    const loc = data.locations.find(l => l.id === p.locationId);
                    const { crewHours, postHours, totalHours } = getProjectHours(p);
                    const invoiceAmt = totalHours * Number(client?.billingRatePerHour ?? 0);
                    return (
                      <div key={p.id} className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 border border-border/50">
                        <div className="text-center min-w-[40px]">
                          <p className="text-xs text-muted-foreground">{p.date.split("-")[1]}/{p.date.split("-")[2]}</p>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm text-foreground">{type?.name}</p>
                          <p className="text-xs text-muted-foreground">{client?.company} · {loc?.name}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{p.startTime}–{p.endTime}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-semibold text-amber-400">{formatCurrency(invoiceAmt)}</p>
                          <p className="text-xs text-muted-foreground">{formatHours(crewHours)} crew + {formatHours(postHours)} post</p>
                          <Badge variant="outline" className="text-[10px] mt-1">
                            {p.status.replace(/_/g, " ")}
                          </Badge>
                        </div>
                      </div>
                    );
                  })}
                  <Separator />
                  <div className="flex justify-between items-center px-1">
                    <span className="text-sm text-muted-foreground">Total invoice this month</span>
                    <span className="text-base font-bold text-amber-400">
                      {formatCurrency(monthlyProjects.reduce((s, p) => {
                        const client = data.clients.find(c => c.id === p.clientId);
                        return s + getProjectHours(p).totalHours * Number(client?.billingRatePerHour ?? 0);
                      }, 0))}
                    </span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---- Client Reports ---- */}
        <TabsContent value="client" className="mt-4 space-y-4">
          {data.clients.map(client => {
            const stat = clientBillingStats.find(s => s.client.id === client.id);
            if (!stat) return null;
            return (
              <Card key={client.id} className="bg-card border-border">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <CardTitle className="text-base">{client.company}</CardTitle>
                      <p className="text-xs text-muted-foreground mt-0.5">{client.contactName} · {client.email} · ${client.billingRatePerHour}/hr</p>
                    </div>
                    <Button size="sm" onClick={() => generateClientReport(client.id)} className="gap-2">
                      <Eye className="w-4 h-4" />
                      Preview Report
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-3 mb-4">
                    <div className="text-center p-3 rounded-lg bg-muted/30">
                      <p className="text-xs text-muted-foreground mb-1">Projects</p>
                      <p className="text-xl font-bold text-foreground">{stat.projectCount}</p>
                    </div>
                    <div className="text-center p-3 rounded-lg bg-muted/30">
                      <p className="text-xs text-muted-foreground mb-1">Hours</p>
                      <p className="text-xl font-bold text-foreground">{formatHours(stat.totalHours)}</p>
                    </div>
                    <div className="text-center p-3 rounded-lg bg-muted/30">
                      <p className="text-xs text-muted-foreground mb-1">Invoice</p>
                      <p className="text-xl font-bold text-amber-400">{formatCurrency(stat.invoiceAmount)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
          {data.clients.length === 0 && (
            <p className="text-muted-foreground text-sm text-center py-8">No clients found</p>
          )}
        </TabsContent>
      </Tabs>
    </div>
    </>
  );
}
