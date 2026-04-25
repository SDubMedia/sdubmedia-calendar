// ============================================================
// Slate — App Data Context (Supabase)
// ============================================================

import React, { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef } from "react";
import type { AppData, Client, CrewMember, Location, ProjectType, EditType, Project, MarketingExpense, Invoice, ContractorInvoice, CrewLocationDistance, ManualTrip, BusinessExpense, CategoryRule, BusinessExpenseCategory, TimeEntry, ContractTemplate, Contract, ProposalTemplate, Proposal, PipelineLead, Series, SeriesEpisode, SeriesMessage, EpisodeComment, Organization, OrgFeatures, PersonalEvent } from "@/lib/types";
import { DEFAULT_PIPELINE_STAGES, DEFAULT_FEATURES } from "@/lib/types";
import { supabase } from "@/lib/supabase";
import { nanoid } from "nanoid";
import { useAuth } from "./AuthContext";
import type { RealtimeChannel } from "@supabase/supabase-js";

interface AppContextValue {
  data: AppData;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  // Clients
  addClient: (c: Omit<Client, "id" | "createdAt">) => Promise<Client>;
  updateClient: (id: string, c: Partial<Client>) => Promise<void>;
  deleteClient: (id: string) => Promise<void>;
  // Crew
  addCrewMember: (c: Omit<CrewMember, "id">) => Promise<CrewMember>;
  updateCrewMember: (id: string, c: Partial<CrewMember>) => Promise<void>;
  deleteCrewMember: (id: string) => Promise<void>;
  // Locations
  addLocation: (l: Omit<Location, "id">) => Promise<Location>;
  updateLocation: (id: string, l: Partial<Location>) => Promise<void>;
  deleteLocation: (id: string) => Promise<void>;
  // Project Types
  addProjectType: (pt: Omit<ProjectType, "id">) => Promise<ProjectType>;
  updateProjectType: (id: string, pt: Partial<ProjectType>) => Promise<void>;
  deleteProjectType: (id: string) => Promise<void>;
  // Edit Types
  addEditType: (et: Omit<EditType, "id">) => Promise<EditType>;
  updateEditType: (id: string, et: Partial<EditType>) => Promise<void>;
  deleteEditType: (id: string) => Promise<void>;
  // Projects
  addProject: (p: Omit<Project, "id" | "createdAt">) => Promise<Project>;
  updateProject: (id: string, p: Partial<Project>) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  // Marketing Expenses
  addMarketingExpense: (e: Omit<MarketingExpense, "id" | "createdAt">) => Promise<MarketingExpense>;
  deleteMarketingExpense: (id: string) => Promise<void>;
  // Invoices
  addInvoice: (inv: Omit<Invoice, "id" | "createdAt" | "updatedAt">) => Promise<Invoice>;
  updateInvoice: (id: string, inv: Partial<Invoice>) => Promise<void>;
  deleteInvoice: (id: string) => Promise<void>;
  // Contractor Invoices
  addContractorInvoice: (inv: Omit<ContractorInvoice, "id" | "createdAt">) => Promise<ContractorInvoice>;
  updateContractorInvoice: (id: string, inv: Partial<ContractorInvoice>) => Promise<void>;
  deleteContractorInvoice: (id: string) => Promise<void>;
  // Series
  addSeries: (s: Omit<Series, "id" | "createdAt">) => Promise<Series>;
  updateSeries: (id: string, s: Partial<Series>) => Promise<void>;
  deleteSeries: (id: string) => Promise<void>;
  // Episodes
  addEpisode: (e: Omit<SeriesEpisode, "id" | "createdAt">) => Promise<SeriesEpisode>;
  updateEpisode: (id: string, e: Partial<SeriesEpisode>) => Promise<void>;
  deleteEpisode: (id: string) => Promise<void>;
  // Series Messages
  fetchMessages: (seriesId: string) => Promise<SeriesMessage[]>;
  addMessage: (m: Omit<SeriesMessage, "id" | "createdAt">) => Promise<SeriesMessage>;
  // Episodes by series
  fetchEpisodes: (seriesId: string) => Promise<SeriesEpisode[]>;
  // Episode Comments
  fetchComments: (episodeId: string) => Promise<EpisodeComment[]>;
  addComment: (c: Omit<EpisodeComment, "id" | "createdAt">) => Promise<EpisodeComment>;
  // Crew Location Distances
  upsertDistance: (crewMemberId: string, locationId: string, distanceMiles: number) => Promise<void>;
  // Manual Trips
  addManualTrip: (t: Omit<ManualTrip, "id" | "createdAt">) => Promise<ManualTrip>;
  deleteManualTrip: (id: string) => Promise<void>;
  // Business Expenses
  addBusinessExpense: (e: Omit<BusinessExpense, "id" | "createdAt">) => Promise<BusinessExpense>;
  addBusinessExpenses: (expenses: Omit<BusinessExpense, "id" | "createdAt">[]) => Promise<void>;
  updateBusinessExpense: (id: string, e: Partial<BusinessExpense>) => Promise<void>;
  deleteBusinessExpense: (id: string) => Promise<void>;
  // Category Rules
  upsertCategoryRule: (keyword: string, category: BusinessExpenseCategory) => Promise<void>;
  // Time Entries
  addTimeEntry: (t: Omit<TimeEntry, "id" | "createdAt">) => Promise<TimeEntry>;
  updateTimeEntry: (id: string, t: Partial<TimeEntry>) => Promise<void>;
  // Contracts
  addContractTemplate: (t: Omit<ContractTemplate, "id" | "createdAt" | "updatedAt">) => Promise<ContractTemplate>;
  updateContractTemplate: (id: string, t: Partial<ContractTemplate>) => Promise<void>;
  deleteContractTemplate: (id: string) => Promise<void>;
  addContract: (c: Omit<Contract, "id" | "createdAt" | "updatedAt">) => Promise<Contract>;
  updateContract: (id: string, c: Partial<Contract>) => Promise<void>;
  deleteContract: (id: string) => Promise<void>;
  // Proposals
  addProposalTemplate: (t: Omit<ProposalTemplate, "id" | "createdAt" | "updatedAt">) => Promise<ProposalTemplate>;
  updateProposalTemplate: (id: string, t: Partial<ProposalTemplate>) => Promise<void>;
  deleteProposalTemplate: (id: string) => Promise<void>;
  addProposal: (p: Omit<Proposal, "id" | "createdAt" | "updatedAt">) => Promise<Proposal>;
  updateProposal: (id: string, p: Partial<Proposal>) => Promise<void>;
  deleteProposal: (id: string) => Promise<void>;
  // Pipeline Leads
  addPipelineLead: (l: Omit<PipelineLead, "id" | "createdAt" | "updatedAt">) => Promise<PipelineLead>;
  updatePipelineLead: (id: string, l: Partial<PipelineLead>) => Promise<void>;
  deletePipelineLead: (id: string) => Promise<void>;
  // Personal Events
  addPersonalEvent: (e: Omit<PersonalEvent, "id" | "createdAt">) => Promise<PersonalEvent>;
  updatePersonalEvent: (id: string, e: Partial<PersonalEvent>) => Promise<void>;
  deletePersonalEvent: (id: string) => Promise<void>;
  // Trash
  restoreItem: (table: string, id: string) => Promise<void>;
  permanentlyDelete: (table: string, id: string) => Promise<void>;
  // Organization
  updateOrganization: (updates: Partial<Organization>) => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

// ---- DB row → app type converters ----
function rowToClient(r: any): Client {
  return {
    id: r.id,
    company: r.company,
    contactName: r.contact_name,
    phone: r.phone,
    email: r.email,
    address: r.address || "",
    city: r.city || "",
    state: r.state || "",
    zip: r.zip || "",
    billingModel: r.billing_model || "hourly",
    billingRatePerHour: Number(r.billing_rate_per_hour ?? 0),
    perProjectRate: Number(r.per_project_rate ?? 0),
    projectTypeRates: r.project_type_rates || [],
    allowedProjectTypeIds: r.allowed_project_type_ids || [],
    defaultProjectTypeId: r.default_project_type_id || "",
    roleBillingMultipliers: r.role_billing_multipliers || [],
    partnerSplit: r.partner_split || null,
    createdAt: r.created_at,
  };
}

function rowToCrew(r: any): CrewMember {
  return {
    id: r.id,
    name: r.name,
    roleRates: r.role_rates || [],
    phone: r.phone,
    email: r.email,
    defaultPayRatePerHour: Number(r.default_pay_rate_per_hour ?? 0),
    homeAddress: r.home_address || null,
    businessName: r.business_name || "",
    businessAddress: r.business_address || "",
    businessCity: r.business_city || "",
    businessState: r.business_state || "",
    businessZip: r.business_zip || "",
    taxId: r.tax_id || "",
    taxIdType: r.tax_id_type || "",
    w9Url: r.w9_url || "",
  };
}

function rowToCrewLocationDistance(r: any): CrewLocationDistance {
  return {
    id: r.id,
    crewMemberId: r.crew_member_id,
    locationId: r.location_id,
    distanceMiles: Number(r.distance_miles ?? 0),
    createdAt: r.created_at,
  };
}

function rowToTimeEntry(r: any): TimeEntry {
  return {
    id: r.id, crewMemberId: r.crew_member_id, projectId: r.project_id,
    startTime: r.start_time, endTime: r.end_time || null,
    durationMinutes: r.duration_minutes != null ? Number(r.duration_minutes) : null,
    autoStopped: r.auto_stopped || false,
    pausedAt: r.paused_at || null,
    totalPausedMs: Number(r.total_paused_ms ?? 0),
    notes: r.notes || "", createdAt: r.created_at,
  };
}

function rowToContractTemplate(r: any): ContractTemplate {
  return { id: r.id, name: r.name || "", content: r.content || "", createdAt: r.created_at, updatedAt: r.updated_at, deletedAt: r.deleted_at || null };
}

function rowToContract(r: any): Contract {
  return {
    id: r.id, templateId: r.template_id || null, clientId: r.client_id || "",
    projectId: r.project_id || null, title: r.title || "", content: r.content || "",
    status: r.status || "draft", sentAt: r.sent_at || null,
    clientSignedAt: r.client_signed_at || null, ownerSignedAt: r.owner_signed_at || null,
    clientSignature: r.client_signature || null, ownerSignature: r.owner_signature || null,
    clientEmail: r.client_email || "", signToken: r.sign_token || "",
    createdAt: r.created_at, updatedAt: r.updated_at, deletedAt: r.deleted_at || null,
  };
}

function rowToProposalTemplate(r: any): ProposalTemplate {
  return {
    id: r.id, name: r.name || "",
    coverImageUrl: r.cover_image_url || "",
    pages: Array.isArray(r.pages) ? r.pages : [],
    packages: Array.isArray(r.packages) ? r.packages : [],
    lineItems: Array.isArray(r.line_items) ? r.line_items : [],
    contractContent: r.contract_content || "",
    paymentConfig: r.payment_config || { option: "none", depositPercent: 0, depositAmount: 0 },
    notes: r.notes || "",
    createdAt: r.created_at, updatedAt: r.updated_at, deletedAt: r.deleted_at || null,
  };
}

function rowToProposal(r: any): Proposal {
  return {
    id: r.id, clientId: r.client_id || "", projectId: r.project_id || null,
    title: r.title || "",
    pages: Array.isArray(r.pages) ? r.pages : [],
    packages: Array.isArray(r.packages) ? r.packages : [],
    selectedPackageId: r.selected_package_id || null,
    paymentMilestones: Array.isArray(r.payment_milestones) ? r.payment_milestones : [],
    pipelineStage: r.pipeline_stage || "inquiry",
    viewedAt: r.viewed_at || null,
    leadSource: r.lead_source || "",
    lineItems: Array.isArray(r.line_items) ? r.line_items : [],
    subtotal: Number(r.subtotal ?? 0), taxRate: Number(r.tax_rate ?? 0),
    taxAmount: Number(r.tax_amount ?? 0), total: Number(r.total ?? 0),
    contractContent: r.contract_content || "",
    paymentConfig: r.payment_config || { option: "none", depositPercent: 0, depositAmount: 0 },
    status: r.status || "draft",
    sentAt: r.sent_at || null, acceptedAt: r.accepted_at || null, completedAt: r.completed_at || null,
    clientSignature: r.client_signature || null, ownerSignature: r.owner_signature || null,
    invoiceId: r.invoice_id || null, stripeSessionId: r.stripe_session_id || null,
    paidAt: r.paid_at || null,
    clientEmail: r.client_email || "", viewToken: r.view_token || "",
    notes: r.notes || "",
    createdAt: r.created_at, updatedAt: r.updated_at, deletedAt: r.deleted_at || null,
  };
}

function rowToPipelineLead(r: any): PipelineLead {
  return {
    id: r.id, clientId: r.client_id || null,
    name: r.name || "", email: r.email || "", phone: r.phone || "",
    projectType: r.project_type || "", eventDate: r.event_date || null,
    location: r.location || "", description: r.description || "",
    leadSource: r.lead_source || "", pipelineStage: r.pipeline_stage || "inquiry",
    proposalId: r.proposal_id || null,
    recentActivity: r.recent_activity || "",
    recentActivityAt: r.recent_activity_at || null,
    createdAt: r.created_at, updatedAt: r.updated_at, deletedAt: r.deleted_at || null,
  };
}

function rowToBusinessExpense(r: any): BusinessExpense {
  return {
    id: r.id,
    date: r.date,
    description: r.description || "",
    category: r.category || "Other",
    amount: Number(r.amount ?? 0),
    serialNumber: r.serial_number || "",
    notes: r.notes || "",
    chaseCategory: r.chase_category || "",
    createdAt: r.created_at,
  };
}

function rowToCategoryRule(r: any): CategoryRule {
  return {
    id: r.id,
    keyword: r.keyword,
    category: r.category || "Other",
    createdAt: r.created_at,
  };
}

function rowToManualTrip(r: any): ManualTrip {
  return {
    id: r.id,
    crewMemberId: r.crew_member_id,
    date: r.date,
    destination: r.destination || "",
    locationId: r.location_id || null,
    purpose: r.purpose || "",
    roundTripMiles: Number(r.round_trip_miles ?? 0),
    createdAt: r.created_at,
  };
}

function rowToContractorInvoice(r: any): ContractorInvoice {
  return {
    id: r.id,
    crewMemberId: r.crew_member_id,
    invoiceNumber: r.invoice_number,
    recipientType: r.recipient_type,
    recipientName: r.recipient_name || "",
    periodStart: r.period_start,
    periodEnd: r.period_end,
    lineItems: r.line_items || [],
    businessInfo: r.business_info || {},
    total: Number(r.total ?? 0),
    status: r.status,
    notes: r.notes || "",
    createdAt: r.created_at,
  };
}

function rowToLocation(r: any): Location {
  return { id: r.id, name: r.name, address: r.address, city: r.city, state: r.state, zip: r.zip, oneTimeUse: r.one_time_use || false };
}

function rowToProjectType(r: any): ProjectType {
  return { id: r.id, name: r.name, lightweight: r.lightweight || false };
}

function rowToEditType(r: any): EditType {
  return { id: r.id, name: r.name };
}

function normalizeCrewEntry(c: any) {
  return {
    crewMemberId: c.crewMemberId || c.crew_member_id || "",
    role: c.role || "",
    hoursWorked: Number(c.hoursWorked ?? c.hours_worked ?? 0),
    payRatePerHour: Number(c.payRatePerHour ?? c.pay_rate_per_hour ?? 0),
    roundTripMiles: c.roundTripMiles ?? c.round_trip_miles ?? undefined,
  };
}

function rowToProject(r: any): Project {
  return {
    id: r.id,
    clientId: r.client_id,
    projectTypeId: r.project_type_id,
    locationId: r.location_id,
    date: r.date,
    startTime: r.start_time,
    endTime: r.end_time,
    status: r.status,
    crew: (r.crew || []).map(normalizeCrewEntry),
    postProduction: (r.post_production || []).map(normalizeCrewEntry),
    editorBilling: r.editor_billing || null,
    projectRate: r.project_rate != null ? Number(r.project_rate) : null,
    billingModel: r.billing_model || null,
    billingRate: r.billing_rate != null ? Number(r.billing_rate) : null,
    paidDate: r.paid_date || null,
    editTypes: r.edit_types || [],
    notes: r.notes || "",
    deliverableUrl: r.deliverable_url || "",
    createdAt: r.created_at,
  };
}

function rowToExpense(r: any): MarketingExpense {
  return {
    id: r.id,
    clientId: r.client_id || "",
    date: r.date,
    category: r.category,
    description: r.description || "",
    notes: r.notes || "",
    amount: Number(r.amount ?? 0),
    createdAt: r.created_at,
  };
}

function rowToInvoice(r: any): Invoice {
  return {
    id: r.id,
    invoiceNumber: r.invoice_number,
    clientId: r.client_id,
    periodStart: r.period_start,
    periodEnd: r.period_end,
    subtotal: Number(r.subtotal ?? 0),
    taxRate: Number(r.tax_rate ?? 0),
    taxAmount: Number(r.tax_amount ?? 0),
    total: Number(r.total ?? 0),
    status: r.status,
    issueDate: r.issue_date,
    dueDate: r.due_date,
    paidDate: r.paid_date || null,
    lineItems: r.line_items || [],
    companyInfo: r.company_info || {},
    clientInfo: r.client_info || {},
    notes: r.notes || "",
    createdAt: r.created_at,
    updatedAt: r.updated_at, deletedAt: r.deleted_at || null,
  };
}

function rowToSeries(r: any): Series {
  return {
    id: r.id,
    name: r.name,
    clientId: r.client_id,
    goal: r.goal || "",
    status: r.status,
    monthlyTokenLimit: Number(r.monthly_token_limit ?? 500000),
    tokensUsedThisMonth: Number(r.tokens_used_this_month ?? 0),
    tokenResetDate: r.token_reset_date || "",
    createdAt: r.created_at,
  };
}

function rowToEpisode(r: any): SeriesEpisode {
  return {
    id: r.id,
    seriesId: r.series_id,
    episodeNumber: r.episode_number,
    title: r.title || "",
    concept: r.concept || "",
    talkingPoints: r.talking_points || "",
    status: r.status,
    projectId: r.project_id || null,
    draftDate: r.draft_date || "",
    draftStartTime: r.draft_start_time || "",
    draftEndTime: r.draft_end_time || "",
    draftLocationId: r.draft_location_id || "",
    draftCrew: r.draft_crew || [],
    createdAt: r.created_at,
  };
}

function rowToMessage(r: any): SeriesMessage {
  return {
    id: r.id,
    seriesId: r.series_id,
    role: r.role,
    senderName: r.sender_name || "",
    content: r.content || "",
    tokensUsed: Number(r.tokens_used ?? 0),
    createdAt: r.created_at,
  };
}

function rowToComment(r: any): EpisodeComment {
  return {
    id: r.id,
    episodeId: r.episode_id,
    seriesId: r.series_id,
    userName: r.user_name || "",
    userRole: r.user_role || "",
    content: r.content || "",
    createdAt: r.created_at,
  };
}

function rowToPersonalEvent(r: any): PersonalEvent {
  return {
    id: r.id,
    title: r.title || "",
    date: r.date,
    startTime: r.start_time || "",
    endTime: r.end_time || "",
    allDay: r.all_day ?? true,
    location: r.location || "",
    notes: r.notes || "",
    category: r.category || "personal",
    color: r.color || "",
    priority: r.priority ?? false,
    orgId: r.org_id || "",
    createdAt: r.created_at,
  };
}

function rowToOrg(r: any): Organization {
  return {
    id: r.id, name: r.name, slug: r.slug, logoUrl: r.logo_url || "", plan: r.plan,
    features: { ...DEFAULT_FEATURES, ...(r.features || {}) },
    productionType: r.production_type || "both",
    defaultBillingModel: r.default_billing_model || "hourly",
    defaultBillingRate: Number(r.default_billing_rate ?? 0),
    businessInfo: r.business_info || { address: "", city: "", state: "", zip: "", phone: "", email: "", website: "", ein: "" },
    dashboardWidgets: r.dashboard_widgets || null,
    pipelineStages: Array.isArray(r.pipeline_stages) && r.pipeline_stages.length > 0 ? r.pipeline_stages : DEFAULT_PIPELINE_STAGES,
    services: Array.isArray(r.services) ? r.services : [],
    projectLimit: r.project_limit ?? 10,
    stripeCustomerId: r.stripe_customer_id || "",
    stripeSubscriptionId: r.stripe_subscription_id || "",
    billingStatus: r.billing_status || "ok",
    testimonialPromptedAt: r.testimonial_prompted_at || null,
    createdAt: r.created_at,
  };
}

const emptyData: AppData = {
  clients: [], crewMembers: [], locations: [], projectTypes: [], editTypes: [], projects: [], marketingExpenses: [], invoices: [], contractorInvoices: [], crewLocationDistances: [], manualTrips: [], businessExpenses: [], categoryRules: [], timeEntries: [], contractTemplates: [], contracts: [], proposalTemplates: [], proposals: [], pipelineLeads: [], series: [], personalEvents: [], organization: null,
};

export function AppProvider({ children }: { children: React.ReactNode }) {
  const { profile, effectiveProfile, impersonateUserId, allProfiles } = useAuth();
  const orgId = profile?.orgId || "";
  const [rawData, setRawData] = useState<AppData>(emptyData);
  const [loading, setLoading] = useState(true);

  // Filter data when impersonating — show only what that user should see
  const data = useMemo(() => {
    if (!impersonateUserId) return rawData;

    const targetUser = allProfiles.find(p => p.id === impersonateUserId);
    const targetRole = targetUser?.role || effectiveProfile?.role;
    const clientIds = targetUser?.clientIds || effectiveProfile?.clientIds || [];
    const crewMemberId = targetUser?.crewMemberId || effectiveProfile?.crewMemberId || "";

    // Staff: filter projects by crew assignment
    if (targetRole === "staff" && crewMemberId) {
      const staffProjects = rawData.projects.filter(p =>
        p.crew.some(c => c.crewMemberId === crewMemberId) ||
        p.postProduction.some(c => c.crewMemberId === crewMemberId)
      );
      const staffClientIds = new Set(staffProjects.map(p => p.clientId));
      return {
        ...rawData,
        projects: staffProjects,
        clients: rawData.clients.filter(c => staffClientIds.has(c.id)),
        invoices: [],
        contracts: [],
        proposals: [],
      };
    }

    // Partner/Client: filter by assigned clientIds
    if (clientIds.length > 0) {
      const allowedClientIds = new Set(clientIds);
      return {
        ...rawData,
        clients: rawData.clients.filter(c => allowedClientIds.has(c.id)),
        projects: rawData.projects.filter(p => allowedClientIds.has(p.clientId)),
        invoices: rawData.invoices.filter(i => allowedClientIds.has(i.clientId)),
        contracts: rawData.contracts.filter(c => allowedClientIds.has(c.clientId)),
        proposals: rawData.proposals.filter(p => allowedClientIds.has(p.clientId)),
      };
    }

    return rawData;
  }, [rawData, impersonateUserId, allProfiles, effectiveProfile]);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [
        { data: clients, error: e1 },
        { data: crew, error: e2 },
        { data: locs, error: e3 },
        { data: types, error: e4 },
        { data: editTypesData, error: _e4b },
        { data: projects, error: e5 },
        { data: expenses, error: e6 },
        { data: invoices, error: e7 },
        { data: contractorInvs, error: e7b },
        { data: distances, error: _e7c },
        { data: manualTripsData, error: _e7d },
        { data: bizExpenses, error: _e7e },
        { data: catRules, error: _e7f },
        { data: timeEntriesData, error: _e7i },
        { data: contractTpls, error: _e7g },
        { data: contractsData, error: _e7h },
        { data: proposalTpls, error: _e7j },
        { data: proposalsData, error: _e7k },
        { data: pipelineLeadsData, error: _e7l },
        { data: seriesData, error: e8 },
        { data: personalEventsData, error: _e8b },
        { data: orgData, error: _e9 },
      ] = await Promise.all([
        supabase.from("clients").select("*").order("company"),
        supabase.from("crew_members").select("*").order("name"),
        supabase.from("locations").select("*").order("name"),
        supabase.from("project_types").select("*").order("name"),
        supabase.from("edit_types").select("*").order("name"),
        supabase.from("projects").select("*").order("date"),
        supabase.from("marketing_expenses").select("*").order("date", { ascending: false }),
        supabase.from("invoices").select("*").is("deleted_at", null).order("created_at", { ascending: false }),
        supabase.from("contractor_invoices").select("*").order("created_at", { ascending: false }),
        supabase.from("crew_location_distances").select("*"),
        supabase.from("manual_trips").select("*").order("date", { ascending: false }),
        supabase.from("business_expenses").select("*").order("date", { ascending: false }),
        supabase.from("category_rules").select("*"),
        supabase.from("time_entries").select("*").order("start_time", { ascending: false }),
        supabase.from("contract_templates").select("*").is("deleted_at", null).order("created_at", { ascending: false }),
        supabase.from("contracts").select("*").is("deleted_at", null).order("created_at", { ascending: false }),
        supabase.from("proposal_templates").select("*").is("deleted_at", null).order("created_at", { ascending: false }),
        supabase.from("proposals").select("*").is("deleted_at", null).order("created_at", { ascending: false }),
        supabase.from("pipeline_leads").select("*").is("deleted_at", null).order("created_at", { ascending: false }),
        supabase.from("series").select("*").order("created_at", { ascending: false }),
        supabase.from("personal_events").select("*").order("date"),
        orgId ? supabase.from("organizations").select("*").eq("id", orgId).single() : Promise.resolve({ data: null, error: null }),
      ]);

      const firstError = e1 || e2 || e3 || e4 || e5 || e6 || e7 || e7b || e8;
      if (firstError) throw new Error(firstError.message);

      setRawData({
        clients: (clients || []).map(rowToClient),
        crewMembers: (crew || []).map(rowToCrew),
        locations: (locs || []).map(rowToLocation),
        projectTypes: (types || []).map(rowToProjectType),
        editTypes: (editTypesData || []).map(rowToEditType),
        projects: (projects || []).map(rowToProject),
        marketingExpenses: (expenses || []).map(rowToExpense),
        invoices: (invoices || []).map(rowToInvoice),
        contractorInvoices: (contractorInvs || []).map(rowToContractorInvoice),
        crewLocationDistances: (distances || []).map(r => { try { return rowToCrewLocationDistance(r); } catch { return null; } }).filter(Boolean) as any[],
        manualTrips: (manualTripsData || []).map(r => { try { return rowToManualTrip(r); } catch { return null; } }).filter(Boolean) as any[],
        businessExpenses: (bizExpenses || []).map(r => { try { return rowToBusinessExpense(r); } catch { return null; } }).filter(Boolean) as any[],
        categoryRules: (catRules || []).map(r => { try { return rowToCategoryRule(r); } catch { return null; } }).filter(Boolean) as any[],
        timeEntries: (timeEntriesData || []).map(r => { try { return rowToTimeEntry(r); } catch { return null; } }).filter(Boolean) as any[],
        contractTemplates: (contractTpls || []).map(r => { try { return rowToContractTemplate(r); } catch { return null; } }).filter(Boolean) as any[],
        contracts: (contractsData || []).map(r => { try { return rowToContract(r); } catch { return null; } }).filter(Boolean) as any[],
        proposalTemplates: (proposalTpls || []).map(r => { try { return rowToProposalTemplate(r); } catch { return null; } }).filter(Boolean) as any[],
        proposals: (proposalsData || []).map(r => { try { return rowToProposal(r); } catch { return null; } }).filter(Boolean) as any[],
        pipelineLeads: (pipelineLeadsData || []).map(r => { try { return rowToPipelineLead(r); } catch { return null; } }).filter(Boolean) as any[],
        series: (seriesData || []).map(rowToSeries),
        personalEvents: (personalEventsData || []).map(r => { try { return rowToPersonalEvent(r); } catch { return null; } }).filter(Boolean) as PersonalEvent[],
        organization: orgData ? rowToOrg(orgData) : null,
      });
    } catch (err: any) {
      setError(err.message || "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ---- Supabase Realtime — sync changes from other users ----
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!orgId) return;

    // Table → { key in AppData, row converter, sort comparator (optional) }
    const tableConfig: Record<string, {
      key: keyof AppData;
      convert: (r: any) => any;
      sort?: (a: any, b: any) => number;
      isSingleton?: boolean;
      softDelete?: boolean;
    }> = {
      clients: { key: "clients", convert: rowToClient, sort: (a, b) => a.company.localeCompare(b.company) },
      crew_members: { key: "crewMembers", convert: rowToCrew, sort: (a, b) => a.name.localeCompare(b.name) },
      locations: { key: "locations", convert: rowToLocation, sort: (a, b) => a.name.localeCompare(b.name) },
      project_types: { key: "projectTypes", convert: rowToProjectType, sort: (a, b) => a.name.localeCompare(b.name) },
      edit_types: { key: "editTypes", convert: rowToEditType, sort: (a, b) => a.name.localeCompare(b.name) },
      projects: { key: "projects", convert: rowToProject, sort: (a, b) => a.date.localeCompare(b.date) },
      marketing_expenses: { key: "marketingExpenses", convert: rowToExpense },
      invoices: { key: "invoices", convert: rowToInvoice, softDelete: true },
      contractor_invoices: { key: "contractorInvoices", convert: rowToContractorInvoice },
      crew_location_distances: { key: "crewLocationDistances", convert: rowToCrewLocationDistance },
      manual_trips: { key: "manualTrips", convert: rowToManualTrip },
      business_expenses: { key: "businessExpenses", convert: rowToBusinessExpense },
      category_rules: { key: "categoryRules", convert: rowToCategoryRule },
      time_entries: { key: "timeEntries", convert: rowToTimeEntry },
      contract_templates: { key: "contractTemplates", convert: rowToContractTemplate, softDelete: true },
      contracts: { key: "contracts", convert: rowToContract, softDelete: true },
      proposal_templates: { key: "proposalTemplates", convert: rowToProposalTemplate, softDelete: true },
      proposals: { key: "proposals", convert: rowToProposal, softDelete: true },
      pipeline_leads: { key: "pipelineLeads", convert: rowToPipelineLead, softDelete: true },
      series: { key: "series", convert: rowToSeries },
      personal_events: { key: "personalEvents", convert: rowToPersonalEvent, sort: (a: any, b: any) => a.date.localeCompare(b.date) },
      organizations: { key: "organization", convert: rowToOrg, isSingleton: true },
    };

    const channel = supabase.channel(`realtime-${orgId}`);

    for (const [table, cfg] of Object.entries(tableConfig)) {
      channel.on(
        "postgres_changes" as any,
        { event: "*", schema: "public", table },
        (payload: any) => {
          try {
            const { eventType, new: newRow, old: oldRow } = payload;

            if (cfg.isSingleton) {
              if (eventType === "UPDATE" && newRow) {
                setRawData(d => ({ ...d, [cfg.key]: cfg.convert(newRow) }));
              }
              return;
            }

            setRawData(d => {
              const list = d[cfg.key] as any[];

              if (eventType === "INSERT" && newRow) {
                // Skip if already exists (our own optimistic add)
                if (list.some((item: any) => item.id === newRow.id)) return d;
                // Skip soft-deleted rows
                if (cfg.softDelete && newRow.deleted_at) return d;
                let converted: any;
                try { converted = cfg.convert(newRow); } catch { return d; }
                const updated = [...list, converted];
                if (cfg.sort) updated.sort(cfg.sort);
                return { ...d, [cfg.key]: updated };
              }

              if (eventType === "UPDATE" && newRow) {
                // Soft-deleted → remove from list
                if (cfg.softDelete && newRow.deleted_at) {
                  return { ...d, [cfg.key]: list.filter((item: any) => item.id !== newRow.id) };
                }
                let converted: any;
                try { converted = cfg.convert(newRow); } catch { return d; }
                const exists = list.some((item: any) => item.id === newRow.id);
                if (!exists) {
                  // Wasn't in our list (e.g. un-soft-deleted) — add it
                  const updated = [...list, converted];
                  if (cfg.sort) updated.sort(cfg.sort);
                  return { ...d, [cfg.key]: updated };
                }
                return { ...d, [cfg.key]: list.map((item: any) => item.id === newRow.id ? converted : item) };
              }

              if (eventType === "DELETE" && oldRow) {
                return { ...d, [cfg.key]: list.filter((item: any) => item.id !== oldRow.id) };
              }

              return d;
            });
          } catch {
            // Ignore malformed realtime events
          }
        }
      );
    }

    channel.subscribe();
    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [orgId]);

  // ---- Clients ----
  const addClient = useCallback(async (c: Omit<Client, "id" | "createdAt">): Promise<Client> => {
    const id = nanoid(10);
    const { data: row, error } = await supabase.from("clients").insert({
      id, ...(orgId ? { org_id: orgId } : {}), company: c.company, contact_name: c.contactName, phone: c.phone,
      email: c.email, address: c.address || "", city: c.city || "", state: c.state || "", zip: c.zip || "",
      billing_model: c.billingModel ?? "hourly",
      billing_rate_per_hour: c.billingRatePerHour, per_project_rate: c.perProjectRate ?? 0,
      project_type_rates: c.projectTypeRates ?? [],
      allowed_project_type_ids: c.allowedProjectTypeIds ?? [],
      default_project_type_id: c.defaultProjectTypeId ?? "",
      role_billing_multipliers: c.roleBillingMultipliers ?? [],
    }).select().single();
    if (error) throw new Error(error.message);
    const client = rowToClient(row);
    setRawData(d => ({ ...d, clients: [...d.clients, client].sort((a, b) => a.company.localeCompare(b.company)) }));
    return client;
  }, [orgId]);

  const updateClient = useCallback(async (id: string, c: Partial<Client>) => {
    const patch: any = {};
    if (c.company !== undefined) patch.company = c.company;
    if (c.contactName !== undefined) patch.contact_name = c.contactName;
    if (c.phone !== undefined) patch.phone = c.phone;
    if (c.email !== undefined) patch.email = c.email;
    if (c.address !== undefined) patch.address = c.address;
    if (c.city !== undefined) patch.city = c.city;
    if (c.state !== undefined) patch.state = c.state;
    if (c.zip !== undefined) patch.zip = c.zip;
    if (c.billingModel !== undefined) patch.billing_model = c.billingModel;
    if (c.billingRatePerHour !== undefined) patch.billing_rate_per_hour = c.billingRatePerHour;
    if (c.perProjectRate !== undefined) patch.per_project_rate = c.perProjectRate;
    if (c.projectTypeRates !== undefined) patch.project_type_rates = c.projectTypeRates;
    if (c.allowedProjectTypeIds !== undefined) patch.allowed_project_type_ids = c.allowedProjectTypeIds;
    if (c.defaultProjectTypeId !== undefined) patch.default_project_type_id = c.defaultProjectTypeId;
    if (c.roleBillingMultipliers !== undefined) patch.role_billing_multipliers = c.roleBillingMultipliers;
    if (c.partnerSplit !== undefined) patch.partner_split = c.partnerSplit;
    const { error } = await supabase.from("clients").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
    setRawData(d => ({ ...d, clients: d.clients.map(x => x.id === id ? { ...x, ...c } : x) }));
  }, []);

  const deleteClient = useCallback(async (id: string) => {
    const { error } = await supabase.from("clients").delete().eq("id", id);
    if (error) throw new Error(error.message);
    setRawData(d => ({ ...d, clients: d.clients.filter(x => x.id !== id) }));
  }, []);

  // ---- Crew ----
  const addCrewMember = useCallback(async (c: Omit<CrewMember, "id">): Promise<CrewMember> => {
    const id = nanoid(10);
    const { data: row, error } = await supabase.from("crew_members").insert({
      id, ...(orgId ? { org_id: orgId } : {}), name: c.name, role_rates: c.roleRates ?? [], phone: c.phone, email: c.email,
      default_pay_rate_per_hour: c.defaultPayRatePerHour, home_address: c.homeAddress || null,
    }).select().single();
    if (error) throw new Error(error.message);
    const member = rowToCrew(row);
    setRawData(d => ({ ...d, crewMembers: [...d.crewMembers, member].sort((a, b) => a.name.localeCompare(b.name)) }));
    return member;
  }, [orgId]);

  const updateCrewMember = useCallback(async (id: string, c: Partial<CrewMember>) => {
    const patch: any = {};
    if (c.name !== undefined) patch.name = c.name;
    if (c.roleRates !== undefined) patch.role_rates = c.roleRates;
    if (c.phone !== undefined) patch.phone = c.phone;
    if (c.email !== undefined) patch.email = c.email;
    if (c.defaultPayRatePerHour !== undefined) patch.default_pay_rate_per_hour = c.defaultPayRatePerHour;
    if (c.homeAddress !== undefined) patch.home_address = c.homeAddress;
    if (c.businessName !== undefined) patch.business_name = c.businessName;
    if (c.businessAddress !== undefined) patch.business_address = c.businessAddress;
    if (c.businessCity !== undefined) patch.business_city = c.businessCity;
    if (c.businessState !== undefined) patch.business_state = c.businessState;
    if (c.businessZip !== undefined) patch.business_zip = c.businessZip;
    if (c.taxId !== undefined) patch.tax_id = c.taxId;
    if (c.taxIdType !== undefined) patch.tax_id_type = c.taxIdType;
    if (c.w9Url !== undefined) patch.w9_url = c.w9Url;
    const { error } = await supabase.from("crew_members").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
    setRawData(d => ({ ...d, crewMembers: d.crewMembers.map(x => x.id === id ? { ...x, ...c } : x) }));
  }, []);

  const deleteCrewMember = useCallback(async (id: string) => {
    const { error } = await supabase.from("crew_members").delete().eq("id", id);
    if (error) throw new Error(error.message);
    setRawData(d => ({ ...d, crewMembers: d.crewMembers.filter(x => x.id !== id) }));
  }, []);

  // ---- Time Entries ----
  const addTimeEntry = useCallback(async (t: Omit<TimeEntry, "id" | "createdAt">): Promise<TimeEntry> => {
    const id = nanoid(10);
    const { data: row, error } = await supabase.from("time_entries").insert({
      id, ...(orgId ? { org_id: orgId } : {}), crew_member_id: t.crewMemberId, project_id: t.projectId,
      start_time: t.startTime, end_time: t.endTime, duration_minutes: t.durationMinutes,
      auto_stopped: t.autoStopped, paused_at: t.pausedAt, total_paused_ms: t.totalPausedMs,
      notes: t.notes,
    }).select().single();
    if (error) throw new Error(error.message);
    const entry = rowToTimeEntry(row);
    setRawData(d => ({ ...d, timeEntries: [entry, ...d.timeEntries] }));
    return entry;
  }, [orgId]);

  const updateTimeEntry = useCallback(async (id: string, t: Partial<TimeEntry>) => {
    const patch: any = {};
    if (t.endTime !== undefined) patch.end_time = t.endTime;
    if (t.durationMinutes !== undefined) patch.duration_minutes = t.durationMinutes;
    if (t.autoStopped !== undefined) patch.auto_stopped = t.autoStopped;
    if (t.pausedAt !== undefined) patch.paused_at = t.pausedAt;
    if (t.totalPausedMs !== undefined) patch.total_paused_ms = t.totalPausedMs;
    if (t.notes !== undefined) patch.notes = t.notes;
    const { error } = await supabase.from("time_entries").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
    setRawData(d => ({ ...d, timeEntries: d.timeEntries.map(x => x.id === id ? { ...x, ...t } : x) }));
  }, []);

  // ---- Contract Templates ----
  const addContractTemplate = useCallback(async (t: Omit<ContractTemplate, "id" | "createdAt" | "updatedAt">): Promise<ContractTemplate> => {
    const id = nanoid(10);
    const now = new Date().toISOString();
    const { data: row, error } = await supabase.from("contract_templates").insert({
      id, ...(orgId ? { org_id: orgId } : {}), name: t.name, content: t.content, updated_at: now,
    }).select().single();
    if (error) throw new Error(error.message);
    const tpl = rowToContractTemplate(row);
    setRawData(d => ({ ...d, contractTemplates: [tpl, ...d.contractTemplates] }));
    return tpl;
  }, [orgId]);

  const updateContractTemplate = useCallback(async (id: string, t: Partial<ContractTemplate>) => {
    const patch: any = { updated_at: new Date().toISOString() };
    if (t.name !== undefined) patch.name = t.name;
    if (t.content !== undefined) patch.content = t.content;
    const { error } = await supabase.from("contract_templates").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
    setRawData(d => ({ ...d, contractTemplates: d.contractTemplates.map(x => x.id === id ? { ...x, ...t, updatedAt: patch.updated_at } : x) }));
  }, []);

  const deleteContractTemplate = useCallback(async (id: string) => {
    const { error } = await supabase.from("contract_templates").update({ deleted_at: new Date().toISOString() }).eq("id", id);
    if (error) throw new Error(error.message);
    setRawData(d => ({ ...d, contractTemplates: d.contractTemplates.filter(x => x.id !== id) }));
  }, []);

  // ---- Contracts ----
  const addContract = useCallback(async (c: Omit<Contract, "id" | "createdAt" | "updatedAt">): Promise<Contract> => {
    const id = nanoid(10);
    const now = new Date().toISOString();
    const { data: row, error } = await supabase.from("contracts").insert({
      id, ...(orgId ? { org_id: orgId } : {}), template_id: c.templateId, client_id: c.clientId,
      project_id: c.projectId, title: c.title, content: c.content, status: c.status,
      sent_at: c.sentAt, client_email: c.clientEmail, sign_token: c.signToken,
      client_signature: c.clientSignature, owner_signature: c.ownerSignature,
      client_signed_at: c.clientSignedAt, owner_signed_at: c.ownerSignedAt,
      updated_at: now,
    }).select().single();
    if (error) throw new Error(error.message);
    const contract = rowToContract(row);
    setRawData(d => ({ ...d, contracts: [contract, ...d.contracts] }));
    return contract;
  }, [orgId]);

  const updateContract = useCallback(async (id: string, c: Partial<Contract>) => {
    const patch: any = { updated_at: new Date().toISOString() };
    if (c.title !== undefined) patch.title = c.title;
    if (c.content !== undefined) patch.content = c.content;
    if (c.status !== undefined) patch.status = c.status;
    if (c.sentAt !== undefined) patch.sent_at = c.sentAt;
    if (c.clientEmail !== undefined) patch.client_email = c.clientEmail;
    if (c.signToken !== undefined) patch.sign_token = c.signToken;
    if (c.clientSignature !== undefined) patch.client_signature = c.clientSignature;
    if (c.ownerSignature !== undefined) patch.owner_signature = c.ownerSignature;
    if (c.clientSignedAt !== undefined) patch.client_signed_at = c.clientSignedAt;
    if (c.ownerSignedAt !== undefined) patch.owner_signed_at = c.ownerSignedAt;
    if (c.clientId !== undefined) patch.client_id = c.clientId;
    if (c.projectId !== undefined) patch.project_id = c.projectId;
    const { error } = await supabase.from("contracts").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
    setRawData(d => ({ ...d, contracts: d.contracts.map(x => x.id === id ? { ...x, ...c, updatedAt: patch.updated_at } : x) }));
  }, []);

  const deleteContract = useCallback(async (id: string) => {
    const { error } = await supabase.from("contracts").update({ deleted_at: new Date().toISOString() }).eq("id", id);
    if (error) throw new Error(error.message);
    setRawData(d => ({ ...d, contracts: d.contracts.filter(x => x.id !== id) }));
  }, []);

  // ---- Proposal Templates ----
  const addProposalTemplate = useCallback(async (t: Omit<ProposalTemplate, "id" | "createdAt" | "updatedAt">): Promise<ProposalTemplate> => {
    const id = nanoid(10);
    const now = new Date().toISOString();
    const { data: row, error } = await supabase.from("proposal_templates").insert({
      id, ...(orgId ? { org_id: orgId } : {}), name: t.name,
      cover_image_url: t.coverImageUrl || "", pages: t.pages || [], packages: t.packages || [],
      line_items: t.lineItems, contract_content: t.contractContent,
      payment_config: t.paymentConfig, notes: t.notes, updated_at: now,
    }).select().single();
    if (error) throw new Error(error.message);
    const tpl = rowToProposalTemplate(row);
    setRawData(d => ({ ...d, proposalTemplates: [tpl, ...d.proposalTemplates] }));
    return tpl;
  }, [orgId]);

  const updateProposalTemplate = useCallback(async (id: string, t: Partial<ProposalTemplate>) => {
    const patch: any = { updated_at: new Date().toISOString() };
    if (t.name !== undefined) patch.name = t.name;
    if (t.coverImageUrl !== undefined) patch.cover_image_url = t.coverImageUrl;
    if (t.pages !== undefined) patch.pages = t.pages;
    if (t.packages !== undefined) patch.packages = t.packages;
    if (t.lineItems !== undefined) patch.line_items = t.lineItems;
    if (t.contractContent !== undefined) patch.contract_content = t.contractContent;
    if (t.paymentConfig !== undefined) patch.payment_config = t.paymentConfig;
    if (t.notes !== undefined) patch.notes = t.notes;
    const { error } = await supabase.from("proposal_templates").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
    setRawData(d => ({ ...d, proposalTemplates: d.proposalTemplates.map(x => x.id === id ? { ...x, ...t, updatedAt: patch.updated_at } : x) }));
  }, []);

  const deleteProposalTemplate = useCallback(async (id: string) => {
    const { error } = await supabase.from("proposal_templates").update({ deleted_at: new Date().toISOString() }).eq("id", id);
    if (error) throw new Error(error.message);
    setRawData(d => ({ ...d, proposalTemplates: d.proposalTemplates.filter(x => x.id !== id) }));
  }, []);

  // ---- Proposals ----
  const addProposal = useCallback(async (p: Omit<Proposal, "id" | "createdAt" | "updatedAt">): Promise<Proposal> => {
    const id = nanoid(10);
    const now = new Date().toISOString();
    const { data: row, error } = await supabase.from("proposals").insert({
      id, ...(orgId ? { org_id: orgId } : {}),
      client_id: p.clientId, project_id: p.projectId, title: p.title,
      pages: p.pages || [], packages: p.packages || [],
      selected_package_id: p.selectedPackageId, payment_milestones: p.paymentMilestones || [],
      pipeline_stage: p.pipelineStage || "inquiry", lead_source: p.leadSource || "",
      line_items: p.lineItems, subtotal: p.subtotal, tax_rate: p.taxRate,
      tax_amount: p.taxAmount, total: p.total,
      contract_content: p.contractContent, payment_config: p.paymentConfig,
      status: p.status, sent_at: p.sentAt, client_email: p.clientEmail,
      view_token: p.viewToken, notes: p.notes, updated_at: now,
    }).select().single();
    if (error) throw new Error(error.message);
    const proposal = rowToProposal(row);
    setRawData(d => ({ ...d, proposals: [proposal, ...d.proposals] }));
    return proposal;
  }, [orgId]);

  const updateProposal = useCallback(async (id: string, p: Partial<Proposal>) => {
    const patch: any = { updated_at: new Date().toISOString() };
    if (p.title !== undefined) patch.title = p.title;
    if (p.clientId !== undefined) patch.client_id = p.clientId;
    if (p.projectId !== undefined) patch.project_id = p.projectId;
    if (p.pages !== undefined) patch.pages = p.pages;
    if (p.packages !== undefined) patch.packages = p.packages;
    if (p.selectedPackageId !== undefined) patch.selected_package_id = p.selectedPackageId;
    if (p.paymentMilestones !== undefined) patch.payment_milestones = p.paymentMilestones;
    if (p.pipelineStage !== undefined) patch.pipeline_stage = p.pipelineStage;
    if (p.viewedAt !== undefined) patch.viewed_at = p.viewedAt;
    if (p.leadSource !== undefined) patch.lead_source = p.leadSource;
    if (p.lineItems !== undefined) patch.line_items = p.lineItems;
    if (p.subtotal !== undefined) patch.subtotal = p.subtotal;
    if (p.taxRate !== undefined) patch.tax_rate = p.taxRate;
    if (p.taxAmount !== undefined) patch.tax_amount = p.taxAmount;
    if (p.total !== undefined) patch.total = p.total;
    if (p.contractContent !== undefined) patch.contract_content = p.contractContent;
    if (p.paymentConfig !== undefined) patch.payment_config = p.paymentConfig;
    if (p.status !== undefined) patch.status = p.status;
    if (p.sentAt !== undefined) patch.sent_at = p.sentAt;
    if (p.acceptedAt !== undefined) patch.accepted_at = p.acceptedAt;
    if (p.completedAt !== undefined) patch.completed_at = p.completedAt;
    if (p.clientSignature !== undefined) patch.client_signature = p.clientSignature;
    if (p.ownerSignature !== undefined) patch.owner_signature = p.ownerSignature;
    if (p.invoiceId !== undefined) patch.invoice_id = p.invoiceId;
    if (p.stripeSessionId !== undefined) patch.stripe_session_id = p.stripeSessionId;
    if (p.paidAt !== undefined) patch.paid_at = p.paidAt;
    if (p.clientEmail !== undefined) patch.client_email = p.clientEmail;
    if (p.notes !== undefined) patch.notes = p.notes;
    const { error } = await supabase.from("proposals").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
    setRawData(d => ({ ...d, proposals: d.proposals.map(x => x.id === id ? { ...x, ...p, updatedAt: patch.updated_at } : x) }));
  }, []);

  const deleteProposal = useCallback(async (id: string) => {
    const { error } = await supabase.from("proposals").update({ deleted_at: new Date().toISOString() }).eq("id", id);
    if (error) throw new Error(error.message);
    setRawData(d => ({ ...d, proposals: d.proposals.filter(x => x.id !== id) }));
  }, []);

  // ---- Pipeline Leads ----
  const addPipelineLead = useCallback(async (l: Omit<PipelineLead, "id" | "createdAt" | "updatedAt">): Promise<PipelineLead> => {
    const id = nanoid(10);
    const now = new Date().toISOString();
    const { data: row, error } = await supabase.from("pipeline_leads").insert({
      id, ...(orgId ? { org_id: orgId } : {}),
      client_id: l.clientId, name: l.name, email: l.email, phone: l.phone,
      project_type: l.projectType, event_date: l.eventDate,
      location: l.location, description: l.description,
      lead_source: l.leadSource, pipeline_stage: l.pipelineStage,
      proposal_id: l.proposalId, recent_activity: l.recentActivity,
      recent_activity_at: l.recentActivityAt, updated_at: now,
    }).select().single();
    if (error) throw new Error(error.message);
    const lead = rowToPipelineLead(row);
    setRawData(d => ({ ...d, pipelineLeads: [lead, ...d.pipelineLeads] }));
    return lead;
  }, [orgId]);

  const updatePipelineLead = useCallback(async (id: string, l: Partial<PipelineLead>) => {
    const patch: any = { updated_at: new Date().toISOString() };
    if (l.name !== undefined) patch.name = l.name;
    if (l.email !== undefined) patch.email = l.email;
    if (l.phone !== undefined) patch.phone = l.phone;
    if (l.clientId !== undefined) patch.client_id = l.clientId;
    if (l.projectType !== undefined) patch.project_type = l.projectType;
    if (l.eventDate !== undefined) patch.event_date = l.eventDate;
    if (l.location !== undefined) patch.location = l.location;
    if (l.description !== undefined) patch.description = l.description;
    if (l.leadSource !== undefined) patch.lead_source = l.leadSource;
    if (l.pipelineStage !== undefined) patch.pipeline_stage = l.pipelineStage;
    if (l.proposalId !== undefined) patch.proposal_id = l.proposalId;
    if (l.recentActivity !== undefined) patch.recent_activity = l.recentActivity;
    if (l.recentActivityAt !== undefined) patch.recent_activity_at = l.recentActivityAt;
    const { error } = await supabase.from("pipeline_leads").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
    setRawData(d => ({ ...d, pipelineLeads: d.pipelineLeads.map(x => x.id === id ? { ...x, ...l, updatedAt: patch.updated_at } : x) }));
  }, []);

  const deletePipelineLead = useCallback(async (id: string) => {
    const { error } = await supabase.from("pipeline_leads").update({ deleted_at: new Date().toISOString() }).eq("id", id);
    if (error) throw new Error(error.message);
    setRawData(d => ({ ...d, pipelineLeads: d.pipelineLeads.filter(x => x.id !== id) }));
  }, []);

  // ---- Personal Events ----
  const addPersonalEvent = useCallback(async (e: Omit<PersonalEvent, "id" | "createdAt">): Promise<PersonalEvent> => {
    const id = `pe_${Date.now()}`;
    const { data: row, error } = await supabase.from("personal_events").insert({
      id, ...(orgId ? { org_id: orgId } : {}),
      title: e.title, date: e.date,
      start_time: e.startTime || "", end_time: e.endTime || "",
      all_day: e.allDay ?? !e.startTime,
      location: e.location || "", notes: e.notes || "",
      category: e.category || "personal",
      color: e.color || "",
      priority: e.priority ?? false,
    }).select().single();
    if (error) throw new Error(error.message);
    const evt = rowToPersonalEvent(row);
    setRawData(d => ({ ...d, personalEvents: [...d.personalEvents, evt].sort((a, b) => a.date.localeCompare(b.date)) }));
    return evt;
  }, [orgId]);

  const updatePersonalEvent = useCallback(async (id: string, e: Partial<PersonalEvent>) => {
    const patch: any = {};
    if (e.title !== undefined) patch.title = e.title;
    if (e.date !== undefined) patch.date = e.date;
    if (e.startTime !== undefined) patch.start_time = e.startTime;
    if (e.endTime !== undefined) patch.end_time = e.endTime;
    if (e.allDay !== undefined) patch.all_day = e.allDay;
    if (e.location !== undefined) patch.location = e.location;
    if (e.notes !== undefined) patch.notes = e.notes;
    if (e.category !== undefined) patch.category = e.category;
    if (e.color !== undefined) patch.color = e.color;
    if (e.priority !== undefined) patch.priority = e.priority;
    const { error } = await supabase.from("personal_events").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
    setRawData(d => ({ ...d, personalEvents: d.personalEvents.map(x => x.id === id ? { ...x, ...e } : x) }));
  }, []);

  const deletePersonalEvent = useCallback(async (id: string) => {
    const { error } = await supabase.from("personal_events").delete().eq("id", id);
    if (error) throw new Error(error.message);
    setRawData(d => ({ ...d, personalEvents: d.personalEvents.filter(x => x.id !== id) }));
  }, []);

  // ---- Trash ----
  const restoreItem = useCallback(async (table: string, id: string) => {
    const { error } = await supabase.from(table).update({ deleted_at: null }).eq("id", id);
    if (error) throw new Error(error.message);
    // Trigger a reload by toggling a state — the useEffect on orgId will re-fetch
    window.location.reload();
  }, []);

  const permanentlyDelete = useCallback(async (table: string, id: string) => {
    const { error } = await supabase.from(table).delete().eq("id", id);
    if (error) throw new Error(error.message);
  }, []);

  // ---- Organization ----
  const updateOrganization = useCallback(async (updates: Partial<Organization>) => {
    if (!orgId) return;
    const patch: any = {};
    if (updates.name !== undefined) patch.name = updates.name;
    if (updates.features !== undefined) patch.features = updates.features;
    if (updates.productionType !== undefined) patch.production_type = updates.productionType;
    if (updates.defaultBillingModel !== undefined) patch.default_billing_model = updates.defaultBillingModel;
    if (updates.defaultBillingRate !== undefined) patch.default_billing_rate = updates.defaultBillingRate;
    if (updates.businessInfo !== undefined) patch.business_info = updates.businessInfo;
    if (updates.dashboardWidgets !== undefined) patch.dashboard_widgets = updates.dashboardWidgets;
    if (updates.pipelineStages !== undefined) patch.pipeline_stages = updates.pipelineStages;
    if (updates.services !== undefined) patch.services = updates.services;
    const { error } = await supabase.from("organizations").update(patch).eq("id", orgId);
    if (error) throw new Error(error.message);
    setRawData(d => ({ ...d, organization: d.organization ? { ...d.organization, ...updates } : null }));
  }, [orgId]);

  // ---- Crew Location Distances ----
  const upsertDistance = useCallback(async (crewMemberId: string, locationId: string, distanceMiles: number) => {
    const id = `${crewMemberId}_${locationId}`;
    const { error } = await supabase.from("crew_location_distances").upsert({
      id, ...(orgId ? { org_id: orgId } : {}), crew_member_id: crewMemberId, location_id: locationId, distance_miles: distanceMiles,
    }, { onConflict: "crew_member_id,location_id" });
    if (error) throw new Error(error.message);
    setRawData(d => {
      const existing = d.crewLocationDistances.find(x => x.crewMemberId === crewMemberId && x.locationId === locationId);
      if (existing) {
        return { ...d, crewLocationDistances: d.crewLocationDistances.map(x => x.id === existing.id ? { ...x, distanceMiles } : x) };
      }
      return { ...d, crewLocationDistances: [...d.crewLocationDistances, { id, crewMemberId, locationId, distanceMiles, createdAt: new Date().toISOString() }] };
    });
  }, [orgId]);

  // ---- Manual Trips ----
  const addManualTrip = useCallback(async (t: Omit<ManualTrip, "id" | "createdAt">): Promise<ManualTrip> => {
    const id = nanoid(10);
    const { data: row, error } = await supabase.from("manual_trips").insert({
      id, ...(orgId ? { org_id: orgId } : {}), crew_member_id: t.crewMemberId, date: t.date, destination: t.destination,
      location_id: t.locationId || null, purpose: t.purpose, round_trip_miles: t.roundTripMiles,
    }).select().single();
    if (error) throw new Error(error.message);
    const trip = rowToManualTrip(row);
    setRawData(d => ({ ...d, manualTrips: [trip, ...d.manualTrips] }));
    return trip;
  }, [orgId]);

  const deleteManualTrip = useCallback(async (id: string) => {
    const { error } = await supabase.from("manual_trips").delete().eq("id", id);
    if (error) throw new Error(error.message);
    setRawData(d => ({ ...d, manualTrips: d.manualTrips.filter(x => x.id !== id) }));
  }, []);

  // ---- Business Expenses ----
  const addBusinessExpense = useCallback(async (e: Omit<BusinessExpense, "id" | "createdAt">): Promise<BusinessExpense> => {
    const id = nanoid(10);
    const { data: row, error } = await supabase.from("business_expenses").insert({
      id, ...(orgId ? { org_id: orgId } : {}), date: e.date, description: e.description,
      category: e.category, amount: e.amount, serial_number: e.serialNumber || "",
      notes: e.notes || "", chase_category: e.chaseCategory || "",
    }).select().single();
    if (error) throw new Error(error.message);
    const expense = rowToBusinessExpense(row);
    setRawData(d => ({ ...d, businessExpenses: [expense, ...d.businessExpenses] }));
    return expense;
  }, [orgId]);

  const addBusinessExpenses = useCallback(async (expenses: Omit<BusinessExpense, "id" | "createdAt">[]) => {
    const rows = expenses.map(e => ({
      id: nanoid(10), ...(orgId ? { org_id: orgId } : {}), date: e.date, description: e.description,
      category: e.category, amount: e.amount, serial_number: e.serialNumber || "",
      notes: e.notes || "", chase_category: e.chaseCategory || "",
    }));
    const { data: inserted, error } = await supabase.from("business_expenses").insert(rows).select();
    if (error) throw new Error(error.message);
    const newExpenses = (inserted || []).map(rowToBusinessExpense);
    setRawData(d => ({ ...d, businessExpenses: [...newExpenses, ...d.businessExpenses] }));
  }, [orgId]);

  const updateBusinessExpense = useCallback(async (id: string, e: Partial<BusinessExpense>) => {
    const patch: any = {};
    if (e.date !== undefined) patch.date = e.date;
    if (e.description !== undefined) patch.description = e.description;
    if (e.category !== undefined) patch.category = e.category;
    if (e.amount !== undefined) patch.amount = e.amount;
    if (e.serialNumber !== undefined) patch.serial_number = e.serialNumber;
    if (e.notes !== undefined) patch.notes = e.notes;
    const { error } = await supabase.from("business_expenses").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
    setRawData(d => ({ ...d, businessExpenses: d.businessExpenses.map(x => x.id === id ? { ...x, ...e } : x) }));
  }, []);

  const deleteBusinessExpense = useCallback(async (id: string) => {
    const { error } = await supabase.from("business_expenses").delete().eq("id", id);
    if (error) throw new Error(error.message);
    setRawData(d => ({ ...d, businessExpenses: d.businessExpenses.filter(x => x.id !== id) }));
  }, []);

  // ---- Category Rules ----
  const upsertCategoryRule = useCallback(async (keyword: string, category: BusinessExpenseCategory) => {
    const id = nanoid(10);
    const { error } = await supabase.from("category_rules").upsert({
      id, ...(orgId ? { org_id: orgId } : {}), keyword: keyword.toUpperCase(), category,
    }, { onConflict: "org_id,keyword" });
    if (error) throw new Error(error.message);
    setRawData(d => {
      const existing = d.categoryRules.find(r => r.keyword === keyword.toUpperCase());
      if (existing) {
        return { ...d, categoryRules: d.categoryRules.map(r => r.keyword === keyword.toUpperCase() ? { ...r, category } : r) };
      }
      return { ...d, categoryRules: [...d.categoryRules, { id, keyword: keyword.toUpperCase(), category, createdAt: new Date().toISOString() }] };
    });
  }, [orgId]);

  // ---- Locations ----
  const addLocation = useCallback(async (l: Omit<Location, "id">): Promise<Location> => {
    const id = nanoid(10);
    const { data: row, error } = await supabase.from("locations").insert({
      id, ...(orgId ? { org_id: orgId } : {}), name: l.name, address: l.address, city: l.city, state: l.state, zip: l.zip, one_time_use: l.oneTimeUse || false,
    }).select().single();
    if (error) throw new Error(error.message);
    const loc = rowToLocation(row);
    setRawData(d => ({ ...d, locations: [...d.locations, loc].sort((a, b) => a.name.localeCompare(b.name)) }));
    return loc;
  }, [orgId]);

  const updateLocation = useCallback(async (id: string, l: Partial<Location>) => {
    // Map camelCase to snake_case for Supabase
    const dbFields: Record<string, any> = {};
    if (l.name !== undefined) dbFields.name = l.name;
    if (l.address !== undefined) dbFields.address = l.address;
    if (l.city !== undefined) dbFields.city = l.city;
    if (l.state !== undefined) dbFields.state = l.state;
    if (l.zip !== undefined) dbFields.zip = l.zip;
    if (l.oneTimeUse !== undefined) dbFields.one_time_use = l.oneTimeUse;
    const { error } = await supabase.from("locations").update(dbFields).eq("id", id);
    if (error) throw new Error(error.message);
    setRawData(d => ({ ...d, locations: d.locations.map(x => x.id === id ? { ...x, ...l } : x) }));
  }, []);

  const deleteLocation = useCallback(async (id: string) => {
    const { error } = await supabase.from("locations").delete().eq("id", id);
    if (error) throw new Error(error.message);
    setRawData(d => ({ ...d, locations: d.locations.filter(x => x.id !== id) }));
  }, []);

  // ---- Project Types ----
  const addProjectType = useCallback(async (pt: Omit<ProjectType, "id">): Promise<ProjectType> => {
    const id = nanoid(10);
    const { data: row, error } = await supabase.from("project_types").insert({ id, ...(orgId ? { org_id: orgId } : {}), name: pt.name, lightweight: pt.lightweight || false }).select().single();
    if (error) throw new Error(error.message);
    const type = rowToProjectType(row);
    setRawData(d => ({ ...d, projectTypes: [...d.projectTypes, type].sort((a, b) => a.name.localeCompare(b.name)) }));
    return type;
  }, [orgId]);

  const updateProjectType = useCallback(async (id: string, pt: Partial<ProjectType>) => {
    const dbFields: Record<string, any> = {};
    if (pt.name !== undefined) dbFields.name = pt.name;
    if (pt.lightweight !== undefined) dbFields.lightweight = pt.lightweight;
    const { error } = await supabase.from("project_types").update(dbFields).eq("id", id);
    if (error) throw new Error(error.message);
    setRawData(d => ({ ...d, projectTypes: d.projectTypes.map(x => x.id === id ? { ...x, ...pt } : x) }));
  }, []);

  const deleteProjectType = useCallback(async (id: string) => {
    const { error } = await supabase.from("project_types").delete().eq("id", id);
    if (error) throw new Error(error.message);
    setRawData(d => ({ ...d, projectTypes: d.projectTypes.filter(x => x.id !== id) }));
  }, []);

  // ---- Edit Types ----
  const addEditType = useCallback(async (et: Omit<EditType, "id">): Promise<EditType> => {
    const id = nanoid(10);
    const { data: row, error } = await supabase.from("edit_types").insert({ id, ...(orgId ? { org_id: orgId } : {}), name: et.name }).select().single();
    if (error) throw new Error(error.message);
    const type = rowToEditType(row);
    setRawData(d => ({ ...d, editTypes: [...d.editTypes, type].sort((a, b) => a.name.localeCompare(b.name)) }));
    return type;
  }, [orgId]);

  const updateEditType = useCallback(async (id: string, et: Partial<EditType>) => {
    const dbFields: Record<string, any> = {};
    if (et.name !== undefined) dbFields.name = et.name;
    const { error } = await supabase.from("edit_types").update(dbFields).eq("id", id);
    if (error) throw new Error(error.message);
    setRawData(d => ({ ...d, editTypes: d.editTypes.map(x => x.id === id ? { ...x, ...et } : x) }));
  }, []);

  const deleteEditType = useCallback(async (id: string) => {
    const { error } = await supabase.from("edit_types").delete().eq("id", id);
    if (error) throw new Error(error.message);
    setRawData(d => ({ ...d, editTypes: d.editTypes.filter(x => x.id !== id) }));
  }, []);

  // ---- Projects ----
  const addProject = useCallback(async (p: Omit<Project, "id" | "createdAt">): Promise<Project> => {
    const id = nanoid(10);
    const { data: row, error } = await supabase.from("projects").insert({
      id,
      ...(orgId ? { org_id: orgId } : {}),
      client_id: p.clientId,
      project_type_id: p.projectTypeId,
      location_id: p.locationId || null,
      date: p.date,
      start_time: p.startTime,
      end_time: p.endTime,
      status: p.status,
      crew: p.crew,
      post_production: p.postProduction,
      editor_billing: p.editorBilling || null,
      project_rate: p.projectRate ?? null,
      billing_model: p.billingModel ?? null,
      billing_rate: p.billingRate ?? null,
      paid_date: p.paidDate || null,
      edit_types: p.editTypes,
      notes: p.notes,
      deliverable_url: p.deliverableUrl || "",
    }).select().single();
    if (error) throw new Error(error.message);
    const project = rowToProject(row);
    setRawData(d => ({ ...d, projects: [...d.projects, project].sort((a, b) => a.date.localeCompare(b.date)) }));
    return project;
  }, [orgId]);

  const updateProject = useCallback(async (id: string, p: Partial<Project>) => {
    const patch: any = {};
    if (p.clientId !== undefined) patch.client_id = p.clientId;
    if (p.projectTypeId !== undefined) patch.project_type_id = p.projectTypeId;
    if (p.locationId !== undefined) patch.location_id = p.locationId || null;
    if (p.date !== undefined) patch.date = p.date;
    if (p.startTime !== undefined) patch.start_time = p.startTime;
    if (p.endTime !== undefined) patch.end_time = p.endTime;
    if (p.status !== undefined) patch.status = p.status;
    if (p.crew !== undefined) patch.crew = p.crew;
    if (p.postProduction !== undefined) patch.post_production = p.postProduction;
    if (p.editorBilling !== undefined) patch.editor_billing = p.editorBilling;
    // Auto-finalize editor billing when project is completed
    if (p.status === "completed" && !patch.editor_billing) {
      const { data: current } = await supabase.from("projects").select("editor_billing").eq("id", id).single();
      if (current?.editor_billing && !current.editor_billing.finalized) {
        patch.editor_billing = { ...current.editor_billing, finalized: true };
      }
    }
    if (p.projectRate !== undefined) patch.project_rate = p.projectRate;
    if (p.billingModel !== undefined) patch.billing_model = p.billingModel;
    if (p.billingRate !== undefined) patch.billing_rate = p.billingRate;
    if (p.paidDate !== undefined) patch.paid_date = p.paidDate;
    if (p.editTypes !== undefined) patch.edit_types = p.editTypes;
    if (p.notes !== undefined) patch.notes = p.notes;
    if (p.deliverableUrl !== undefined) patch.deliverable_url = p.deliverableUrl;
    const { data: updated, error } = await supabase.from("projects").update(patch).eq("id", id).select().single();
    if (error) throw new Error(error.message);
    if (!updated) throw new Error("Update failed — row not returned (possible RLS restriction)");
    const normalized = rowToProject(updated);
    setRawData(d => ({ ...d, projects: d.projects.map(x => x.id === id ? normalized : x) }));
  }, []);

  const deleteProject = useCallback(async (id: string) => {
    const { error } = await supabase.from("projects").delete().eq("id", id);
    if (error) throw new Error(error.message);
    setRawData(d => ({ ...d, projects: d.projects.filter(x => x.id !== id) }));
  }, []);

  // ---- Marketing Expenses ----
  const addMarketingExpense = useCallback(async (e: Omit<MarketingExpense, "id" | "createdAt">): Promise<MarketingExpense> => {
    const id = nanoid(10);
    const { data: row, error } = await supabase.from("marketing_expenses").insert({
      id, ...(orgId ? { org_id: orgId } : {}), client_id: e.clientId, date: e.date, category: e.category,
      description: e.description, notes: e.notes, amount: e.amount,
    }).select().single();
    if (error) throw new Error(error.message);
    const expense = rowToExpense(row);
    setRawData(d => ({ ...d, marketingExpenses: [expense, ...d.marketingExpenses].sort((a, b) => b.date.localeCompare(a.date)) }));
    return expense;
  }, [orgId]);

  const deleteMarketingExpense = useCallback(async (id: string) => {
    const { error } = await supabase.from("marketing_expenses").delete().eq("id", id);
    if (error) throw new Error(error.message);
    setRawData(d => ({ ...d, marketingExpenses: d.marketingExpenses.filter(x => x.id !== id) }));
  }, []);

  // ---- Invoices ----
  const addInvoice = useCallback(async (inv: Omit<Invoice, "id" | "createdAt" | "updatedAt">): Promise<Invoice> => {
    const id = nanoid(10);
    const { data: row, error } = await supabase.from("invoices").insert({
      id,
      ...(orgId ? { org_id: orgId } : {}),
      invoice_number: inv.invoiceNumber,
      client_id: inv.clientId,
      period_start: inv.periodStart,
      period_end: inv.periodEnd,
      subtotal: inv.subtotal,
      tax_rate: inv.taxRate,
      tax_amount: inv.taxAmount,
      total: inv.total,
      status: inv.status,
      issue_date: inv.issueDate,
      due_date: inv.dueDate,
      paid_date: inv.paidDate,
      line_items: inv.lineItems,
      company_info: inv.companyInfo,
      client_info: inv.clientInfo,
      notes: inv.notes,
    }).select().single();
    if (error) throw new Error(error.message);
    const invoice = rowToInvoice(row);
    setRawData(d => ({ ...d, invoices: [invoice, ...d.invoices] }));
    return invoice;
  }, [orgId]);

  const updateInvoice = useCallback(async (id: string, inv: Partial<Invoice>) => {
    const patch: any = {};
    if (inv.invoiceNumber !== undefined) patch.invoice_number = inv.invoiceNumber;
    if (inv.clientId !== undefined) patch.client_id = inv.clientId;
    if (inv.periodStart !== undefined) patch.period_start = inv.periodStart;
    if (inv.periodEnd !== undefined) patch.period_end = inv.periodEnd;
    if (inv.subtotal !== undefined) patch.subtotal = inv.subtotal;
    if (inv.taxRate !== undefined) patch.tax_rate = inv.taxRate;
    if (inv.taxAmount !== undefined) patch.tax_amount = inv.taxAmount;
    if (inv.total !== undefined) patch.total = inv.total;
    if (inv.status !== undefined) patch.status = inv.status;
    if (inv.issueDate !== undefined) patch.issue_date = inv.issueDate;
    if (inv.dueDate !== undefined) patch.due_date = inv.dueDate;
    if (inv.paidDate !== undefined) patch.paid_date = inv.paidDate;
    if (inv.lineItems !== undefined) patch.line_items = inv.lineItems;
    if (inv.companyInfo !== undefined) patch.company_info = inv.companyInfo;
    if (inv.clientInfo !== undefined) patch.client_info = inv.clientInfo;
    if (inv.notes !== undefined) patch.notes = inv.notes;
    patch.updated_at = new Date().toISOString();
    const { error } = await supabase.from("invoices").update(patch).eq("id", id);
    if (error) throw new Error(error.message);

    // When invoice marked paid, auto-mark all linked projects as paid
    if (inv.status === "paid") {
      const invoice = data.invoices.find(x => x.id === id);
      const projectIds = (invoice?.lineItems || []).map(li => li.projectId).filter(Boolean);
      const today = new Date().toISOString().slice(0, 10);
      for (const pid of projectIds) {
        await supabase.from("projects").update({ paid_date: today }).eq("id", pid);
      }
      setRawData(d => ({
        ...d,
        invoices: d.invoices.map(x => x.id === id ? { ...x, ...inv, updatedAt: patch.updated_at } : x),
        projects: d.projects.map(p => projectIds.includes(p.id) ? { ...p, paidDate: today } : p),
      }));
    } else {
      setRawData(d => ({ ...d, invoices: d.invoices.map(x => x.id === id ? { ...x, ...inv, updatedAt: patch.updated_at } : x) }));
    }
  }, [data.invoices]);

  const deleteInvoice = useCallback(async (id: string) => {
    const { error } = await supabase.from("invoices").update({ deleted_at: new Date().toISOString() }).eq("id", id);
    if (error) throw new Error(error.message);
    setRawData(d => ({ ...d, invoices: d.invoices.filter(x => x.id !== id) }));
  }, []);

  // ---- Contractor Invoices ----
  const addContractorInvoice = useCallback(async (inv: Omit<ContractorInvoice, "id" | "createdAt">): Promise<ContractorInvoice> => {
    const id = nanoid(10);
    const { data: row, error } = await supabase.from("contractor_invoices").insert({
      id,
      ...(orgId ? { org_id: orgId } : {}),
      crew_member_id: inv.crewMemberId,
      invoice_number: inv.invoiceNumber,
      recipient_type: inv.recipientType,
      recipient_name: inv.recipientName,
      period_start: inv.periodStart,
      period_end: inv.periodEnd,
      line_items: inv.lineItems,
      business_info: inv.businessInfo,
      total: inv.total,
      status: inv.status,
      notes: inv.notes,
    }).select().single();
    if (error) throw new Error(error.message);
    const cinv = rowToContractorInvoice(row);
    setRawData(d => ({ ...d, contractorInvoices: [cinv, ...d.contractorInvoices] }));
    return cinv;
  }, [orgId]);

  const updateContractorInvoice = useCallback(async (id: string, inv: Partial<ContractorInvoice>) => {
    const patch: any = {};
    if (inv.status !== undefined) patch.status = inv.status;
    if (inv.notes !== undefined) patch.notes = inv.notes;
    if (inv.lineItems !== undefined) patch.line_items = inv.lineItems;
    if (inv.total !== undefined) patch.total = inv.total;
    const { error } = await supabase.from("contractor_invoices").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
    setRawData(d => ({ ...d, contractorInvoices: d.contractorInvoices.map(x => x.id === id ? { ...x, ...inv } : x) }));
  }, []);

  const deleteContractorInvoice = useCallback(async (id: string) => {
    const { error } = await supabase.from("contractor_invoices").delete().eq("id", id);
    if (error) throw new Error(error.message);
    setRawData(d => ({ ...d, contractorInvoices: d.contractorInvoices.filter(x => x.id !== id) }));
  }, []);

  // ---- Series ----
  const addSeries = useCallback(async (s: Omit<Series, "id" | "createdAt">): Promise<Series> => {
    const id = nanoid(10);
    const today = new Date();
    const resetDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`;
    const { data: row, error } = await supabase.from("series").insert({
      id, ...(orgId ? { org_id: orgId } : {}), name: s.name, client_id: s.clientId, goal: s.goal, status: s.status,
      monthly_token_limit: s.monthlyTokenLimit, tokens_used_this_month: 0, token_reset_date: resetDate,
    }).select().single();
    if (error) throw new Error(error.message);
    const series = rowToSeries(row);
    setRawData(d => ({ ...d, series: [series, ...d.series] }));
    return series;
  }, [orgId]);

  const updateSeries = useCallback(async (id: string, s: Partial<Series>) => {
    const patch: any = {};
    if (s.name !== undefined) patch.name = s.name;
    if (s.clientId !== undefined) patch.client_id = s.clientId;
    if (s.goal !== undefined) patch.goal = s.goal;
    if (s.status !== undefined) patch.status = s.status;
    if (s.monthlyTokenLimit !== undefined) patch.monthly_token_limit = s.monthlyTokenLimit;
    if (s.tokensUsedThisMonth !== undefined) patch.tokens_used_this_month = s.tokensUsedThisMonth;
    if (s.tokenResetDate !== undefined) patch.token_reset_date = s.tokenResetDate;
    const { error } = await supabase.from("series").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
    setRawData(d => ({ ...d, series: d.series.map(x => x.id === id ? { ...x, ...s } : x) }));
  }, []);

  const deleteSeries = useCallback(async (id: string) => {
    const { error } = await supabase.from("series").delete().eq("id", id);
    if (error) throw new Error(error.message);
    setRawData(d => ({ ...d, series: d.series.filter(x => x.id !== id) }));
  }, []);

  // ---- Episodes ----
  const fetchEpisodes = useCallback(async (seriesId: string): Promise<SeriesEpisode[]> => {
    const { data: rows, error } = await supabase.from("series_episodes").select("*").eq("series_id", seriesId).order("episode_number");
    if (error) throw new Error(error.message);
    return (rows || []).map(rowToEpisode);
  }, []);

  const addEpisode = useCallback(async (e: Omit<SeriesEpisode, "id" | "createdAt">): Promise<SeriesEpisode> => {
    const id = nanoid(10);
    const { data: row, error } = await supabase.from("series_episodes").insert({
      id, series_id: e.seriesId, episode_number: e.episodeNumber, title: e.title,
      concept: e.concept, talking_points: e.talkingPoints, status: e.status, project_id: e.projectId,
      draft_date: e.draftDate || "", draft_start_time: e.draftStartTime || "",
      draft_end_time: e.draftEndTime || "", draft_location_id: e.draftLocationId || "",
      draft_crew: e.draftCrew || [],
    }).select().single();
    if (error) throw new Error(error.message);
    return rowToEpisode(row);
  }, []);

  const updateEpisode = useCallback(async (id: string, e: Partial<SeriesEpisode>) => {
    const patch: any = {};
    if (e.episodeNumber !== undefined) patch.episode_number = e.episodeNumber;
    if (e.title !== undefined) patch.title = e.title;
    if (e.concept !== undefined) patch.concept = e.concept;
    if (e.talkingPoints !== undefined) patch.talking_points = e.talkingPoints;
    if (e.status !== undefined) patch.status = e.status;
    if (e.projectId !== undefined) patch.project_id = e.projectId;
    if (e.draftDate !== undefined) patch.draft_date = e.draftDate;
    if (e.draftStartTime !== undefined) patch.draft_start_time = e.draftStartTime;
    if (e.draftEndTime !== undefined) patch.draft_end_time = e.draftEndTime;
    if (e.draftLocationId !== undefined) patch.draft_location_id = e.draftLocationId;
    if (e.draftCrew !== undefined) patch.draft_crew = e.draftCrew;
    const { error } = await supabase.from("series_episodes").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
  }, []);

  const deleteEpisode = useCallback(async (id: string) => {
    const { error } = await supabase.from("series_episodes").delete().eq("id", id);
    if (error) throw new Error(error.message);
  }, []);

  // ---- Series Messages ----
  const fetchMessages = useCallback(async (seriesId: string): Promise<SeriesMessage[]> => {
    const { data: rows, error } = await supabase.from("series_messages").select("*").eq("series_id", seriesId).order("created_at");
    if (error) throw new Error(error.message);
    return (rows || []).map(rowToMessage);
  }, []);

  const addMessage = useCallback(async (m: Omit<SeriesMessage, "id" | "createdAt">): Promise<SeriesMessage> => {
    const id = nanoid(10);
    const { data: row, error } = await supabase.from("series_messages").insert({
      id, series_id: m.seriesId, role: m.role, sender_name: m.senderName,
      content: m.content, tokens_used: m.tokensUsed,
    }).select().single();
    if (error) throw new Error(error.message);
    return rowToMessage(row);
  }, []);

  // ---- Episode Comments ----
  const fetchComments = useCallback(async (episodeId: string): Promise<EpisodeComment[]> => {
    const { data: rows, error } = await supabase.from("episode_comments").select("*").eq("episode_id", episodeId).order("created_at");
    if (error) throw new Error(error.message);
    return (rows || []).map(rowToComment);
  }, []);

  const addComment = useCallback(async (c: Omit<EpisodeComment, "id" | "createdAt">): Promise<EpisodeComment> => {
    const id = nanoid(10);
    const { data: row, error } = await supabase.from("episode_comments").insert({
      id, episode_id: c.episodeId, series_id: c.seriesId,
      user_name: c.userName, user_role: c.userRole, content: c.content,
    }).select().single();
    if (error) throw new Error(error.message);
    return rowToComment(row);
  }, []);

  return (
    <AppContext.Provider value={{
      data, loading, error, refresh: fetchAll,
      addClient, updateClient, deleteClient,
      addCrewMember, updateCrewMember, deleteCrewMember,
      addLocation, updateLocation, deleteLocation,
      addProjectType, updateProjectType, deleteProjectType,
      addEditType, updateEditType, deleteEditType,
      addProject, updateProject, deleteProject,
      addMarketingExpense, deleteMarketingExpense,
      addInvoice, updateInvoice, deleteInvoice,
      addContractorInvoice, updateContractorInvoice, deleteContractorInvoice,
      addSeries, updateSeries, deleteSeries,
      addEpisode, updateEpisode, deleteEpisode,
      fetchMessages, addMessage, fetchEpisodes,
      fetchComments, addComment,
      upsertDistance,
      addManualTrip, deleteManualTrip,
      addBusinessExpense, addBusinessExpenses, updateBusinessExpense, deleteBusinessExpense,
      upsertCategoryRule,
      addTimeEntry, updateTimeEntry,
      addContractTemplate, updateContractTemplate, deleteContractTemplate,
      addContract, updateContract, deleteContract,
      addProposalTemplate, updateProposalTemplate, deleteProposalTemplate,
      addProposal, updateProposal, deleteProposal,
      addPipelineLead, updatePipelineLead, deletePipelineLead,
      addPersonalEvent, updatePersonalEvent, deletePersonalEvent,
      restoreItem, permanentlyDelete,
      updateOrganization,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
