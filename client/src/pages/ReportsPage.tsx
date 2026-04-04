// ============================================================
// Reports Page — Earnings, Monthly, Client Reports
// Design: Dark Cinematic Studio | Amber accent on charcoal
// Billing Model: Hourly — client billed at flat rate, crew paid individually
// ============================================================

import { useState, useMemo } from "react";
import { useApp } from "@/contexts/AppContext";
import type { Project, Client } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Eye, BarChart2, DollarSign, Users, TrendingUp, Calendar } from "lucide-react";
import ReportPreview from "@/components/ReportPreview";
import { getBillableHours, getProjectBillableHours, getProjectInvoiceAmount, getProjectWorkedHours, getProjectCrewCost as getProjectCrewCostHelper, getProjectTravelCost } from "@/lib/data";

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
  return getProjectWorkedHours(project);
}

function getProjectCrewCost(project: Project) {
  return getProjectCrewCostHelper(project);
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

  // ---- Billing stats per client (scoped to selected month) ----
  const clientBillingStats = useMemo((): ClientBillingStat[] => {
    return data.clients.map(client => {
      const clientProjects = monthlyProjects.filter(p => p.clientId === client.id);
      const totalHours = clientProjects.reduce((s, p) => s + getProjectBillableHours(p, client).totalBillable, 0);
      const crewCost = clientProjects.reduce((s, p) => s + getProjectCrewCost(p), 0);
      const invoiceAmount = clientProjects.reduce((s, p) => s + getProjectInvoiceAmount(p, client), 0);
      const margin = invoiceAmount - crewCost;
      return { client, projectCount: clientProjects.length, totalHours, invoiceAmount, crewCost, margin };
    });
  }, [data.clients, monthlyProjects]);

  // ---- Report generators ----
  function generateInternalReport() {
    const monthNum = parseInt(selectedMonth);
    const monthName = MONTHS[monthNum - 1];
    const yr = parseInt(selectedYear);
    const issueDate = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

    // Filter projects for this month
    const projects = filteredProjects
      .filter(p => parseInt(p.date.split("-")[1]) === monthNum)
      .sort((a, b) => a.date.localeCompare(b.date));

    // March 2026+: use billable hours with image tracking; before: use worked hours
    const useNewHoursDisplay = yr > 2026 || (yr === 2026 && monthNum >= 3);
    const totalProductionHours = useNewHoursDisplay
      ? projects.reduce((s, p) => {
          const client = data.clients.find(c => c.id === p.clientId);
          if (!client) return s + (p.crew || []).filter(e => e.role !== "Travel").reduce((h, e) => h + Number(e.hoursWorked ?? 0), 0);
          const crewBillable = (p.crew || []).filter(e => e.role !== "Travel").reduce((h, e) => h + getBillableHours(e, client), 0);
          const nonEditorPost = (p.postProduction || []).filter(e => e.role !== "Photo Editor" && e.role !== "Travel");
          const postBillable = nonEditorPost.reduce((h, e) => h + getBillableHours(e, client), 0);
          return s + crewBillable + postBillable;
        }, 0)
      : projects.reduce((s, p) => s + (p.crew || []).filter(e => e.role !== "Travel").reduce((h, e) => h + Number(e.hoursWorked ?? 0), 0), 0);
    const totalEditorHours = useNewHoursDisplay
      ? projects.reduce((s, p) => s + (p.editorBilling?.finalHours ?? 0), 0)
      : projects.reduce((s, p) => s + getProjectWorkedHours(p).postHours, 0);
    const totalImages = useNewHoursDisplay
      ? projects.reduce((s, p) => s + (p.editorBilling?.imageCount ?? 0), 0)
      : 0;
    const totalTravelHours = projects.reduce((s, p) => {
      const crewTravel = (p.crew || []).filter(e => e.role === "Travel").reduce((h, e) => h + Number(e.hoursWorked ?? 0), 0);
      const postTravel = (p.postProduction || []).filter(e => e.role === "Travel").reduce((h, e) => h + Number(e.hoursWorked ?? 0), 0);
      return s + crewTravel + postTravel;
    }, 0);
    const totalHours = totalProductionHours + totalEditorHours;

    const totalBilling = projects.reduce((s, p) => {
      const client = data.clients.find(c => c.id === p.clientId);
      if (!client) return s;
      return s + getProjectInvoiceAmount(p, client);
    }, 0);
    const totalCrewCost = projects.reduce((s, p) => s + getProjectCrewCost(p), 0);

    // Earnings splits — use client's partnerSplit if available, otherwise SDub-only split
    const selectedClient = selectedClientId !== "all" ? data.clients.find(c => c.id === selectedClientId) : null;
    const split = selectedClient?.partnerSplit;
    const partnerName = split?.partnerName || null;
    const useNewSplitLogic = split && (yr > 2026 || (yr === 2026 && monthNum >= 3));

    let ownerCut = 0;
    let adminCut = 0;
    let marketingBudget = 0;

    if (useNewSplitLogic) {
      // March 2026+ partner split: per-project crew/editor formula
      projects.forEach(p => {
        const client = data.clients.find(c => c.id === p.clientId);
        if (!client) return;

        // Only apply partner split logic to clients that have a partnerSplit
        const clientSplit = client.partnerSplit;
        if (!clientSplit) {
          // Non-partner client (e.g. Hannah Grace): revenue goes entirely to SDub Media
          const projRevenue = getProjectInvoiceAmount(p, client);
          const projCrewCost = getProjectCrewCostHelper(p);
          const projTravelCost = getProjectTravelCost(p);
          adminCut += projRevenue - projCrewCost - projTravelCost;
          return;
        }

        const rate = Number(client.billingRatePerHour ?? 0);
        if (client.billingModel === "per_project") {
          // Per-project with partner: use project invoice amount as revenue, crew cost as labor
          const projRevenue = getProjectInvoiceAmount(p, client);
          const projCrewCost = getProjectCrewCostHelper(p);
          const projTravelCost = getProjectTravelCost(p);
          const projProfit = projRevenue - projCrewCost;
          if (projProfit > 0) {
            const partnerPct = clientSplit.partnerPercent ?? 0;
            const adminPct = clientSplit.adminPercent ?? 0.45;
            const mktgPct = clientSplit.marketingPercent ?? 0.10;
            ownerCut += projProfit * partnerPct;
            adminCut += projProfit * adminPct;
            marketingBudget += projProfit * mktgPct;
          }
          marketingBudget -= projTravelCost;
          return;
        }
        if (rate === 0) return;

        const { crewBillable, postBillable } = getProjectBillableHours(p, client);
        const hasPhotoEditor = p.editorBilling?.finalHours != null;
        const editorBillableHours = hasPhotoEditor ? p.editorBilling!.finalHours : 0;
        const nonEditorPostBillable = postBillable - editorBillableHours;

        // Billing amounts
        const crewBillingAmt = (crewBillable + nonEditorPostBillable) * rate;
        const editorBillingAmt = editorBillableHours * rate;

        // Crew costs (excluding photo editor and travel)
        const crewPayCost = (p.crew || []).filter(e => e.role !== "Travel").reduce((s, e) =>
          s + Number(e.hoursWorked ?? 0) * Number(e.payRatePerHour ?? 0), 0);
        const nonEditorPostCost = (p.postProduction || [])
          .filter(e => e.role !== "Photo Editor" && e.role !== "Travel")
          .reduce((s, e) => s + Number(e.hoursWorked ?? 0) * Number(e.payRatePerHour ?? 0), 0);
        const crewCost = crewPayCost + nonEditorPostCost;
        const travelCost = getProjectTravelCost(p);

        // CREW SPLIT: use client's configurable settings
        const threshold = clientSplit.crewSplitThreshold ?? 0.5;
        const crewMktgPct = clientSplit.crewMarketingPercent ?? 0.10;
        const remainderSplit = clientSplit.crewRemainderSplit ?? 0.5;
        if (crewBillingAmt > 0) {
          if (crewCost <= crewBillingAmt * threshold) {
            const mktg = crewBillingAmt * crewMktgPct;
            const remainder = crewBillingAmt - crewCost - mktg;
            if (clientSplit.spendingBudgetEnabled !== false) marketingBudget += mktg;
            ownerCut += remainder * remainderSplit;
            adminCut += remainder * (1 - remainderSplit);
          } else {
            const remainder = crewBillingAmt - crewCost;
            ownerCut += remainder * remainderSplit;
            adminCut += remainder * (1 - remainderSplit);
          }
        }

        // Travel deducted from marketing budget
        if (clientSplit.spendingBudgetEnabled !== false) marketingBudget -= travelCost;

        // EDITOR SPLIT: use client's configurable settings
        if (editorBillingAmt > 0 && hasPhotoEditor) {
          const editorCost = p.editorBilling!.imageCount * (p.editorBilling!.perImageRate ?? 6);
          const editorProfit = editorBillingAmt - editorCost;
          const ePtnr = clientSplit.editorPartnerPercent ?? 0.45;
          const eAdmin = clientSplit.editorAdminPercent ?? 0.45;
          const eMktg = clientSplit.editorMarketingPercent ?? 0.10;
          ownerCut += editorProfit * ePtnr;
          adminCut += editorProfit * eAdmin;
          if (clientSplit.spendingBudgetEnabled !== false) marketingBudget += editorProfit * eMktg;
        }
      });
    } else if (split) {
      // Jan/Feb 2026 legacy partner split (flat percentages on total billing)
      const partnerPct = split.partnerPercent ?? 0;
      const adminPct = split.adminPercent ?? 0.45;
      ownerCut = totalBilling * partnerPct;
      adminCut = totalBilling * adminPct;
      marketingBudget = totalBilling - totalCrewCost - ownerCut - adminCut;
    } else {
      // No partner — all profit goes to owner/admin
      adminCut = totalBilling - totalCrewCost;
      marketingBudget = 0;
    }

    // Total travel cost (shown on report, already deducted from marketing in new split logic)
    const totalTravelCost = projects.reduce((s, p) => s + getProjectTravelCost(p), 0);
    if (!useNewSplitLogic && totalTravelCost > 0) {
      marketingBudget -= totalTravelCost;
    }

    // Monthly marketing expenses (same month only)
    const monthStr = `${yr}-${String(monthNum).padStart(2, "0")}`;
    const monthlyExpensesList = data.marketingExpenses.filter(e => e.date.startsWith(monthStr));
    const monthlyExpenses = monthlyExpensesList.reduce((s, e) => s + e.amount, 0);
    const monthlyTravelExpenses = monthlyExpensesList.filter(e => e.category === "Travel").reduce((s, e) => s + e.amount, 0);
    const travelReimbursement = totalTravelCost + monthlyTravelExpenses;

    // YTD marketing balance (filtered by selected client if applicable, through selected month)
    const ytdProjects = data.projects
      .filter(p => p.date.startsWith(String(yr)) && parseInt(p.date.split("-")[1]) <= monthNum)
      .filter(p => selectedClientId === "all" || p.clientId === selectedClientId);
    const ytdMarketingEarned = ytdProjects.reduce((s, p) => {
        const client = data.clients.find(c => c.id === p.clientId);
        if (!client) return s;
        return s + getProjectInvoiceAmount(p, client) * 0.10;
      }, 0);
    const ytdTravelCost = ytdProjects.reduce((s, p) => s + getProjectTravelCost(p), 0);
    const ytdExpenses = data.marketingExpenses
      .filter(e => e.date.startsWith(String(yr)) && parseInt(e.date.split("-")[1]) <= monthNum)
      .filter(e => selectedClientId === "all" || e.clientId === selectedClientId)
      .reduce((s, e) => s + e.amount, 0);
    const ytdMarketingBalance = ytdMarketingEarned - ytdExpenses - ytdTravelCost;

    // Per-person pay breakdown
    const personPay: Record<string, { name: string; prodHours: number; editHours: number; editImages: number; editorBilledHours: number; travelHours: number; travelCost: number; totalPay: number }> = {};
    const emptyPerson = () => ({ name: "", prodHours: 0, editHours: 0, editImages: 0, editorBilledHours: 0, travelHours: 0, travelCost: 0, totalPay: 0 });
    projects.forEach(p => {
      const client = data.clients.find(c => c.id === p.clientId);
      (p.crew || []).forEach(e => {
        const member = data.crewMembers.find(c => c.id === e.crewMemberId);
        const name = member?.name ?? "Unknown";
        if (!personPay[e.crewMemberId]) personPay[e.crewMemberId] = { ...emptyPerson(), name };
        const hrs = Number(e.hoursWorked ?? 0);
        const rate = Number(e.payRatePerHour ?? 0);
        if (e.role === "Travel") {
          personPay[e.crewMemberId].travelHours += hrs;
          personPay[e.crewMemberId].travelCost += hrs * rate;
        } else {
          personPay[e.crewMemberId].prodHours += (useNewHoursDisplay && client) ? getBillableHours(e, client) : hrs;
          personPay[e.crewMemberId].totalPay += hrs * rate;
        }
      });
      (p.postProduction || []).forEach(e => {
        const member = data.crewMembers.find(c => c.id === e.crewMemberId);
        const name = member?.name ?? "Unknown";
        if (!personPay[e.crewMemberId]) personPay[e.crewMemberId] = { ...emptyPerson(), name };
        if (e.role === "Travel") {
          const hrs = Number(e.hoursWorked ?? 0);
          personPay[e.crewMemberId].travelHours += hrs;
          personPay[e.crewMemberId].travelCost += hrs * Number(e.payRatePerHour ?? 0);
        } else if (useNewHoursDisplay && e.role === "Photo Editor" && p.editorBilling) {
          personPay[e.crewMemberId].editImages += p.editorBilling.imageCount;
          personPay[e.crewMemberId].editorBilledHours += p.editorBilling.finalHours ?? 0;
          personPay[e.crewMemberId].totalPay += p.editorBilling.imageCount * (p.editorBilling.perImageRate ?? 6);
        } else {
          personPay[e.crewMemberId].editHours += (useNewHoursDisplay && client) ? getBillableHours(e, client) : Number(e.hoursWorked ?? 0);
          personPay[e.crewMemberId].totalPay += Number(e.hoursWorked ?? 0) * Number(e.payRatePerHour ?? 0);
        }
      });
    });
    const personList = Object.values(personPay).sort((a, b) => b.totalPay - a.totalPay);

    // Crew pay cards
    const crewPayCards = personList.map(p => `
      <div class="crew-pay-card">
        <div class="crew-pay-name">${p.name}</div>
        <div class="crew-pay-amount">${formatCurrency(p.totalPay)}</div>
      </div>
    `).join("");

    // Pay table rows
    const payTableRows = personList.map(p => `
      <tr><td>${p.name}</td><td style="text-align:right">${formatCurrency(p.totalPay)}</td></tr>
    `).join("");

    // Hours by person table
    const hoursTableRows = personList.map(p => {
      const editDisplay = p.editImages > 0
        ? `${p.editorBilledHours.toFixed(2)} hrs / ${p.editImages} imgs`
        : p.editHours > 0
          ? p.editHours.toFixed(2)
          : "—";
      const totalBilledHrs = p.prodHours + p.editHours + p.editorBilledHours;
      const totalDisplay = p.editImages > 0
        ? `${totalBilledHrs.toFixed(2)} hrs / ${p.editImages} imgs`
        : totalBilledHrs.toFixed(2);
      return `
        <tr>
          <td>${p.name}</td>
          <td style="text-align:right">${p.prodHours > 0 ? p.prodHours.toFixed(2) : "—"}</td>
          <td style="text-align:right">${editDisplay}</td>
          <td style="text-align:right">${p.travelCost > 0 ? formatCurrency(p.travelCost) : "—"}</td>
          <td style="text-align:right; font-weight:700">${totalDisplay}</td>
        </tr>
      `;
    }).join("");

    // Group projects by date
    const dateGroups = new Map<string, typeof projects>();
    projects.forEach(p => {
      const existing = dateGroups.get(p.date) || [];
      existing.push(p);
      dateGroups.set(p.date, existing);
    });

    // Build day sections
    const daySections = Array.from(dateGroups.entries()).map(([date, dayProjects]) => {
      const dayDate = new Date(date + "T00:00:00");
      const dayName = dayDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
      const dayTotalHours = useNewHoursDisplay
        ? dayProjects.reduce((s, p) => {
            const client = data.clients.find(c => c.id === p.clientId);
            return s + (client ? getProjectBillableHours(p, client).totalBillable : getProjectHours(p).totalHours);
          }, 0)
        : dayProjects.reduce((s, p) => s + getProjectHours(p).totalHours, 0);

      const projectCards = dayProjects.map(p => {
        const client = data.clients.find(c => c.id === p.clientId);
        const type = data.projectTypes.find(t => t.id === p.projectTypeId)?.name || "";
        const loc = data.locations.find(l => l.id === p.locationId);
        const { crewHours: rawCrewHours, postHours, totalHours: projTotal } = getProjectWorkedHours(p);
        const crewHours = rawCrewHours - (p.crew || []).filter(e => e.role === "Travel").reduce((h, e) => h + Number(e.hoursWorked ?? 0), 0);
        const billable = (useNewHoursDisplay && client) ? getProjectBillableHours(p, client) : null;
        const projTravelCost = getProjectTravelCost(p);
        const billedTotal = (billable?.totalBillable ?? projTotal) - (p.crew || []).filter(e => e.role === "Travel").reduce((h, e) => h + Number(e.hoursWorked ?? 0), 0);
        const hasEditorBilling = useNewHoursDisplay && !!p.editorBilling?.finalHours;

        const locationHtml = loc ? `
          <div class="project-meta-label">Filming Location</div>
          <div class="project-meta-value"><strong>${loc.name}</strong><br/>${loc.address} ${loc.city}, ${loc.state} ${loc.zip}</div>
        ` : "";

        const filmingTime = (p.startTime && p.endTime) ? `
          <div class="project-meta-label">Filming Time</div>
          <div class="project-meta-value">${p.startTime} - ${p.endTime}</div>
        ` : "";

        const deliverables = (p.editTypes || []).map(et => `<li>${et}</li>`).join("");
        const deliverablesHtml = deliverables ? `
          <div class="project-meta-label">Deliverables</div>
          <ul class="deliverables-list">${deliverables}</ul>
        ` : "";

        // Internal pay allocation table
        const allEntries = [
          ...(p.crew || []).map(e => ({ ...e, type: "Filming" })),
          ...(p.postProduction || []).map(e => ({ ...e, type: "Editing" })),
        ];
        const payRows = allEntries.map(e => {
          const member = data.crewMembers.find(c => c.id === e.crewMemberId);
          const isPhotoEditorWithBilling = e.role === "Photo Editor" && p.editorBilling;
          const editorRate = p.editorBilling?.perImageRate ?? 6;
          const qty = isPhotoEditorWithBilling ? p.editorBilling!.imageCount : Number(e.hoursWorked ?? 0);
          const rate = isPhotoEditorWithBilling ? editorRate : Number(e.payRatePerHour ?? 0);
          const qtyLabel = isPhotoEditorWithBilling ? `${qty} imgs` : `${qty.toFixed(2)}`;
          const rateLabel = isPhotoEditorWithBilling ? `$${editorRate}/img` : formatCurrency(rate);
          return `
            <tr>
              <td>${member?.name ?? "Unknown"}</td>
              <td>${e.role}</td>
              <td style="text-align:right">${qtyLabel}</td>
              <td style="text-align:right">${rateLabel}</td>
              <td style="text-align:right">${formatCurrency(qty * rate)}</td>
            </tr>
          `;
        }).join("");
        const projectLabor = getProjectCrewCost(p);

        const isClientPerProject = client?.billingModel === "per_project";
        const projInvoiceAmt = client ? getProjectInvoiceAmount(p, client) : 0;

        return `
          <div class="project-card" style="margin-bottom: 16px;">
            <div class="project-card-header">
              <div>
                <div class="project-name">${loc?.name || client?.company || ""}</div>
                <div class="project-type-badge">${type}</div>
              </div>
              <div style="text-align: right;">
                ${isClientPerProject ? `
                <div class="hours-badge">${formatCurrency(projInvoiceAmt)}</div>
                <div class="hours-detail">Project Rate</div>
                ` : `
                <div class="hours-badge">${billedTotal.toFixed(2)} hrs</div>
                <div class="hours-detail">Hours Billed to Client</div>
                `}
                ${crewHours > 0 ? `<div class="hours-detail">Production: ${(billable ? billable.crewBillable - ((p.crew || []).filter(e => e.role === "Travel").reduce((h, e) => h + getBillableHours(e, client!), 0)) : crewHours).toFixed(2)} hrs</div>` : ""}
                ${hasEditorBilling ? `<div class="hours-detail">${p.editorBilling!.imageCount} images @ $${(p.editorBilling!.perImageRate ?? 6).toFixed(0)}/img</div>` : postHours > 0 ? `<div class="hours-detail">Editing: ${postHours.toFixed(2)} hrs</div>` : ""}
                ${projTravelCost > 0 ? `<div class="hours-detail" style="color:#8b5cf6">Travel: ${formatCurrency(projTravelCost)}</div>` : ""}
              </div>
            </div>
            <hr class="project-card-divider" />
            <div class="project-card-body">
              ${filmingTime}
              ${locationHtml}
              ${deliverablesHtml}
              <div class="internal-pay-box">
                <div class="ipb-header">Internal Pay Allocation</div>
                <div class="ipb-note">Crew Pay = Hours × Rate (gross labor only). Owner/Admin/Marketing splits are separate.</div>
                <table class="internal-pay-table">
                  <thead><tr><th>Person</th><th>Role</th><th style="text-align:right">Hours</th><th style="text-align:right">Rate</th><th style="text-align:right">Allocated Pay</th></tr></thead>
                  <tbody>${payRows}</tbody>
                  <tfoot><tr class="ipt-total"><td colspan="4"><strong>Project Labor Cost</strong></td><td>${formatCurrency(projectLabor)}</td></tr></tfoot>
                </table>
              </div>
            </div>
          </div>
        `;
      }).join("");

      return `
        <div class="day-header">
          <div>
            <div class="day-title">${dayName}</div>
            <div class="day-subtitle">${dayProjects.length} Project${dayProjects.length !== 1 ? "s" : ""}</div>
          </div>
          <div>
            <div class="day-hours-label">Total Hours Billed</div>
            <div class="day-hours-value">${dayTotalHours.toFixed(2)}</div>
          </div>
        </div>
        <div class="day-projects">
          ${projectCards}
        </div>
      `;
    }).join("");

    setPreview({ title: `Earnings Breakdown — ${monthName} ${yr}`, html: `
      <!-- Header Banner -->
      <div class="invoice-header">
        <h1>Earnings Breakdown Report</h1>
        <div class="meta-grid">
          <div><div class="meta-label">Report Period</div><div class="meta-value">${monthName} ${yr}</div></div>
          <div><div class="meta-label">Generated</div><div class="meta-value">${issueDate}</div></div>
        </div>
      </div>

      <!-- Earnings Summary -->
      <h2 style="font-size: 18px; font-weight: 700; margin: 24px 0 12px; border: none;">Earnings Summary</h2>

      <div class="section">
        <div class="section-header">Spending Budget</div>
        <div class="section-body" style="padding: 0;">
          <table style="width:100%;border-collapse:collapse">
            <tbody>
              <tr><td style="padding:10px 16px;font-size:13px">Added in ${monthName}</td><td style="text-align:right;padding:10px 16px;font-size:13px;font-weight:600;color:#22c55e">+${formatCurrency(marketingBudget)}</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="earnings-grid-2">
        ${partnerName ? `<div class="earnings-card owner">
          <div class="card-label" style="color: #22c55e; font-weight: 600;">${partnerName} (Partner)</div>
          <div class="card-value">${formatCurrency(ownerCut)}</div>
        </div>` : ""}
        <div class="earnings-card admin">
          <div class="card-label" style="color: #3b82f6; font-weight: 600;">SDub Media LLC</div>
          <div class="card-value">${formatCurrency(adminCut)}</div>
        </div>
      </div>

      <!-- Crew & Editors -->
      <h2 style="font-size: 16px; font-weight: 700; margin: 20px 0 4px; border: none;">Crew & Editors</h2>
      <p class="subtitle" style="margin-bottom: 12px;">Payroll totals aggregated from project Internal Pay Allocation rows (worked hours × pay rate).</p>
      <div class="earnings-grid-2">
        ${crewPayCards}
      </div>
      ${split ? (() => {
        const geoffCrewPay = personList.find(p => p.name === "Geoff Southworth")?.totalPay ?? 0;
        const geoffTotal = geoffCrewPay + adminCut + travelReimbursement;
        return `<div class="earnings-card" style="border-top: 3px solid #3b82f6; margin-bottom: 16px;">
          <div class="card-label" style="color: #3b82f6; font-weight: 600;">Geoff Southworth — Total Payout</div>
          <div class="card-value">${formatCurrency(geoffTotal)}</div>
          <div class="card-note" style="margin-top:6px;font-size:12px;color:#555">
            Crew: ${formatCurrency(geoffCrewPay)} · Admin: ${formatCurrency(adminCut)} · Travel: ${formatCurrency(travelReimbursement)}
          </div>
        </div>`;
      })() : ""}

      <!-- Pay This Week -->
      <div class="section">
        <div class="section-header">Pay This Period (Internal)</div>
        <div class="section-body">
          <table class="pay-table">
            <thead><tr><th>Person</th><th style="text-align:right">Amount to Pay</th></tr></thead>
            <tbody>${payTableRows}
              ${partnerName ? `<tr style="border-top:1px solid #e5e5e5"><td>${partnerName} (Partner)</td><td style="text-align:right">${formatCurrency(ownerCut)}</td></tr>` : ""}
              ${split ? `<tr><td>Geoff Southworth (Admin)</td><td style="text-align:right">${formatCurrency(adminCut)}</td></tr>` : ""}
              ${split ? `<tr><td>Geoff Southworth (Travel Expense)</td><td style="text-align:right">${formatCurrency(travelReimbursement)}</td></tr>` : ""}
            </tbody>
            <tfoot><tr class="pay-total"><td><strong>Total to Pay</strong></td><td style="text-align:right">${formatCurrency(totalCrewCost + adminCut + (partnerName ? ownerCut : 0) + travelReimbursement)}</td></tr></tfoot>
          </table>
          <p style="font-size: 11px; color: #888;">Reference: Earnings Breakdown Report for ${monthName} ${yr}</p>
        </div>
      </div>

      <!-- Hours Billed to Client Summary -->
      <div class="section">
        <div class="section-header">Hours Billed to Client — Summary</div>
        <div class="section-body" style="padding: 0;">
          <div class="hours-billed-grid" style="grid-template-columns: ${totalTravelCost > 0 ? "1fr 1fr 1fr 1fr" : "1fr 1fr 1fr"}">
            <div class="hours-billed-cell"><div class="hb-label">Production</div><div class="hb-value">${totalProductionHours.toFixed(2)} hrs</div></div>
            <div class="hours-billed-cell"><div class="hb-label">Editor</div><div class="hb-value">${totalEditorHours.toFixed(2)} hrs${totalImages > 0 ? ` / ${totalImages} imgs` : ""}</div></div>
            ${totalTravelCost > 0 ? `<div class="hours-billed-cell"><div class="hb-label">Travel</div><div class="hb-value" style="color:#8b5cf6">${formatCurrency(totalTravelCost)}</div></div>` : ""}
            <div class="hours-billed-cell"><div class="hb-label">Total Billed</div><div class="hb-value highlight">${totalHours.toFixed(2)} hrs</div></div>
          </div>
        </div>
      </div>

      <!-- Hours by Person -->
      <h2 style="font-size: 18px; font-weight: 700; margin: 24px 0 4px; border: none;">Hours Billed to Client (by Person)</h2>
      <p class="subtitle" style="margin-bottom: 12px;">Billed hours reflect billable time entries for this period.</p>
      <table class="pay-table">
        <thead><tr><th>Person</th><th style="text-align:right">Production Hours</th><th style="text-align:right">Editor Hours</th><th style="text-align:right">Travel</th><th style="text-align:right">Total Billed Hours</th></tr></thead>
        <tbody>${hoursTableRows}</tbody>
        <tfoot><tr class="pay-total"><td><strong>TOTAL</strong></td><td style="text-align:right">${totalProductionHours.toFixed(2)}</td><td style="text-align:right">${totalEditorHours.toFixed(2)} hrs${totalImages > 0 ? ` / ${totalImages} imgs` : ""}</td><td style="text-align:right">${totalTravelCost > 0 ? formatCurrency(totalTravelCost) : "—"}</td><td style="text-align:right">${totalHours.toFixed(2)} hrs</td></tr></tfoot>
      </table>

      <!-- Weekly Activity & Pay Breakdown -->
      <h2 style="font-size: 18px; font-weight: 700; margin: 28px 0 4px; border: none; text-transform: uppercase; letter-spacing: 0.05em;">Weekly Activity & Pay Breakdown (Internal)</h2>
      ${daySections || "<p>No projects this period</p>"}
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

    // Calculate billable hours (with role multipliers + editorBilling)
    const totalProductionHours = clientProjects.reduce((s, p) =>
      s + getProjectBillableHours(p, client).crewBillable, 0);
    const totalEditorHours = clientProjects.reduce((s, p) =>
      s + getProjectBillableHours(p, client).postBillable, 0);
    const totalHours = totalProductionHours + totalEditorHours;
    const totalInvoice = clientProjects.reduce((s, p) => s + getProjectInvoiceAmount(p, client), 0);

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

    const isPerProject = client.billingModel === "per_project";

    // Build project cards
    const projectCards = clientProjects.map(p => {
      const type = data.projectTypes.find(t => t.id === p.projectTypeId)?.name || "";
      const loc = data.locations.find(l => l.id === p.locationId);
      const { crewBillable: crewHours, postBillable: postHours, totalBillable: projTotal } = getProjectBillableHours(p, client);
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
            <div class="crew-hours">${getBillableHours(e, client).toFixed(2)} hrs</div>
          </div>
        `;
      }).join("");

      const postEntries = (p.postProduction || []).map(e => {
        const member = data.crewMembers.find(c => c.id === e.crewMemberId);
        const isPhotoEditorWithBilling = e.role === "Photo Editor" && p.editorBilling?.finalHours;
        const displayHours = isPhotoEditorWithBilling ? p.editorBilling!.finalHours : getBillableHours(e, client);
        return `
          <div class="crew-entry">
            <div><div class="crew-role">Editing</div><div class="crew-name">${member?.name ?? "Unknown"}</div></div>
            <div class="crew-hours">${displayHours.toFixed(2)} hrs</div>
          </div>
        `;
      }).join("");

      const projRate = getProjectInvoiceAmount(p, client);

      return `
        <div class="project-card">
          <div class="project-card-header">
            <div>
              <div class="project-name">${type}</div>
              <div class="project-date">${dateStr}</div>
            </div>
            <div style="text-align: right;">
              ${isPerProject ? `
              <div class="hours-badge">${formatCurrency(projRate)}</div>
              <div class="hours-detail">Flat Rate</div>
              ` : `
              <div class="hours-badge">${projTotal.toFixed(2)} hrs</div>
              <div class="hours-detail">Production: ${crewHours.toFixed(2)}</div>
              <div class="hours-detail">Editing: ${postHours.toFixed(2)}</div>
              `}
            </div>
          </div>
          <hr class="project-card-divider" />
          <div class="project-card-body">
            ${locationHtml}
            ${deliverablesHtml}
            ${!isPerProject ? `
            <div style="margin-top: 16px;">
              ${crewEntries}
              ${postEntries}
            </div>
            ` : ""}
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
        <h1>${isPerProject ? "Project Activity Report & Invoice" : "Hourly Activity Report & Project Invoice"}</h1>
        <div class="meta-grid">
          <div><div class="meta-label">Report #</div><div class="meta-value">${reportNum}</div></div>
          <div><div class="meta-label">Report Period</div><div class="meta-value">${periodStart} - ${periodEnd}</div></div>
          <div><div class="meta-label">Issue Date</div><div class="meta-value">${issueDate}</div></div>
        </div>
      </div>

      <!-- Summary -->
      <div class="section">
        <div class="section-header">${isPerProject ? "Project Summary" : "Hours Summary"}</div>
        <div class="section-body">
          ${isPerProject ? `
          <div class="hours-row"><span>Projects Completed</span><span>${clientProjects.length}</span></div>
          <div class="hours-row highlight"><span>Total Billed</span><span class="hours-value">${formatCurrency(totalInvoice)}</span></div>
          ` : `
          <div class="hours-row"><span>Production Hours Used</span><span>${totalProductionHours.toFixed(1)} hrs</span></div>
          <div class="hours-row"><span>Editor Hours Used</span><span>${totalEditorHours.toFixed(1)} hrs</span></div>
          <div class="hours-row total"><span>Total Hours Used</span><span>${totalHours.toFixed(1)} hrs</span></div>
          <div class="hours-row highlight"><span>Total Value of Hours Used</span><span class="hours-value">${formatCurrency(totalInvoice)}</span></div>
          `}
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
          <div class="calc">${isPerProject
            ? `${clientProjects.length} project${clientProjects.length !== 1 ? "s" : ""} — flat rate billing`
            : `${totalHours.toFixed(1)} hrs × $${Number(client.billingRatePerHour).toFixed(0)}/hr`
          }</div>
          <div class="note">Make checks payable to ${client.partnerSplit?.partnerName ? client.partnerSplit.partnerName : "SDub Media LLC"} if additional charges apply.</div>
        </div>
      </div>

      <!-- Service Provider & Client -->
      <div class="section">
        <div class="section-header">Service Provider & Client</div>
        <div class="section-body">
          <div class="provider-grid">
            <div><div class="col-label">Service Provider</div><div class="col-value">${client.partnerSplit?.partnerName || "SDub Media LLC"}</div></div>
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

  const ytdHours = filteredProjects.reduce((s, p) => {
    const client = data.clients.find(c => c.id === p.clientId);
    if (!client) return s + getProjectHours(p).totalHours;
    return s + getProjectBillableHours(p, client).totalBillable;
  }, 0);
  const ytdInvoice = filteredProjects.reduce((s, p) => {
    const client = data.clients.find(c => c.id === p.clientId);
    if (!client) return s;
    return s + getProjectInvoiceAmount(p, client);
  }, 0);

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
      <div className="grid grid-cols-3 gap-3">
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
              <DollarSign className="w-4 h-4 text-primary" />
              <span className="text-xs text-muted-foreground uppercase tracking-wide">YTD Revenue</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{formatCurrency(ytdInvoice)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Report tabs */}
      <Tabs defaultValue="client">
        <TabsList className="bg-muted">
          <TabsTrigger value="client">Client Reports</TabsTrigger>
          <TabsTrigger value="internal">Internal Report</TabsTrigger>
        </TabsList>

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
                      <p className="text-xs text-muted-foreground mt-0.5">{client.contactName} · {client.email} · {client.billingModel === "per_project" ? `$${Number(client.perProjectRate).toFixed(0)}/project` : `$${client.billingRatePerHour}/hr`}</p>
                    </div>
                    <Button size="sm" onClick={() => generateClientReport(client.id)} className="gap-2">
                      <Eye className="w-4 h-4" />
                      Preview Report
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className={`grid ${client.billingModel === "per_project" ? "grid-cols-2" : "grid-cols-3"} gap-3 mb-4`}>
                    <div className="text-center p-3 rounded-lg bg-muted/30">
                      <p className="text-xs text-muted-foreground mb-1">Projects</p>
                      <p className="text-xl font-bold text-foreground">{stat.projectCount}</p>
                    </div>
                    {client.billingModel !== "per_project" && (
                      <div className="text-center p-3 rounded-lg bg-muted/30">
                        <p className="text-xs text-muted-foreground mb-1">Hours</p>
                        <p className="text-xl font-bold text-foreground">{formatHours(stat.totalHours)}</p>
                      </div>
                    )}
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

        {/* ---- Internal Report ---- */}
        <TabsContent value="internal" className="mt-4 space-y-4">
          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">
                  Earnings Breakdown — {MONTHS[parseInt(selectedMonth) - 1]} {selectedYear}
                </CardTitle>
                <Button size="sm" onClick={generateInternalReport} className="gap-2">
                  <Eye className="w-4 h-4" />
                  Preview Report
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Internal earnings breakdown with crew pay allocation, owner/admin splits, spending budget, and per-project labor costs for {MONTHS[parseInt(selectedMonth) - 1]} {selectedYear}.
              </p>
              <p className="text-sm text-muted-foreground mt-2">
                {monthlyProjects.length} project{monthlyProjects.length !== 1 ? "s" : ""} this month
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
    </>
  );
}
