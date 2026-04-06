// ============================================================
// DashboardPage — At-a-glance business overview
// ============================================================

import { useMemo, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { useAuth } from "@/contexts/AuthContext";
import { getProjectInvoiceAmount, getProjectCrewCost } from "@/lib/data";
import type { InvoiceStatus, UserRole, Project, DashboardWidgetId } from "@/lib/types";
import { DEFAULT_DASHBOARD_WIDGETS } from "@/lib/types";
import ProjectDetailSheet from "@/components/ProjectDetailSheet";
import { Link } from "wouter";
import { CalendarDays, FileText, TrendingUp, ArrowRight, Clock, MapPin, Eye, Film, Car, Users } from "lucide-react";
import { DEFAULT_PIPELINE_STAGES } from "@/lib/types";
import { cn } from "@/lib/utils";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

const STATUS_COLORS: Record<InvoiceStatus, string> = {
  draft: "bg-zinc-500/20 text-zinc-300 border-zinc-500/30",
  sent: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  paid: "bg-green-500/20 text-green-300 border-green-500/30",
  void: "bg-red-500/20 text-red-300 border-red-500/30",
};

function formatCurrency(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
}

function formatCurrencyFull(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(n);
}

function formatDate(d: string): string {
  if (!d) return "";
  const date = new Date(d + "T00:00:00");
  return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default function DashboardPage() {
  const { data } = useApp();
  const { profile, viewAsRole, setViewAsRole } = useAuth();
  const isRealOwner = profile?.role === "owner";
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const widgetConfig = data.organization?.dashboardWidgets || DEFAULT_DASHBOARD_WIDGETS;
  const isWidgetEnabled = (id: DashboardWidgetId) => {
    const w = widgetConfig.find(c => c.id === id);
    return w ? w.enabled : true;
  };
  const widgetOrder = widgetConfig.filter(w => w.enabled).map(w => w.id);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const weekFromNow = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth();

  // Upcoming projects (next 7 days)
  const upcomingProjects = useMemo(() => {
    return data.projects
      .filter(p => p.date >= todayStr && p.date <= weekFromNow && p.status === "upcoming")
      .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
  }, [data.projects, todayStr, weekFromNow]);

  // Projects by status
  const projectsByStatus = useMemo(() => ({
    upcoming: data.projects.filter(p => p.status === "upcoming").sort((a, b) => a.date.localeCompare(b.date)),
    filming_done: data.projects.filter(p => p.status === "filming_done").sort((a, b) => b.date.localeCompare(a.date)),
    in_editing: data.projects.filter(p => p.status === "in_editing").sort((a, b) => b.date.localeCompare(a.date)),
    completed: data.projects.filter(p => p.status === "completed").sort((a, b) => b.date.localeCompare(a.date)),
  }), [data.projects]);

  // This month's revenue
  const thisMonthRevenue = useMemo(() => {
    const monthProjects = data.projects.filter(p => {
      const d = new Date(p.date + "T00:00:00");
      return d.getFullYear() === currentYear && d.getMonth() === currentMonth;
    });
    return monthProjects.reduce((sum, p) => {
      const client = data.clients.find(c => c.id === p.clientId);
      if (!client) return sum;
      return sum + getProjectInvoiceAmount(p, client);
    }, 0);
  }, [data.projects, data.clients, currentYear, currentMonth]);

  // This month's crew costs + margin
  const { crewCost: _crewCost, marginPercent: _marginPercent } = useMemo(() => {
    const monthProjects = data.projects.filter(p => {
      const d = new Date(p.date + "T00:00:00");
      return d.getFullYear() === currentYear && d.getMonth() === currentMonth;
    });
    let totalCrewCost = 0;
    monthProjects.forEach(p => {
      totalCrewCost += getProjectCrewCost(p);
    });
    const margin = thisMonthRevenue > 0 ? ((thisMonthRevenue - totalCrewCost) / thisMonthRevenue) * 100 : 0;
    return { crewCost: totalCrewCost, marginPercent: margin };
  }, [data.projects, currentYear, currentMonth, thisMonthRevenue]);

  // Outstanding invoices
  const outstandingAmount = useMemo(() => {
    return data.invoices
      .filter(inv => inv.status === "draft" || inv.status === "sent")
      .reduce((sum, inv) => sum + inv.total, 0);
  }, [data.invoices]);

  // Recent invoices
  const recentInvoices = useMemo(() => {
    return data.invoices.slice(0, 5);
  }, [data.invoices]);

  // Pipeline summary — use org's custom stages
  const pipelineStages = data.organization?.pipelineStages?.length ? data.organization.pipelineStages : DEFAULT_PIPELINE_STAGES;
  const pipelineCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of pipelineStages) counts[s.id] = 0;
    for (const l of data.pipelineLeads) {
      if (counts[l.pipelineStage] !== undefined) counts[l.pipelineStage]++;
    }
    const linkedIds = new Set(data.pipelineLeads.map(l => l.proposalId).filter(Boolean));
    for (const p of data.proposals) {
      if (linkedIds.has(p.id)) continue;
      const stage = p.pipelineStage || "inquiry";
      if (counts[stage] !== undefined) counts[stage]++;
    }
    return counts;
  }, [data.pipelineLeads, data.proposals, pipelineStages]);
  const totalPipelineActive = Object.values(pipelineCounts).reduce((s, c) => s + c, 0);

  // Revenue chart — last 6 months
  const chartData = useMemo(() => {
    const months: { name: string; revenue: number; cost: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const m = new Date(currentYear, currentMonth - i, 1);
      const yr = m.getFullYear();
      const mo = m.getMonth();
      const monthProjects = data.projects.filter(p => {
        const d = new Date(p.date + "T00:00:00");
        return d.getFullYear() === yr && d.getMonth() === mo;
      });
      let revenue = 0;
      let cost = 0;
      monthProjects.forEach(p => {
        const client = data.clients.find(c => c.id === p.clientId);
        if (client) revenue += getProjectInvoiceAmount(p, client);
        cost += getProjectCrewCost(p);
      });
      months.push({ name: `${MONTH_SHORT[mo]}`, revenue, cost });
    }
    return months;
  }, [data.projects, data.clients, currentYear, currentMonth]);

  // Mileage summary for the current user's crew member
  const mileageStats = useMemo(() => {
    const crewMemberId = profile?.crewMemberId || "";
    // For owner, find their crew member by matching email or use crew_geoff
    const ownerCrewId = crewMemberId || data.crewMembers.find(c => c.email === profile?.email)?.id || "";
    if (!ownerCrewId) return { monthMiles: 0, yearMiles: 0, tripCount: 0 };

    const distances = data.crewLocationDistances.filter(d => d.crewMemberId === ownerCrewId);
    const distanceMap = new Map(distances.map(d => [d.locationId, d.distanceMiles]));

    let monthMiles = 0;
    let yearMiles = 0;
    let tripCount = 0;

    data.projects.forEach(p => {
      const d = new Date(p.date + "T00:00:00");
      const isThisYear = d.getFullYear() === currentYear;
      const isThisMonth = isThisYear && d.getMonth() === currentMonth;

      // Check if this crew member is on this project
      const isOnProject = [...(p.crew || []), ...(p.postProduction || [])]
        .some(e => e.crewMemberId === ownerCrewId);

      if (isOnProject && p.locationId) {
        // Use snapshot miles from crew entry first, fall back to cached distance
        const crewEntry = (p.crew || []).find(e => e.crewMemberId === ownerCrewId);
        const oneWay = crewEntry?.roundTripMiles
          ? crewEntry.roundTripMiles / 2
          : (distanceMap.get(p.locationId) || 0);
        const roundTrip = oneWay * 2;

        if (roundTrip > 0) {
          if (isThisYear) yearMiles += roundTrip;
          if (isThisMonth) { monthMiles += roundTrip; tripCount++; }
        }
      }
    });

    return { monthMiles: Math.round(monthMiles * 10) / 10, yearMiles: Math.round(yearMiles * 10) / 10, tripCount };
  }, [data.projects, data.crewLocationDistances, data.crewMembers, profile, currentYear, currentMonth]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-border bg-card/50">
        <div>
          <h1 className="text-xl font-semibold text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            Dashboard
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Business overview at a glance</p>
        </div>
        {isRealOwner && (
          <div className="flex items-center gap-2">
            <Eye className="w-3.5 h-3.5 text-muted-foreground" />
            <select
              value={viewAsRole || ""}
              onChange={e => setViewAsRole(e.target.value ? e.target.value as UserRole : null)}
              className="bg-background border border-border rounded-md px-2 py-1 text-xs text-foreground"
            >
              <option value="">Owner</option>
              <option value="partner">Partner</option>
              <option value="client">Client</option>
              <option value="staff">Staff</option>
            </select>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-auto p-3 sm:p-6 space-y-5">
        {/* Metric Cards */}
        {isWidgetEnabled("metrics") && (<>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <MetricCard
            icon={CalendarDays}
            iconColor="text-blue-400"
            iconBg="bg-blue-500/20"
            label="Upcoming"
            value={String(projectsByStatus.upcoming.length)}
            sub="Scheduled shoots"
            onClick={() => setExpandedSection(expandedSection === "upcoming" ? null : "upcoming")}
            active={expandedSection === "upcoming"}
          />
          <MetricCard
            icon={Film}
            iconColor="text-purple-400"
            iconBg="bg-purple-500/20"
            label="In Editing"
            value={String(projectsByStatus.in_editing.length)}
            sub="Being edited"
            onClick={() => setExpandedSection(expandedSection === "in_editing" ? null : "in_editing")}
            active={expandedSection === "in_editing"}
          />
          <MetricCard
            icon={FileText}
            iconColor="text-purple-400"
            iconBg="bg-purple-500/20"
            label="Outstanding"
            value={formatCurrency(outstandingAmount)}
            sub="Unpaid invoices"
            onClick={() => setExpandedSection(expandedSection === "outstanding" ? null : "outstanding")}
            active={expandedSection === "outstanding"}
          />
          <MetricCard
            icon={TrendingUp}
            iconColor="text-green-400"
            iconBg="bg-green-500/20"
            label="Completed"
            value={String(projectsByStatus.completed.length)}
            sub="All time"
            onClick={() => setExpandedSection(expandedSection === "completed" ? null : "completed")}
            active={expandedSection === "completed"}
          />
        </div>

        {/* Expanded Section */}
        {expandedSection && expandedSection !== "outstanding" && (
          <div className="bg-card border border-border rounded-lg">
            <div className="px-4 py-3 border-b border-border">
              <h3 className="text-sm font-semibold text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                {expandedSection === "upcoming" ? "Upcoming Shoots" : expandedSection === "in_editing" ? "In Editing" : "Completed Projects"}
              </h3>
            </div>
            <div className="divide-y divide-border max-h-80 overflow-auto">
              {(projectsByStatus[expandedSection as keyof typeof projectsByStatus] || []).length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">No projects</div>
              ) : (
                (projectsByStatus[expandedSection as keyof typeof projectsByStatus] || []).slice(0, 20).map(p => {
                  const client = data.clients.find(c => c.id === p.clientId);
                  const pType = data.projectTypes.find(t => t.id === p.projectTypeId);
                  const loc = data.locations.find(l => l.id === p.locationId);
                  return (
                    <div key={p.id} className="px-4 py-3 hover:bg-white/3 cursor-pointer transition-colors" onClick={() => setSelectedProject(p)}>
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-foreground">{pType?.name ?? "Project"}</span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">{client?.company}</span>
                          </div>
                          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{p.startTime} — {p.endTime}</span>
                            {loc && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{loc.name}</span>}
                          </div>
                        </div>
                        <span className="text-xs font-medium text-primary shrink-0">{formatDate(p.date)}</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* Outstanding Invoices */}
        {expandedSection === "outstanding" && (
          <div className="bg-card border border-border rounded-lg">
            <div className="px-4 py-3 border-b border-border">
              <h3 className="text-sm font-semibold text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                Outstanding Invoices
              </h3>
            </div>
            <div className="divide-y divide-border max-h-80 overflow-auto">
              {data.invoices.filter(inv => inv.status === "draft" || inv.status === "sent").length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">No outstanding invoices</div>
              ) : (
                data.invoices.filter(inv => inv.status === "draft" || inv.status === "sent").map(inv => {
                  const client = data.clients.find(c => c.id === inv.clientId);
                  return (
                    <Link key={inv.id} href="/invoices">
                      <div className="px-4 py-3 flex items-center justify-between hover:bg-secondary/30 transition-colors cursor-pointer">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-foreground">{inv.invoiceNumber}</span>
                            <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded border", STATUS_COLORS[inv.status])}>
                              {inv.status}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">{client?.company || inv.clientInfo.company}</p>
                        </div>
                        <span className="text-sm font-semibold text-foreground">{formatCurrencyFull(inv.total)}</span>
                      </div>
                    </Link>
                  );
                })
              )}
            </div>
          </div>
        )}

        </>)}

        {/* Middle Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Upcoming Projects */}
          {isWidgetEnabled("upcoming") && (
          <div className="bg-card border border-border rounded-lg">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h3 className="text-sm font-semibold text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                Upcoming Shoots
              </h3>
              <Link href="/calendar" className="flex items-center gap-1 text-xs text-primary hover:text-primary/80">
                Calendar <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
            <div className="divide-y divide-border">
              {upcomingProjects.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">No shoots in the next 7 days</div>
              ) : (
                upcomingProjects.slice(0, 5).map(p => {
                  const client = data.clients.find(c => c.id === p.clientId);
                  const pType = data.projectTypes.find(t => t.id === p.projectTypeId);
                  const loc = data.locations.find(l => l.id === p.locationId);
                  const crewNames = p.crew.map(c => data.crewMembers.find(cm => cm.id === c.crewMemberId)?.name ?? "").filter(Boolean);
                  return (
                    <div key={p.id} className="px-4 py-3 hover:bg-white/3 cursor-pointer transition-colors" onClick={() => setSelectedProject(p)}>
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-foreground">{pType?.name ?? "Project"}</span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">{client?.company}</span>
                          </div>
                          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{p.startTime} — {p.endTime}</span>
                            {loc && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{loc.name}</span>}
                          </div>
                          {crewNames.length > 0 && (
                            <p className="text-xs text-muted-foreground/70 mt-1">{crewNames.join(", ")}</p>
                          )}
                        </div>
                        <span className="text-xs font-medium text-primary shrink-0">{formatDate(p.date)}</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          )}
          {/* Recent Invoices */}
          {isWidgetEnabled("invoices") && (
          <div className="bg-card border border-border rounded-lg">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h3 className="text-sm font-semibold text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                Recent Invoices
              </h3>
              <Link href="/invoices" className="flex items-center gap-1 text-xs text-primary hover:text-primary/80">
                All Invoices <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
            <div className="divide-y divide-border">
              {recentInvoices.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">No invoices yet</div>
              ) : (
                recentInvoices.map(inv => {
                  const client = data.clients.find(c => c.id === inv.clientId);
                  return (
                    <div key={inv.id} className="px-4 py-3 flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-foreground">{inv.invoiceNumber}</span>
                          <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded border", STATUS_COLORS[inv.status])}>
                            {inv.status}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{client?.company || inv.clientInfo.company}</p>
                      </div>
                      <span className="text-sm font-semibold text-foreground">{formatCurrencyFull(inv.total)}</span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
          )}

          {/* Pipeline Summary */}
          {isRealOwner && (
          <div className="bg-card border border-border rounded-lg">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                <Users className="w-4 h-4 text-primary" />
                Pipeline
              </h3>
              <Link href="/pipeline" className="flex items-center gap-1 text-xs text-primary hover:text-primary/80">
                View All <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
            <div className="flex overflow-x-auto divide-x divide-border">
              {pipelineStages.filter(s => s.id !== "archived").map(s => {
                const colorClass = `text-${s.color}-400`;
                return (
                  <div key={s.id} className="p-3 text-center flex-1 min-w-[60px]">
                    <p className={cn("text-xl font-bold", pipelineCounts[s.id] > 0 ? colorClass : "text-muted-foreground/30")}>{pipelineCounts[s.id] || 0}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{s.label}</p>
                  </div>
                );
              })}
            </div>
          </div>
          )}
        </div>

        {/* Mileage Summary */}
        {isWidgetEnabled("mileage") && (mileageStats.monthMiles > 0 || mileageStats.yearMiles > 0) && (
          <div className="bg-card border border-border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <Car className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-semibold text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                Mileage
              </h3>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center p-3 rounded-lg bg-muted/30">
                <p className="text-xl font-bold text-foreground">{mileageStats.monthMiles.toLocaleString()}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Miles This Month</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-muted/30">
                <p className="text-xl font-bold text-foreground">{mileageStats.yearMiles.toLocaleString()}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Miles YTD</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-muted/30">
                <p className="text-xl font-bold text-foreground">{mileageStats.tripCount}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Trips This Month</p>
              </div>
            </div>
          </div>
        )}

        {/* Revenue Chart */}
        {isWidgetEnabled("revenue") && (
        <div className="bg-card border border-border rounded-lg p-4">
          <h3 className="text-sm font-semibold text-foreground mb-4" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            Monthly Revenue
          </h3>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} barCategoryGap="20%">
                <XAxis dataKey="name" tick={{ fill: "#64748b", fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#64748b", fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip
                  contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #334155", borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: "#94a3b8" }}
                  formatter={(value: number, name: string) => [formatCurrencyFull(value), name === "revenue" ? "Revenue" : "Crew Cost"]}
                />
                <Bar dataKey="revenue" radius={[4, 4, 0, 0]}>
                  {chartData.map((_, i) => (
                    <Cell key={i} fill={i === chartData.length - 1 ? "#0088ff" : "#0088ff44"} />
                  ))}
                </Bar>
                <Bar dataKey="cost" radius={[4, 4, 0, 0]} fill="#64748b44" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        )}
      </div>

      {/* Project Detail Sheet */}
      {selectedProject && (
        <ProjectDetailSheet
          project={selectedProject}
          onClose={() => setSelectedProject(null)}
        />
      )}
    </div>
  );
}

function MetricCard({ icon: Icon, iconColor, iconBg, label, value, sub, onClick, active }: {
  icon: React.ComponentType<{ className?: string }>;
  iconColor: string;
  iconBg: string;
  label: string;
  value: string;
  sub: string;
  onClick?: () => void;
  active?: boolean;
}) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "bg-card border rounded-lg p-4 transition-colors",
        onClick && "cursor-pointer hover:border-primary/30",
        active ? "border-primary/50 bg-primary/5" : "border-border",
      )}
    >
      <div className="flex items-center gap-3">
        <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center shrink-0", iconBg)}>
          <Icon className={cn("w-5 h-5", iconColor)} />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-lg font-semibold text-foreground truncate">{value}</p>
          <p className="text-[10px] text-muted-foreground/60">{sub}</p>
        </div>
      </div>
    </div>
  );
}
