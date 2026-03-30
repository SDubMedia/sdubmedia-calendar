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
import { getBillableHours, getProjectBillableHours, getProjectInvoiceAmount } from "@/lib/data";

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

function getPhotoEditorCost(project: Project): number {
  if (!project.editorBilling) return 0;
  return project.editorBilling.imageCount * (project.editorBilling.perImageRate ?? 6);
}

function getProjectCrewCost(project: Project) {
  const crewCost = (project.crew || []).reduce(
    (s, e) => s + Number(e.hoursWorked ?? 0) * Number(e.payRatePerHour ?? 0), 0
  );
  // For post-production, use editorBilling for photo editors when available
  const postCost = (project.postProduction || []).reduce((s, e) => {
    if (e.role === "Photo Editor" && project.editorBilling) {
      return s; // skip — handled by getPhotoEditorCost
    }
    return s + Number(e.hoursWorked ?? 0) * Number(e.payRatePerHour ?? 0);
  }, 0);
  return crewCost + postCost + getPhotoEditorCost(project);
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
      const totalHours = clientProjects.reduce((s, p) => s + getProjectBillableHours(p, client).totalBillable, 0);
      const crewCost = clientProjects.reduce((s, p) => s + getProjectCrewCost(p), 0);
      const invoiceAmount = clientProjects.reduce((s, p) => s + getProjectInvoiceAmount(p, client), 0);
      const margin = invoiceAmount - crewCost;
      return { client, projectCount: clientProjects.length, totalHours, invoiceAmount, crewCost, margin };
    });
  }, [data.clients, filteredProjects]);

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

    // Calculate totals
    const totalProductionHours = projects.reduce((s, p) =>
      s + (p.crew || []).reduce((cs, c) => cs + Number(c.hoursWorked ?? 0), 0), 0);
    const totalEditorHours = projects.reduce((s, p) =>
      s + (p.postProduction || []).reduce((ps, e) => ps + Number(e.hoursWorked ?? 0), 0), 0);
    const totalHours = totalProductionHours + totalEditorHours;

    const totalBilling = projects.reduce((s, p) => {
      const client = data.clients.find(c => c.id === p.clientId);
      if (!client) return s;
      return s + getProjectInvoiceAmount(p, client);
    }, 0);
    const totalCrewCost = projects.reduce((s, p) => s + getProjectCrewCost(p), 0);

    // Earnings splits
    const ownerCut = totalBilling * 0.20;
    const adminCut = totalBilling * 0.20;
    const marketingBudget = totalBilling - totalCrewCost - ownerCut - adminCut;

    // Per-person pay breakdown
    const personPay: Record<string, { name: string; prodHours: number; editHours: number; totalPay: number }> = {};
    projects.forEach(p => {
      (p.crew || []).forEach(e => {
        const member = data.crewMembers.find(c => c.id === e.crewMemberId);
        const name = member?.name ?? "Unknown";
        if (!personPay[e.crewMemberId]) personPay[e.crewMemberId] = { name, prodHours: 0, editHours: 0, totalPay: 0 };
        personPay[e.crewMemberId].prodHours += Number(e.hoursWorked ?? 0);
        personPay[e.crewMemberId].totalPay += Number(e.hoursWorked ?? 0) * Number(e.payRatePerHour ?? 0);
      });
      (p.postProduction || []).forEach(e => {
        const member = data.crewMembers.find(c => c.id === e.crewMemberId);
        const name = member?.name ?? "Unknown";
        if (!personPay[e.crewMemberId]) personPay[e.crewMemberId] = { name, prodHours: 0, editHours: 0, totalPay: 0 };
        if (e.role === "Photo Editor" && p.editorBilling) {
          personPay[e.crewMemberId].editHours += p.editorBilling.imageCount;
          personPay[e.crewMemberId].totalPay += p.editorBilling.imageCount * (p.editorBilling.perImageRate ?? 6);
        } else {
          personPay[e.crewMemberId].editHours += Number(e.hoursWorked ?? 0);
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
    const hoursTableRows = personList.map(p => `
      <tr>
        <td>${p.name}</td>
        <td style="text-align:right">${p.prodHours.toFixed(2)}</td>
        <td style="text-align:right">${p.editHours.toFixed(2)}</td>
        <td style="text-align:right; font-weight:700">${(p.prodHours + p.editHours).toFixed(2)}</td>
      </tr>
    `).join("");

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
      const dayTotalHours = dayProjects.reduce((s, p) => s + getProjectHours(p).totalHours, 0);

      const projectCards = dayProjects.map(p => {
        const client = data.clients.find(c => c.id === p.clientId);
        const type = data.projectTypes.find(t => t.id === p.projectTypeId)?.name || "";
        const loc = data.locations.find(l => l.id === p.locationId);
        const crewHours = (p.crew || []).reduce((s, c) => s + Number(c.hoursWorked ?? 0), 0);
        const postHours = (p.postProduction || []).reduce((s, e) => s + Number(e.hoursWorked ?? 0), 0);
        const projTotal = crewHours + postHours;

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
          const qty = isPhotoEditorWithBilling ? p.editorBilling!.imageCount : Number(e.hoursWorked ?? 0);
          const rate = isPhotoEditorWithBilling ? 6 : Number(e.payRatePerHour ?? 0);
          const qtyLabel = isPhotoEditorWithBilling ? `${qty} imgs` : `${qty.toFixed(2)}`;
          const rateLabel = isPhotoEditorWithBilling ? "$6/img" : formatCurrency(rate);
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

        return `
          <div class="project-card" style="margin-bottom: 16px;">
            <div class="project-card-header">
              <div>
                <div class="project-name">${loc?.name || client?.company || ""}</div>
                <div class="project-type-badge">${type}</div>
              </div>
              <div style="text-align: right;">
                <div class="hours-badge">${projTotal.toFixed(2)} hrs</div>
                <div class="hours-detail">Total Hours Billed</div>
                <div class="hours-detail">Production: ${crewHours.toFixed(2)} hrs</div>
                <div class="hours-detail">Editing: ${postHours.toFixed(2)} hrs</div>
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

      <div class="earnings-card marketing">
        <div class="card-label" style="color: #8b5cf6; font-weight: 600;">Marketing Budget</div>
        <div class="card-value">${formatCurrency(Math.max(0, marketingBudget))}</div>
        <div class="card-note">10% of billing (after crew costs)</div>
      </div>

      <div class="earnings-grid-2">
        <div class="earnings-card owner">
          <div class="card-label" style="color: #22c55e; font-weight: 600;">Showcase (Owner)</div>
          <div class="card-value">${formatCurrency(ownerCut)}</div>
          <div class="card-note">20% of billing value</div>
        </div>
        <div class="earnings-card admin">
          <div class="card-label" style="color: #3b82f6; font-weight: 600;">SDub Media (Admin)</div>
          <div class="card-value">${formatCurrency(adminCut)}</div>
          <div class="card-note">20% of billing value</div>
        </div>
      </div>

      <!-- Crew & Editors -->
      <h2 style="font-size: 16px; font-weight: 700; margin: 20px 0 4px; border: none;">Crew & Editors</h2>
      <p class="subtitle" style="margin-bottom: 12px;">Payroll totals aggregated from project Internal Pay Allocation rows (worked hours × pay rate).</p>
      <div class="earnings-grid-2">
        ${crewPayCards}
      </div>

      <!-- Pay This Week -->
      <div class="section">
        <div class="section-header">Pay This Period (Internal)</div>
        <div class="section-body">
          <table class="pay-table">
            <thead><tr><th>Person</th><th style="text-align:right">Amount to Pay</th></tr></thead>
            <tbody>${payTableRows}</tbody>
            <tfoot><tr class="pay-total"><td><strong>Total to Pay</strong></td><td style="text-align:right">${formatCurrency(totalCrewCost)}</td></tr></tfoot>
          </table>
          <p style="font-size: 11px; color: #888;">Reference: Earnings Breakdown Report for ${monthName} ${yr}</p>
        </div>
      </div>

      <!-- Hours Billed to Client Summary -->
      <div class="section">
        <div class="section-header">Hours Billed to Client — Summary</div>
        <div class="section-body" style="padding: 0;">
          <div class="hours-billed-grid">
            <div class="hours-billed-cell"><div class="hb-label">Production</div><div class="hb-value">${totalProductionHours.toFixed(2)}</div></div>
            <div class="hours-billed-cell"><div class="hb-label">Editor</div><div class="hb-value">${totalEditorHours.toFixed(2)}</div></div>
            <div class="hours-billed-cell"><div class="hb-label">Total Billed</div><div class="hb-value highlight">${totalHours.toFixed(2)}</div></div>
          </div>
        </div>
      </div>

      <!-- Hours by Person -->
      <h2 style="font-size: 18px; font-weight: 700; margin: 24px 0 4px; border: none;">Hours Billed to Client (by Person)</h2>
      <p class="subtitle" style="margin-bottom: 12px;">Billed hours reflect billable time entries for this period.</p>
      <table class="pay-table">
        <thead><tr><th>Person</th><th style="text-align:right">Production Hours</th><th style="text-align:right">Editor Hours</th><th style="text-align:right">Total Billed Hours</th></tr></thead>
        <tbody>${hoursTableRows}</tbody>
        <tfoot><tr class="pay-total"><td><strong>TOTAL</strong></td><td style="text-align:right">${totalProductionHours.toFixed(2)}</td><td style="text-align:right">${totalEditorHours.toFixed(2)}</td><td style="text-align:right">${totalHours.toFixed(2)}</td></tr></tfoot>
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

    // Calculate billable hours (with role multipliers)
    const totalProductionHours = clientProjects.reduce((s, p) =>
      s + (p.crew || []).reduce((cs, c) => cs + getBillableHours(c, client), 0), 0);
    const totalEditorHours = clientProjects.reduce((s, p) =>
      s + (p.postProduction || []).reduce((ps, e) => ps + getBillableHours(e, client), 0), 0);
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

    // Build project cards
    const projectCards = clientProjects.map(p => {
      const type = data.projectTypes.find(t => t.id === p.projectTypeId)?.name || "";
      const loc = data.locations.find(l => l.id === p.locationId);
      const crewHours = (p.crew || []).reduce((s, c) => s + getBillableHours(c, client), 0);
      const postHours = (p.postProduction || []).reduce((s, e) => s + getBillableHours(e, client), 0);
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
            <div class="crew-hours">${getBillableHours(e, client).toFixed(2)} hrs</div>
          </div>
        `;
      }).join("");

      const postEntries = (p.postProduction || []).map(e => {
        const member = data.crewMembers.find(c => c.id === e.crewMemberId);
        return `
          <div class="crew-entry">
            <div><div class="crew-role">Editing</div><div class="crew-name">${member?.name ?? "Unknown"}</div></div>
            <div class="crew-hours">${getBillableHours(e, client).toFixed(2)} hrs</div>
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
                Internal earnings breakdown with crew pay allocation, owner/admin splits, marketing budget, and per-project labor costs for {MONTHS[parseInt(selectedMonth) - 1]} {selectedYear}.
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
