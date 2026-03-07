// ============================================================
// SDub Media FilmProject Pro — Data Layer (localStorage)
// ============================================================

import { nanoid } from "nanoid";
import type { AppData, Client, CrewMember, Location, ProjectType, Project, RetainerPayment } from "./types";

const STORAGE_KEY = "sdubmedia_filmproject_data";

// ---- Seed Data (pre-populated from Base44 app) ----

const seedData: AppData = {
  clients: [
    {
      id: "client_cbsr",
      company: "Coldwell Banker Southern Realty",
      contactName: "Sam Sizemore",
      phone: "864-494-6909",
      email: "sam.cbsouthernrealty@gmail.com",
      retainerStartDate: "2025-01-01",
      monthlyHours: 25,
      createdAt: new Date().toISOString(),
    },
  ],
  crewMembers: [
    {
      id: "crew_zach",
      name: "Zach Harrison",
      roles: ["Photographer"],
      phone: "6617337513",
      email: "",
    },
    {
      id: "crew_ken",
      name: "Ken Robinson",
      roles: ["Photographer"],
      phone: "615-849-2477",
      email: "",
    },
    {
      id: "crew_melissa",
      name: "Melissa Mann",
      roles: ["Editor", "Photographer", "Photo_editor"],
      phone: "661-917-8526",
      email: "",
    },
    {
      id: "crew_antonio",
      name: "Antonio Brum",
      roles: ["Videographer", "Crew", "Editor", "Video_editor"],
      phone: "629-401-7226",
      email: "",
    },
    {
      id: "crew_geoff",
      name: "Geoff Southworth",
      roles: ["Videographer", "Editor", "Photographer", "Video_editor", "Photo_editor", "Crew"],
      phone: "661-916-9468",
      email: "Geoff@SDubMedia.com",
    },
  ],
  locations: [
    {
      id: "loc_cbsr_mboro",
      name: "Coldwell Banker Southern Realty",
      address: "1980 Old Fort Pkwy",
      city: "Murfreesboro",
      state: "TN",
      zip: "37129",
    },
    {
      id: "loc_cbsr_brentwood",
      name: "CBSR Brentwood",
      address: "1600 Westgate Cir",
      city: "Brentwood",
      state: "TN",
      zip: "37027",
    },
    {
      id: "loc_cbsr_murfreesboro",
      name: "CBSR Murfreesboro",
      address: "1980 Old Fort Pkwy",
      city: "Murfreesboro",
      state: "TN",
      zip: "37129",
    },
    {
      id: "loc_cbsr_lawrenceburg",
      name: "CBSR Lawrenceburg",
      address: "102 Weakley Creek Rd",
      city: "Lawrenceburg",
      state: "TN",
      zip: "38464",
    },
    {
      id: "loc_cbsr_shelbyville",
      name: "CBSR Shelbyville",
      address: "1708 N Main St",
      city: "Shelbyville",
      state: "TN",
      zip: "37160",
    },
    {
      id: "loc_cbsr_columbia",
      name: "CBSR Columbia",
      address: "2563 Nashville Hwy Ste. 6",
      city: "Columbia",
      state: "TN",
      zip: "38401",
    },
    {
      id: "loc_cbsr_mtjuliet",
      name: "CBSR Mt. Juliet",
      address: "2600 N Mt Juliet Rd",
      city: "Mt. Juliet",
      state: "TN",
      zip: "37122",
    },
    {
      id: "loc_cbsr_nashville",
      name: "CBSR Nashville",
      address: "915 Rep. John Lewis Way S Suite 102",
      city: "Nashville",
      state: "TN",
      zip: "37203",
    },
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
      crew: [
        { crewMemberId: "crew_geoff", role: "Main Videographer", hoursWorked: 2, hoursDeducted: 2 },
      ],
      postProduction: [
        { crewMemberId: "crew_geoff", role: "Video Editor", hoursWorked: 1, hoursDeducted: 1 },
      ],
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
        { crewMemberId: "crew_geoff", role: "Main Videographer", hoursWorked: 3, hoursDeducted: 3 },
        { crewMemberId: "crew_antonio", role: "Crew", hoursWorked: 3, hoursDeducted: 3 },
      ],
      postProduction: [
        { crewMemberId: "crew_antonio", role: "Video Editor", hoursWorked: 2, hoursDeducted: 2 },
      ],
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
      crew: [
        { crewMemberId: "crew_zach", role: "Photographer", hoursWorked: 3, hoursDeducted: 3 },
      ],
      postProduction: [
        { crewMemberId: "crew_melissa", role: "Photo Editor", hoursWorked: 2, hoursDeducted: 2 },
      ],
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
      crew: [
        { crewMemberId: "crew_geoff", role: "Main Videographer", hoursWorked: 2, hoursDeducted: 2 },
      ],
      postProduction: [
        { crewMemberId: "crew_geoff", role: "Video Editor", hoursWorked: 1.5, hoursDeducted: 1.5 },
      ],
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
      crew: [
        { crewMemberId: "crew_geoff", role: "Main Videographer", hoursWorked: 2, hoursDeducted: 2 },
      ],
      postProduction: [
        { crewMemberId: "crew_antonio", role: "Video Editor", hoursWorked: 1, hoursDeducted: 1 },
      ],
      editTypes: ["Social Vertical", "Social Horizontal"],
      notes: "",
      createdAt: new Date().toISOString(),
    },
  ],
  retainerPayments: [
    {
      id: "pay_001",
      clientId: "client_cbsr",
      date: "2026-01-01",
      hours: 25,
      notes: "January retainer",
    },
    {
      id: "pay_002",
      clientId: "client_cbsr",
      date: "2026-02-01",
      hours: 25,
      notes: "February retainer",
    },
    {
      id: "pay_003",
      clientId: "client_cbsr",
      date: "2026-03-01",
      hours: 25,
      notes: "March retainer",
    },
  ],
};

// ---- Storage helpers ----

export function loadData(): AppData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw) as AppData;
    }
  } catch {
    // ignore parse errors
  }
  // First run — seed with initial data
  saveData(seedData);
  return seedData;
}

export function saveData(data: AppData): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

// ---- Retainer math (single source of truth) ----

/**
 * Calculates total retainer hours DEDUCTED for a given client in a given month.
 * Only counts hours from projects whose date falls in that month.
 * Sums crew.hoursDeducted + postProduction.hoursDeducted for each project.
 */
export function calcHoursUsed(
  projects: Project[],
  clientId: string,
  year: number,
  month: number // 0-indexed
): number {
  return projects
    .filter((p) => {
      if (p.clientId !== clientId) return false;
      const d = new Date(p.date);
      return d.getFullYear() === year && d.getMonth() === month;
    })
    .reduce((sum, p) => {
      const crewHrs = p.crew.reduce((s, c) => s + (c.hoursDeducted || 0), 0);
      const postHrs = p.postProduction.reduce((s, c) => s + (c.hoursDeducted || 0), 0);
      return sum + crewHrs + postHrs;
    }, 0);
}

/**
 * Calculates total hours PAID for a client in a given month.
 */
export function calcHoursPaid(
  payments: RetainerPayment[],
  clientId: string,
  year: number,
  month: number
): number {
  return payments
    .filter((p) => {
      if (p.clientId !== clientId) return false;
      const d = new Date(p.date);
      return d.getFullYear() === year && d.getMonth() === month;
    })
    .reduce((sum, p) => sum + p.hours, 0);
}

/**
 * Returns the running balance for a client at the END of a given month.
 * Walks from retainerStartDate month forward to the target month.
 */
export function calcBalanceAtEndOfMonth(
  client: Client,
  projects: Project[],
  payments: RetainerPayment[],
  targetYear: number,
  targetMonth: number
): number {
  const start = new Date(client.retainerStartDate);
  let balance = 0;
  let y = start.getFullYear();
  let m = start.getMonth();

  while (y < targetYear || (y === targetYear && m <= targetMonth)) {
    balance += calcHoursPaid(payments, client.id, y, m);
    balance -= calcHoursUsed(projects, client.id, y, m);
    if (m === 11) { y++; m = 0; } else { m++; }
  }
  return Math.round(balance * 100) / 100;
}

/**
 * Returns the daily running retainer balance for a given month (for calendar overlay).
 * Returns a map of day-of-month (1-indexed) => balance at end of that day.
 */
export function calcDailyBalances(
  client: Client,
  projects: Project[],
  payments: RetainerPayment[],
  year: number,
  month: number
): Record<number, number> {
  // Start with balance at end of previous month
  let prevYear = year;
  let prevMonth = month - 1;
  if (prevMonth < 0) { prevMonth = 11; prevYear--; }

  let runningBalance = calcBalanceAtEndOfMonth(client, projects, payments, prevYear, prevMonth);

  // Add all payments for this month first (they come in at start of month)
  runningBalance += calcHoursPaid(payments, client.id, year, month);

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const dailyMap: Record<number, number> = {};

  for (let day = 1; day <= daysInMonth; day++) {
    const dayStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const dayProjects = projects.filter(
      (p) => p.clientId === client.id && p.date === dayStr
    );
    const dayHours = dayProjects.reduce((sum, p) => {
      const crewHrs = p.crew.reduce((s, c) => s + (c.hoursDeducted || 0), 0);
      const postHrs = p.postProduction.reduce((s, c) => s + (c.hoursDeducted || 0), 0);
      return sum + crewHrs + postHrs;
    }, 0);
    runningBalance -= dayHours;
    dailyMap[day] = Math.round(runningBalance * 100) / 100;
  }

  return dailyMap;
}

// ---- CRUD helpers ----

export function generateId(): string {
  return nanoid(10);
}
