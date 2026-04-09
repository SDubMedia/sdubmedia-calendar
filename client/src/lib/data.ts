// ============================================================
// Slate — Data Layer & Billing Math
// ============================================================

import { nanoid } from "nanoid";
import type { AppData, Client, Project, ProjectCrewEntry, ProjectPostEntry, MarketingExpense, CrewMember } from "./types";

// ---- Seed Data (pre-populated from Base44 app) ----
// NOTE: This is only used for localStorage fallback; Supabase is the primary data source.

export const seedData: AppData = {
  clients: [
    {
      id: "client_cbsr",
      company: "Coldwell Banker Southern Realty",
      contactName: "Sam Sizemore",
      phone: "864-494-6909",
      email: "sam.cbsouthernrealty@gmail.com",
      billingModel: "hourly",
      billingRatePerHour: 200,
      perProjectRate: 0,
      projectTypeRates: [],
      allowedProjectTypeIds: [],
      defaultProjectTypeId: "",
      roleBillingMultipliers: [],
      createdAt: new Date().toISOString(),
    },
  ],
  crewMembers: [
    { id: "crew_zach", name: "Zach Harrison", roleRates: [{ role: "Main Photographer", payRatePerHour: 0 }], phone: "6617337513", email: "", defaultPayRatePerHour: 0 },
    { id: "crew_ken", name: "Ken Robinson", roleRates: [{ role: "Main Photographer", payRatePerHour: 0 }], phone: "615-849-2477", email: "", defaultPayRatePerHour: 0 },
    { id: "crew_melissa", name: "Melissa Mann", roleRates: [{ role: "Main Photographer", payRatePerHour: 0 }, { role: "Photo Editor", payRatePerHour: 0 }], phone: "661-917-8526", email: "", defaultPayRatePerHour: 0 },
    { id: "crew_antonio", name: "Antonio Brum", roleRates: [{ role: "Videographer", payRatePerHour: 0 }, { role: "Video Editor", payRatePerHour: 0 }], phone: "629-401-7226", email: "", defaultPayRatePerHour: 0 },
    { id: "crew_geoff", name: "Geoff Southworth", roleRates: [{ role: "Main Videographer", payRatePerHour: 0 }, { role: "Video Editor", payRatePerHour: 0 }, { role: "Main Photographer", payRatePerHour: 0 }, { role: "Photo Editor", payRatePerHour: 0 }], phone: "661-916-9468", email: "Geoff@SDubMedia.com", defaultPayRatePerHour: 0 },
  ],
  locations: [
    { id: "loc_cbsr_mboro", name: "Coldwell Banker Southern Realty", address: "1980 Old Fort Pkwy", city: "Murfreesboro", state: "TN", zip: "37129" },
    { id: "loc_cbsr_brentwood", name: "CBSR Brentwood", address: "1600 Westgate Cir", city: "Brentwood", state: "TN", zip: "37027" },
    { id: "loc_cbsr_murfreesboro", name: "CBSR Murfreesboro", address: "1980 Old Fort Pkwy", city: "Murfreesboro", state: "TN", zip: "37129" },
    { id: "loc_cbsr_lawrenceburg", name: "CBSR Lawrenceburg", address: "102 Weakley Creek Rd", city: "Lawrenceburg", state: "TN", zip: "38464" },
    { id: "loc_cbsr_shelbyville", name: "CBSR Shelbyville", address: "1708 N Main St", city: "Shelbyville", state: "TN", zip: "37160" },
    { id: "loc_cbsr_columbia", name: "CBSR Columbia", address: "2563 Nashville Hwy Ste. 6", city: "Columbia", state: "TN", zip: "38401" },
    { id: "loc_cbsr_mtjuliet", name: "CBSR Mt. Juliet", address: "2600 N Mt Juliet Rd", city: "Mt. Juliet", state: "TN", zip: "37122" },
    { id: "loc_cbsr_nashville", name: "CBSR Nashville", address: "915 Rep. John Lewis Way S Suite 102", city: "Nashville", state: "TN", zip: "37203" },
  ],
  projectTypes: [
    { id: "pt_awards", name: "Awards Ceremony" },
    { id: "pt_jason_recruit", name: "Jason Nagy - Recruitment Videos" },
    { id: "pt_jason_nagy", name: "Jason Nagy" },
    { id: "pt_jason", name: "Jason" },
    { id: "pt_rich_minute", name: "Rich Weekly Minute" },
    { id: "pt_rich_tips", name: "Rich Weekly Tips" },
    { id: "pt_podcast", name: "Podcast" },
    { id: "pt_office_merger", name: "Office Merger" },
    { id: "pt_full_day", name: "Full day event" },
    { id: "pt_agent_camera", name: "Agent on Camera" },
    { id: "pt_mboro_grand", name: "Murfreesboro Grand Opening" },
    { id: "pt_chuck", name: "Chuck Whitehead" },
    { id: "pt_sales", name: "Sales Meeting" },
    { id: "pt_headshot", name: "Headshot Photography" },
  ],
  projects: [
    {
      id: "proj_001",
      clientId: "client_cbsr",
      projectTypeId: "pt_rich_minute",
      locationId: "loc_cbsr_mboro",
      date: "2026-03-09",
      startTime: "12:00",
      endTime: "14:00",
      status: "upcoming",
      crew: [{ crewMemberId: "crew_geoff", role: "Main Videographer", hoursWorked: 2, payRatePerHour: 0 }],
      postProduction: [{ crewMemberId: "crew_geoff", role: "Video Editor", hoursWorked: 1, payRatePerHour: 0 }],
      editTypes: ["Social Vertical", "Social Horizontal"],
      notes: "",
      deliverableUrl: "",
      createdAt: new Date().toISOString(),
    },
    {
      id: "proj_002",
      clientId: "client_cbsr",
      projectTypeId: "pt_podcast",
      locationId: "loc_cbsr_nashville",
      date: "2026-03-12",
      startTime: "10:00",
      endTime: "13:00",
      status: "upcoming",
      crew: [
        { crewMemberId: "crew_geoff", role: "Main Videographer", hoursWorked: 3, payRatePerHour: 0 },
        { crewMemberId: "crew_antonio", role: "Crew", hoursWorked: 3, payRatePerHour: 0 },
      ],
      postProduction: [{ crewMemberId: "crew_antonio", role: "Video Editor", hoursWorked: 2, payRatePerHour: 0 }],
      editTypes: ["Podcast Edit"],
      notes: "",
      deliverableUrl: "",
      createdAt: new Date().toISOString(),
    },
    {
      id: "proj_003",
      clientId: "client_cbsr",
      projectTypeId: "pt_headshot",
      locationId: "loc_cbsr_brentwood",
      date: "2026-03-15",
      startTime: "09:00",
      endTime: "12:00",
      status: "upcoming",
      crew: [{ crewMemberId: "crew_zach", role: "Photographer", hoursWorked: 3, payRatePerHour: 0 }],
      postProduction: [{ crewMemberId: "crew_melissa", role: "Photo Editor", hoursWorked: 2, payRatePerHour: 0 }],
      editTypes: [],
      notes: "",
      deliverableUrl: "",
      createdAt: new Date().toISOString(),
    },
    {
      id: "proj_004",
      clientId: "client_cbsr",
      projectTypeId: "pt_agent_camera",
      locationId: "loc_cbsr_murfreesboro",
      date: "2026-02-20",
      startTime: "14:00",
      endTime: "16:00",
      status: "completed",
      crew: [{ crewMemberId: "crew_geoff", role: "Main Videographer", hoursWorked: 2, payRatePerHour: 0 }],
      postProduction: [{ crewMemberId: "crew_geoff", role: "Video Editor", hoursWorked: 1.5, payRatePerHour: 0 }],
      editTypes: ["Social Vertical"],
      notes: "",
      deliverableUrl: "",
      createdAt: new Date().toISOString(),
    },
    {
      id: "proj_005",
      clientId: "client_cbsr",
      projectTypeId: "pt_rich_tips",
      locationId: "loc_cbsr_mboro",
      date: "2026-02-27",
      startTime: "12:00",
      endTime: "14:00",
      status: "in_editing",
      crew: [{ crewMemberId: "crew_geoff", role: "Main Videographer", hoursWorked: 2, payRatePerHour: 0 }],
      postProduction: [{ crewMemberId: "crew_antonio", role: "Video Editor", hoursWorked: 1, payRatePerHour: 0 }],
      editTypes: ["Social Vertical", "Social Horizontal"],
      notes: "",
      deliverableUrl: "",
      createdAt: new Date().toISOString(),
    },
  ],
  marketingExpenses: [],
  invoices: [],
  contractorInvoices: [],
  crewLocationDistances: [],
  manualTrips: [],
  businessExpenses: [],
  categoryRules: [],
  timeEntries: [],
  contractTemplates: [],
  contracts: [],
  proposalTemplates: [],
  proposals: [],
  pipelineLeads: [],
  series: [],
  organization: null,
};

// ---- Billing math helpers ----

/**
 * Get total worked hours for a project, using editorBilling.finalHours for photo editors.
 */
export function getProjectWorkedHours(project: Project): { crewHours: number; postHours: number; totalHours: number } {
  const crewHours = (project.crew || []).reduce((s, c) => s + Number(c.hoursWorked ?? 0), 0);
  const postHours = (project.postProduction || []).reduce((s, c) => {
    if (c.role === "Photo Editor" && project.editorBilling?.finalHours != null) {
      return s + project.editorBilling.finalHours;
    }
    return s + Number(c.hoursWorked ?? 0);
  }, 0);
  return { crewHours, postHours, totalHours: crewHours + postHours };
}

/**
 * Get total crew cost for a project, using editorBilling for photo editors.
 */
export function getProjectCrewCost(project: Project): number {
  const crewCost = (project.crew || []).filter(e => e.role !== "Travel").reduce(
    (s, e) => s + Number(e.hoursWorked ?? 0) * Number(e.payRatePerHour ?? 0), 0
  );
  const postCost = (project.postProduction || []).filter(e => e.role !== "Travel").reduce((s, e) => {
    if (e.role === "Photo Editor" && project.editorBilling) {
      return s + project.editorBilling.imageCount * (project.editorBilling.perImageRate ?? 6);
    }
    return s + Number(e.hoursWorked ?? 0) * Number(e.payRatePerHour ?? 0);
  }, 0);
  return crewCost + postCost;
}

/** Get total travel cost for a project (Travel role entries only). */
export function getProjectTravelCost(project: Project): number {
  const crewTravel = (project.crew || []).filter(e => e.role === "Travel")
    .reduce((s, e) => s + Number(e.hoursWorked ?? 0) * Number(e.payRatePerHour ?? 0), 0);
  const postTravel = (project.postProduction || []).filter(e => e.role === "Travel")
    .reduce((s, e) => s + Number(e.hoursWorked ?? 0) * Number(e.payRatePerHour ?? 0), 0);
  return crewTravel + postTravel;
}

/**
 * Get the billing multiplier for a role on a specific client.
 * Default is 1.0 (1 hour worked = 1 hour billed).
 * e.g. "2nd Videographer" on CBSR might be 0.5 (6hrs worked = 3hrs billed)
 */
export function getRoleBillingMultiplier(client: Client, role: string): number {
  const m = client.roleBillingMultipliers?.find(r => r.role === role);
  return m?.multiplier ?? 1.0;
}

/**
 * Get billable hours for a single crew/post entry, applying the client's role multiplier.
 * hoursWorked = what crew gets paid for
 * billableHours = what client gets billed for
 */
export function getBillableHours(entry: ProjectCrewEntry | ProjectPostEntry, client: Client): number {
  const multiplier = getRoleBillingMultiplier(client, entry.role);
  return Number(entry.hoursWorked ?? 0) * multiplier;
}

/**
 * Get total billable hours for a project (applying client role multipliers).
 * When editorBilling.finalHours is set, uses that instead of photo editor post-production hours.
 */
export function getProjectBillableHours(project: Project, client: Client): {
  crewBillable: number;
  postBillable: number;
  totalBillable: number;
} {
  const crewBillable = (project.crew || []).reduce((s, e) => s + getBillableHours(e, client), 0);

  if (project.editorBilling?.finalHours != null) {
    // Photo editor hours come from the calculator; exclude photo editor entries from normal calculation
    const nonPhotoEditorPost = (project.postProduction || []).filter(e => e.role !== "Photo Editor");
    const postBillable = nonPhotoEditorPost.reduce((s, e) => s + getBillableHours(e, client), 0);
    const editorBillable = project.editorBilling.finalHours;
    return { crewBillable, postBillable: postBillable + editorBillable, totalBillable: crewBillable + postBillable + editorBillable };
  }

  const postBillable = (project.postProduction || []).reduce((s, e) => s + getBillableHours(e, client), 0);
  return { crewBillable, postBillable, totalBillable: crewBillable + postBillable };
}

/**
 * Get the invoice amount for a single project based on the client's billing model.
 * Hourly: billable hours × rate.
 * Per-project: project-level override → type-specific rate → client default rate.
 */
export function getProjectInvoiceAmount(project: Project, client: Client): number {
  if (client.billingModel === "per_project") {
    // 1. Project-level override (editable per project)
    if (project.projectRate != null && project.projectRate > 0) {
      return project.projectRate;
    }
    // 2. Project-type-specific rate, 3. Client default per-project rate
    const typeRate = client.projectTypeRates?.find(r => r.projectTypeId === project.projectTypeId);
    return Number(typeRate?.rate ?? client.perProjectRate ?? 0);
  }
  const { totalBillable } = getProjectBillableHours(project, client);
  return totalBillable * Number(client.billingRatePerHour ?? 0);
}

/**
 * Calculates total hours worked for a client in a given month.
 */
export function calcHoursWorked(
  projects: Project[],
  clientId: string,
  year: number,
  month: number
): number {
  return projects
    .filter((p) => {
      if (p.clientId !== clientId) return false;
      const d = new Date(p.date + "T00:00:00");
      return d.getFullYear() === year && d.getMonth() === month;
    })
    .reduce((sum, p) => sum + getProjectWorkedHours(p).totalHours, 0);
}

// ---- Monthly Earnings Breakdown (shared by P&L and Reports) ----

export interface MonthlyEarnings {
  year: number;
  month: number;
  projectCount: number;
  revenue: number;
  crewCost: number;
  ownerCrewPay: number;
  travelCost: number;
  marketingExpenses: number;
  partnerPayout: number;
  adminSplit: number;
  nonPartnerProfit: number;
  grossProfit: number;
  netProfit: number;
}

export function getMonthlyEarningsBreakdown(
  projects: Project[],
  clients: Client[],
  marketingExpenses: MarketingExpense[],
  ownerCrewMemberId: string,
  year: number,
  month: number,
): MonthlyEarnings {
  const monthStr = `${year}-${String(month).padStart(2, "0")}`;
  const monthProjects = projects.filter(p => p.date.startsWith(monthStr));

  let revenue = 0;
  let totalCrewCost = 0;
  let ownerCrewPay = 0;
  let travelCost = 0;
  let partnerPayout = 0;
  let adminSplit = 0;
  let nonPartnerProfit = 0;

  // Use new split logic for March 2026+
  const useNewSplitLogic = year > 2026 || (year === 2026 && month >= 3);

  monthProjects.forEach(p => {
    const client = clients.find(c => c.id === p.clientId);
    if (!client) return;

    const projRevenue = getProjectInvoiceAmount(p, client);
    const projCrewCost = getProjectCrewCost(p);
    const projTravelCost = getProjectTravelCost(p);

    revenue += projRevenue;
    totalCrewCost += projCrewCost;
    travelCost += projTravelCost;

    // Owner's crew pay (separate from other crew)
    [...(p.crew || []), ...(p.postProduction || [])].forEach(e => {
      if (e.crewMemberId !== ownerCrewMemberId) return;
      if (e.role === "Travel") return;
      if (e.role === "Photo Editor" && p.editorBilling) {
        ownerCrewPay += p.editorBilling.imageCount * (p.editorBilling.perImageRate ?? 6);
      } else {
        ownerCrewPay += Number(e.hoursWorked ?? 0) * Number(e.payRatePerHour ?? 0);
      }
    });

    const clientSplit = client.partnerSplit;

    if (!clientSplit) {
      // Non-partner client: profit goes to owner
      nonPartnerProfit += projRevenue - projCrewCost - projTravelCost;
      return;
    }

    if (!useNewSplitLogic) {
      // Legacy split (Jan/Feb 2026)
      const pPct = clientSplit.partnerPercent ?? 0;
      const aPct = clientSplit.adminPercent ?? 0.45;
      partnerPayout += projRevenue * pPct;
      adminSplit += projRevenue * aPct;
      return;
    }

    if (client.billingModel === "per_project") {
      // Per-project with partner
      const projProfit = projRevenue - projCrewCost;
      if (projProfit > 0) {
        partnerPayout += projProfit * (clientSplit.partnerPercent ?? 0);
        adminSplit += projProfit * (clientSplit.adminPercent ?? 0.45);
      }
      return;
    }

    // Hourly billing with partner — detailed crew/editor split
    const rate = Number(client.billingRatePerHour ?? 0);
    if (rate === 0) return;

    const { crewBillable, postBillable } = getProjectBillableHours(p, client);
    const hasPhotoEditor = p.editorBilling?.finalHours != null;
    const editorBillableHours = hasPhotoEditor ? p.editorBilling!.finalHours : 0;
    const nonEditorPostBillable = postBillable - editorBillableHours;

    const crewBillingAmt = (crewBillable + nonEditorPostBillable) * rate;
    const editorBillingAmt = editorBillableHours * rate;

    // Crew costs (excluding photo editor and travel)
    const crewPayCost = (p.crew || []).filter(e => e.role !== "Travel").reduce((s, e) =>
      s + Number(e.hoursWorked ?? 0) * Number(e.payRatePerHour ?? 0), 0);
    const nonEditorPostCost = (p.postProduction || [])
      .filter(e => e.role !== "Photo Editor" && e.role !== "Travel")
      .reduce((s, e) => s + Number(e.hoursWorked ?? 0) * Number(e.payRatePerHour ?? 0), 0);
    const crewCost = crewPayCost + nonEditorPostCost;

    // Crew split
    const threshold = clientSplit.crewSplitThreshold ?? 0.5;
    const crewMktgPct = clientSplit.crewMarketingPercent ?? 0.10;
    const remainderSplit = clientSplit.crewRemainderSplit ?? 0.5;
    if (crewBillingAmt > 0) {
      if (crewCost <= crewBillingAmt * threshold) {
        const mktg = crewBillingAmt * crewMktgPct;
        const remainder = crewBillingAmt - crewCost - mktg;
        partnerPayout += remainder * remainderSplit;
        adminSplit += remainder * (1 - remainderSplit);
      } else {
        const remainder = crewBillingAmt - crewCost;
        partnerPayout += remainder * remainderSplit;
        adminSplit += remainder * (1 - remainderSplit);
      }
    }

    // Editor split
    if (editorBillingAmt > 0 && hasPhotoEditor) {
      const editorCost = p.editorBilling!.imageCount * (p.editorBilling!.perImageRate ?? 6);
      const editorProfit = editorBillingAmt - editorCost;
      const ePtnr = clientSplit.editorPartnerPercent ?? 0.45;
      const eAdmin = clientSplit.editorAdminPercent ?? 0.45;
      partnerPayout += editorProfit * ePtnr;
      adminSplit += editorProfit * eAdmin;
    }
  });

  const mktgExp = marketingExpenses
    .filter(e => e.date.startsWith(monthStr))
    .reduce((s, e) => s + e.amount, 0);

  const grossProfit = revenue - totalCrewCost;
  const netProfit = revenue - totalCrewCost - travelCost - mktgExp - partnerPayout;

  return {
    year, month,
    projectCount: monthProjects.length,
    revenue,
    crewCost: totalCrewCost,
    ownerCrewPay,
    travelCost,
    marketingExpenses: mktgExp,
    partnerPayout,
    adminSplit,
    nonPartnerProfit,
    grossProfit,
    netProfit,
  };
}

// ---- CRUD helpers ----

export function generateId(): string {
  return nanoid(10);
}
