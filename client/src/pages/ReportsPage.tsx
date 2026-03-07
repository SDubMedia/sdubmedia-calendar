// ============================================================
// Reports Page — Marketing Budget, Earnings, Client Reports
// Design: Dark Cinematic Studio | Amber accent on charcoal
// ============================================================

import { useState, useMemo } from "react";
import { useApp } from "@/contexts/AppContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { FileDown, BarChart2, DollarSign, Users, TrendingUp, Calendar } from "lucide-react";
import { toast } from "sonner";

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = [CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2];
const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December"
];

function formatHours(h: number) {
  return h % 1 === 0 ? `${h}h` : `${h.toFixed(1)}h`;
}

function getProjectHours(project: any) {
  const crewHours = (project.crew || []).reduce((s: number, c: any) => s + (Number(c.hoursDeducted) || 0), 0);
  const postHours = (project.postProduction || []).reduce((s: number, c: any) => s + (Number(c.hoursDeducted) || 0), 0);
  return { crewHours, postHours, totalHours: crewHours + postHours };
}

// ---- Simple print-based PDF generation ----
function printReport(title: string, html: string) {
  const win = window.open("", "_blank");
  if (!win) { toast.error("Please allow pop-ups to generate reports"); return; }
  win.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>${title}</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #1a1a1a; padding: 40px; font-size: 13px; }
        h1 { font-size: 22px; font-weight: 700; margin-bottom: 4px; color: #111; }
        h2 { font-size: 15px; font-weight: 600; margin: 20px 0 8px; color: #333; border-bottom: 1px solid #e5e5e5; padding-bottom: 4px; }
        .subtitle { color: #666; font-size: 12px; margin-bottom: 24px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
        th { background: #f5f5f5; text-align: left; padding: 8px 10px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #555; border-bottom: 2px solid #e0e0e0; }
        td { padding: 7px 10px; border-bottom: 1px solid #f0f0f0; font-size: 12px; }
        tr:last-child td { border-bottom: none; }
        .total-row td { font-weight: 700; background: #f9f9f9; border-top: 2px solid #e0e0e0; }
        .stat-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 24px; }
        .stat-box { border: 1px solid #e5e5e5; border-radius: 8px; padding: 14px; }
        .stat-label { font-size: 11px; color: #888; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px; }
        .stat-value { font-size: 20px; font-weight: 700; color: #111; }
        .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; }
        .badge-green { background: #d1fae5; color: #065f46; }
        .badge-blue { background: #dbeafe; color: #1e40af; }
        .badge-amber { background: #fef3c7; color: #92400e; }
        .badge-gray { background: #f3f4f6; color: #374151; }
        @media print { body { padding: 20px; } }
      </style>
    </head>
    <body>
      ${html}
      <script>window.onload = () => { window.print(); }<\/script>
    </body>
    </html>
  `);
  win.document.close();
}

export default function ReportsPage() {
  const { data, loading } = useApp();
  const [selectedYear, setSelectedYear] = useState(String(CURRENT_YEAR));
  const [selectedMonth, setSelectedMonth] = useState(String(new Date().getMonth() + 1));
  const [selectedClientId, setSelectedClientId] = useState<string>("all");

  // ---- Derived data ----
  const filteredProjects = useMemo(() => {
    return data.projects.filter(p => {
      const [y, m] = p.date.split("-");
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

  // ---- Retainer stats ----
  const retainerStats = useMemo(() => {
    return data.clients.map(client => {
      const payments = data.retainerPayments.filter(p =>
        p.clientId === client.id && p.date.startsWith(selectedYear)
      );
      const totalPaid = payments.reduce((s, p) => s + Number(p.hours), 0);
      const clientProjects = filteredProjects.filter(p => p.clientId === client.id);
      const totalUsed = clientProjects.reduce((s, p) => {
        const { totalHours } = getProjectHours(p);
        return s + totalHours;
      }, 0);
      return { client, totalPaid, totalUsed, balance: totalPaid - totalUsed, projectCount: clientProjects.length };
    });
  }, [data.clients, data.retainerPayments, filteredProjects, selectedYear]);

  // ---- Monthly earnings ----
  const monthlyStats = useMemo(() => {
    return MONTHS.map((month, idx) => {
      const monthNum = idx + 1;
      const projects = filteredProjects.filter(p => parseInt(p.date.split("-")[1]) === monthNum);
      const totalHours = projects.reduce((s, p) => s + getProjectHours(p).totalHours, 0);
      const payments = data.retainerPayments.filter(p =>
        p.clientId !== "all" && p.date.startsWith(`${selectedYear}-${String(monthNum).padStart(2,"0")}`)
      );
      const retainerHours = payments.reduce((s, p) => s + Number(p.hours), 0);
      return { month, monthNum, projects: projects.length, totalHours, retainerHours };
    });
  }, [filteredProjects, data.retainerPayments, selectedYear]);

  // ---- Report generators ----
  function generateEarningsReport() {
    const stats = retainerStats;
    const totalProjects = filteredProjects.length;
    const totalHoursUsed = filteredProjects.reduce((s, p) => s + getProjectHours(p).totalHours, 0);
    const totalRetainerHours = stats.reduce((s, r) => s + r.totalPaid, 0);

    const monthlyRows = monthlyStats.map(m => `
      <tr>
        <td>${m.month}</td>
        <td>${m.projects}</td>
        <td>${formatHours(m.totalHours)}</td>
        <td>${formatHours(m.retainerHours)}</td>
      </tr>
    `).join("");

    const clientRows = stats.map(s => `
      <tr>
        <td>${s.client.company}</td>
        <td>${s.projectCount}</td>
        <td>${formatHours(s.totalPaid)}</td>
        <td>${formatHours(s.totalUsed)}</td>
        <td>${formatHours(s.balance)}</td>
      </tr>
    `).join("");

    printReport(`Earnings Report ${selectedYear}`, `
      <h1>Earnings Report — ${selectedYear}</h1>
      <p class="subtitle">Generated ${new Date().toLocaleDateString()} · SDub Media</p>
      <div class="stat-grid">
        <div class="stat-box"><div class="stat-label">Total Projects</div><div class="stat-value">${totalProjects}</div></div>
        <div class="stat-box"><div class="stat-label">Total Hours Used</div><div class="stat-value">${formatHours(totalHoursUsed)}</div></div>
        <div class="stat-box"><div class="stat-label">Total Retainer Hours</div><div class="stat-value">${formatHours(totalRetainerHours)}</div></div>
      </div>
      <h2>Monthly Breakdown</h2>
      <table>
        <thead><tr><th>Month</th><th>Projects</th><th>Hours Used</th><th>Retainer Hours</th></tr></thead>
        <tbody>${monthlyRows}</tbody>
        <tfoot><tr class="total-row"><td>Total</td><td>${totalProjects}</td><td>${formatHours(totalHoursUsed)}</td><td>${formatHours(totalRetainerHours)}</td></tr></tfoot>
      </table>
      <h2>Client Summary</h2>
      <table>
        <thead><tr><th>Client</th><th>Projects</th><th>Retainer Paid</th><th>Hours Used</th><th>Balance</th></tr></thead>
        <tbody>${clientRows}</tbody>
      </table>
    `);
  }

  function generateClientReport(clientId: string) {
    const client = data.clients.find(c => c.id === clientId);
    if (!client) return;

    const clientProjects = filteredProjects.filter(p => p.clientId === clientId);
    const payments = data.retainerPayments.filter(p => p.clientId === clientId && p.date.startsWith(selectedYear));
    const totalPaid = payments.reduce((s, p) => s + Number(p.hours), 0);
    const totalUsed = clientProjects.reduce((s, p) => s + getProjectHours(p).totalHours, 0);

    const projectRows = clientProjects.map(p => {
      const type = data.projectTypes.find(t => t.id === p.projectTypeId)?.name || p.projectTypeId;
      const loc = data.locations.find(l => l.id === p.locationId)?.name || "";
      const { totalHours } = getProjectHours(p);
      const statusMap: Record<string,string> = { upcoming: "badge-blue", in_editing: "badge-amber", completed: "badge-green", filmed: "badge-gray", filming_done: "badge-gray" };
      const statusBadge = statusMap[p.status] || "badge-gray";
      return `
        <tr>
          <td>${p.date}</td>
          <td>${type}</td>
          <td>${loc}</td>
          <td>${p.startTime}–${p.endTime}</td>
          <td>${formatHours(totalHours)}</td>
          <td><span class="badge ${statusBadge}">${p.status.replace("_"," ")}</span></td>
        </tr>
      `;
    }).join("");

    const paymentRows = payments.map(p => `
      <tr><td>${p.date}</td><td>${formatHours(Number(p.hours))}</td><td>${p.notes}</td></tr>
    `).join("");

    printReport(`Client Report — ${client.company} ${selectedYear}`, `
      <h1>${client.company}</h1>
      <p class="subtitle">${client.contactName} · ${client.phone} · ${client.email}</p>
      <div class="stat-grid">
        <div class="stat-box"><div class="stat-label">Projects ${selectedYear}</div><div class="stat-value">${clientProjects.length}</div></div>
        <div class="stat-box"><div class="stat-label">Retainer Hours Paid</div><div class="stat-value">${formatHours(totalPaid)}</div></div>
        <div class="stat-box"><div class="stat-label">Hours Used</div><div class="stat-value">${formatHours(totalUsed)}</div></div>
      </div>
      <h2>Projects</h2>
      <table>
        <thead><tr><th>Date</th><th>Type</th><th>Location</th><th>Time</th><th>Hours</th><th>Status</th></tr></thead>
        <tbody>${projectRows || "<tr><td colspan='6'>No projects found</td></tr>"}</tbody>
        <tfoot><tr class="total-row"><td colspan="4">Total</td><td>${formatHours(totalUsed)}</td><td></td></tr></tfoot>
      </table>
      <h2>Retainer Payments</h2>
      <table>
        <thead><tr><th>Date</th><th>Hours</th><th>Notes</th></tr></thead>
        <tbody>${paymentRows || "<tr><td colspan='3'>No payments found</td></tr>"}</tbody>
        <tfoot><tr class="total-row"><td>Total</td><td>${formatHours(totalPaid)}</td><td></td></tr></tfoot>
      </table>
    `);
  }

  function generateMonthlyReport() {
    const projects = monthlyProjects;
    const totalHours = projects.reduce((s, p) => s + getProjectHours(p).totalHours, 0);
    const monthName = MONTHS[parseInt(selectedMonth) - 1];

    const projectRows = projects.map(p => {
      const client = data.clients.find(c => c.id === p.clientId)?.company || "";
      const type = data.projectTypes.find(t => t.id === p.projectTypeId)?.name || "";
      const loc = data.locations.find(l => l.id === p.locationId)?.name || "";
      const { crewHours, postHours, totalHours: th } = getProjectHours(p);
      const statusMap2: Record<string,string> = { upcoming: "badge-blue", in_editing: "badge-amber", completed: "badge-green", filmed: "badge-gray", filming_done: "badge-gray" };
      const statusBadge = statusMap2[p.status] || "badge-gray";
      return `
        <tr>
          <td>${p.date}</td>
          <td>${client}</td>
          <td>${type}</td>
          <td>${loc}</td>
          <td>${formatHours(crewHours)}</td>
          <td>${formatHours(postHours)}</td>
          <td>${formatHours(th)}</td>
          <td><span class="badge ${statusBadge}">${p.status.replace("_"," ")}</span></td>
        </tr>
      `;
    }).join("");

    printReport(`Monthly Report — ${monthName} ${selectedYear}`, `
      <h1>Monthly Production Report</h1>
      <p class="subtitle">${monthName} ${selectedYear} · SDub Media</p>
      <div class="stat-grid">
        <div class="stat-box"><div class="stat-label">Total Projects</div><div class="stat-value">${projects.length}</div></div>
        <div class="stat-box"><div class="stat-label">Total Hours</div><div class="stat-value">${formatHours(totalHours)}</div></div>
        <div class="stat-box"><div class="stat-label">Clients</div><div class="stat-value">${new Set(projects.map(p => p.clientId)).size}</div></div>
      </div>
      <h2>Projects</h2>
      <table>
        <thead><tr><th>Date</th><th>Client</th><th>Type</th><th>Location</th><th>Crew Hrs</th><th>Post Hrs</th><th>Total</th><th>Status</th></tr></thead>
        <tbody>${projectRows || "<tr><td colspan='8'>No projects this month</td></tr>"}</tbody>
        <tfoot><tr class="total-row"><td colspan="6">Total</td><td>${formatHours(totalHours)}</td><td></td></tr></tfoot>
      </table>
    `);
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

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
          Reports
        </h1>
        <p className="text-muted-foreground text-sm mt-1">Generate and download production reports as PDFs</p>
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
            <p className="text-2xl font-bold text-foreground">
              {formatHours(filteredProjects.reduce((s, p) => s + getProjectHours(p).totalHours, 0))}
            </p>
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
              <span className="text-xs text-muted-foreground uppercase tracking-wide">Retainer Bal.</span>
            </div>
            <p className="text-2xl font-bold text-foreground">
              {formatHours(retainerStats.reduce((s, r) => s + r.balance, 0))}
            </p>
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
                  <FileDown className="w-4 h-4" />
                  Download PDF
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
                      <th className="text-right py-2 px-3 text-muted-foreground font-medium text-xs uppercase tracking-wide">Hours Used</th>
                      <th className="text-right py-2 px-3 text-muted-foreground font-medium text-xs uppercase tracking-wide">Retainer Hrs</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthlyStats.map(m => (
                      <tr key={m.monthNum} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                        <td className="py-2 px-3 text-foreground">{m.month}</td>
                        <td className="py-2 px-3 text-right text-muted-foreground">{m.projects}</td>
                        <td className="py-2 px-3 text-right text-foreground">{formatHours(m.totalHours)}</td>
                        <td className="py-2 px-3 text-right text-primary">{formatHours(m.retainerHours)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-border">
                      <td className="py-2 px-3 font-bold text-foreground">Total</td>
                      <td className="py-2 px-3 text-right font-bold text-foreground">{filteredProjects.length}</td>
                      <td className="py-2 px-3 text-right font-bold text-foreground">
                        {formatHours(filteredProjects.reduce((s, p) => s + getProjectHours(p).totalHours, 0))}
                      </td>
                      <td className="py-2 px-3 text-right font-bold text-primary">
                        {formatHours(retainerStats.reduce((s, r) => s + r.totalPaid, 0))}
                      </td>
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
                  <FileDown className="w-4 h-4" />
                  Download PDF
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
                          <p className="text-sm font-semibold text-primary">{formatHours(totalHours)}</p>
                          <p className="text-xs text-muted-foreground">{formatHours(crewHours)} crew + {formatHours(postHours)} post</p>
                          <Badge variant="outline" className="text-[10px] mt-1">
                            {p.status.replace("_", " ")}
                          </Badge>
                        </div>
                      </div>
                    );
                  })}
                  <Separator />
                  <div className="flex justify-between items-center px-1">
                    <span className="text-sm text-muted-foreground">Total hours this month</span>
                    <span className="text-base font-bold text-primary">
                      {formatHours(monthlyProjects.reduce((s, p) => s + getProjectHours(p).totalHours, 0))}
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
            const stat = retainerStats.find(s => s.client.id === client.id);
            if (!stat) return null;
            return (
              <Card key={client.id} className="bg-card border-border">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <CardTitle className="text-base">{client.company}</CardTitle>
                      <p className="text-xs text-muted-foreground mt-0.5">{client.contactName} · {client.email}</p>
                    </div>
                    <Button size="sm" onClick={() => generateClientReport(client.id)} className="gap-2">
                      <FileDown className="w-4 h-4" />
                      Download PDF
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
                      <p className="text-xs text-muted-foreground mb-1">Hours Used</p>
                      <p className="text-xl font-bold text-foreground">{formatHours(stat.totalUsed)}</p>
                    </div>
                    <div className="text-center p-3 rounded-lg bg-muted/30">
                      <p className="text-xs text-muted-foreground mb-1">Balance</p>
                      <p className={`text-xl font-bold ${stat.balance >= 0 ? "text-green-400" : "text-red-400"}`}>
                        {formatHours(stat.balance)}
                      </p>
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
  );
}
