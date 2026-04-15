// ============================================================
// Slate — Production Management Platform
// Billing Model: Hourly — client billed at flat rate, crew paid individually
// ============================================================

// ---- Organizations ----
export interface OrgFeatures {
  calendar: boolean;
  crewManagement: boolean;
  invoicing: boolean;
  mileage: boolean;
  expenses: boolean;
  clientPortal: boolean;
  contentSeries: boolean;
  partnerSplits: boolean;
  budget: boolean;
  pipeline: boolean;
  proposals: boolean;
  contracts: boolean;
  clientHealth: boolean;
  profitLoss: boolean;
  contractor1099: boolean;
  clientManagement: boolean;
  locationManagement: boolean;
  reports: boolean;
  // Per-role overrides: if set, these control what each role sees independently
  staffFeatures?: Partial<OrgFeatures>;
  partnerFeatures?: Partial<OrgFeatures>;
  clientFeatures?: Partial<OrgFeatures>;
  familyFeatures?: Partial<OrgFeatures>;
}

export const DEFAULT_FEATURES: OrgFeatures = {
  calendar: true,
  crewManagement: true,
  invoicing: true,
  mileage: false,
  expenses: false,
  clientPortal: false,
  contentSeries: false,
  partnerSplits: false,
  budget: true,
  pipeline: true,
  proposals: true,
  contracts: true,
  clientHealth: true,
  profitLoss: true,
  contractor1099: true,
  clientManagement: true,
  locationManagement: true,
  reports: true,
};

export type ProductionType = "video" | "photo" | "both";

// Dashboard widget configuration
export type DashboardWidgetId = "metrics" | "upcoming" | "invoices" | "mileage" | "revenue";

export interface DashboardWidgetConfig {
  id: DashboardWidgetId;
  enabled: boolean;
}

export const DEFAULT_DASHBOARD_WIDGETS: DashboardWidgetConfig[] = [
  { id: "metrics", enabled: true },
  { id: "upcoming", enabled: true },
  { id: "invoices", enabled: true },
  { id: "mileage", enabled: true },
  { id: "revenue", enabled: true },
];

export const DASHBOARD_WIDGET_LABELS: Record<DashboardWidgetId, string> = {
  metrics: "Status Cards (Upcoming, In Editing, Outstanding, Completed)",
  upcoming: "Upcoming Shoots",
  invoices: "Recent Invoices",
  mileage: "Mileage Summary",
  revenue: "Revenue Chart",
};

export interface OrgBusinessInfo {
  address: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  email: string;
  website: string;
  ein: string;
}

export interface ServiceItem {
  id: string;
  name: string;
  description: string;
  defaultPrice: number;
  category: string; // e.g. "photo", "video", "other"
}

export interface PipelineStageConfig {
  id: string;
  label: string;
  color: string; // tailwind color class e.g. "blue", "green", "amber"
}

export const DEFAULT_PIPELINE_STAGES: PipelineStageConfig[] = [
  { id: "inquiry", label: "Inquiry", color: "blue" },
  { id: "follow_up", label: "Follow-up", color: "cyan" },
  { id: "proposal_sent", label: "Proposal Sent", color: "indigo" },
  { id: "proposal_signed", label: "Proposal Signed", color: "amber" },
  { id: "retainer_paid", label: "Retainer Paid", color: "green" },
  { id: "final_payment", label: "Final Payment", color: "emerald" },
  { id: "in_production", label: "In Production", color: "orange" },
  { id: "delivered", label: "Delivered", color: "purple" },
  { id: "review", label: "Review", color: "pink" },
  { id: "archived", label: "Archived", color: "zinc" },
];

export interface Organization {
  id: string;
  name: string;
  slug: string;
  logoUrl: string;
  plan: string;
  features: OrgFeatures;
  productionType: ProductionType;
  defaultBillingModel: BillingModel;
  defaultBillingRate: number;
  businessInfo: OrgBusinessInfo;
  dashboardWidgets: DashboardWidgetConfig[];
  pipelineStages: PipelineStageConfig[];
  services: ServiceItem[];
  createdAt: string;
}

// ---- Auth & Roles ----
export type UserRole = "owner" | "client" | "partner" | "staff" | "family";

export interface PersonalEventTemplate {
  id: string;
  label: string;
  title: string;
  category: string;
  color: string;
}

export interface UserProfile {
  id: string;           // matches Supabase Auth user ID
  orgId: string;        // organization this user belongs to
  email: string;
  name: string;
  role: UserRole;
  clientIds: string[];  // which clients this user can access (empty = all for owner)
  crewMemberId: string; // links staff user to a crew member (staff role only)
  mustChangePassword: boolean; // force password change on first login
  hasCompletedOnboarding: boolean;
  featureOverrides?: Record<string, boolean>; // per-user feature overrides (most specific wins)
  personalEventTemplates: PersonalEventTemplate[];
  createdAt: string;
}

export type ProjectStatus = "upcoming" | "filming_done" | "in_editing" | "completed" | "cancelled";

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
  | "Crew"
  | "Travel";

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
  address: string;
  city: string;
  state: string;
  zip: string;
  // Billing settings
  billingModel: BillingModel; // "hourly" or "per_project"
  billingRatePerHour: number; // $ per hour (for hourly model)
  perProjectRate: number; // default $ per project (for per_project model)
  projectTypeRates: { projectTypeId: string; rate: number }[]; // per-type rates (for per_project model)
  allowedProjectTypeIds: string[]; // if set, only these types show in project form (empty = all)
  defaultProjectTypeId: string; // auto-selected project type for new projects
  roleBillingMultipliers: RoleBillingMultiplier[]; // per-role hour adjustments (hourly only)
  partnerSplit?: PartnerSplit | null; // profit split config for partner clients
  createdAt: string;
}

// A role assigned to a crew member with its own pay rate
export interface RoleRate {
  role: CrewRole;
  payRatePerHour: number;
}

export interface HomeAddress {
  address: string;
  city: string;
  state: string;
  zip: string;
}

export interface CrewMember {
  id: string;
  name: string;
  roleRates: RoleRate[];           // each role has its own pay rate
  phone: string;
  email: string;
  defaultPayRatePerHour: number;   // fallback rate if role-specific rate not found
  homeAddress?: HomeAddress | null; // for mileage calculation
  // Business info for contractor invoicing (optional, self-managed by staff)
  businessName?: string;
  businessAddress?: string;
  businessCity?: string;
  businessState?: string;
  businessZip?: string;
  // W-9 info (owner-only, for 1099 filing)
  taxId?: string; // SSN or EIN from W-9
  taxIdType?: "ssn" | "ein" | ""; // type of tax ID
  w9Url?: string; // URL to uploaded W-9 document in Supabase Storage
}

export interface Location {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  oneTimeUse: boolean;
}

export interface ProjectType {
  id: string;
  name: string;
  lightweight: boolean;
}

// A crew member assigned to a project (filming/shoot)
export interface ProjectCrewEntry {
  crewMemberId: string;
  role: string;
  hoursWorked: number;
  payRatePerHour: number; // $ per hour — set per-entry so it can be overridden
  roundTripMiles?: number; // miles from crew member's home to location and back (snapshot at project time)
}

// A post-production person assigned to a project (editing)
export interface ProjectPostEntry {
  crewMemberId: string;
  role: string;
  hoursWorked: number;
  payRatePerHour: number; // $ per hour
}

// Photo editor billing calculator data (stored per-project)
export interface EditorBilling {
  imageCount: number;
  billingMode: "standard" | "event"; // standard = 2x cost, event = +1hr
  finalHours: number; // editable — this is what goes on the client invoice
  perImageRate: number; // $ per image — default 6, editable per project
  finalized?: boolean; // true when actual count is confirmed, false/undefined = projection
}

// Partner profit split config (stored per-client)
export interface PartnerSplit {
  partnerName: string;
  partnerPercent: number; // e.g. 0.45
  adminPercent: number;   // e.g. 0.45
  marketingPercent: number; // e.g. 0.10
  // Crew split settings
  crewSplitThreshold: number;  // e.g. 0.5 — if crew ≤ this % of billing, deduct marketing
  crewMarketingPercent: number; // e.g. 0.10 — marketing % when under threshold
  crewRemainderSplit: number;  // e.g. 0.5 — each side gets this % of remainder (partner/admin)
  // Editor split settings
  editorPartnerPercent: number;  // e.g. 0.45
  editorAdminPercent: number;    // e.g. 0.45
  editorMarketingPercent: number; // e.g. 0.10
  // Spending budget
  spendingBudgetEnabled: boolean; // whether to track marketing budget for this client
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
  editorBilling?: EditorBilling | null; // photo editor image-based billing
  projectRate?: number | null; // per-project rate override (for per_project billing)
  paidDate?: string | null; // date this project was marked paid (ISO date or null)
  editTypes: EditType[];
  notes: string;
  deliverableUrl: string; // Google Drive link to final deliverables
  createdAt: string;
}

// Spending budget expense
export type ExpenseCategory = "Equipment" | "Software" | "Advertising" | "Travel" | "Other";

export interface MarketingExpense {
  id: string;
  clientId: string;
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

// ---- Contractor Invoices (1099 crew self-service) ----
export type ContractorInvoiceStatus = "draft" | "sent";

export interface ContractorInvoiceLineItem {
  projectId: string;
  date: string;
  description: string; // project type + location
  role: string;
  hours: number;
  rate: number;
  amount: number;
}

export interface ContractorInvoice {
  id: string;
  crewMemberId: string;
  invoiceNumber: string; // per-contractor sequence e.g. MM-2026-0001
  recipientType: "sdub_media" | "partner";
  recipientName: string;
  periodStart: string;
  periodEnd: string;
  lineItems: ContractorInvoiceLineItem[];
  businessInfo: {
    name: string;
    address: string;
    city: string;
    state: string;
    zip: string;
    phone: string;
    email: string;
  };
  total: number;
  status: ContractorInvoiceStatus;
  notes: string;
  createdAt: string;
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
  deletedAt?: string | null;
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

export interface AppNotification {
  id: string;
  userId: string;
  type: string; // "assignment" | "review" | "delivery" | "comment" | "invoice"
  title: string;
  message: string;
  link: string;
  read: boolean;
  createdAt: string;
}

// Business expense categories (Schedule C aligned)
export type BusinessExpenseCategory =
  | "Equipment"
  | "Software"
  | "Travel"
  | "Meals"
  | "Advertising"
  | "Office"
  | "Insurance"
  | "Vehicle"
  | "Education"
  | "Subscriptions"
  | "Personal"
  | "Other";

export interface BusinessExpense {
  id: string;
  date: string;
  description: string;
  category: BusinessExpenseCategory;
  amount: number;
  serialNumber: string; // optional — for equipment tracking
  notes: string;
  chaseCategory: string; // original category from Chase CSV
  createdAt: string;
}

export interface CategoryRule {
  id: string;
  keyword: string;
  category: BusinessExpenseCategory;
  createdAt: string;
}

// Manual mileage trip (office visit, gear pickup, ad-hoc)
export interface ManualTrip {
  id: string;
  crewMemberId: string;
  date: string;
  destination: string;
  locationId?: string | null;
  purpose: string;
  roundTripMiles: number;
  createdAt: string;
}

// Cached distance from a crew member's home to a location (one-way, in miles)
export interface CrewLocationDistance {
  id: string;
  crewMemberId: string;
  locationId: string;
  distanceMiles: number;
  createdAt: string;
}

// ---- Time Tracking ----
export interface TimeEntry {
  id: string;
  crewMemberId: string;
  projectId: string;
  startTime: string;
  endTime: string | null;
  durationMinutes: number | null;
  autoStopped: boolean;
  pausedAt: string | null;
  totalPausedMs: number;
  notes: string;
  createdAt: string;
}

// ---- Contracts & E-Signatures ----
export type ContractStatus = "draft" | "sent" | "client_signed" | "completed" | "void";

export interface ContractTemplate {
  id: string;
  name: string;
  content: string; // HTML content
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface ContractSignature {
  name: string;
  email: string;
  ip: string;
  timestamp: string;
  signatureData: string; // base64 image or typed name
  signatureType: "drawn" | "typed";
}

export interface Contract {
  id: string;
  templateId: string | null;
  clientId: string;
  projectId: string | null;
  title: string;
  content: string; // HTML content or 'pdf:filename' for uploaded PDFs
  status: ContractStatus;
  sentAt: string | null;
  clientSignedAt: string | null;
  ownerSignedAt: string | null;
  clientSignature: ContractSignature | null;
  ownerSignature: ContractSignature | null;
  clientEmail: string;
  signToken: string;
  pdfUrl?: string; // for uploaded PDF contracts
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

// ---- Proposals ----
export type ProposalStatus = "draft" | "sent" | "accepted" | "completed" | "void";
export type ProposalPaymentOption = "none" | "deposit" | "full";

export type PipelineStage =
  | "inquiry" | "follow_up" | "proposal_sent" | "proposal_signed"
  | "retainer_paid" | "final_payment" | "in_production"
  | "delivered" | "review" | "archived";

export type ProposalPageType = "agreement" | "invoice" | "payment" | "custom";
export type MilestoneStatus = "pending" | "due" | "paid" | "overdue";

export interface ProposalLineItem {
  id: string;
  description: string;
  details: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}

export interface ProposalPaymentConfig {
  option: ProposalPaymentOption;
  depositPercent: number;
  depositAmount: number;
}

export interface ProposalPage {
  id: string;
  type: ProposalPageType;
  label: string;
  content: string;
  sortOrder: number;
}

export interface PaymentMilestone {
  id: string;
  label: string;
  type: "percent" | "fixed";
  percent?: number;
  fixedAmount?: number;
  dueType: "at_signing" | "relative_days" | "absolute_date";
  dueDays?: number;
  dueDate?: string;
  status: MilestoneStatus;
  paidAt?: string | null;
  stripeSessionId?: string | null;
}

export interface ProposalPackage {
  id: string;
  name: string;
  description: string;
  lineItems: ProposalLineItem[];
  totalPrice: number;
  paymentMilestones: PaymentMilestone[];
}

export interface ProposalTemplate {
  id: string;
  name: string;
  coverImageUrl: string;
  pages: ProposalPage[];
  packages: ProposalPackage[];
  // Legacy fields (backward compat)
  lineItems: ProposalLineItem[];
  contractContent: string;
  paymentConfig: ProposalPaymentConfig;
  notes: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface Proposal {
  id: string;
  clientId: string;
  projectId: string | null;
  title: string;
  // V2 fields
  pages: ProposalPage[];
  packages: ProposalPackage[];
  selectedPackageId: string | null;
  paymentMilestones: PaymentMilestone[];
  pipelineStage: PipelineStage;
  viewedAt: string | null;
  leadSource: string;
  // Legacy fields (backward compat)
  lineItems: ProposalLineItem[];
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  contractContent: string;
  paymentConfig: ProposalPaymentConfig;
  status: ProposalStatus;
  sentAt: string | null;
  acceptedAt: string | null;
  completedAt: string | null;
  clientSignature: ContractSignature | null;
  ownerSignature: ContractSignature | null;
  invoiceId: string | null;
  stripeSessionId: string | null;
  paidAt: string | null;
  clientEmail: string;
  viewToken: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface PipelineLead {
  id: string;
  clientId: string | null;
  name: string;
  email: string;
  phone: string;
  projectType: string;
  eventDate: string | null;
  location: string;
  description: string;
  leadSource: string;
  pipelineStage: PipelineStage;
  proposalId: string | null;
  recentActivity: string;
  recentActivityAt: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface PersonalEvent {
  id: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  allDay: boolean;
  location: string;
  notes: string;
  category: string;
  color: string;
  priority: boolean;
  orgId: string;
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
  contractorInvoices: ContractorInvoice[];
  crewLocationDistances: CrewLocationDistance[];
  manualTrips: ManualTrip[];
  businessExpenses: BusinessExpense[];
  categoryRules: CategoryRule[];
  timeEntries: TimeEntry[];
  contractTemplates: ContractTemplate[];
  contracts: Contract[];
  proposalTemplates: ProposalTemplate[];
  proposals: Proposal[];
  pipelineLeads: PipelineLead[];
  series: Series[];
  personalEvents: PersonalEvent[];
  organization: Organization | null;
}
