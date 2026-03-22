// ============================================================
// ClientDashboardPage — Client-facing dashboard
// Shows their projects, statuses, and invoices
// ============================================================

import { useMemo, useState, useEffect } from "react";
import { useApp } from "@/contexts/AppContext";
import type { InvoiceStatus, SeriesEpisode } from "@/lib/types";
import { Link } from "wouter";
import { CalendarDays, Film, CheckCircle, FileText, ArrowRight, Clock, MapPin, AlertCircle, Clapperboard } from "lucide-react";
import { cn } from "@/lib/utils";

const STATUS_COLORS: Record<string, string> = {
  upcoming: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  filming_done: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  in_editing: "bg-purple-500/20 text-purple-300 border-purple-500/30",
  completed: "bg-green-500/20 text-green-300 border-green-500/30",
};

const STATUS_LABELS: Record<string, string> = {
  upcoming: "Upcoming",
  filming_done: "Filmed",
  in_editing: "In Editing",
  completed: "Completed",
};

const INVOICE_STATUS_COLORS: Record<InvoiceStatus, string> = {
  draft: "bg-zinc-500/20 text-zinc-300 border-zinc-500/30",
  sent: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  paid: "bg-green-500/20 text-green-300 border-green-500/30",
  void: "bg-red-500/20 text-red-300 border-red-500/30",
};

function formatCurrency(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(n);
}

function formatDate(d: string): string {
  if (!d) return "";
  const date = new Date(d + "T00:00:00");
  return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

export default function ClientDashboardPage() {
  const { data, fetchEpisodes } = useApp();
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth();
  const thirtyDaysOut = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  // Status counts
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { upcoming: 0, filming_done: 0, in_editing: 0, completed: 0 };
    data.projects.forEach(p => { counts[p.status] = (counts[p.status] || 0) + 1; });
    return counts;
  }, [data.projects]);

  // Completed this month
  const completedThisMonth = useMemo(() => {
    return data.projects.filter(p => {
      if (p.status !== "completed") return false;
      const d = new Date(p.date + "T00:00:00");
      return d.getFullYear() === currentYear && d.getMonth() === currentMonth;
    }).length;
  }, [data.projects, currentYear, currentMonth]);

  // Outstanding invoices
  const outstandingAmount = useMemo(() => {
    return data.invoices
      .filter(inv => inv.status === "draft" || inv.status === "sent")
      .reduce((sum, inv) => sum + inv.total, 0);
  }, [data.invoices]);

  // Upcoming projects (next 30 days)
  const upcomingProjects = useMemo(() => {
    return data.projects
      .filter(p => p.date >= todayStr && p.date <= thirtyDaysOut)
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [data.projects, todayStr, thirtyDaysOut]);

  // Recent invoices
  const recentInvoices = useMemo(() => {
    return data.invoices.slice(0, 5);
  }, [data.invoices]);

  // Episodes needing review
  const [reviewEpisodes, setReviewEpisodes] = useState<(SeriesEpisode & { seriesName: string })[]>([]);
  useEffect(() => {
    async function loadReviewEpisodes() {
      const results: (SeriesEpisode & { seriesName: string })[] = [];
      for (const s of data.series) {
        try {
          const episodes = await fetchEpisodes(s.id);
          for (const ep of episodes) {
            if (ep.status === "client_review" || ep.status === "review") {
              results.push({ ...ep, seriesName: s.name });
            }
          }
        } catch { /* ignore */ }
      }
      setReviewEpisodes(results);
    }
    if (data.series.length > 0) loadReviewEpisodes();
  }, [data.series, fetchEpisodes]);

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-border bg-card/50">
        <h1 className="text-xl font-semibold text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
          Dashboard
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">Your projects and invoices</p>
      </div>

      <div className="flex-1 overflow-auto p-3 sm:p-6 space-y-5">
        {/* Metric Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <MetricCard icon={CalendarDays} iconColor="text-blue-400" iconBg="bg-blue-500/20"
            label="Upcoming" value={String(statusCounts.upcoming)} sub="Scheduled shoots" />
          <MetricCard icon={Film} iconColor="text-purple-400" iconBg="bg-purple-500/20"
            label="In Editing" value={String(statusCounts.in_editing)} sub="Being edited now" />
          <MetricCard icon={CheckCircle} iconColor="text-green-400" iconBg="bg-green-500/20"
            label="Completed" value={String(completedThisMonth)} sub="This month" />
          <MetricCard icon={FileText} iconColor="text-amber-400" iconBg="bg-amber-500/20"
            label="Outstanding" value={formatCurrency(outstandingAmount)} sub="Unpaid invoices" />
        </div>

        {/* Needs Your Review */}
        {reviewEpisodes.length > 0 && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <AlertCircle className="w-4 h-4 text-amber-400" />
              <h3 className="text-sm font-semibold text-amber-300" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                Needs Your Review
              </h3>
            </div>
            <div className="space-y-2">
              {reviewEpisodes.map(ep => (
                <Link key={ep.id} href={`/series/${ep.seriesId}`}>
                  <div className="flex items-center justify-between bg-card/50 rounded-md px-3 py-2 hover:bg-card transition-colors cursor-pointer">
                    <div>
                      <span className="text-sm text-foreground font-medium">Episode {ep.episodeNumber}: {ep.title}</span>
                      <p className="text-xs text-muted-foreground">{ep.seriesName}</p>
                    </div>
                    <span className="text-xs text-amber-400 font-medium">Review</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Active Series */}
        {data.series.length > 0 && (
          <div className="bg-card border border-border rounded-lg">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h3 className="text-sm font-semibold text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                Active Series
              </h3>
              <Link href="/series" className="flex items-center gap-1 text-xs text-primary hover:text-primary/80">
                All Series <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
            <div className="divide-y divide-border">
              {data.series.slice(0, 3).map(s => (
                <Link key={s.id} href={`/series/${s.id}`}>
                  <div className="px-4 py-3 flex items-center justify-between hover:bg-secondary/30 transition-colors cursor-pointer">
                    <div className="flex items-center gap-2">
                      <Clapperboard className="w-4 h-4 text-purple-400" />
                      <span className="text-sm text-foreground">{s.name}</span>
                    </div>
                    <ArrowRight className="w-3 h-3 text-muted-foreground" />
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Upcoming Projects */}
          <div className="bg-card border border-border rounded-lg">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h3 className="text-sm font-semibold text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                Upcoming Projects
              </h3>
              <Link href="/calendar" className="flex items-center gap-1 text-xs text-primary hover:text-primary/80">
                Calendar <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
            <div className="divide-y divide-border">
              {upcomingProjects.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">No upcoming projects</div>
              ) : (
                upcomingProjects.slice(0, 6).map(p => {
                  const pType = data.projectTypes.find(t => t.id === p.projectTypeId);
                  const loc = data.locations.find(l => l.id === p.locationId);
                  return (
                    <div key={p.id} className="px-4 py-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-foreground">{pType?.name ?? "Project"}</span>
                            <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded border", STATUS_COLORS[p.status])}>
                              {STATUS_LABELS[p.status] ?? p.status}
                            </span>
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

          {/* Recent Invoices */}
          <div className="bg-card border border-border rounded-lg">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h3 className="text-sm font-semibold text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                Invoices
              </h3>
            </div>
            <div className="divide-y divide-border">
              {recentInvoices.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">No invoices yet</div>
              ) : (
                recentInvoices.map(inv => (
                  <div key={inv.id} className="px-4 py-3 flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground">{inv.invoiceNumber}</span>
                        <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded border", INVOICE_STATUS_COLORS[inv.status])}>
                          {inv.status}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {formatDate(inv.periodStart)} — {formatDate(inv.periodEnd)}
                      </p>
                    </div>
                    <span className="text-sm font-semibold text-foreground">{formatCurrency(inv.total)}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Project Status Overview */}
        <div className="bg-card border border-border rounded-lg p-4">
          <h3 className="text-sm font-semibold text-foreground mb-3" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            All Projects by Status
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {(["upcoming", "filming_done", "in_editing", "completed"] as const).map(status => (
              <div key={status} className="text-center p-3 rounded-lg bg-secondary/30">
                <p className="text-2xl font-semibold text-foreground">{statusCounts[status] || 0}</p>
                <p className={cn("text-xs font-medium mt-1", STATUS_COLORS[status].split(" ").find(c => c.startsWith("text-")))}>
                  {STATUS_LABELS[status]}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ icon: Icon, iconColor, iconBg, label, value, sub }: {
  icon: React.ComponentType<{ className?: string }>;
  iconColor: string;
  iconBg: string;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="bg-card border border-border rounded-lg p-4">
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
