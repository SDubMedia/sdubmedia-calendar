// ============================================================
// ProfitLossPage — Owner P&L statement
// Monthly breakdown with revenue, expenses, and margins
// ============================================================

import { useState, useMemo } from "react";
import { useApp } from "@/contexts/AppContext";
import { getProjectInvoiceAmount, getProjectCrewCost, getProjectTravelCost } from "@/lib/data";
import { ChevronLeft, ChevronRight, Printer, TrendingUp, TrendingDown, DollarSign } from "lucide-react";
import { Button } from "@/components/ui/button";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatCurrency(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
}

function formatCurrencyFull(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(n);
}

function formatPercent(n: number) {
  return `${n.toFixed(1)}%`;
}

interface MonthlyPL {
  month: string;
  monthIndex: number;
  projectCount: number;
  revenue: number;
  crewCost: number;
  travelCost: number;
  marketingExpenses: number;
  grossProfit: number;
  netProfit: number;
  grossMargin: number;
  netMargin: number;
}

export default function ProfitLossPage() {
  const { data } = useApp();
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());

  const monthlyData = useMemo((): MonthlyPL[] => {
    const months: MonthlyPL[] = [];

    for (let m = 0; m < 12; m++) {
      const monthProjects = data.projects.filter(p => {
        const d = new Date(p.date + "T00:00:00");
        return d.getFullYear() === year && d.getMonth() === m;
      });

      let revenue = 0;
      let crewCost = 0;
      let travelCost = 0;

      monthProjects.forEach(p => {
        const client = data.clients.find(c => c.id === p.clientId);
        if (client) revenue += getProjectInvoiceAmount(p, client);
        crewCost += getProjectCrewCost(p);
        travelCost += getProjectTravelCost(p);
      });

      const monthStr = `${year}-${String(m + 1).padStart(2, "0")}`;
      const marketingExpenses = data.marketingExpenses
        .filter(e => e.date.startsWith(monthStr))
        .reduce((s, e) => s + e.amount, 0);

      const grossProfit = revenue - crewCost;
      const netProfit = grossProfit - travelCost - marketingExpenses;
      const grossMargin = revenue > 0 ? (grossProfit / revenue) * 100 : 0;
      const netMargin = revenue > 0 ? (netProfit / revenue) * 100 : 0;

      months.push({
        month: MONTH_NAMES[m],
        monthIndex: m,
        projectCount: monthProjects.length,
        revenue,
        crewCost,
        travelCost,
        marketingExpenses,
        grossProfit,
        netProfit,
        grossMargin,
        netMargin,
      });
    }
    return months;
  }, [data.projects, data.clients, data.marketingExpenses, year]);

  // Revenue by client for the year
  const clientBreakdown = useMemo(() => {
    const map = new Map<string, { name: string; revenue: number; crewCost: number; projectCount: number }>();
    data.projects
      .filter(p => new Date(p.date + "T00:00:00").getFullYear() === year)
      .forEach(p => {
        const client = data.clients.find(c => c.id === p.clientId);
        if (!client) return;
        const existing = map.get(client.id) || { name: client.company, revenue: 0, crewCost: 0, projectCount: 0 };
        existing.revenue += getProjectInvoiceAmount(p, client);
        existing.crewCost += getProjectCrewCost(p);
        existing.projectCount++;
        map.set(client.id, existing);
      });
    return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
  }, [data.projects, data.clients, year]);

  // Pay per crew member for the year
  const crewPayBreakdown = useMemo(() => {
    const map = new Map<string, { name: string; totalPay: number; hours: number; projectCount: number }>();
    data.projects
      .filter(p => new Date(p.date + "T00:00:00").getFullYear() === year)
      .forEach(p => {
        const allEntries = [
          ...(p.crew || []).map(e => ({ ...e, type: "crew" })),
          ...(p.postProduction || []).map(e => ({ ...e, type: "post" })),
        ];
        const seen = new Set<string>(); // count project once per person
        allEntries.forEach(e => {
          const member = data.crewMembers.find(c => c.id === e.crewMemberId);
          if (!member) return;
          const existing = map.get(e.crewMemberId) || { name: member.name, totalPay: 0, hours: 0, projectCount: 0 };
          if (e.role === "Photo Editor" && p.editorBilling) {
            existing.totalPay += p.editorBilling.imageCount * (p.editorBilling.perImageRate ?? 6);
          } else if (e.role !== "Travel") {
            existing.totalPay += Number(e.hoursWorked ?? 0) * Number(e.payRatePerHour ?? 0);
          }
          existing.hours += Number(e.hoursWorked ?? 0);
          if (!seen.has(e.crewMemberId)) {
            existing.projectCount++;
            seen.add(e.crewMemberId);
          }
          map.set(e.crewMemberId, existing);
        });
      });
    return Array.from(map.values()).sort((a, b) => b.totalPay - a.totalPay);
  }, [data.projects, data.crewMembers, year]);

  // Partner payouts for the year
  const partnerPayouts = useMemo(() => {
    const map = new Map<string, { name: string; totalPayout: number }>();
    data.projects
      .filter(p => new Date(p.date + "T00:00:00").getFullYear() === year)
      .forEach(p => {
        const client = data.clients.find(c => c.id === p.clientId);
        if (!client?.partnerSplit) return;
        const split = client.partnerSplit;
        const revenue = getProjectInvoiceAmount(p, client);
        const crewCost = getProjectCrewCost(p);
        const profit = revenue - crewCost;
        if (profit <= 0) return;
        const partnerCut = profit * (split.partnerPercent ?? 0);
        if (partnerCut > 0) {
          const existing = map.get(split.partnerName) || { name: split.partnerName, totalPayout: 0 };
          existing.totalPayout += partnerCut;
          map.set(split.partnerName, existing);
        }
      });
    return Array.from(map.values()).sort((a, b) => b.totalPayout - a.totalPayout);
  }, [data.projects, data.clients, year]);

  const annualTotals = useMemo(() => {
    return monthlyData.reduce((acc, m) => ({
      projectCount: acc.projectCount + m.projectCount,
      revenue: acc.revenue + m.revenue,
      crewCost: acc.crewCost + m.crewCost,
      travelCost: acc.travelCost + m.travelCost,
      marketingExpenses: acc.marketingExpenses + m.marketingExpenses,
      grossProfit: acc.grossProfit + m.grossProfit,
      netProfit: acc.netProfit + m.netProfit,
    }), { projectCount: 0, revenue: 0, crewCost: 0, travelCost: 0, marketingExpenses: 0, grossProfit: 0, netProfit: 0 });
  }, [monthlyData]);

  const annualGrossMargin = annualTotals.revenue > 0 ? (annualTotals.grossProfit / annualTotals.revenue) * 100 : 0;
  const annualNetMargin = annualTotals.revenue > 0 ? (annualTotals.netProfit / annualTotals.revenue) * 100 : 0;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-border bg-card/50 print:hidden">
        <div>
          <h1 className="text-xl font-semibold text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            Profit & Loss
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Annual business performance</p>
        </div>
        <Button size="sm" onClick={() => window.print()} className="gap-2">
          <Printer className="w-4 h-4" /> Print
        </Button>
      </div>

      {/* Year navigator */}
      <div className="flex items-center justify-center gap-4 py-3 print:hidden">
        <button onClick={() => setYear(y => y - 1)} className="p-2 text-muted-foreground hover:text-foreground">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h2 className="text-lg font-semibold text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
          {year}
        </h2>
        <button onClick={() => setYear(y => y + 1)} className="p-2 text-muted-foreground hover:text-foreground">
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-auto p-3 sm:p-6 space-y-6">
        {/* Print header */}
        <div className="hidden print:block mb-4">
          <h1 className="text-2xl font-bold">Profit & Loss Statement — {year}</h1>
          <p className="text-sm text-gray-600 mt-1">SDub Media | Generated {new Date().toLocaleDateString()}</p>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-card border border-border rounded-lg p-4 text-center print:border-gray-300">
            <p className="text-2xl font-bold text-foreground">{formatCurrency(annualTotals.revenue)}</p>
            <p className="text-xs text-muted-foreground mt-1">Gross Revenue</p>
          </div>
          <div className="bg-card border border-border rounded-lg p-4 text-center print:border-gray-300">
            <p className="text-2xl font-bold text-foreground">{formatCurrency(annualTotals.crewCost)}</p>
            <p className="text-xs text-muted-foreground mt-1">Crew Costs</p>
          </div>
          <div className="bg-card border border-border rounded-lg p-4 text-center print:border-gray-300">
            <p className={`text-2xl font-bold ${annualTotals.grossProfit >= 0 ? "text-green-400" : "text-red-400"}`}>
              {formatCurrency(annualTotals.grossProfit)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">Gross Profit ({formatPercent(annualGrossMargin)})</p>
          </div>
          <div className="bg-card border border-border rounded-lg p-4 text-center print:border-gray-300">
            <p className={`text-2xl font-bold ${annualTotals.netProfit >= 0 ? "text-green-400" : "text-red-400"}`}>
              {formatCurrency(annualTotals.netProfit)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">Net Profit ({formatPercent(annualNetMargin)})</p>
          </div>
        </div>

        {/* Monthly P&L Table */}
        <div className="bg-card border border-border rounded-lg print:border-gray-300">
          <div className="px-4 py-3 border-b border-border print:border-gray-300">
            <h3 className="text-sm font-semibold text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              Monthly Breakdown
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground border-b border-border print:border-gray-300">
                  <th className="text-left px-4 py-2">Month</th>
                  <th className="text-right px-3 py-2">Projects</th>
                  <th className="text-right px-3 py-2">Revenue</th>
                  <th className="text-right px-3 py-2">Crew</th>
                  <th className="text-right px-3 py-2">Travel</th>
                  <th className="text-right px-3 py-2">Marketing</th>
                  <th className="text-right px-3 py-2">Gross Profit</th>
                  <th className="text-right px-4 py-2">Net Profit</th>
                </tr>
              </thead>
              <tbody>
                {monthlyData.map(m => (
                  <tr key={m.monthIndex} className={`border-b border-border/50 print:border-gray-200 ${m.projectCount === 0 ? "text-muted-foreground" : ""}`}>
                    <td className="px-4 py-2 font-medium">{MONTH_SHORT[m.monthIndex]}</td>
                    <td className="text-right px-3 py-2">{m.projectCount || "—"}</td>
                    <td className="text-right px-3 py-2">{m.revenue ? formatCurrency(m.revenue) : "—"}</td>
                    <td className="text-right px-3 py-2 text-red-300/70">{m.crewCost ? formatCurrency(m.crewCost) : "—"}</td>
                    <td className="text-right px-3 py-2 text-red-300/70">{m.travelCost ? formatCurrency(m.travelCost) : "—"}</td>
                    <td className="text-right px-3 py-2 text-red-300/70">{m.marketingExpenses ? formatCurrency(m.marketingExpenses) : "—"}</td>
                    <td className={`text-right px-3 py-2 font-medium ${m.grossProfit >= 0 ? "text-green-400" : "text-red-400"}`}>
                      {m.revenue ? formatCurrency(m.grossProfit) : "—"}
                    </td>
                    <td className={`text-right px-4 py-2 font-medium ${m.netProfit >= 0 ? "text-green-400" : "text-red-400"}`}>
                      {m.revenue ? formatCurrency(m.netProfit) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-bold border-t-2 border-border print:border-gray-400">
                  <td className="px-4 py-3">TOTAL</td>
                  <td className="text-right px-3 py-3">{annualTotals.projectCount}</td>
                  <td className="text-right px-3 py-3">{formatCurrency(annualTotals.revenue)}</td>
                  <td className="text-right px-3 py-3 text-red-300">{formatCurrency(annualTotals.crewCost)}</td>
                  <td className="text-right px-3 py-3 text-red-300">{formatCurrency(annualTotals.travelCost)}</td>
                  <td className="text-right px-3 py-3 text-red-300">{formatCurrency(annualTotals.marketingExpenses)}</td>
                  <td className={`text-right px-3 py-3 ${annualTotals.grossProfit >= 0 ? "text-green-400" : "text-red-400"}`}>
                    {formatCurrency(annualTotals.grossProfit)}
                  </td>
                  <td className={`text-right px-4 py-3 ${annualTotals.netProfit >= 0 ? "text-green-400" : "text-red-400"}`}>
                    {formatCurrency(annualTotals.netProfit)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Revenue by Client */}
        <div className="bg-card border border-border rounded-lg print:border-gray-300">
          <div className="px-4 py-3 border-b border-border print:border-gray-300">
            <h3 className="text-sm font-semibold text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              Revenue by Client
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground border-b border-border print:border-gray-300">
                  <th className="text-left px-4 py-2">Client</th>
                  <th className="text-right px-3 py-2">Projects</th>
                  <th className="text-right px-3 py-2">Revenue</th>
                  <th className="text-right px-3 py-2">Crew Cost</th>
                  <th className="text-right px-3 py-2">Gross Profit</th>
                  <th className="text-right px-4 py-2">Margin</th>
                </tr>
              </thead>
              <tbody>
                {clientBreakdown.map(c => {
                  const profit = c.revenue - c.crewCost;
                  const margin = c.revenue > 0 ? (profit / c.revenue) * 100 : 0;
                  return (
                    <tr key={c.name} className="border-b border-border/50 print:border-gray-200">
                      <td className="px-4 py-2 font-medium">{c.name}</td>
                      <td className="text-right px-3 py-2">{c.projectCount}</td>
                      <td className="text-right px-3 py-2">{formatCurrency(c.revenue)}</td>
                      <td className="text-right px-3 py-2 text-red-300/70">{formatCurrency(c.crewCost)}</td>
                      <td className={`text-right px-3 py-2 font-medium ${profit >= 0 ? "text-green-400" : "text-red-400"}`}>
                        {formatCurrency(profit)}
                      </td>
                      <td className="text-right px-4 py-2">{formatPercent(margin)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        {/* Crew Pay Breakdown */}
        {crewPayBreakdown.length > 0 && (
          <div className="bg-card border border-border rounded-lg print:border-gray-300">
            <div className="px-4 py-3 border-b border-border print:border-gray-300">
              <h3 className="text-sm font-semibold text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                Crew Pay Breakdown
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground border-b border-border print:border-gray-300">
                    <th className="text-left px-4 py-2">Crew Member</th>
                    <th className="text-right px-3 py-2">Projects</th>
                    <th className="text-right px-3 py-2">Hours</th>
                    <th className="text-right px-4 py-2">Total Paid</th>
                  </tr>
                </thead>
                <tbody>
                  {crewPayBreakdown.map(c => (
                    <tr key={c.name} className="border-b border-border/50 print:border-gray-200">
                      <td className="px-4 py-2 font-medium">{c.name}</td>
                      <td className="text-right px-3 py-2">{c.projectCount}</td>
                      <td className="text-right px-3 py-2">{c.hours.toFixed(1)}</td>
                      <td className="text-right px-4 py-2 font-medium">{formatCurrencyFull(c.totalPay)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="font-bold border-t-2 border-border print:border-gray-400">
                    <td className="px-4 py-3">TOTAL</td>
                    <td className="text-right px-3 py-3">{crewPayBreakdown.reduce((s, c) => s + c.projectCount, 0)}</td>
                    <td className="text-right px-3 py-3">{crewPayBreakdown.reduce((s, c) => s + c.hours, 0).toFixed(1)}</td>
                    <td className="text-right px-4 py-3">{formatCurrencyFull(crewPayBreakdown.reduce((s, c) => s + c.totalPay, 0))}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {/* Partner Payouts */}
        {partnerPayouts.length > 0 && (
          <div className="bg-card border border-border rounded-lg print:border-gray-300">
            <div className="px-4 py-3 border-b border-border print:border-gray-300">
              <h3 className="text-sm font-semibold text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                Partner Payouts
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground border-b border-border print:border-gray-300">
                    <th className="text-left px-4 py-2">Partner</th>
                    <th className="text-right px-4 py-2">Total Payout</th>
                  </tr>
                </thead>
                <tbody>
                  {partnerPayouts.map(p => (
                    <tr key={p.name} className="border-b border-border/50 print:border-gray-200">
                      <td className="px-4 py-2 font-medium">{p.name}</td>
                      <td className="text-right px-4 py-2 font-medium">{formatCurrencyFull(p.totalPayout)}</td>
                    </tr>
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
