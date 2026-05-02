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
  deliveries: boolean;
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
  deliveries: true,
  clientHealth: true,
  profitLoss: true,
  contractor1099: true,
  clientManagement: true,
  locationManagement: true,
  reports: true,
};

export type ProductionType = "video" | "photo" | "both";

// Dashboard widget configuration
export type DashboardWidgetId = "metrics" | "activity" | "upcoming" | "invoices" | "mileage" | "revenue";

export interface DashboardWidgetConfig {
  id: DashboardWidgetId;
  enabled: boolean;
}

export const DEFAULT_DASHBOARD_WIDGETS: DashboardWidgetConfig[] = [
  { id: "metrics", enabled: true },
  { id: "activity", enabled: true },
  { id: "upcoming", enabled: true },
  { id: "invoices", enabled: true },
  { id: "mileage", enabled: true },
  { id: "revenue", enabled: true },
];

export const DASHBOARD_WIDGET_LABELS: Record<DashboardWidgetId, string> = {
  metrics: "Status Cards (Upcoming, In Editing, Outstanding, Completed)",
  activity: "Activity Feed (recent client interactions)",
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
  // The signing/owner's name — printed on vendor signature blocks. Distinct
  // from `Organization.name` (the company name shown elsewhere). Optional
  // for back-compat with rows saved before this field existed.
  ownerName?: string;
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
  { id: "awaiting_approval", label: "Awaiting Approval", color: "yellow" },
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
  faviconUrl: string;
  plan: string;
  features: OrgFeatures;
  productionType: ProductionType;
  defaultBillingModel: BillingModel;
  defaultBillingRate: number;
  businessInfo: OrgBusinessInfo;
  dashboardWidgets: DashboardWidgetConfig[];
  pipelineStages: PipelineStageConfig[];
  services: ServiceItem[];
  // SaaS billing state — all set by /api/stripe-webhook. Frontend reads these
  // to enforce project limits, show the Manage Subscription button, and render
  // the PaymentBanner when a charge has failed.
  projectLimit: number;          // -1 = unlimited (paid tier or grandfathered), otherwise the free-tier cap (10)
  stripeCustomerId: string;      // empty string until user first opens checkout
  stripeSubscriptionId: string;  // empty string when no active subscription
  billingStatus: string;         // 'ok' | 'past_due' | 'cancelled'
  testimonialPromptedAt: string | null; // when the testimonial prompt last fired (null = never asked)
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

export interface EditType {
  id: string;
  name: string;
}

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
  billingModel?: BillingModel | null; // null = inherit from client
  billingRate?: number | null; // $/hr when hourly, flat $ when per_project. null = inherit
  paidDate?: string | null; // date this project was marked paid (ISO date or null)
  editTypes: string[]; // edit_type IDs
  notes: string;
  deliverableUrl: string; // Google Drive link to final deliverables
  cancellationReason: string; // populated when status === "cancelled"
  cancelledAt: string | null; // ISO timestamp of when status flipped to "cancelled"
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
  // Block-based authoring (Phase B). When non-empty, the editor uses these
  // blocks and `content` is kept in sync as the rendered HTML for backward
  // compat with rendering surfaces that read the flat string.
  blocks?: ProposalBlock[];
  content: string; // HTML content (legacy + render output)
  // Multi-page authoring (HoneyBook-style "Smart Files"). When non-empty,
  // the editor + renderer use these pages and the legacy single-page
  // blocks/content are ignored. Each page can be agreement / invoice /
  // payment / custom — invoice pages auto-render from contract milestones.
  // Reuses ProposalPage shape since the rendering pipeline is the same.
  pages?: ProposalPage[];
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

// Extra signers beyond the always-present client + owner. Each gets their
// own sign URL via a unique signToken so the UX matches what the primary
// client sees today. Stored inline on the contract row as JSONB.
export interface AdditionalSigner {
  id: string;
  name: string;
  email: string;
  role: string;        // free-form label: "Business Partner", "Second Shooter", etc.
  signToken: string;
  signature: ContractSignature | null;
  signedAt: string | null;
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
  /**
   * Bracket-field values keyed by the placeholder text (e.g. "PURPOSE — what
   * are you discussing?"). Populated when the user fills `[BRACKETED]` chips
   * in the WYSIWYG editor. Same key used across the document so filling one
   * chip fills every duplicate.
   */
  fieldValues: Record<string, string>;
  additionalSigners: AdditionalSigner[];
  documentExpiresAt: string | null;   // ISO date — auto-void after this date
  remindersEnabled: boolean;          // when true, scheduled cron pings unsigned signers
  lastReminderSentAt: string | null;  // last time the reminder cron emailed unsigned signers
  // Phase A — auto-generated drafts from proposal acceptance.
  proposalId: string | null;          // links back to the source proposal (null for standalone contracts)
  masterTemplateVersionId: string;    // audit stamp of which master template version produced this draft
  firingLog: ConditionalRuleFiring[]; // future use — which conditional clauses fired and why (Phase B)
  sendBackReason: string;             // populated when owner clicks "Send Back"; empty otherwise
  // Per-milestone payment tracking — same shape as proposals.payment_milestones
  // plus `id`, `lastReminderSentAt`, and `paidAt` populated by the proposal-
  // accept handler and the Stripe webhook respectively. Drives the payment-
  // reminders cron + Outstanding Payments page + pipeline lateness badge.
  paymentMilestones: PaymentMilestone[];
  // Inbound email replies captured by /api/inbound-email and threaded onto
  // this contract. Each entry: { receivedAt, from, subject, body }.
  inboundReplies: Array<{ receivedAt: string; from: string; subject: string; body: string }>;
  // Multi-page contract document. When non-empty, takes precedence over the
  // legacy single-page blocks/content. Each page renders as its own panel
  // in the contract editor + on /sign/<token>. Invoice pages auto-render
  // from paymentMilestones — no user authoring required.
  pages?: ProposalPage[];
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

// One entry per conditional clause that fired (or was suppressed) when the
// rule engine generated a draft contract. Reserved for Phase B (conditional
// clauses); Phase A always produces an empty array.
export interface ConditionalRuleFiring {
  clauseLabel: string;
  rule: "always" | "if_package" | "if_not_package";
  packageId?: string;
  fired: boolean;
  reason: string;
}

// ---- Proposals ----
export type ProposalStatus = "draft" | "sent" | "accepted" | "completed" | "void";
export type ProposalPaymentOption = "none" | "deposit" | "full";

export type PipelineStage =
  | "inquiry" | "follow_up" | "proposal_sent" | "proposal_signed"
  | "awaiting_approval"
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

// ---- Proposal blocks (block-based template editor — sub-phase 1A) ----
//
// Pages are rendered via `blocks[]` when present. When `blocks` is undefined
// or empty, the renderer falls back to `content` (legacy raw HTML/text). This
// preserves every existing template untouched while letting new templates use
// the block-based editor.
//
// Future blocks (package_row variants pulling from a reusable Packages library,
// conditional clauses, etc.) ship in sub-phases 1B+1C — not here.

export type ProposalBlock =
  | {
      id: string;
      type: "hero";
      // Data URL for v1; R2/Supabase storage migration is a separate task.
      imageDataUrl: string;
      height?: "sm" | "md" | "lg";
    }
  | {
      id: string;
      type: "image";
      imageDataUrl: string;
      caption?: string;
    }
  | {
      id: string;
      type: "centered_title";
      text: string;
      // Defaults to "center" if omitted (legacy blocks).
      align?: "left" | "center" | "right";
      // Visual scale: "sm" subheading, "md" heading, "lg" hero (default).
      size?: "sm" | "md" | "lg";
      // Inline formatting flags — applied to the whole heading.
      bold?: boolean;
      italic?: boolean;
      underline?: boolean;
    }
  | {
      id: string;
      type: "section_divider";
      // Uppercase letter-spaced section header, e.g. "FILM COLLECTION".
      text: string;
      // Defaults to "center" if omitted (legacy blocks).
      align?: "left" | "center" | "right";
    }
  | {
      id: string;
      type: "prose";
      // Sanitised HTML produced by TipTap. Renderer must DOMPurify before injecting.
      html: string;
    }
  | {
      // Inline payment-schedule editor (contract templates only). User
      // configures deposit + balance terms in the canvas; at signing time
      // the contract generator converts percentages to dollar amounts using
      // the proposal's package total.
      id: string;
      type: "payment_schedule";
      deposit: {
        kind: "percent" | "fixed";
        value: number;             // percent (0-100) or fixed dollars
        dueType: "at_signing" | "absolute_date" | "relative_days";
        dueDays?: number;          // for relative_days: days from signing
        dueDate?: string;          // for absolute_date: ISO YYYY-MM-DD
        label?: string;            // override default "Deposit"
      };
      balance: {
        dueType: "at_signing" | "absolute_date" | "relative_days" | "on_event_date";
        dueDays?: number;          // for relative_days: days BEFORE event (positive number)
        dueDate?: string;          // for absolute_date
        label?: string;            // override default "Balance"
      };
    }
  | {
      id: string;
      type: "package_row";
      // References a Package in the org's central Packages library. The
      // renderer is given the library list and resolves the lookup at render
      // time. For sent proposals, pin-by-default semantics will snapshot the
      // resolved data at send time (Sub-Phase 1B/1C concern).
      packageId: string;
      // Optional icon override; when blank, the renderer uses the Package's
      // own icon. Lets a template highlight a package with a different icon
      // without mutating the library entry.
      icon?: string;
    }
  | {
      id: string;
      type: "divider";
    }
  | {
      id: string;
      type: "spacer";
      size: "sm" | "md" | "lg";
    }
  | {
      id: string;
      type: "signature";
      // Renders the existing signature surface — the actual signing flow lives in ViewProposalPage.
      label?: string;
      // Distinguishes who signs on this line. "client" → client signing UI;
      // "vendor" → owner/vendor counter-signing UI; undefined → legacy
      // generic line (kept for back-compat with old templates).
      role?: "client" | "vendor";
    }
  | {
      id: string;
      type: "merge_field";
      // One of the SUPPORTED_MERGE_FIELDS keys defined in api/_contractGenerator.ts —
      // e.g. "client_name", "event_date", "packages_block", "payment_schedule_block".
      // Renders inline as the literal token `{{key}}` so the contract generator's
      // server-side substitution can find and replace it. In the editor, displays
      // as a styled chip showing the human-readable label.
      field: string;
    };

export interface ProposalPage {
  id: string;
  type: ProposalPageType;
  label: string;
  // Legacy raw content (HTML or plain text). Required for backward compat with
  // every existing template. New templates set `blocks[]` and leave this empty.
  content: string;
  // Block-based content. When non-empty, the renderer uses this and ignores `content`.
  blocks?: ProposalBlock[];
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
  // ISO timestamp the payment-reminders cron last emailed about this
  // milestone. Used to dedupe sends within a single day. Optional — older
  // milestones written before the cron existed won't have this set.
  lastReminderSentAt?: string;
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
  // Master contract template used by Phase A auto-generation. When a client
  // accepts a proposal built from this template, the server resolves the
  // linked contract template and renders a draft Contract for owner review.
  contractTemplateId: string | null;
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
  // Master contract template used to auto-generate the draft contract when
  // this proposal is accepted. Inherited from the proposal template at send
  // time; null falls back to the legacy embedded contractContent flow.
  contractTemplateId: string | null;
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
  // Per-send snapshot history. Appended each time the proposal moves to
  // "sent" status. Each entry: { sentAt, total, packageIds, milestoneCount }.
  sendHistory: Array<{ sentAt: string; total?: number; packageIds?: string[]; milestoneCount?: number }>;
  // Inbound email replies captured by /api/inbound-email and threaded onto
  // this proposal. Each entry: { receivedAt, from, subject, body }.
  inboundReplies: Array<{ receivedAt: string; from: string; subject: string; body: string }>;
  // Optional expiration. When set and elapsed, the public proposal page
  // shows an "expired" state instead of the live form.
  expiresAt: string | null;
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

// Lightweight unpaid calendar entry. Optionally tied to a client; when the
// visibleToClient flag is on, the assigned client sees it on their calendar.
export interface Meeting {
  id: string;
  ownerUserId: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  clientId: string | null;
  locationText: string;
  notes: string;
  visibleToClient: boolean;
  color: string; // "" = default slate; otherwise one of MEETING_COLORS values
  orgId: string;
  createdAt: string;
}

// ----------------------------------------------------------------------
// Packages library — reusable services that drop into proposal templates
// as `package_row` blocks. Owner-administered org-wide list. The icon key
// resolves against the curated Lucide vocabulary in
// client/src/components/proposal/icons.ts.
// ----------------------------------------------------------------------

export interface Package {
  id: string;
  orgId: string;
  name: string;
  icon: string;                        // ICON_VOCABULARY key (used when iconCustomDataUrl is empty)
  iconCustomDataUrl: string;           // optional custom PNG/SVG data URL (≤50KB); takes precedence over `icon`
  description: string;
  defaultPrice: number;
  discountFromPrice: number | null;    // null = no strikethrough crossed-out price
  photoDataUrl: string;                // v1 data URL ≤500KB; R2 migration deferred
  deliverables: string[];
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

// ----------------------------------------------------------------------
// Proposal image library — uploaded images saved org-wide so they can be
// re-picked across proposal templates without re-uploading. Each block
// type that takes an image (hero / image / package photo) can pick from
// this library. Data URLs in v1; R2 migration is its own task.
// ----------------------------------------------------------------------

export interface ProposalImage {
  id: string;
  orgId: string;
  name: string;
  imageDataUrl: string;
  width: number;
  height: number;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

// ----------------------------------------------------------------------
// Galleries (deliveries)
// ----------------------------------------------------------------------

export type DeliveryStatus = "draft" | "sent" | "submitted" | "working" | "delivered";

export interface DeliveryFile {
  id: string;
  deliveryId: string;
  storagePath: string;
  originalName: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  mimeType: string;
  position: number;
  downloadCount: number;
  createdAt: string;
}

export interface DeliverySelection {
  id: string;
  deliveryId: string;
  fileId: string;
  isPaid: boolean;
  stripePaymentIntentId: string | null;
  editedAt: string | null;
  createdAt: string;
}

export type CoverLayout = "center" | "vintage" | "minimal" | "left" | "stripe" | "frame" | "divider" | "stamp";

export interface DeliveryCollection {
  id: string;
  name: string;
  slug: string | null;
  coverSubtitle: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Delivery {
  id: string;
  projectId: string | null;
  collectionId: string | null;
  title: string;
  coverFileId: string | null;
  watermarkText: string | null;
  watermarkUseLogo: boolean;
  printsEnabled: boolean;
  coverLayout: CoverLayout;
  coverFont: string;             // "" = Cormorant Garamond default; see COVER_FONTS in MeetingDialog... err, DeliveriesPage
  coverSubtitle: string | null;  // tagline / location / event subtitle
  coverDate: string | null;      // free-form date string ("16th March, 2026")
  slug: string | null;           // vanity URL — /g/<slug>; null = use /deliver/<token> only
  requireEmail: boolean;         // when true, visitors must enter email before viewing
  token: string;
  hasPassword: boolean;          // never expose the hash; UI just needs to know it's set
  expiresAt: string | null;

  // Proofing config
  selectionLimit: number;        // 0 disables proofing entirely
  perExtraPhotoCents: number;    // 0 = no per-photo upsell
  buyAllFlatCents: number;       // 0 = no flat unlock-all option

  status: DeliveryStatus;

  clientName: string | null;
  clientEmail: string | null;
  submittedAt: string | null;
  workingAt: string | null;
  deliveredAt: string | null;

  viewCount: number;
  downloadCount: number;

  createdAt: string;
  updatedAt: string;
}

export interface AppData {
  clients: Client[];
  crewMembers: CrewMember[];
  locations: Location[];
  projectTypes: ProjectType[];
  editTypes: EditType[];
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
  meetings: Meeting[];
  packages: Package[];
  proposalImages: ProposalImage[];
  deliveries: Delivery[];
  deliveryFiles: DeliveryFile[];
  deliverySelections: DeliverySelection[];
  deliveryCollections: DeliveryCollection[];
  organization: Organization | null;
}
