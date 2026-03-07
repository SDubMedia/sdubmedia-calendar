// ============================================================
// SDub Media FilmProject Pro — Core Data Types
// Design: Dark Cinematic Studio | Amber accent on charcoal
// ============================================================

export type ProjectStatus = "upcoming" | "filming_done" | "in_editing" | "completed";

export type CrewRole =
  | "Videographer"
  | "Photographer"
  | "Editor"
  | "Video_editor"
  | "Photo_editor"
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
  // Retainer settings
  retainerStartDate: string; // ISO date
  monthlyHours: number; // default hours per month
  createdAt: string;
}

export interface CrewMember {
  id: string;
  name: string;
  roles: CrewRole[];
  phone: string;
  email: string;
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

export interface ProjectCrewEntry {
  crewMemberId: string;
  role: string;
  hoursWorked: number;
  hoursDeducted: number; // hours billed against retainer
}

export interface ProjectPostEntry {
  crewMemberId: string;
  role: string;
  hoursWorked: number;
  hoursDeducted: number;
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

export interface RetainerPayment {
  id: string;
  clientId: string;
  date: string; // ISO date
  hours: number;
  notes: string;
}

// Computed retainer summary for a given month
export interface MonthlyRetainerSummary {
  year: number;
  month: number; // 0-indexed
  startingBalance: number;
  paidThisMonth: number;
  usedThisMonth: number;
  endingBalance: number;
  refillNeeded: number;
  status: "ok" | "overused" | "low";
}

export interface AppData {
  clients: Client[];
  crewMembers: CrewMember[];
  locations: Location[];
  projectTypes: ProjectType[];
  projects: Project[];
  retainerPayments: RetainerPayment[];
}
