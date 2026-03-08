// ============================================================
// SDub Media FilmProject Pro — Core Data Types
// Design: Dark Cinematic Studio | Amber accent on charcoal
// Billing Model: Hourly — client billed at flat rate, crew paid individually
// ============================================================

export type ProjectStatus = "upcoming" | "filming_done" | "in_editing" | "completed";

export type CrewRole =
  | "Videographer"
  | "Main Videographer"
  | "Secondary Videographer"
  | "Photographer"
  | "Editor"
  | "Video Editor"
  | "Photo Editor"
  | "Audio Engineer"
  | "Director"
  | "Producer"
  | "Crew";

export type EditType =
  | "Social Vertical"
  | "Social Horizontal"
  | "Podcast Edit"
  | "Full Edit"
  | "Highlight Reel"
  | "Raw Footage";

export interface Client {
  id: string;
  company: string;
  contactName: string;
  phone: string;
  email: string;
  // Billing settings
  billingRatePerHour: number; // $ per hour billed to this client
  createdAt: string;
}

export interface CrewMember {
  id: string;
  name: string;
  roles: CrewRole[];
  phone: string;
  email: string;
  defaultPayRatePerHour: number; // default $ per hour pay rate for this crew member
}

export interface Location {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
}

export interface ProjectType {
  id: string;
  name: string;
}

// A crew member assigned to a project (filming/shoot)
export interface ProjectCrewEntry {
  crewMemberId: string;
  role: string;
  hoursWorked: number;
  payRatePerHour: number; // $ per hour — set per-entry so it can be overridden
}

// A post-production person assigned to a project (editing)
export interface ProjectPostEntry {
  crewMemberId: string;
  role: string;
  hoursWorked: number;
  payRatePerHour: number; // $ per hour
}

export interface Project {
  id: string;
  clientId: string;
  projectTypeId: string;
  locationId: string;
  date: string; // ISO date YYYY-MM-DD
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  status: ProjectStatus;
  crew: ProjectCrewEntry[];
  postProduction: ProjectPostEntry[];
  editTypes: EditType[];
  notes: string;
  createdAt: string;
}

// Monthly billing summary for a client
export interface MonthlyBillingSummary {
  year: number;
  month: number; // 0-indexed
  clientId: string;
  totalHoursBilled: number;       // sum of all crew hours across projects
  clientInvoiceAmount: number;    // totalHoursBilled × client billing rate
  crewPayBreakdown: {
    crewMemberId: string;
    name: string;
    totalHours: number;
    totalPay: number;
  }[];
  totalCrewCost: number;          // sum of all crew pay
  grossMargin: number;            // clientInvoiceAmount - totalCrewCost
}

export interface AppData {
  clients: Client[];
  crewMembers: CrewMember[];
  locations: Location[];
  projectTypes: ProjectType[];
  projects: Project[];
}
