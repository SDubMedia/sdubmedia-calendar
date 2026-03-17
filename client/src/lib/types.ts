// ============================================================
// SDub Media FilmProject Pro — Core Data Types
// Design: Dark Cinematic Studio | Amber accent on charcoal
// Billing Model: Hourly — client billed at flat rate, crew paid individually
// ============================================================

// ---- Auth & Roles ----
export type UserRole = "owner" | "client" | "partner";

export interface UserProfile {
  id: string;           // matches Supabase Auth user ID
  email: string;
  name: string;
  role: UserRole;
  clientIds: string[];  // which clients this user can access (empty = all for owner)
  createdAt: string;
}

export type ProjectStatus = "upcoming" | "filming_done" | "in_editing" | "completed";

export type CrewRole =
  | "Main Videographer"
  | "Secondary Videographer"
  | "Videographer"
  | "Main Photographer"
  | "Second Photographer"
  | "Video Editor"
  | "Photo Editor"
  | "Editor"
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

export type BillingModel = "hourly" | "per_project";

// Per-role billing multiplier for a client
// e.g. { role: "2nd Videographer", multiplier: 0.5 } means 1hr worked = 0.5hr billed
export interface RoleBillingMultiplier {
  role: string;
  multiplier: number;
}

export interface Client {
  id: string;
  company: string;
  contactName: string;
  phone: string;
  email: string;
  // Billing settings
  billingModel: BillingModel; // "hourly" or "per_project"
  billingRatePerHour: number; // $ per hour (for hourly model)
  perProjectRate: number; // default $ per project (for per_project model)
  projectTypeRates: { projectTypeId: string; rate: number }[]; // per-type rates (for per_project model)
  roleBillingMultipliers: RoleBillingMultiplier[]; // per-role hour adjustments (hourly only)
  createdAt: string;
}

// A role assigned to a crew member with its own pay rate
export interface RoleRate {
  role: CrewRole;
  payRatePerHour: number;
}

export interface CrewMember {
  id: string;
  name: string;
  roleRates: RoleRate[];           // each role has its own pay rate
  phone: string;
  email: string;
  defaultPayRatePerHour: number;   // fallback rate if role-specific rate not found
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

// Marketing budget expense
export type ExpenseCategory = "Equipment" | "Software" | "Advertising" | "Travel" | "Other";

export interface MarketingExpense {
  id: string;
  date: string; // ISO date YYYY-MM-DD
  category: ExpenseCategory;
  description: string;
  notes: string;
  amount: number;
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
  marketingExpenses: MarketingExpense[];
}
