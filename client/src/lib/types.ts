// ============================================================
// SDub Media FilmProject Pro — Core Data Types
// Design: Dark Cinematic Studio | Amber accent on charcoal
// Billing Model: Hourly — client billed at flat rate, crew paid individually
// ============================================================

// ---- Auth & Roles ----
export type UserRole = "owner" | "client" | "partner" | "staff";

export interface UserProfile {
  id: string;           // matches Supabase Auth user ID
  email: string;
  name: string;
  role: UserRole;
  clientIds: string[];  // which clients this user can access (empty = all for owner)
  crewMemberId: string; // links staff user to a crew member (staff role only)
  mustChangePassword: boolean; // force password change on first login
  hasCompletedOnboarding: boolean;
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
  allowedProjectTypeIds: string[]; // if set, only these types show in project form (empty = all)
  defaultProjectTypeId: string; // auto-selected project type for new projects
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
  deliverableUrl: string; // Google Drive link to final deliverables
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

// ---- Invoices ----
export type InvoiceStatus = "draft" | "sent" | "paid" | "void";

export interface InvoiceLineItem {
  projectId: string;
  date: string;
  description: string;
  quantity: number;    // hours or 1 (for per-project)
  unitPrice: number;   // rate per hour or flat rate
  amount: number;      // quantity × unitPrice
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  clientId: string;
  periodStart: string;
  periodEnd: string;
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  status: InvoiceStatus;
  issueDate: string;
  dueDate: string;
  paidDate: string | null;
  lineItems: InvoiceLineItem[];
  companyInfo: Record<string, string>;
  clientInfo: Record<string, string>;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

// ---- Content Series ----
export type SeriesStatus = "draft" | "active" | "completed";
export type EpisodeStatus = "idea" | "concept" | "script" | "client_review" | "scheduled" | "filming" | "editing" | "review" | "delivered";

export interface Series {
  id: string;
  name: string;
  clientId: string;
  goal: string;
  status: SeriesStatus;
  monthlyTokenLimit: number;
  tokensUsedThisMonth: number;
  tokenResetDate: string;
  createdAt: string;
}

export interface SeriesEpisode {
  id: string;
  seriesId: string;
  episodeNumber: number;
  title: string;
  concept: string;
  talkingPoints: string;
  status: EpisodeStatus;
  projectId: string | null;
  // Draft scheduling
  draftDate: string;
  draftStartTime: string;
  draftEndTime: string;
  draftLocationId: string;
  draftCrew: string[]; // crew member IDs
  createdAt: string;
}

export interface SeriesMessage {
  id: string;
  seriesId: string;
  role: "user" | "assistant" | "system";
  senderName: string;
  content: string;
  tokensUsed: number;
  createdAt: string;
}

export interface EpisodeComment {
  id: string;
  episodeId: string;
  seriesId: string;
  userName: string;
  userRole: string;
  content: string;
  createdAt: string;
}

export interface AppData {
  clients: Client[];
  crewMembers: CrewMember[];
  locations: Location[];
  projectTypes: ProjectType[];
  projects: Project[];
  marketingExpenses: MarketingExpense[];
  invoices: Invoice[];
  series: Series[];
}
