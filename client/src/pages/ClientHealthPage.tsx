// ============================================================
// ClientHealthPage — Client health dashboard for owner/partner
// Shows profitability, activity, and trends per client
// ============================================================

import { useMemo } from "react";
import { useApp } from "@/contexts/AppContext";
import { getProjectInvoiceAmount } from "@/lib/data";
import { TrendingUp, TrendingDown, Minus, DollarSign, CalendarDays, Clock, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

function formatCurrency(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
}

function formatCurrencyFull(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(n);
}

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

interface ClientHealth {
  clientId: string;
  company: string;
  contactName: string;
  totalRevenue: number;
  totalCrewCost: number;
  grossMargin: number;
  marginPercent: number;
  totalProjects: number;
  completedProjects: number;
  activeProjects: number;
  lastProjectDate: string;
  outstandingInvoices: number;
  monthlyRevenue: { month: string; revenue: number }[];
  trend: "up" | "down" | "flat";
}

export default function ClientHealthPage() {
  const { data } = useApp();
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth();

  const clientHealth = useMemo((): ClientHealth[] => {
    return data.clients.map(client => {
      const clientProjects = data.projects.filter(p => p.clientId === client.id);

      // Revenue
      let totalRevenue = 0;
      let totalCrewCost = 0;
      clientProjects.forEach(p => {
        totalRevenue += getProjectInvoiceAmount(p, client);
        [...p.crew, ...p.postProduction].forEach(e => {
          totalCrewCost += Number(e.hoursWorked ?? 0) * Number(e.payRatePerHour ?? 0);
        });
      });
      const grossMargin = totalRevenue - totalCrewCost;
      const marginPercent = totalRevenue > 0 ? (grossMargin / totalRevenue) * 100 : 0;

      // Project counts
      const completedProjects = clientProjects.filter(p => p.status === "completed").length;
      const activeProjects = clientProjects.filter(p => p.status !== "completed").length;
      const sortedByDate = [...clientProjects].sort((a, b) => b.date.localeCompare(a.date));
      const lastProjectDate = sortedByDate[0]?.date || "";

      // Outstanding invoices
      const outstandingInvoices = data.invoices
        .filter(inv => inv.clientId === client.id && (inv.status === "draft" || inv.status === "sent"))
        .reduce((sum, inv) => sum + inv.total, 0);

      // Monthly revenue (last 6 months)
      const monthlyRevenue: { month: string; revenue: number }[] = [];
      for (let i = 5; i >= 0; i--) {
        const m = new Date(currentYear, currentMonth - i, 1);
        const yr = m.getFullYear();
        const mo = m.getMonth();
        const monthProjects = clientProjects.filter(p => {
          const d = new Date(p.date + "T00:00:00");
          return d.getFullYear() === yr && d.getMonth() === mo;
        });
        let revenue = 0;
        monthProjects.forEach(p => { revenue += getProjectInvoiceAmount(p, client); });
        monthlyRevenue.push({ month: MONTH_SHORT[mo], revenue });
      }

      // Trend: compare last 3 months avg to prior 3 months avg
      const recent3 = monthlyRevenue.slice(3).reduce((s, m) => s + m.revenue, 0) / 3;
      const prior3 = monthlyRevenue.slice(0, 3).reduce((s, m) => s + m.revenue, 0) / 3;
      const trend: "up" | "down" | "flat" = recent3 > prior3 * 1.1 ? "up" : recent3 < prior3 * 0.9 ? "down" : "flat";

      return {
        clientId: client.id,
        company: client.company,
        contactName: client.contactName,
        totalRevenue,
        totalCrewCost,
        grossMargin,
        marginPercent,
        totalProjects: clientProjects.length,
        completedProjects,
        activeProjects,
        lastProjectDate,
        outstandingInvoices,
        monthlyRevenue,
        trend,
      };
    }).sort((a, b) => b.totalRevenue - a.totalRevenue);
  }, [data, currentYear, currentMonth]);

  // Totals
  const totals = useMemo(() => {
    return {
      revenue: clientHealth.reduce((s, c) => s + c.totalRevenue, 0),
      margin: clientHealth.reduce((s, c) => s + c.grossMargin, 0),
      projects: clientHealth.reduce((s, c) => s + c.totalProjects, 0),
      outstanding: clientHealth.reduce((s, c) => s + c.outstandingInvoices, 0),
    };
  }, [clientHealth]);

  const totalMarginPercent = totals.revenue > 0 ? (totals.margin / totals.revenue) * 100 : 0;

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-border bg-card/50">
        <h1 className="text-xl font-semibold text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
          Client Health
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">Profitability, activity, and trends across all clients</p>
      </div>

      <div className="flex-1 overflow-auto p-3 sm:p-6 space-y-5">
        {/* Summary Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <MetricCard icon={DollarSign} iconColor="text-amber-400" iconBg="bg-amber-500/20"
            label="Total Revenue" value={formatCurrency(totals.revenue)} sub="All time" />
          <MetricCard icon={TrendingUp} iconColor="text-green-400" iconBg="bg-green-500/20"
            label="Gross Margin" value={`${totalMarginPercent.toFixed(0)}%`} sub={formatCurrency(totals.margin)} />
          <MetricCard icon={CalendarDays} iconColor="text-blue-400" iconBg="bg-blue-500/20"
            label="Total Projects" value={String(totals.projects)} sub="All clients" />
          <MetricCard icon={FileText} iconColor="text-purple-400" iconBg="bg-purple-500/20"
            label="Outstanding" value={formatCurrency(totals.outstanding)} sub="Unpaid invoices" />
        </div>

        {/* Client Cards */}
        <div className="space-y-4">
          {clientHealth.map(client => (
            <div key={client.clientId} className="bg-card border border-border rounded-lg p-4">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                      {client.company}
                    </h3>
                    {client.trend === "up" && <TrendingUp className="w-4 h-4 text-green-400" />}
                    {client.trend === "down" && <TrendingDown className="w-4 h-4 text-red-400" />}
                    {client.trend === "flat" && <Minus className="w-4 h-4 text-zinc-400" />}
                  </div>
                  <p className="text-xs text-muted-foreground">{client.contactName}</p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-semibold text-foreground">{formatCurrency(client.totalRevenue)}</p>
                  <p className="text-[10px] text-muted-foreground">total revenue</p>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
                <div className="text-center p-2 rounded bg-secondary/30">
                  <p className="text-sm font-semibold text-foreground">{client.marginPercent.toFixed(0)}%</p>
                  <p className="text-[10px] text-muted-foreground">Margin</p>
                </div>
                <div className="text-center p-2 rounded bg-secondary/30">
                  <p className="text-sm font-semibold text-foreground">{client.totalProjects}</p>
                  <p className="text-[10px] text-muted-foreground">Projects</p>
                </div>
                <div className="text-center p-2 rounded bg-secondary/30">
                  <p className="text-sm font-semibold text-foreground">{client.activeProjects}</p>
                  <p className="text-[10px] text-muted-foreground">Active</p>
                </div>
                <div className="text-center p-2 rounded bg-secondary/30">
                  <p className={cn("text-sm font-semibold", client.outstandingInvoices > 0 ? "text-amber-400" : "text-foreground")}>
                    {formatCurrency(client.outstandingInvoices)}
                  </p>
                  <p className="text-[10px] text-muted-foreground">Outstanding</p>
                </div>
              </div>

              {/* Mini revenue chart */}
              <div className="h-24">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={client.monthlyRevenue} barCategoryGap="15%">
                    <XAxis dataKey="month" tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #334155", borderRadius: 6, fontSize: 11 }}
                      formatter={(value: number) => [formatCurrencyFull(value), "Revenue"]}
                    />
                    <Bar dataKey="revenue" radius={[3, 3, 0, 0]}>
                      {client.monthlyRevenue.map((_, i) => (
                        <Cell key={i} fill={i === client.monthlyRevenue.length - 1 ? "#d97706" : "#d9770633"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {client.lastProjectDate && (
                <p className="text-[10px] text-muted-foreground/60 mt-2">
                  Last project: {new Date(client.lastProjectDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </p>
              )}
            </div>
          ))}
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
