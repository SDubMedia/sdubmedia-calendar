// ============================================================
// BillingPage — Monthly billing summary
// Design: Dark Cinematic Studio | Amber accent on charcoal
// Shows: total hours worked → client invoice amount, crew pay breakdown, gross margin
// ============================================================

import { useState, useMemo } from "react";
import { useApp } from "@/contexts/AppContext";
import type { Project, Client, AppData } from "@/lib/types";
import { DollarSign, Clock, Users, TrendingUp, ChevronLeft, ChevronRight, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

interface ClientSummary {
  client: Client;
  projects: Project[];
  totalBillableHours: number;
  clientInvoiceAmount: number;
  crewPayBreakdown: { crewMemberId: string; name: string; totalHours: number; totalPay: number }[];
  totalCrewCost: number;
  grossMargin: number;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function formatCurrency(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(n);
}

export default function BillingPage() {
  const { data } = useApp();
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [selectedClientId, setSelectedClientId] = useState<string>("all");

  const prevMonth = () => {
    if (month === 0) { setMonth(11); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 11) { setMonth(0); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  };

  // Projects in the selected month
  const monthProjects = useMemo(() => {
    return data.projects.filter(p => {
      const d = new Date(p.date + "T00:00:00");
      return d.getFullYear() === year && d.getMonth() === month;
    });
  }, [data.projects, year, month]);

  // Filter by client if selected
  const filteredProjects = useMemo(() => {
    if (selectedClientId === "all") return monthProjects;
    return monthProjects.filter(p => p.clientId === selectedClientId);
  }, [monthProjects, selectedClientId]);

  // Compute per-client billing summaries
  const clientSummaries = useMemo((): ClientSummary[] => {
    const clientIds: string[] = selectedClientId === "all"
      ? Array.from(new Set(monthProjects.map(p => p.clientId)))
      : [selectedClientId];

    return clientIds.map(clientId => {
      const client = data.clients.find(c => c.id === clientId);
      if (!client) return null;

      const projects = monthProjects.filter(p => p.clientId === clientId);

      // Total billable hours = sum of all crew + post hours across projects
      let totalBillableHours = 0;
      const crewMap: Record<string, { name: string; totalHours: number; totalPay: number }> = {};

      projects.forEach(p => {
        [...p.crew, ...p.postProduction].forEach(entry => {
          const hrs = Number(entry.hoursWorked ?? 0);
          const rate = Number(entry.payRatePerHour ?? 0);
          totalBillableHours += hrs;

          const member = data.crewMembers.find(c => c.id === entry.crewMemberId);
          const name = member?.name ?? "Unknown";
          if (!crewMap[entry.crewMemberId]) {
            crewMap[entry.crewMemberId] = { name, totalHours: 0, totalPay: 0 };
          }
          crewMap[entry.crewMemberId].totalHours += hrs;
          crewMap[entry.crewMemberId].totalPay += hrs * rate;
        });
      });

      const clientInvoiceAmount = totalBillableHours * client.billingRatePerHour;
      const crewPayBreakdown = Object.entries(crewMap).map(([id, v]) => ({ crewMemberId: id, ...v }));
      const totalCrewCost = crewPayBreakdown.reduce((s, c) => s + c.totalPay, 0);
      const grossMargin = clientInvoiceAmount - totalCrewCost;

      return {
        client,
        projects,
        totalBillableHours,
        clientInvoiceAmount,
        crewPayBreakdown,
        totalCrewCost,
        grossMargin,
      };
    }).filter((x): x is ClientSummary => x !== null);
  }, [monthProjects, selectedClientId, data.clients, data.crewMembers]);

  // Grand totals across all clients
  const grandTotals = useMemo(() => ({
    hours: clientSummaries.reduce((s: number, c: ClientSummary) => s + c.totalBillableHours, 0),
    invoice: clientSummaries.reduce((s: number, c: ClientSummary) => s + c.clientInvoiceAmount, 0),
    crewCost: clientSummaries.reduce((s: number, c: ClientSummary) => s + c.totalCrewCost, 0),
    margin: clientSummaries.reduce((s: number, c: ClientSummary) => s + c.grossMargin, 0),
  }), [clientSummaries]);

  const printSummary = () => {
    window.print();
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-border bg-card/50">
        <div>
          <h1 className="text-xl font-semibold text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            Billing Summary
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Monthly hours &amp; invoicing
          </p>
        </div>
        <button
          onClick={printSummary}
          className="flex items-center gap-2 px-3 py-2 rounded-md bg-primary/10 text-primary hover:bg-primary/20 transition-colors text-sm font-medium"
        >
          <FileText className="w-4 h-4" />
          <span className="hidden sm:inline">Print / Export</span>
        </button>
      </div>

      <div className="flex-1 overflow-auto p-3 sm:p-6 space-y-5">
        {/* Month navigator + client filter */}
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          {/* Month nav */}
          <div className="flex items-center gap-3 bg-card border border-border rounded-lg px-4 py-2">
            <button onClick={prevMonth} className="p-1 rounded hover:bg-white/8 text-muted-foreground hover:text-foreground transition-colors">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-base font-semibold text-foreground min-w-[140px] text-center" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              {MONTH_NAMES[month]} {year}
            </span>
            <button onClick={nextMonth} className="p-1 rounded hover:bg-white/8 text-muted-foreground hover:text-foreground transition-colors">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Client filter */}
          <select
            value={selectedClientId}
            onChange={e => setSelectedClientId(e.target.value)}
            className="bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="all">All Clients</option>
            {data.clients.map(c => (
              <option key={c.id} value={c.id}>{c.company}</option>
            ))}
          </select>
        </div>

        {/* Grand total summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <SummaryCard
            icon={<Clock className="w-4 h-4" />}
            label="Total Hours"
            value={`${Number(grandTotals.hours).toFixed(1)} hrs`}
            color="text-blue-400"
            bg="bg-blue-500/10"
          />
          <SummaryCard
            icon={<DollarSign className="w-4 h-4" />}
            label="Client Invoice"
            value={formatCurrency(grandTotals.invoice)}
            color="text-amber-400"
            bg="bg-amber-500/10"
          />
          <SummaryCard
            icon={<Users className="w-4 h-4" />}
            label="Crew Cost"
            value={formatCurrency(grandTotals.crewCost)}
            color="text-purple-400"
            bg="bg-purple-500/10"
          />
          <SummaryCard
            icon={<TrendingUp className="w-4 h-4" />}
            label="Gross Margin"
            value={formatCurrency(grandTotals.margin)}
            color={grandTotals.margin >= 0 ? "text-green-400" : "text-red-400"}
            bg={grandTotals.margin >= 0 ? "bg-green-500/10" : "bg-red-500/10"}
          />
        </div>

        {/* Per-client breakdowns */}
        {clientSummaries.length === 0 ? (
          <div className="bg-card border border-border rounded-lg p-8 text-center">
            <Clock className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">No projects found for {MONTH_NAMES[month]} {year}</p>
            <p className="text-sm text-muted-foreground/60 mt-1">Add projects to the calendar to see billing summaries here.</p>
          </div>
        ) : (
          clientSummaries.map(summary => (
            <ClientBillingCard key={summary.client.id} summary={summary} />
          ))
        )}

        {/* Project-level detail table */}
        {filteredProjects.length > 0 && (
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <div className="px-5 py-3 border-b border-border">
              <h3 className="text-sm font-semibold text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                Project Breakdown — {MONTH_NAMES[month]} {year}
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-secondary/50">
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">Date</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">Project</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider hidden sm:table-cell">Client</th>
                    <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">Hours</th>
                    <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider hidden sm:table-cell">Crew Cost</th>
                    <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">Invoice</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProjects.map(p => (
                    <ProjectRow key={p.id} project={p} data={data} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---- Sub-components ----

function SummaryCard({ icon, label, value, color, bg }: {
  icon: React.ReactNode; label: string; value: string; color: string; bg: string;
}) {
  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <div className={cn("w-8 h-8 rounded-md flex items-center justify-center mb-2", bg, color)}>
        {icon}
      </div>
      <p className="text-xs text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className={cn("text-lg font-bold mt-0.5 tabular-nums", color)} style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
        {value}
      </p>
    </div>
  );
}

function ClientBillingCard({ summary }: { summary: ClientSummary }) {
  const { client, totalBillableHours, clientInvoiceAmount, crewPayBreakdown, totalCrewCost, grossMargin } = summary;
  const marginPct = clientInvoiceAmount > 0 ? (grossMargin / clientInvoiceAmount) * 100 : 0;

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      {/* Client header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-secondary/30">
        <div>
          <h3 className="text-sm font-semibold text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            {client.company}
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Billing rate: {formatCurrency(client.billingRatePerHour)}/hr
          </p>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold text-amber-400 tabular-nums" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            {formatCurrency(clientInvoiceAmount)}
          </p>
          <p className="text-xs text-muted-foreground">{Number(totalBillableHours).toFixed(1)} hrs billed</p>
        </div>
      </div>

      <div className="p-5 space-y-4">
        {/* Crew pay breakdown */}
        {crewPayBreakdown.length > 0 && (
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Crew Pay</p>
            <div className="space-y-2">
              {crewPayBreakdown.map((entry: any) => (
                <div key={entry.crewMemberId} className="flex items-center justify-between py-1.5 px-3 bg-secondary/40 rounded-md">
                  <div>
                    <span className="text-sm font-medium text-foreground">{entry.name}</span>
                    <span className="text-xs text-muted-foreground ml-2">{Number(entry.totalHours).toFixed(1)} hrs</span>
                  </div>
                  <span className="text-sm font-semibold text-purple-300 tabular-nums">{formatCurrency(entry.totalPay)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Financial summary row */}
        <div className="grid grid-cols-3 gap-3 pt-2 border-t border-border">
          <div className="text-center">
            <p className="text-xs text-muted-foreground">Invoice</p>
            <p className="text-sm font-bold text-amber-400 tabular-nums">{formatCurrency(clientInvoiceAmount)}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-muted-foreground">Crew Cost</p>
            <p className="text-sm font-bold text-purple-400 tabular-nums">{formatCurrency(totalCrewCost)}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-muted-foreground">Margin</p>
            <p className={cn("text-sm font-bold tabular-nums", grossMargin >= 0 ? "text-green-400" : "text-red-400")}>
              {formatCurrency(grossMargin)}
              <span className="text-xs font-normal ml-1">({Number(marginPct).toFixed(0)}%)</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProjectRow({ project, data }: { project: Project; data: AppData }) {
  const client = data.clients.find(c => c.id === project.clientId);
  const pType = data.projectTypes.find(pt => pt.id === project.projectTypeId);

  const allEntries = [...project.crew, ...project.postProduction];
  const totalHours = allEntries.reduce((s, e) => s + Number(e.hoursWorked ?? 0), 0);
  const totalCrewCost = allEntries.reduce((s, e) => s + Number(e.hoursWorked ?? 0) * Number(e.payRatePerHour ?? 0), 0);
  const invoiceAmount = totalHours * Number(client?.billingRatePerHour ?? 0);

  const dateStr = new Date(project.date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });

  return (
    <tr className="border-b border-border/50 hover:bg-white/2 transition-colors">
      <td className="px-4 py-3 text-muted-foreground text-xs">{dateStr}</td>
      <td className="px-4 py-3 text-foreground">{pType?.name ?? "—"}</td>
      <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">{client?.company ?? "—"}</td>
      <td className="px-4 py-3 text-right tabular-nums text-foreground">{Number(totalHours).toFixed(1)}</td>
      <td className="px-4 py-3 text-right tabular-nums text-purple-300 hidden sm:table-cell">{formatCurrency(totalCrewCost)}</td>
      <td className="px-4 py-3 text-right tabular-nums text-amber-300 font-medium">{formatCurrency(invoiceAmount)}</td>
    </tr>
  );
}
