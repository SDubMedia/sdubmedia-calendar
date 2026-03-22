// ============================================================
// SDub Media FilmProject Pro — Data Layer
// Billing Model: Hourly — client billed at flat rate, crew paid individually
// ============================================================

import { nanoid } from "nanoid";
import type { AppData, Client, Project, ProjectCrewEntry, ProjectPostEntry } from "./types";

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
      createdAt: new Date().toISOString(),
    },
  ],
  marketingExpenses: [],
  invoices: [],
};

// ---- Billing math helpers ----

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
 */
export function getProjectBillableHours(project: Project, client: Client): {
  crewBillable: number;
  postBillable: number;
  totalBillable: number;
} {
  const crewBillable = (project.crew || []).reduce((s, e) => s + getBillableHours(e, client), 0);
  const postBillable = (project.postProduction || []).reduce((s, e) => s + getBillableHours(e, client), 0);
  return { crewBillable, postBillable, totalBillable: crewBillable + postBillable };
}

/**
 * Get the invoice amount for a single project based on the client's billing model.
 * Hourly: billable hours × rate. Per-project: flat rate per project.
 */
export function getProjectInvoiceAmount(project: Project, client: Client): number {
  if (client.billingModel === "per_project") {
    // Check for project-type-specific rate first, fall back to default per-project rate
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
    .reduce((sum, p) => {
      const crewHrs = p.crew.reduce((s, c) => s + Number(c.hoursWorked || 0), 0);
      const postHrs = p.postProduction.reduce((s, c) => s + Number(c.hoursWorked || 0), 0);
      return sum + crewHrs + postHrs;
    }, 0);
}

/**
 * Calculates the total client invoice amount for a given month.
 */
export function calcClientInvoice(
  client: Client,
  projects: Project[],
  year: number,
  month: number
): number {
  const hours = calcHoursWorked(projects, client.id, year, month);
  return hours * client.billingRatePerHour;
}

// ---- CRUD helpers ----

export function generateId(): string {
  return nanoid(10);
}
