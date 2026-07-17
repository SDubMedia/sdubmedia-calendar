// ============================================================
// Slate — App Data Context (Supabase)
// ============================================================

import React, { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef } from "react";
import type { AppData, Client, CrewMember, Location, ProjectType, EditType, Project, ProjectHistoryEntry, MarketingExpense, Invoice, ContractorInvoice, CrewPayment, Product, ShootRequest, ShootRequestStatus, Availability, ShooterPref, CrewLocationDistance, ManualTrip, BusinessExpense, CategoryRule, BusinessExpenseCategory, TimeEntry, ContractTemplate, Contract, StaffAgreement, ShootConfirmation, ProposalTemplate, Proposal, PipelineLead, Series, SeriesEpisode, SeriesMessage, EpisodeComment, Organization, PersonalEvent, ExternalCalendar, ExternalEvent, Meeting, Package, ProposalImage, Delivery, DeliveryFile, DeliverySelection, DeliveryStatus, DeliveryCollection, ServiceCategory, Service, ServiceVariant } from "@/lib/types";
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
  fetchProjectHistory: (projectId: string) => Promise<ProjectHistoryEntry[]>;
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
  addCrewPayment: (p: Omit<CrewPayment, "id" | "createdAt">) => Promise<CrewPayment>;
  updateCrewPayment: (id: string, p: Partial<CrewPayment>) => Promise<void>;
  deleteCrewPayment: (id: string) => Promise<void>;
  addProduct: (p: Omit<Product, "id" | "orgId" | "createdAt">) => Promise<Product>;
  updateProduct: (id: string, p: Partial<Product>) => Promise<void>;
  deleteProduct: (id: string) => Promise<void>;
  addShootRequest: (r: Omit<ShootRequest, "id" | "orgId" | "createdAt" | "status" | "projectId" | "ownerResponse">) => Promise<ShootRequest>;
  updateShootRequest: (id: string, r: Partial<ShootRequest>) => Promise<void>;
  deleteShootRequest: (id: string) => Promise<void>;
  addAvailability: (a: Omit<Availability, "id" | "orgId" | "createdAt">) => Promise<Availability>;
  updateAvailability: (id: string, a: Partial<Availability>) => Promise<void>;
  deleteAvailability: (id: string) => Promise<void>;
  upsertShooterPref: (p: Omit<ShooterPref, "orgId" | "createdAt">) => Promise<void>;
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
  upsertDistance: (crewMemberId: string, locationId: string, distanceMiles: number, homeBaseId?: string) => Promise<void>;
  ensureLocationDistances: (locationId: string | null | undefined, crewMemberIds: string[]) => Promise<void>;
  // Manual Trips
  addManualTrip: (t: Omit<ManualTrip, "id" | "createdAt">) => Promise<ManualTrip>;
  updateManualTrip: (id: string, patch: Partial<Omit<ManualTrip, "id" | "createdAt">>) => Promise<void>;
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
  addMeeting: (m: Omit<Meeting, "id" | "ownerUserId" | "orgId" | "createdAt">) => Promise<Meeting>;
  updateMeeting: (id: string, m: Partial<Meeting>) => Promise<void>;
  deleteMeeting: (id: string) => Promise<void>;
  // Packages library
  addPackage: (p: Omit<Package, "id" | "orgId" | "createdAt" | "updatedAt">) => Promise<Package>;
  updatePackage: (id: string, p: Partial<Package>) => Promise<void>;
  deletePackage: (id: string) => Promise<void>;
  // Proposal images library
  addProposalImage: (i: Omit<ProposalImage, "id" | "orgId" | "createdAt" | "updatedAt">) => Promise<ProposalImage>;
  updateProposalImage: (id: string, i: Partial<ProposalImage>) => Promise<void>;
  deleteProposalImage: (id: string) => Promise<void>;
  // Deliveries (galleries)
  addDelivery: (d: Omit<Delivery, "id" | "token" | "hasPassword" | "createdAt" | "updatedAt" | "viewCount" | "downloadCount" | "submittedAt" | "workingAt" | "deliveredAt" | "clientName" | "clientEmail">) => Promise<Delivery>;
  createReShootGallery: (projectId: string, title: string) => Promise<Delivery | null>;
  updateDelivery: (id: string, d: Partial<Delivery>) => Promise<void>;
  deleteDelivery: (id: string) => Promise<void>;
  setDeliveryStatus: (id: string, status: DeliveryStatus) => Promise<void>;
  // Delivery files (metadata; actual upload goes through Storage SDK)
  registerDeliveryFile: (f: Omit<DeliveryFile, "id" | "createdAt" | "downloadCount">) => Promise<DeliveryFile>;
  updateDeliveryFile: (id: string, patch: Partial<Pick<DeliveryFile, "thumbnailStoragePath" | "durationSeconds">>) => Promise<void>;
  deleteDeliveryFile: (id: string) => Promise<void>;
  reorderDeliveryFiles: (deliveryId: string, orderedIds: string[]) => Promise<void>;
  markSelectionEdited: (selectionId: string, edited: boolean) => Promise<void>;
  // Delivery collections
  addDeliveryCollection: (c: { name: string; slug: string | null; coverSubtitle: string | null }) => Promise<DeliveryCollection>;
  updateDeliveryCollection: (id: string, c: Partial<Pick<DeliveryCollection, "name" | "slug" | "coverSubtitle">>) => Promise<void>;
  deleteDeliveryCollection: (id: string) => Promise<void>;
  // Service categories / services / variants — hierarchical pricing model
  addServiceCategory: (c: Omit<ServiceCategory, "id" | "createdAt">) => Promise<ServiceCategory>;
  updateServiceCategory: (id: string, c: Partial<ServiceCategory>) => Promise<void>;
  deleteServiceCategory: (id: string) => Promise<void>;
  addService: (s: Omit<Service, "id" | "createdAt">) => Promise<Service>;
  updateService: (id: string, s: Partial<Service>) => Promise<void>;
  deleteService: (id: string) => Promise<void>;
  addServiceVariant: (v: Omit<ServiceVariant, "id" | "createdAt">) => Promise<ServiceVariant>;
  updateServiceVariant: (id: string, v: Partial<ServiceVariant>) => Promise<void>;
  deleteServiceVariant: (id: string) => Promise<void>;
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
    serviceRates: Array.isArray(r.service_rates) ? r.service_rates : [],
    allowedProjectTypeIds: r.allowed_project_type_ids || [],
    defaultProjectTypeId: r.default_project_type_id || "",
    roleBillingMultipliers: r.role_billing_multipliers || [],
    partnerSplit: r.partner_split || null,
    brandNotes: r.brand_notes || "",
    clientType: r.client_type || "standard",
    brokerId: r.broker_id || null,
    principalBrokerUserId: r.principal_broker_user_id || null,
    stripeCustomerId: r.stripe_customer_id || null,
    cardOnFile: r.card_on_file === true,
    cardBrand: r.card_brand || null,
    cardLast4: r.card_last4 || null,
    agreementAcceptedAt: r.agreement_accepted_at || null,
    agreementVersion: r.agreement_version || null,
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
    homeBases: Array.isArray(r.home_bases) ? r.home_bases : [],
    preferredPaymentMethod: r.preferred_payment_method || null,
    preferredPaymentDetails: r.preferred_payment_details || "",
    businessName: r.business_name || "",
    businessAddress: r.business_address || "",
    businessCity: r.business_city || "",
    businessState: r.business_state || "",
    businessZip: r.business_zip || "",
    taxId: r.tax_id || "",
    taxIdType: r.tax_id_type || "",
    w9Url: r.w9_url || "",
    w9SubmittedAt: r.w9_submitted_at || null,
    requiresShootConfirmation: !!r.requires_shoot_confirmation,
    archived: !!r.archived,
    stripeAccountId: r.stripe_account_id || "",
    stripePayoutsEnabled: !!r.stripe_payouts_enabled,
  };
}

function rowToCrewLocationDistance(r: any): CrewLocationDistance {
  return {
    id: r.id,
    crewMemberId: r.crew_member_id,
    homeBaseId: r.home_base_id || "primary",
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
  return {
    id: r.id, name: r.name || "", content: r.content || "",
    blocks: Array.isArray(r.blocks) ? r.blocks : [],
    pages: Array.isArray(r.pages) ? r.pages : [],
    createdAt: r.created_at, updatedAt: r.updated_at, deletedAt: r.deleted_at || null,
  };
}

function rowToContract(r: any): Contract {
  return {
    id: r.id, templateId: r.template_id || null, clientId: r.client_id || "",
    projectId: r.project_id || null, title: r.title || "", content: r.content || "",
    status: r.status || "draft", sentAt: r.sent_at || null,
    clientSignedAt: r.client_signed_at || null, ownerSignedAt: r.owner_signed_at || null,
    clientSignature: r.client_signature || null, ownerSignature: r.owner_signature || null,
    clientEmail: r.client_email || "", signToken: r.sign_token || "",
    fieldValues: (r.field_values && typeof r.field_values === "object") ? r.field_values : {},
    additionalSigners: Array.isArray(r.additional_signers) ? r.additional_signers : [],
    documentExpiresAt: r.document_expires_at || null,
    remindersEnabled: !!r.reminders_enabled,
    lastReminderSentAt: r.last_reminder_sent_at || null,
    proposalId: r.proposal_id || null,
    masterTemplateVersionId: r.master_template_version_id || "",
    firingLog: Array.isArray(r.firing_log) ? r.firing_log : [],
    sendBackReason: r.send_back_reason || "",
    paymentMilestones: Array.isArray(r.payment_milestones) ? r.payment_milestones : [],
    inboundReplies: Array.isArray(r.inbound_replies) ? r.inbound_replies : [],
    pages: Array.isArray(r.pages) ? r.pages : [],
    createdAt: r.created_at, updatedAt: r.updated_at, deletedAt: r.deleted_at || null,
  };
}

function rowToStaffAgreement(r: any): StaffAgreement {
  return {
    id: r.id,
    crewMemberId: r.crew_member_id || "",
    agreementVersion: r.agreement_version || "",
    agreementTitle: r.agreement_title || "",
    agreementText: r.agreement_text || "",
    staffSignature: r.staff_signature || null,
    staffSignedAt: r.staff_signed_at || null,
    ownerSignature: r.owner_signature || null,
    ownerSignedAt: r.owner_signed_at || null,
    status: r.status || "awaiting_staff",
    createdAt: r.created_at,
  };
}

function rowToShootConfirmation(r: any): ShootConfirmation {
  return {
    id: r.id,
    projectId: r.project_id || "",
    crewMemberId: r.crew_member_id || "",
    notifiedAt: r.notified_at || null,
    confirmedAt: r.confirmed_at || null,
    createdAt: r.created_at,
  };
}

function rowToProposalTemplate(r: any): ProposalTemplate {
  return {
    id: r.id, name: r.name || "",
    coverImageUrl: r.cover_image_url || "",
    pages: Array.isArray(r.pages) ? r.pages : [],
    packages: Array.isArray(r.packages) ? r.packages : [],
    contractTemplateId: r.contract_template_id || null,
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
    contractTemplateId: r.contract_template_id || null,
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
    sendHistory: Array.isArray(r.send_history) ? r.send_history : [],
    inboundReplies: Array.isArray(r.inbound_replies) ? r.inbound_replies : [],
    expiresAt: r.expires_at || null,
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
    paidAt: r.paid_at || null,
    paymentMethod: r.payment_method || null,
    paymentReference: r.payment_reference || "",
    createdAt: r.created_at,
  };
}

function rowToCrewPayment(r: any): CrewPayment {
  return {
    id: r.id,
    crewMemberId: r.crew_member_id,
    projectId: r.project_id,
    role: r.role || undefined,
    amount: Number(r.amount ?? 0),
    paymentMethod: r.payment_method,
    paidAt: r.paid_at,
    reference: r.reference || undefined,
    note: r.note || undefined,
    createdAt: r.created_at,
  };
}

function rowToProduct(r: any): Product {
  return {
    id: r.id,
    orgId: r.org_id || "",
    name: r.name || "",
    unitCost: Number(r.unit_cost ?? 0),
    active: r.active !== false,
    sortOrder: Number(r.sort_order ?? 0),
    createdAt: r.created_at,
  };
}

function rowToShootRequest(r: any): ShootRequest {
  return {
    id: r.id,
    orgId: r.org_id || "",
    clientId: r.client_id,
    propertyAddress: r.property_address || "",
    preferredDate: r.preferred_date || null,
    preferredTime: r.preferred_time || null,
    preferredCrewMemberId: r.preferred_crew_member_id || null,
    agentWillMeet: !!r.agent_will_meet,
    isVacant: !!r.is_vacant,
    notes: r.notes || "",
    requestedServices: Array.isArray(r.requested_services) ? r.requested_services : [],
    status: (r.status || "pending") as ShootRequestStatus,
    projectId: r.project_id || null,
    ownerResponse: r.owner_response || "",
    createdAt: r.created_at,
  };
}

function rowToAvailability(r: any): Availability {
  return {
    id: r.id,
    orgId: r.org_id || "",
    crewMemberId: r.crew_member_id,
    recurring: r.recurring !== false,
    weekday: r.weekday === null || r.weekday === undefined ? null : Number(r.weekday),
    specificDate: r.specific_date || null,
    allDay: r.all_day === true,
    startTime: r.start_time || "09:00",
    endTime: r.end_time || "17:00",
    createdAt: r.created_at,
  };
}

function rowToShooterPref(r: any): ShooterPref {
  return {
    crewMemberId: r.crew_member_id,
    orgId: r.org_id || "",
    shootMinutes: Number(r.shoot_minutes ?? 60),
    bufferMinutes: Number(r.buffer_minutes ?? 30),
    maxPerDay: Number(r.max_per_day ?? 0),
    fakeBusyMinutes: Number(r.fake_busy_minutes ?? 0),
    createdAt: r.created_at,
  };
}

function rowToLocation(r: any): Location {
  return { id: r.id, name: r.name, address: r.address, city: r.city, state: r.state, zip: r.zip, oneTimeUse: r.one_time_use || false };
}

function rowToProjectType(r: any): ProjectType {
  return { id: r.id, name: r.name, lightweight: r.lightweight || false, appliesTo: r.applies_to || "any" };
}

function rowToEditType(r: any): EditType {
  return { id: r.id, name: r.name, appliesTo: r.applies_to || "any" };
}

function normalizeCrewEntry(c: any) {
  return {
    crewMemberId: c.crewMemberId || c.crew_member_id || "",
    role: c.role || "",
    hoursWorked: Number(c.hoursWorked ?? c.hours_worked ?? 0),
    payRatePerHour: Number(c.payRatePerHour ?? c.pay_rate_per_hour ?? 0),
    roundTripMiles: c.roundTripMiles ?? c.round_trip_miles ?? undefined,
    homeBaseId: c.homeBaseId ?? c.home_base_id ?? undefined,
    // Preserve flat-pay fields — dropping these reverted flat-rate crew to $0
    // on every reload (the "crew rate not saving" bug).
    payType: c.payType ?? c.pay_type ?? undefined,
    flatAmount: c.flatAmount ?? c.flat_amount ?? undefined,
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
    billedHours: r.billed_hours != null ? Number(r.billed_hours) : null,
    paidDate: r.paid_date || null,
    editTypes: r.edit_types || [],
    notes: r.notes || "",
    deliverableUrl: r.deliverable_url || "",
    cancellationReason: r.cancellation_reason || "",
    cancelledAt: r.cancelled_at || null,
    depositPaidAt: r.deposit_paid_at || null,
    onTheWayAt: r.on_the_way_at || null,
    discountType: (r.discount_type as "percent" | "fixed" | null) || null,
    discountAmount: r.discount_amount != null ? Number(r.discount_amount) : 0,
    discountReason: r.discount_reason || "",
    serviceCategoryId: r.service_category_id || null,
    services: Array.isArray(r.services) ? r.services : [],
    billToId: r.bill_to_id || null,
    products: Array.isArray(r.products) ? r.products : [],
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
  const rawMethods = Array.isArray(r.payment_methods) ? r.payment_methods : [];
  const validMethods = rawMethods.filter((m: unknown): m is "stripe" | "venmo" => m === "stripe" || m === "venmo");
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
    checkSentAt: r.check_sent_at || null,
    lineItems: r.line_items || [],
    companyInfo: r.company_info || {},
    clientInfo: r.client_info || {},
    notes: r.notes || "",
    createdAt: r.created_at,
    updatedAt: r.updated_at, deletedAt: r.deleted_at || null,
    paymentMethods: validMethods.length > 0 ? validMethods : ["stripe"],
    viewToken: r.view_token || "",
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
    reviewToken: r.review_token || null,
    reviewStatus: r.review_status || "draft",
    sentForReviewAt: r.sent_for_review_at || null,
    clientReviewedAt: r.client_reviewed_at || null,
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
    approvalStatus: r.approval_status || "pending",
    clientComment: r.client_comment || "",
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

function rowToExternalCalendar(r: any): ExternalCalendar {
  return {
    id: r.id,
    ownerUserId: r.owner_user_id,
    label: r.label || "",
    url: r.url,
    color: r.color || "#94a3b8",
    enabled: r.enabled ?? true,
    lastSyncedAt: r.last_synced_at || null,
    lastError: r.last_error || "",
    eventCount: Number(r.event_count ?? 0),
    createdAt: r.created_at,
  };
}

function rowToExternalEvent(r: any): ExternalEvent {
  return {
    id: r.id,
    externalCalendarId: r.external_calendar_id,
    icalUid: r.ical_uid || "",
    title: r.title || "",
    description: r.description || "",
    location: r.location || "",
    startAt: r.start_at,
    endAt: r.end_at || null,
    allDay: r.all_day ?? false,
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

function rowToPackage(r: any): Package {
  return {
    id: r.id, orgId: r.org_id || "",
    name: r.name || "", icon: r.icon || "heart",
    iconCustomDataUrl: r.icon_custom_data_url || "",
    description: r.description || "",
    defaultPrice: Number(r.default_price ?? 0),
    discountFromPrice: r.discount_from_price === null || r.discount_from_price === undefined ? null : Number(r.discount_from_price),
    photoDataUrl: r.photo_data_url || "",
    deliverables: Array.isArray(r.deliverables) ? r.deliverables : [],
    sortOrder: Number(r.sort_order ?? 0),
    createdAt: r.created_at, updatedAt: r.updated_at, deletedAt: r.deleted_at || null,
  };
}

function rowToProposalImage(r: any): ProposalImage {
  return {
    id: r.id, orgId: r.org_id || "",
    name: r.name || "",
    imageDataUrl: r.image_data_url || "",
    width: Number(r.width ?? 0), height: Number(r.height ?? 0),
    sortOrder: Number(r.sort_order ?? 0),
    createdAt: r.created_at, updatedAt: r.updated_at, deletedAt: r.deleted_at || null,
  };
}

function rowToMeeting(r: any): Meeting {
  return {
    id: r.id,
    ownerUserId: r.owner_user_id || "",
    title: r.title || "",
    date: r.date,
    startTime: r.start_time || "",
    endTime: r.end_time || "",
    clientId: r.client_id || null,
    locationText: r.location_text || "",
    notes: r.notes || "",
    visibleToClient: r.visible_to_client ?? false,
    color: r.color || "",
    assignedUserIds: Array.isArray(r.assigned_user_ids) ? r.assigned_user_ids : [],
    meetingAddress: r.meeting_address || undefined,
    oneWayMiles: typeof r.one_way_miles === "number" ? r.one_way_miles : (r.one_way_miles ? Number(r.one_way_miles) : undefined),
    orgId: r.org_id || "",
    createdAt: r.created_at,
  };
}

function rowToServiceCategory(r: any): ServiceCategory {
  return {
    id: r.id,
    name: r.name || "",
    position: Number(r.position ?? 0),
    appliesTo: r.applies_to || "any",
    clientIds: Array.isArray(r.client_ids) ? r.client_ids : [],
    createdAt: r.created_at,
  };
}

function rowToService(r: any): Service {
  return {
    id: r.id,
    categoryId: r.category_id,
    name: r.name || "",
    defaultPrice: Number(r.default_price ?? 0),
    defaultCost: Number(r.default_cost ?? 0),
    crewRole: r.crew_role === "shoot" || r.crew_role === "edit" ? r.crew_role : null,
    durationMinutes: Number(r.duration_minutes ?? 0),
    description: r.description || "",
    position: Number(r.position ?? 0),
    createdAt: r.created_at,
  };
}

function rowToServiceVariant(r: any): ServiceVariant {
  return {
    id: r.id,
    serviceId: r.service_id,
    label: r.label || "",
    price: Number(r.price ?? 0),
    cost: Number(r.cost ?? 0),
    durationMinutes: Number(r.duration_minutes ?? 0),
    position: Number(r.position ?? 0),
    createdAt: r.created_at,
  };
}

function rowToDeliveryCollection(r: any): DeliveryCollection {
  return {
    id: r.id,
    name: r.name || "",
    slug: r.slug || null,
    coverSubtitle: r.cover_subtitle || null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function rowToDelivery(r: any): Delivery {
  return {
    id: r.id,
    projectId: r.project_id || null,
    collectionId: r.collection_id || null,
    title: r.title || "",
    coverFileId: r.cover_file_id || null,
    watermarkText: r.watermark_text || null,
    watermarkUseLogo: !!r.watermark_use_logo,
    printsEnabled: !!r.prints_enabled,
    // Coerce unknown / removed layouts (e.g. "outline" pre-2026-04-30) → "center".
    coverLayout: (["center","vintage","minimal","left","stripe","frame","divider","stamp"].includes(r.cover_layout) ? r.cover_layout : "center") as Delivery["coverLayout"],
    coverFont: r.cover_font || "",
    coverSubtitle: r.cover_subtitle || null,
    coverDate: r.cover_date || null,
    slug: r.slug || null,
    requireEmail: !!r.require_email,
    token: r.token || "",
    hasPassword: !!r.password_hash,
    expiresAt: r.expires_at || null,
    selectionLimit: Number(r.selection_limit ?? 0),
    downloadOnly: r.download_only === true,
    perExtraPhotoCents: Number(r.per_extra_photo_cents ?? 0),
    buyAllFlatCents: Number(r.buy_all_flat_cents ?? 0),
    status: (r.status || "draft") as DeliveryStatus,
    clientName: r.client_name || null,
    clientEmail: r.client_email || null,
    submittedAt: r.submitted_at || null,
    workingAt: r.working_at || null,
    deliveredAt: r.delivered_at || null,
    viewCount: Number(r.view_count ?? 0),
    downloadCount: Number(r.download_count ?? 0),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function rowToDeliveryFile(r: any): DeliveryFile {
  const mediaType = r.media_type === "video" ? "video" : "image";
  return {
    id: r.id,
    deliveryId: r.delivery_id,
    storagePath: r.storage_path || "",
    originalName: r.original_name || "",
    sizeBytes: Number(r.size_bytes ?? 0),
    width: r.width ?? null,
    height: r.height ?? null,
    mimeType: r.mime_type || "",
    position: Number(r.position ?? 0),
    downloadCount: Number(r.download_count ?? 0),
    createdAt: r.created_at,
    mediaType,
    thumbnailStoragePath: r.thumbnail_storage_path || "",
    durationSeconds: r.duration_seconds == null ? null : Number(r.duration_seconds),
  };
}

function rowToDeliverySelection(r: any): DeliverySelection {
  return {
    id: r.id,
    deliveryId: r.delivery_id,
    fileId: r.file_id,
    isPaid: !!r.is_paid,
    stripePaymentIntentId: r.stripe_payment_intent_id || null,
    editedAt: r.edited_at || null,
    createdAt: r.created_at,
  };
}

function rowToOrg(r: any): Organization {
  return {
    id: r.id, name: r.name, slug: r.slug, logoUrl: r.logo_url || "", faviconUrl: r.favicon_url || "", plan: r.plan,
    features: { ...DEFAULT_FEATURES, ...(r.features || {}) },
    productionType: r.production_type || "both",
    defaultBillingModel: r.default_billing_model || "hourly",
    defaultBillingRate: Number(r.default_billing_rate ?? 0),
    businessInfo: r.business_info || { address: "", city: "", state: "", zip: "", phone: "", email: "", website: "", ein: "" },
    dashboardWidgets: r.dashboard_widgets || null,
    pipelineStages: Array.isArray(r.pipeline_stages) && r.pipeline_stages.length > 0 ? r.pipeline_stages : DEFAULT_PIPELINE_STAGES,
    services: Array.isArray(r.services) ? r.services : [],
    projectLimit: r.project_limit ?? 10,
    stripeAccountId: r.stripe_account_id || "",
    stripeCustomerId: r.stripe_customer_id || "",
    stripeSubscriptionId: r.stripe_subscription_id || "",
    billingStatus: r.billing_status || "ok",
    testimonialPromptedAt: r.testimonial_prompted_at || null,
    seriesReviewMessageTemplate: r.series_review_message_template || "",
    calendarFeedToken: r.calendar_feed_token || "",
    w9TemplatePath: r.w9_template_path || "",
    w9FieldMap: (r.w9_field_map && typeof r.w9_field_map === "object") ? r.w9_field_map : {},
    staffAgreementText: r.staff_agreement_text || "",
    staffAgreementVersion: r.staff_agreement_version || "",
    googleDriveEmail: r.google_drive_email || "",
    createdAt: r.created_at,
  };
}

const emptyData: AppData = {
  clients: [], crewMembers: [], locations: [], projectTypes: [], editTypes: [], projects: [], marketingExpenses: [], invoices: [], contractorInvoices: [], crewPayments: [], products: [], shootRequests: [], availability: [], shooterPrefs: [], crewLocationDistances: [], manualTrips: [], businessExpenses: [], categoryRules: [], timeEntries: [], contractTemplates: [], contracts: [], staffAgreements: [], shootConfirmations: [], proposalTemplates: [], proposals: [], pipelineLeads: [], series: [], personalEvents: [], externalCalendars: [], externalEvents: [], meetings: [], packages: [], proposalImages: [], deliveries: [], deliveryFiles: [], deliverySelections: [], deliveryCollections: [], serviceCategories: [], services: [], serviceVariants: [], organization: null,
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
    const targetUserId = targetUser?.id || effectiveProfile?.id || "";

    // Staff: filter projects by crew assignment
    if (targetRole === "staff" && crewMemberId) {
      const staffProjects = rawData.projects.filter(p =>
        p.crew.some(c => c.crewMemberId === crewMemberId) ||
        p.postProduction.some(c => c.crewMemberId === crewMemberId)
      );
      const staffClientIds = new Set(staffProjects.map(p => p.clientId));
      const staffProjectIds = new Set(staffProjects.map(p => p.id));
      // Meetings: staff sees ONLY meetings explicitly assigned to them.
      // No assignment = admin-only (don't leak the owner's calendar).
      const staffMeetings = rawData.meetings.filter(m =>
        !!targetUserId && Array.isArray(m.assignedUserIds) && m.assignedUserIds.includes(targetUserId)
      );
      return {
        ...rawData,
        projects: staffProjects,
        clients: rawData.clients.filter(c => staffClientIds.has(c.id)),
        invoices: [],
        contracts: [],
        proposals: [],
        meetings: staffMeetings,
        deliveries: rawData.deliveries.filter(d => d.projectId && staffProjectIds.has(d.projectId)),
        // Staff have no shoot-request access (mirrors RLS — no staff policy).
        // Availability passes through via ...rawData so they can manage their own.
        shootRequests: [],
      };
    }

    // Partner/Client: filter by assigned clientIds.
    // This must mirror what RLS allows when the user logs in directly — see
    // migrations/2026-04-28-partner-rls-tighten.sql et al. Owner finance
    // (contractor invoices, expenses, leads) is hidden entirely.
    if (clientIds.length > 0) {
      const allowedClientIds = new Set(clientIds);
      // For the partner role: when a client's partnership has ended,
      // hide projects + invoices dated AFTER the end date. Past data
      // remains visible so the partner can still review history.
      // Lookup endedAt per allowed client up-front to keep the filter
      // tight.
      const partnerEndedAtByClient = new Map<string, string>();
      if (targetRole === "partner") {
        for (const c of rawData.clients) {
          if (allowedClientIds.has(c.id) && c.partnerSplit?.endedAt) {
            partnerEndedAtByClient.set(c.id, c.partnerSplit.endedAt);
          }
        }
      }
      const isPartnerCutoff = (clientId: string, dateStr: string): boolean => {
        if (targetRole !== "partner") return false;
        const endedAt = partnerEndedAtByClient.get(clientId);
        return !!endedAt && dateStr > endedAt;
      };
      // A client sees their own projects; a BROKER also sees their agents'
      // shoots (stored under the agent) and anything billed directly to them.
      const clientById = new Map(rawData.clients.map(c => [c.id, c]));
      const clientCanSeeProject = (p: Project): boolean => {
        if (allowedClientIds.has(p.clientId)) return true;
        if (p.billToId && allowedClientIds.has(p.billToId)) return true;
        const c = clientById.get(p.clientId);
        return !!(c?.clientType === "agent" && c.brokerId && allowedClientIds.has(c.brokerId));
      };
      const allowedProjects = rawData.projects.filter(p =>
        clientCanSeeProject(p) && !isPartnerCutoff(p.clientId, p.date)
      );
      const allowedProjectIds = new Set(allowedProjects.map(p => p.id));
      // Meetings:
      //  - client role gets only meetings explicitly shared (visibleToClient=true)
      //    AND tied to one of their clients.
      //  - partner role gets only meetings where they're explicitly
      //    assigned via assignedCrewMemberIds. Same rule as staff —
      //    no meeting shows up on a partner's calendar unless they
      //    were specifically added. Partners without a crew_member_id
      //    linked won't see any meetings (admin-only by default).
      const allowedMeetings = targetRole === "client"
        ? rawData.meetings.filter(m => m.visibleToClient && m.clientId && allowedClientIds.has(m.clientId))
        : rawData.meetings.filter(m =>
            !!targetUserId && Array.isArray(m.assignedUserIds) && m.assignedUserIds.includes(targetUserId)
          );
      // Galleries: clients keep access to their own deliveries; partners
      // and family don't get the gallery feature at all (owner-only).
      const allowedDeliveries = targetRole === "client"
        ? rawData.deliveries.filter(d => d.projectId && allowedProjectIds.has(d.projectId))
        : [];
      const allowedDeliveryIds = new Set(allowedDeliveries.map(d => d.id));
      return {
        ...rawData,
        // A broker also keeps their agents' client records (so the agent list +
        // names resolve) — mirrors the broker_read_agents RLS policy.
        clients: rawData.clients.filter(c =>
          allowedClientIds.has(c.id)
          || (c.clientType === "agent" && !!c.brokerId && allowedClientIds.has(c.brokerId))
        ),
        projects: allowedProjects,
        invoices: rawData.invoices.filter(i =>
          allowedClientIds.has(i.clientId) && !isPartnerCutoff(i.clientId, i.issueDate)
        ),
        contracts: rawData.contracts.filter(c =>
          allowedClientIds.has(c.clientId) && !isPartnerCutoff(c.clientId, c.createdAt.slice(0, 10))
        ),
        proposals: rawData.proposals.filter(p =>
          allowedClientIds.has(p.clientId) && !isPartnerCutoff(p.clientId, p.createdAt.slice(0, 10))
        ),
        deliveries: allowedDeliveries,
        deliveryFiles: rawData.deliveryFiles.filter(f => allowedDeliveryIds.has(f.deliveryId)),
        deliverySelections: rawData.deliverySelections.filter(s => allowedDeliveryIds.has(s.deliveryId)),
        deliveryCollections: targetRole === "client" ? rawData.deliveryCollections : [],
        meetings: allowedMeetings,
        // Agents (client role) keep their own shoot requests; partners see
        // requests for their assigned clients. Scoped to allowed clients.
        shootRequests: rawData.shootRequests.filter(r => allowedClientIds.has(r.clientId)),
        // Hidden from partners/clients entirely — owner-only data
        contractorInvoices: [],
        crewPayments: [],
        products: [],
        marketingExpenses: [],
        businessExpenses: [],
        pipelineLeads: [],
        categoryRules: [],
        manualTrips: [],
        // Templates & Inquiry Pipeline libraries — owner-only per PRD RBAC
        packages: [],
        proposalImages: [],
        // Time entries — only show entries on allowed projects
        timeEntries: rawData.timeEntries.filter(t => t.projectId && allowedProjectIds.has(t.projectId)),
      };
    }

    // Final guard for non-owner roles who didn't match either earlier
    // branch — typically a partner or family member whose profile has
    // no client_ids assigned. Returns a restrictive empty view —
    // everything client-scoped is empty, everything admin-scoped is
    // empty, only org metadata + their own meetings/personal events
    // come through. Mirrors the RLS rule: no client assignment =
    // no data access.
    if (targetRole !== "owner") {
      return {
        ...rawData,
        // Client-scoped — empty since no clients are assigned
        clients: [],
        projects: [],
        invoices: [],
        contracts: [],
        proposals: [],
        deliveries: [],
        deliveryFiles: [],
        deliverySelections: [],
        deliveryCollections: [],
        timeEntries: [],
        shootRequests: [],
        // Owner-only data — never visible to non-owner without clients
        contractorInvoices: [],
        crewPayments: [],
        products: [],
        marketingExpenses: [],
        businessExpenses: [],
        pipelineLeads: [],
        categoryRules: [],
        manualTrips: [],
        contractTemplates: [],
        proposalTemplates: [],
        packages: [],
        proposalImages: [],
        series: [],
        // Crew + locations are org-wide directory info; show empty
        // for true lockdown so impersonation matches what RLS gives
        // a clientless partner (which is nothing useful).
        crewMembers: [],
        // Meetings: only those explicitly assigned to this user
        meetings: rawData.meetings.filter(m =>
          !!targetUserId && Array.isArray(m.assignedUserIds) && m.assignedUserIds.includes(targetUserId)
        ),
        // Keep org metadata + project/edit/location reference data
        // visible (these are pure config — locations have no PII).
        // Partners need them for any UI that tries to render labels.
      };
    }

    return rawData;
  }, [rawData, impersonateUserId, allProfiles, effectiveProfile]);
  const [error, setError] = useState<string | null>(null);

  const lastFetchAtRef = useRef(0);
  const fetchAll = useCallback(async () => {
    lastFetchAtRef.current = Date.now();
    setLoading(true);
    setError(null);
    // Client/agent/broker logins read cost-free VIEWS (crew pay, piece cost,
    // product cost stripped). Routing keys off the REAL session role, not
    // impersonation — RLS enforces against the actual JWT. Owner/staff/partner
    // read the raw tables. See migrations/2026-06-19-client-safe-views.sql.
    const isClient = profile?.role === "client";
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
        { data: crewPaymentsData, error: e7cp },
        { data: productsData, error: e7pr },
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
        { data: externalCalendarsData, error: _e8b1 },
        { data: externalEventsData, error: _e8b1b },
        { data: meetingsData, error: _e8b2 },
        { data: packagesData, error: _e8b3 },
        { data: proposalImagesData, error: _e8b4 },
        { data: deliveriesData, error: _e8c },
        { data: deliveryFilesData, error: _e8d },
        { data: deliverySelectionsData, error: _e8e },
        { data: deliveryCollectionsData, error: _e8f },
        { data: serviceCategoriesData, error: _e8g },
        { data: servicesData, error: _e8h },
        { data: serviceVariantsData, error: _e8i },
        { data: orgData, error: _e9 },
        { data: shootRequestsData, error: e7sr },
        { data: availabilityData, error: e7av },
        { data: shooterPrefsData, error: e7sp },
        { data: staffAgreementsData, error: _eSA },
        { data: shootConfirmationsData, error: _eSC },
      ] = await Promise.all([
        supabase.from("clients").select("*").order("company"),
        supabase.from("crew_members").select("*").order("name"),
        supabase.from("locations").select("*").order("name"),
        supabase.from("project_types").select("*").order("name"),
        supabase.from("edit_types").select("*").order("name"),
        supabase.from(isClient ? "projects_client" : "projects").select("*").order("date"),
        supabase.from("marketing_expenses").select("*").order("date", { ascending: false }),
        supabase.from("invoices").select("*").is("deleted_at", null).order("created_at", { ascending: false }),
        supabase.from("contractor_invoices").select("*").order("created_at", { ascending: false }),
        supabase.from("crew_payments").select("*").order("paid_at", { ascending: false }),
        supabase.from("products").select("*").order("sort_order"),
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
        supabase.from("external_calendars").select("*").order("created_at", { ascending: false }),
        supabase.from("external_events").select("*").order("start_at"),
        supabase.from("meetings").select("*").order("date"),
        supabase.from("packages").select("*").is("deleted_at", null).order("sort_order"),
        supabase.from("proposal_images").select("*").is("deleted_at", null).order("sort_order", { ascending: false }),
        supabase.from("deliveries").select("*").order("created_at", { ascending: false }),
        supabase.from("delivery_files").select("*").order("position"),
        supabase.from("delivery_selections").select("*").order("created_at"),
        supabase.from("delivery_collections").select("*").order("created_at", { ascending: false }),
        supabase.from("service_categories").select("*").is("deleted_at", null).order("position"),
        supabase.from(isClient ? "services_client" : "services").select("*").is("deleted_at", null).order("position"),
        supabase.from(isClient ? "service_variants_client" : "service_variants").select("*").is("deleted_at", null).order("position"),
        orgId ? supabase.from("organizations").select("*").eq("id", orgId).single() : Promise.resolve({ data: null, error: null }),
        supabase.from("shoot_requests").select("*").order("created_at", { ascending: false }),
        supabase.from("availability").select("*"),
        supabase.from("shooter_prefs").select("*"),
        supabase.from("staff_agreements").select("*").order("created_at", { ascending: false }),
        supabase.from("shoot_confirmations").select("*"),
      ]);

      const firstError = e1 || e2 || e3 || e4 || e5 || e6 || e7 || e7b || e7cp || e7pr || e7sr || e7av || e7sp || e8;
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
        crewPayments: (crewPaymentsData || []).map(r => { try { return rowToCrewPayment(r); } catch { return null; } }).filter(Boolean) as CrewPayment[],
        products: (productsData || []).map(r => { try { return rowToProduct(r); } catch { return null; } }).filter(Boolean) as Product[],
        shootRequests: (shootRequestsData || []).map(r => { try { return rowToShootRequest(r); } catch { return null; } }).filter(Boolean) as ShootRequest[],
        availability: (availabilityData || []).map(r => { try { return rowToAvailability(r); } catch { return null; } }).filter(Boolean) as Availability[],
        shooterPrefs: (shooterPrefsData || []).map(r => { try { return rowToShooterPref(r); } catch { return null; } }).filter(Boolean) as ShooterPref[],
        crewLocationDistances: (distances || []).map(r => { try { return rowToCrewLocationDistance(r); } catch { return null; } }).filter(Boolean) as any[],
        manualTrips: (manualTripsData || []).map(r => { try { return rowToManualTrip(r); } catch { return null; } }).filter(Boolean) as any[],
        businessExpenses: (bizExpenses || []).map(r => { try { return rowToBusinessExpense(r); } catch { return null; } }).filter(Boolean) as any[],
        categoryRules: (catRules || []).map(r => { try { return rowToCategoryRule(r); } catch { return null; } }).filter(Boolean) as any[],
        timeEntries: (timeEntriesData || []).map(r => { try { return rowToTimeEntry(r); } catch { return null; } }).filter(Boolean) as any[],
        contractTemplates: (contractTpls || []).map(r => { try { return rowToContractTemplate(r); } catch { return null; } }).filter(Boolean) as any[],
        contracts: (contractsData || []).map(r => { try { return rowToContract(r); } catch { return null; } }).filter(Boolean) as any[],
        staffAgreements: (staffAgreementsData || []).map(r => { try { return rowToStaffAgreement(r); } catch { return null; } }).filter(Boolean) as StaffAgreement[],
        shootConfirmations: (shootConfirmationsData || []).map(r => { try { return rowToShootConfirmation(r); } catch { return null; } }).filter(Boolean) as ShootConfirmation[],
        proposalTemplates: (proposalTpls || []).map(r => { try { return rowToProposalTemplate(r); } catch { return null; } }).filter(Boolean) as any[],
        proposals: (proposalsData || []).map(r => { try { return rowToProposal(r); } catch { return null; } }).filter(Boolean) as any[],
        pipelineLeads: (pipelineLeadsData || []).map(r => { try { return rowToPipelineLead(r); } catch { return null; } }).filter(Boolean) as any[],
        series: (seriesData || []).map(rowToSeries),
        personalEvents: (personalEventsData || []).map(r => { try { return rowToPersonalEvent(r); } catch { return null; } }).filter(Boolean) as PersonalEvent[],
        externalCalendars: (externalCalendarsData || []).map(rowToExternalCalendar),
        externalEvents: (externalEventsData || []).map(rowToExternalEvent),
        meetings: (meetingsData || []).map(r => { try { return rowToMeeting(r); } catch { return null; } }).filter(Boolean) as Meeting[],
        packages: (packagesData || []).map(r => { try { return rowToPackage(r); } catch { return null; } }).filter(Boolean) as Package[],
        proposalImages: (proposalImagesData || []).map(r => { try { return rowToProposalImage(r); } catch { return null; } }).filter(Boolean) as ProposalImage[],
        deliveries: (deliveriesData || []).map(r => { try { return rowToDelivery(r); } catch { return null; } }).filter(Boolean) as Delivery[],
        deliveryFiles: (deliveryFilesData || []).map(r => { try { return rowToDeliveryFile(r); } catch { return null; } }).filter(Boolean) as DeliveryFile[],
        deliverySelections: (deliverySelectionsData || []).map(r => { try { return rowToDeliverySelection(r); } catch { return null; } }).filter(Boolean) as DeliverySelection[],
        deliveryCollections: (deliveryCollectionsData || []).map(r => { try { return rowToDeliveryCollection(r); } catch { return null; } }).filter(Boolean) as DeliveryCollection[],
        serviceCategories: (serviceCategoriesData || []).map(r => { try { return rowToServiceCategory(r); } catch { return null; } }).filter(Boolean) as ServiceCategory[],
        services: (servicesData || []).map(r => { try { return rowToService(r); } catch { return null; } }).filter(Boolean) as Service[],
        serviceVariants: (serviceVariantsData || []).map(r => { try { return rowToServiceVariant(r); } catch { return null; } }).filter(Boolean) as ServiceVariant[],
        organization: orgData ? rowToOrg(orgData) : null,
      });
    } catch (err: any) {
      setError(err.message || "Failed to load data");
    } finally {
      setLoading(false);
    }
  // profile?.id is included so switching between two same-role accounts
  // (e.g. one client/broker login to another) re-pulls data for the new
  // user — role alone wouldn't change, leaving the previous user's data.
  }, [orgId, profile?.role, profile?.id]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Re-fetch when the user returns to the app (tab focus / page becomes
  // visible) so data that became newly visible while they were away — e.g.
  // an owner linking an agent to this broker — appears without a manual
  // reload. Throttled so rapid focus toggles don't hammer the database.
  useEffect(() => {
    const maybeRefetch = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastFetchAtRef.current < 3000) return;
      fetchAll();
    };
    window.addEventListener("focus", maybeRefetch);
    document.addEventListener("visibilitychange", maybeRefetch);
    return () => {
      window.removeEventListener("focus", maybeRefetch);
      document.removeEventListener("visibilitychange", maybeRefetch);
    };
  }, [fetchAll]);

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
      crew_payments: { key: "crewPayments", convert: rowToCrewPayment },
      products: { key: "products", convert: rowToProduct },
      shoot_requests: { key: "shootRequests", convert: rowToShootRequest },
      availability: { key: "availability", convert: rowToAvailability },
      crew_location_distances: { key: "crewLocationDistances", convert: rowToCrewLocationDistance },
      manual_trips: { key: "manualTrips", convert: rowToManualTrip },
      business_expenses: { key: "businessExpenses", convert: rowToBusinessExpense },
      category_rules: { key: "categoryRules", convert: rowToCategoryRule },
      time_entries: { key: "timeEntries", convert: rowToTimeEntry },
      contract_templates: { key: "contractTemplates", convert: rowToContractTemplate, softDelete: true },
      contracts: { key: "contracts", convert: rowToContract, softDelete: true },
      staff_agreements: { key: "staffAgreements", convert: rowToStaffAgreement },
      shoot_confirmations: { key: "shootConfirmations", convert: rowToShootConfirmation },
      proposal_templates: { key: "proposalTemplates", convert: rowToProposalTemplate, softDelete: true },
      proposals: { key: "proposals", convert: rowToProposal, softDelete: true },
      pipeline_leads: { key: "pipelineLeads", convert: rowToPipelineLead, softDelete: true },
      series: { key: "series", convert: rowToSeries },
      personal_events: { key: "personalEvents", convert: rowToPersonalEvent, sort: (a: any, b: any) => a.date.localeCompare(b.date) },
      external_calendars: { key: "externalCalendars", convert: rowToExternalCalendar },
      external_events: { key: "externalEvents", convert: rowToExternalEvent, sort: (a: any, b: any) => a.startAt.localeCompare(b.startAt) },
      meetings: { key: "meetings", convert: rowToMeeting, sort: (a: any, b: any) => a.date.localeCompare(b.date) },
      packages: { key: "packages", convert: rowToPackage, softDelete: true, sort: (a: any, b: any) => a.sortOrder - b.sortOrder },
      proposal_images: { key: "proposalImages", convert: rowToProposalImage, softDelete: true, sort: (a: any, b: any) => b.sortOrder - a.sortOrder },
      deliveries: { key: "deliveries", convert: rowToDelivery },
      delivery_files: { key: "deliveryFiles", convert: rowToDeliveryFile, sort: (a: any, b: any) => a.position - b.position },
      delivery_selections: { key: "deliverySelections", convert: rowToDeliverySelection },
      delivery_collections: { key: "deliveryCollections", convert: rowToDeliveryCollection },
      service_categories: { key: "serviceCategories", convert: rowToServiceCategory, softDelete: true, sort: (a: any, b: any) => a.position - b.position },
      services: { key: "services", convert: rowToService, softDelete: true, sort: (a: any, b: any) => a.position - b.position },
      service_variants: { key: "serviceVariants", convert: rowToServiceVariant, softDelete: true, sort: (a: any, b: any) => a.position - b.position },
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
      service_rates: c.serviceRates ?? [],
      allowed_project_type_ids: c.allowedProjectTypeIds ?? [],
      default_project_type_id: c.defaultProjectTypeId ?? "",
      role_billing_multipliers: c.roleBillingMultipliers ?? [],
      brand_notes: c.brandNotes || "",
      client_type: c.clientType ?? "standard",
      broker_id: c.brokerId ?? null,
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
    if (c.serviceRates !== undefined) patch.service_rates = c.serviceRates;
    if (c.allowedProjectTypeIds !== undefined) patch.allowed_project_type_ids = c.allowedProjectTypeIds;
    if (c.defaultProjectTypeId !== undefined) patch.default_project_type_id = c.defaultProjectTypeId;
    if (c.roleBillingMultipliers !== undefined) patch.role_billing_multipliers = c.roleBillingMultipliers;
    if (c.partnerSplit !== undefined) patch.partner_split = c.partnerSplit;
    if (c.brandNotes !== undefined) patch.brand_notes = c.brandNotes;
    if (c.clientType !== undefined) patch.client_type = c.clientType;
    if (c.brokerId !== undefined) patch.broker_id = c.brokerId ?? null;
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
      home_bases: c.homeBases ?? [],
      requires_shoot_confirmation: c.requiresShootConfirmation ?? false,
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
    if (c.homeBases !== undefined) patch.home_bases = c.homeBases;
    if (c.preferredPaymentMethod !== undefined) patch.preferred_payment_method = c.preferredPaymentMethod;
    if (c.preferredPaymentDetails !== undefined) patch.preferred_payment_details = c.preferredPaymentDetails;
    if (c.businessName !== undefined) patch.business_name = c.businessName;
    if (c.businessAddress !== undefined) patch.business_address = c.businessAddress;
    if (c.businessCity !== undefined) patch.business_city = c.businessCity;
    if (c.businessState !== undefined) patch.business_state = c.businessState;
    if (c.businessZip !== undefined) patch.business_zip = c.businessZip;
    if (c.taxId !== undefined) patch.tax_id = c.taxId;
    if (c.taxIdType !== undefined) patch.tax_id_type = c.taxIdType;
    if (c.w9Url !== undefined) patch.w9_url = c.w9Url;
    if (c.requiresShootConfirmation !== undefined) patch.requires_shoot_confirmation = c.requiresShootConfirmation;
    if (c.archived !== undefined) patch.archived = c.archived;
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
      id, ...(orgId ? { org_id: orgId } : {}), name: t.name, content: t.content,
      blocks: t.blocks ?? [],
      pages: t.pages ?? [],
      updated_at: now,
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
    if (t.blocks !== undefined) patch.blocks = t.blocks;
    if (t.pages !== undefined) patch.pages = t.pages;
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
      field_values: c.fieldValues || {},
      additional_signers: c.additionalSigners || [],
      document_expires_at: c.documentExpiresAt || null,
      reminders_enabled: c.remindersEnabled ?? false,
      proposal_id: c.proposalId ?? null,
      master_template_version_id: c.masterTemplateVersionId || "",
      firing_log: c.firingLog || [],
      send_back_reason: c.sendBackReason || "",
      payment_milestones: c.paymentMilestones || [],
      pages: c.pages || [],
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
    if (c.fieldValues !== undefined) patch.field_values = c.fieldValues;
    if (c.additionalSigners !== undefined) patch.additional_signers = c.additionalSigners;
    if (c.documentExpiresAt !== undefined) patch.document_expires_at = c.documentExpiresAt;
    if (c.remindersEnabled !== undefined) patch.reminders_enabled = c.remindersEnabled;
    if (c.proposalId !== undefined) patch.proposal_id = c.proposalId;
    if (c.masterTemplateVersionId !== undefined) patch.master_template_version_id = c.masterTemplateVersionId;
    if (c.firingLog !== undefined) patch.firing_log = c.firingLog;
    if (c.sendBackReason !== undefined) patch.send_back_reason = c.sendBackReason;
    if (c.pages !== undefined) patch.pages = c.pages;
    if (c.paymentMilestones !== undefined) patch.payment_milestones = c.paymentMilestones;
    const { error } = await supabase.from("contracts").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
    setRawData(d => ({ ...d, contracts: d.contracts.map(x => x.id === id ? { ...x, ...c, updatedAt: patch.updated_at } : x) }));

    // When a contract flips to "sent" status, mark the linked project as
    // "tentative" on the calendar. Stays tentative until the deposit
    // milestone gets paidAt stamped (handled in the Stripe webhook), at
    // which point it transitions back to "upcoming". Best-effort —
    // failure here doesn't block the contract update.
    if (c.status === "sent") {
      try {
        const { data: contractRow } = await supabase
          .from("contracts")
          .select("proposal_id, project_id")
          .eq("id", id)
          .single();
        let projectIdToUpdate: string | null = contractRow?.project_id || null;
        if (!projectIdToUpdate && contractRow?.proposal_id) {
          const { data: prop } = await supabase
            .from("proposals")
            .select("project_id")
            .eq("id", contractRow.proposal_id)
            .single();
          projectIdToUpdate = prop?.project_id || null;
        }
        if (projectIdToUpdate) {
          await supabase
            .from("projects")
            .update({ status: "tentative", updated_at: new Date().toISOString() })
            .eq("id", projectIdToUpdate);
          setRawData(d => ({
            ...d,
            projects: d.projects.map(p => p.id === projectIdToUpdate ? { ...p, status: "tentative" as const } : p),
          }));
        }
      } catch (err) {
        console.warn("[updateContract] project status cascade failed:", err);
      }
    }
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
      contract_template_id: t.contractTemplateId ?? null,
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
    if (t.contractTemplateId !== undefined) patch.contract_template_id = t.contractTemplateId;
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
      contract_template_id: p.contractTemplateId ?? null,
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
    if (p.contractTemplateId !== undefined) patch.contract_template_id = p.contractTemplateId;
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

  // ---- Meetings (lightweight unpaid calendar entries) ----
  const addMeeting = useCallback(async (m: Omit<Meeting, "id" | "ownerUserId" | "orgId" | "createdAt">): Promise<Meeting> => {
    if (!profile?.id) throw new Error("Not signed in");
    const id = `mtg_${Date.now()}`;
    const { data: row, error } = await supabase.from("meetings").insert({
      id,
      ...(orgId ? { org_id: orgId } : {}),
      owner_user_id: profile.id,
      title: m.title,
      date: m.date,
      start_time: m.startTime || "",
      end_time: m.endTime || "",
      client_id: m.clientId || null,
      location_text: m.locationText || "",
      notes: m.notes || "",
      visible_to_client: m.visibleToClient ?? false,
      color: m.color || "",
      assigned_user_ids: m.assignedUserIds ?? [],
      meeting_address: m.meetingAddress || null,
      one_way_miles: typeof m.oneWayMiles === "number" ? m.oneWayMiles : null,
    }).select().single();
    if (error) throw new Error(error.message);
    const meeting = rowToMeeting(row);
    setRawData(d => ({ ...d, meetings: [...d.meetings, meeting].sort((a, b) => a.date.localeCompare(b.date)) }));
    return meeting;
  }, [orgId, profile?.id]);

  const updateMeeting = useCallback(async (id: string, m: Partial<Meeting>) => {
    const patch: any = {};
    if (m.title !== undefined) patch.title = m.title;
    if (m.date !== undefined) patch.date = m.date;
    if (m.startTime !== undefined) patch.start_time = m.startTime;
    if (m.endTime !== undefined) patch.end_time = m.endTime;
    if (m.clientId !== undefined) patch.client_id = m.clientId || null;
    if (m.locationText !== undefined) patch.location_text = m.locationText;
    if (m.notes !== undefined) patch.notes = m.notes;
    if (m.visibleToClient !== undefined) patch.visible_to_client = m.visibleToClient;
    if (m.color !== undefined) patch.color = m.color;
    if (m.assignedUserIds !== undefined) patch.assigned_user_ids = m.assignedUserIds;
    if (m.meetingAddress !== undefined) patch.meeting_address = m.meetingAddress || null;
    if (m.oneWayMiles !== undefined) patch.one_way_miles = m.oneWayMiles ?? null;
    const { error } = await supabase.from("meetings").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
    setRawData(d => ({ ...d, meetings: d.meetings.map(x => x.id === id ? { ...x, ...m } : x) }));
  }, []);

  const deleteMeeting = useCallback(async (id: string) => {
    const { error } = await supabase.from("meetings").delete().eq("id", id);
    if (error) throw new Error(error.message);
    setRawData(d => ({ ...d, meetings: d.meetings.filter(x => x.id !== id) }));
  }, []);

  // ---- Packages library ----
  const addPackage = useCallback(async (p: Omit<Package, "id" | "orgId" | "createdAt" | "updatedAt">): Promise<Package> => {
    const id = `pkg_${Date.now()}_${nanoid(4)}`;
    const { data: row, error } = await supabase.from("packages").insert({
      id,
      ...(orgId ? { org_id: orgId } : {}),
      name: p.name,
      icon: p.icon || "heart",
      icon_custom_data_url: p.iconCustomDataUrl || "",
      description: p.description || "",
      default_price: p.defaultPrice || 0,
      discount_from_price: p.discountFromPrice ?? null,
      photo_data_url: p.photoDataUrl || "",
      deliverables: p.deliverables || [],
      sort_order: p.sortOrder || 0,
    }).select().single();
    if (error) throw new Error(error.message);
    const pkg = rowToPackage(row);
    setRawData(d => ({ ...d, packages: [...d.packages, pkg].sort((a, b) => a.sortOrder - b.sortOrder) }));
    return pkg;
  }, [orgId]);

  const updatePackage = useCallback(async (id: string, p: Partial<Package>) => {
    const patch: any = { updated_at: new Date().toISOString() };
    if (p.name !== undefined) patch.name = p.name;
    if (p.icon !== undefined) patch.icon = p.icon;
    if (p.iconCustomDataUrl !== undefined) patch.icon_custom_data_url = p.iconCustomDataUrl;
    if (p.description !== undefined) patch.description = p.description;
    if (p.defaultPrice !== undefined) patch.default_price = p.defaultPrice;
    if (p.discountFromPrice !== undefined) patch.discount_from_price = p.discountFromPrice;
    if (p.photoDataUrl !== undefined) patch.photo_data_url = p.photoDataUrl;
    if (p.deliverables !== undefined) patch.deliverables = p.deliverables;
    if (p.sortOrder !== undefined) patch.sort_order = p.sortOrder;
    const { error } = await supabase.from("packages").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
    setRawData(d => ({ ...d, packages: d.packages.map(x => x.id === id ? { ...x, ...p } : x) }));
  }, []);

  const deletePackage = useCallback(async (id: string) => {
    const { error } = await supabase.from("packages").update({ deleted_at: new Date().toISOString() }).eq("id", id);
    if (error) throw new Error(error.message);
    setRawData(d => ({ ...d, packages: d.packages.filter(x => x.id !== id) }));
  }, []);

  // ---- Proposal images library ----
  const addProposalImage = useCallback(async (i: Omit<ProposalImage, "id" | "orgId" | "createdAt" | "updatedAt">): Promise<ProposalImage> => {
    const id = `img_${Date.now()}_${nanoid(4)}`;
    const { data: row, error } = await supabase.from("proposal_images").insert({
      id,
      ...(orgId ? { org_id: orgId } : {}),
      name: i.name,
      image_data_url: i.imageDataUrl,
      width: i.width || 0,
      height: i.height || 0,
      sort_order: i.sortOrder || Date.now(),
    }).select().single();
    if (error) throw new Error(error.message);
    const img = rowToProposalImage(row);
    setRawData(d => ({ ...d, proposalImages: [img, ...d.proposalImages] }));
    return img;
  }, [orgId]);

  const updateProposalImage = useCallback(async (id: string, i: Partial<ProposalImage>) => {
    const patch: any = { updated_at: new Date().toISOString() };
    if (i.name !== undefined) patch.name = i.name;
    if (i.sortOrder !== undefined) patch.sort_order = i.sortOrder;
    const { error } = await supabase.from("proposal_images").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
    setRawData(d => ({ ...d, proposalImages: d.proposalImages.map(x => x.id === id ? { ...x, ...i } : x) }));
  }, []);

  const deleteProposalImage = useCallback(async (id: string) => {
    const { error } = await supabase.from("proposal_images").update({ deleted_at: new Date().toISOString() }).eq("id", id);
    if (error) throw new Error(error.message);
    setRawData(d => ({ ...d, proposalImages: d.proposalImages.filter(x => x.id !== id) }));
  }, []);

  // ---- Deliveries (galleries) ----
  const addDelivery = useCallback(async (d: Omit<Delivery, "id" | "token" | "hasPassword" | "createdAt" | "updatedAt" | "viewCount" | "downloadCount" | "submittedAt" | "workingAt" | "deliveredAt" | "clientName" | "clientEmail">): Promise<Delivery> => {
    const id = nanoid(10);
    const token = nanoid(16); // longer for public URL — harder to guess
    const now = new Date().toISOString();
    const { data: row, error } = await supabase.from("deliveries").insert({
      id, ...(orgId ? { org_id: orgId } : {}),
      project_id: d.projectId, title: d.title, cover_file_id: d.coverFileId,
      cover_layout: d.coverLayout || "center",
      cover_font: d.coverFont || "",
      cover_subtitle: d.coverSubtitle,
      cover_date: d.coverDate,
      token, expires_at: d.expiresAt,
      selection_limit: d.selectionLimit, download_only: d.downloadOnly ?? false, per_extra_photo_cents: d.perExtraPhotoCents,
      buy_all_flat_cents: d.buyAllFlatCents, status: d.status || "draft",
      updated_at: now,
    }).select().single();
    if (error) throw new Error(error.message);
    const delivery = rowToDelivery(row);
    setRawData(d => ({ ...d, deliveries: [delivery, ...d.deliveries] }));
    return delivery;
  }, [orgId]);

  // Auto-create a private (draft) gallery linked to a real-estate shoot, so the
  // owner always has a place to upload. Skips if one already exists. No-op-safe.
  const createReShootGallery = useCallback(async (projectId: string, title: string): Promise<Delivery | null> => {
    return addDelivery({
      projectId, collectionId: null, title: title || "Real Estate Shoot",
      coverFileId: null, watermarkText: null, watermarkUseLogo: false, printsEnabled: false,
      coverLayout: "center", coverFont: "", coverSubtitle: null, coverDate: null,
      slug: null, requireEmail: false, expiresAt: null,
      selectionLimit: 0, downloadOnly: true, perExtraPhotoCents: 0, buyAllFlatCents: 0, status: "draft",
    });
  }, [addDelivery]);

  const updateDelivery = useCallback(async (id: string, d: Partial<Delivery>) => {
    const patch: any = { updated_at: new Date().toISOString() };
    if (d.title !== undefined) patch.title = d.title;
    if (d.coverFileId !== undefined) patch.cover_file_id = d.coverFileId;
    if (d.coverLayout !== undefined) patch.cover_layout = d.coverLayout;
    if (d.coverFont !== undefined) patch.cover_font = d.coverFont;
    if (d.coverSubtitle !== undefined) patch.cover_subtitle = d.coverSubtitle;
    if (d.coverDate !== undefined) patch.cover_date = d.coverDate;
    if (d.slug !== undefined) patch.slug = d.slug;
    if (d.requireEmail !== undefined) patch.require_email = d.requireEmail;
    if (d.collectionId !== undefined) patch.collection_id = d.collectionId;
    if (d.watermarkText !== undefined) patch.watermark_text = d.watermarkText;
    if (d.watermarkUseLogo !== undefined) patch.watermark_use_logo = d.watermarkUseLogo;
    if (d.printsEnabled !== undefined) patch.prints_enabled = d.printsEnabled;
    if (d.projectId !== undefined) patch.project_id = d.projectId;
    if (d.expiresAt !== undefined) patch.expires_at = d.expiresAt;
    if (d.selectionLimit !== undefined) patch.selection_limit = d.selectionLimit;
    if (d.downloadOnly !== undefined) patch.download_only = d.downloadOnly;
    if (d.perExtraPhotoCents !== undefined) patch.per_extra_photo_cents = d.perExtraPhotoCents;
    if (d.buyAllFlatCents !== undefined) patch.buy_all_flat_cents = d.buyAllFlatCents;
    if (d.status !== undefined) patch.status = d.status;
    const { error } = await supabase.from("deliveries").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
    setRawData(s => ({ ...s, deliveries: s.deliveries.map(x => x.id === id ? { ...x, ...d, updatedAt: patch.updated_at } : x) }));
  }, []);

  const deleteDelivery = useCallback(async (id: string) => {
    // Hard delete (cascades to delivery_files + delivery_selections via FK).
    // Storage-side cleanup happens via the API endpoint, which can also unlink R2 objects.
    const { error } = await supabase.from("deliveries").delete().eq("id", id);
    if (error) throw new Error(error.message);
    setRawData(s => ({
      ...s,
      deliveries: s.deliveries.filter(x => x.id !== id),
      deliveryFiles: s.deliveryFiles.filter(f => f.deliveryId !== id),
      deliverySelections: s.deliverySelections.filter(sel => sel.deliveryId !== id),
    }));
  }, []);

  const setDeliveryStatus = useCallback(async (id: string, status: DeliveryStatus) => {
    const now = new Date().toISOString();
    const patch: any = { status, updated_at: now };
    if (status === "submitted") patch.submitted_at = now;
    else if (status === "working") patch.working_at = now;
    else if (status === "delivered") patch.delivered_at = now;
    const { error } = await supabase.from("deliveries").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
    setRawData(s => ({
      ...s,
      deliveries: s.deliveries.map(x => x.id === id
        ? { ...x, status, updatedAt: now,
            submittedAt: status === "submitted" ? now : x.submittedAt,
            workingAt: status === "working" ? now : x.workingAt,
            deliveredAt: status === "delivered" ? now : x.deliveredAt }
        : x),
    }));
  }, []);

  const registerDeliveryFile = useCallback(async (f: Omit<DeliveryFile, "id" | "createdAt" | "downloadCount">): Promise<DeliveryFile> => {
    const id = nanoid(10);
    const { data: row, error } = await supabase.from("delivery_files").insert({
      id, delivery_id: f.deliveryId, ...(orgId ? { org_id: orgId } : {}),
      storage_path: f.storagePath, original_name: f.originalName,
      size_bytes: f.sizeBytes, width: f.width, height: f.height,
      mime_type: f.mimeType, position: f.position,
      media_type: f.mediaType ?? "image",
      thumbnail_storage_path: f.thumbnailStoragePath ?? "",
      duration_seconds: f.durationSeconds ?? null,
    }).select().single();
    if (error) throw new Error(error.message);
    const file = rowToDeliveryFile(row);
    setRawData(s => ({ ...s, deliveryFiles: [...s.deliveryFiles, file] }));
    return file;
  }, [orgId]);

  const updateDeliveryFile = useCallback(async (id: string, patch: Partial<Pick<DeliveryFile, "thumbnailStoragePath" | "durationSeconds">>) => {
    const dbPatch: Record<string, unknown> = {};
    if (patch.thumbnailStoragePath !== undefined) dbPatch.thumbnail_storage_path = patch.thumbnailStoragePath;
    if (patch.durationSeconds !== undefined) dbPatch.duration_seconds = patch.durationSeconds;
    if (Object.keys(dbPatch).length === 0) return;
    const { error } = await supabase.from("delivery_files").update(dbPatch).eq("id", id);
    if (error) throw new Error(error.message);
    setRawData(s => ({
      ...s,
      deliveryFiles: s.deliveryFiles.map(f => f.id === id ? { ...f, ...patch } : f),
    }));
  }, []);

  const deleteDeliveryFile = useCallback(async (id: string) => {
    const { error } = await supabase.from("delivery_files").delete().eq("id", id);
    if (error) throw new Error(error.message);
    setRawData(s => ({ ...s, deliveryFiles: s.deliveryFiles.filter(f => f.id !== id) }));
  }, []);

  const reorderDeliveryFiles = useCallback(async (deliveryId: string, orderedIds: string[]) => {
    // Update each file's position individually — a partial upsert would null out
    // the row's NOT NULL columns (storage_path etc.) on insert. Update local
    // state first so the new order shows instantly, then persist.
    setRawData(s => {
      const positionMap = new Map(orderedIds.map((id, i) => [id, i]));
      return {
        ...s,
        deliveryFiles: s.deliveryFiles.map(f =>
          f.deliveryId === deliveryId && positionMap.has(f.id)
            ? { ...f, position: positionMap.get(f.id)! }
            : f
        ),
      };
    });
    const results = await Promise.all(
      orderedIds.map((fid, i) => supabase.from("delivery_files").update({ position: i }).eq("id", fid))
    );
    const failed = results.find(r => r.error);
    if (failed?.error) throw new Error(failed.error.message);
  }, []);

  // ---- Delivery Collections ----
  const addDeliveryCollection = useCallback(async (c: { name: string; slug: string | null; coverSubtitle: string | null }): Promise<DeliveryCollection> => {
    const id = nanoid(10);
    const now = new Date().toISOString();
    const { data: row, error } = await supabase.from("delivery_collections").insert({
      id, ...(orgId ? { org_id: orgId } : {}),
      name: c.name, slug: c.slug, cover_subtitle: c.coverSubtitle,
      updated_at: now,
    }).select().single();
    if (error) throw new Error(error.message);
    const coll = rowToDeliveryCollection(row);
    setRawData(s => ({ ...s, deliveryCollections: [coll, ...s.deliveryCollections] }));
    return coll;
  }, [orgId]);

  const updateDeliveryCollection = useCallback(async (id: string, c: Partial<Pick<DeliveryCollection, "name" | "slug" | "coverSubtitle">>) => {
    const patch: any = { updated_at: new Date().toISOString() };
    if (c.name !== undefined) patch.name = c.name;
    if (c.slug !== undefined) patch.slug = c.slug;
    if (c.coverSubtitle !== undefined) patch.cover_subtitle = c.coverSubtitle;
    const { error } = await supabase.from("delivery_collections").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
    setRawData(s => ({
      ...s,
      deliveryCollections: s.deliveryCollections.map(x => x.id === id ? { ...x, ...c, updatedAt: patch.updated_at } : x),
    }));
  }, []);

  const deleteDeliveryCollection = useCallback(async (id: string) => {
    const { error } = await supabase.from("delivery_collections").delete().eq("id", id);
    if (error) throw new Error(error.message);
    setRawData(s => ({
      ...s,
      deliveryCollections: s.deliveryCollections.filter(x => x.id !== id),
      // Detach any galleries that pointed at this collection
      deliveries: s.deliveries.map(d => d.collectionId === id ? { ...d, collectionId: null } : d),
    }));
  }, []);

  // ---- Service Categories / Services / Variants ----
  // Hierarchical pricing model: Category → Service → Variant.
  // Each level has CRUD; cascading deletes (variants on service delete,
  // services + variants on category delete) are handled by the
  // ON DELETE CASCADE foreign keys in the schema.
  const addServiceCategory = useCallback(async (c: Omit<ServiceCategory, "id" | "createdAt">): Promise<ServiceCategory> => {
    const id = nanoid(10);
    const { data: row, error } = await supabase.from("service_categories").insert({
      id, ...(orgId ? { org_id: orgId } : {}),
      name: c.name, position: c.position ?? 0, applies_to: c.appliesTo ?? "any", client_ids: c.clientIds ?? [], updated_at: new Date().toISOString(),
    }).select().single();
    if (error) throw new Error(error.message);
    const cat = rowToServiceCategory(row);
    setRawData(d => ({ ...d, serviceCategories: [...d.serviceCategories, cat].sort((a, b) => a.position - b.position) }));
    return cat;
  }, [orgId]);

  const updateServiceCategory = useCallback(async (id: string, c: Partial<ServiceCategory>) => {
    const patch: any = { updated_at: new Date().toISOString() };
    if (c.name !== undefined) patch.name = c.name;
    if (c.position !== undefined) patch.position = c.position;
    if (c.appliesTo !== undefined) patch.applies_to = c.appliesTo;
    if (c.clientIds !== undefined) patch.client_ids = c.clientIds;
    const { error } = await supabase.from("service_categories").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
    setRawData(d => ({ ...d, serviceCategories: d.serviceCategories.map(x => x.id === id ? { ...x, ...c } : x) }));
  }, []);

  const deleteServiceCategory = useCallback(async (id: string) => {
    // Soft delete — cascades to services + variants through their FK
    // ON DELETE CASCADE since the DB foreign keys reference the same
    // row even when deleted_at is set. We rely on the load query's
    // `.is("deleted_at", null)` filter to hide it from the UI.
    const { error } = await supabase.from("service_categories").update({ deleted_at: new Date().toISOString() }).eq("id", id);
    if (error) throw new Error(error.message);
    setRawData(d => ({
      ...d,
      serviceCategories: d.serviceCategories.filter(x => x.id !== id),
      // Hide services + variants under the deleted category too.
      services: d.services.filter(s => s.categoryId !== id),
      serviceVariants: d.serviceVariants.filter(v => !d.services.find(s => s.id === v.serviceId && s.categoryId === id)),
    }));
  }, []);

  const addService = useCallback(async (s: Omit<Service, "id" | "createdAt">): Promise<Service> => {
    const id = nanoid(10);
    const { data: row, error } = await supabase.from("services").insert({
      id, ...(orgId ? { org_id: orgId } : {}),
      category_id: s.categoryId, name: s.name,
      default_price: s.defaultPrice ?? 0, default_cost: s.defaultCost ?? 0,
      crew_role: s.crewRole ?? null,
      duration_minutes: s.durationMinutes ?? 0, description: s.description ?? "", position: s.position ?? 0,
      updated_at: new Date().toISOString(),
    }).select().single();
    if (error) throw new Error(error.message);
    const svc = rowToService(row);
    setRawData(d => ({ ...d, services: [...d.services, svc].sort((a, b) => a.position - b.position) }));
    return svc;
  }, [orgId]);

  const updateService = useCallback(async (id: string, s: Partial<Service>) => {
    const patch: any = { updated_at: new Date().toISOString() };
    if (s.name !== undefined) patch.name = s.name;
    if (s.defaultPrice !== undefined) patch.default_price = s.defaultPrice;
    if (s.defaultCost !== undefined) patch.default_cost = s.defaultCost;
    if (s.crewRole !== undefined) patch.crew_role = s.crewRole;
    if (s.durationMinutes !== undefined) patch.duration_minutes = s.durationMinutes;
    if (s.description !== undefined) patch.description = s.description;
    if (s.position !== undefined) patch.position = s.position;
    if (s.categoryId !== undefined) patch.category_id = s.categoryId;
    const { error } = await supabase.from("services").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
    setRawData(d => ({ ...d, services: d.services.map(x => x.id === id ? { ...x, ...s } : x) }));
  }, []);

  const deleteService = useCallback(async (id: string) => {
    const { error } = await supabase.from("services").update({ deleted_at: new Date().toISOString() }).eq("id", id);
    if (error) throw new Error(error.message);
    setRawData(d => ({
      ...d,
      services: d.services.filter(x => x.id !== id),
      serviceVariants: d.serviceVariants.filter(v => v.serviceId !== id),
    }));
  }, []);

  const addServiceVariant = useCallback(async (v: Omit<ServiceVariant, "id" | "createdAt">): Promise<ServiceVariant> => {
    const id = nanoid(10);
    const { data: row, error } = await supabase.from("service_variants").insert({
      id, ...(orgId ? { org_id: orgId } : {}),
      service_id: v.serviceId, label: v.label,
      price: v.price ?? 0, cost: v.cost ?? 0,
      duration_minutes: v.durationMinutes ?? 0, position: v.position ?? 0,
      updated_at: new Date().toISOString(),
    }).select().single();
    if (error) throw new Error(error.message);
    const variant = rowToServiceVariant(row);
    setRawData(d => ({ ...d, serviceVariants: [...d.serviceVariants, variant].sort((a, b) => a.position - b.position) }));
    return variant;
  }, [orgId]);

  const updateServiceVariant = useCallback(async (id: string, v: Partial<ServiceVariant>) => {
    const patch: any = { updated_at: new Date().toISOString() };
    if (v.label !== undefined) patch.label = v.label;
    if (v.price !== undefined) patch.price = v.price;
    if (v.cost !== undefined) patch.cost = v.cost;
    if (v.durationMinutes !== undefined) patch.duration_minutes = v.durationMinutes;
    if (v.position !== undefined) patch.position = v.position;
    if (v.serviceId !== undefined) patch.service_id = v.serviceId;
    const { error } = await supabase.from("service_variants").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
    setRawData(d => ({ ...d, serviceVariants: d.serviceVariants.map(x => x.id === id ? { ...x, ...v } : x) }));
  }, []);

  const deleteServiceVariant = useCallback(async (id: string) => {
    const { error } = await supabase.from("service_variants").update({ deleted_at: new Date().toISOString() }).eq("id", id);
    if (error) throw new Error(error.message);
    setRawData(d => ({ ...d, serviceVariants: d.serviceVariants.filter(x => x.id !== id) }));
  }, []);

  const markSelectionEdited = useCallback(async (selectionId: string, edited: boolean) => {
    const editedAt = edited ? new Date().toISOString() : null;
    const { error } = await supabase.from("delivery_selections").update({ edited_at: editedAt }).eq("id", selectionId);
    if (error) throw new Error(error.message);
    setRawData(s => ({
      ...s,
      deliverySelections: s.deliverySelections.map(sel => sel.id === selectionId ? { ...sel, editedAt } : sel),
    }));
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
    if (updates.logoUrl !== undefined) patch.logo_url = updates.logoUrl;
    if (updates.faviconUrl !== undefined) patch.favicon_url = updates.faviconUrl;
    if (updates.features !== undefined) patch.features = updates.features;
    if (updates.productionType !== undefined) patch.production_type = updates.productionType;
    if (updates.defaultBillingModel !== undefined) patch.default_billing_model = updates.defaultBillingModel;
    if (updates.defaultBillingRate !== undefined) patch.default_billing_rate = updates.defaultBillingRate;
    if (updates.businessInfo !== undefined) patch.business_info = updates.businessInfo;
    if (updates.dashboardWidgets !== undefined) patch.dashboard_widgets = updates.dashboardWidgets;
    if (updates.pipelineStages !== undefined) patch.pipeline_stages = updates.pipelineStages;
    if (updates.services !== undefined) patch.services = updates.services;
    if (updates.seriesReviewMessageTemplate !== undefined) patch.series_review_message_template = updates.seriesReviewMessageTemplate;
    if (updates.staffAgreementText !== undefined) patch.staff_agreement_text = updates.staffAgreementText;
    if (updates.staffAgreementVersion !== undefined) patch.staff_agreement_version = updates.staffAgreementVersion;
    const { error } = await supabase.from("organizations").update(patch).eq("id", orgId);
    if (error) throw new Error(error.message);
    setRawData(d => ({ ...d, organization: d.organization ? { ...d.organization, ...updates } : null }));
  }, [orgId]);

  // ---- Crew Location Distances ----
  // Distances are now keyed by (crew_member, home_base, location).
  // Defaults to "primary" if no home base is specified — matches the
  // backfill default for legacy rows.
  const upsertDistance = useCallback(async (crewMemberId: string, locationId: string, distanceMiles: number, homeBaseId: string = "primary") => {
    const id = `${crewMemberId}_${homeBaseId}_${locationId}`;
    const { error } = await supabase.from("crew_location_distances").upsert({
      id, ...(orgId ? { org_id: orgId } : {}), crew_member_id: crewMemberId, home_base_id: homeBaseId, location_id: locationId, distance_miles: distanceMiles,
    }, { onConflict: "crew_member_id,home_base_id,location_id" });
    if (error) throw new Error(error.message);
    setRawData(d => {
      const existing = d.crewLocationDistances.find(x => x.crewMemberId === crewMemberId && x.homeBaseId === homeBaseId && x.locationId === locationId);
      if (existing) {
        return { ...d, crewLocationDistances: d.crewLocationDistances.map(x => x.id === existing.id ? { ...x, distanceMiles } : x) };
      }
      return { ...d, crewLocationDistances: [...d.crewLocationDistances, { id, crewMemberId, homeBaseId, locationId, distanceMiles, createdAt: new Date().toISOString() }] };
    });
  }, [orgId]);

  // Auto-compute the drive from each assigned person's primary home base to the
  // project's location, so mileage shows up without visiting the Locations page.
  // Best-effort; skips anyone who already has a distance for this location, and
  // works with one-line addresses (no separate city/state/zip required).
  const ensureLocationDistances = useCallback(async (locationId: string | null | undefined, crewMemberIds: string[]) => {
    if (!locationId) return;
    const loc = rawData.locations.find(l => l.id === locationId);
    if (!loc?.address) return;
    const joinAddr = (a?: string, city?: string, state?: string, zip?: string) =>
      [a, city, [state, zip].filter(Boolean).join(" ")].map(s => (s || "").trim()).filter(Boolean).join(", ");
    const destination = joinAddr(loc.address, loc.city, loc.state, loc.zip);
    const done = new Set<string>();
    for (const cmId of crewMemberIds) {
      if (!cmId || done.has(cmId)) continue;
      done.add(cmId);
      if (rawData.crewLocationDistances.some(d => d.crewMemberId === cmId && d.locationId === locationId)) continue;
      const ha = rawData.crewMembers.find(c => c.id === cmId)?.homeAddress;
      if (!ha?.address) continue;
      try {
        const token = (await supabase.auth.getSession()).data.session?.access_token;
        if (!token) continue;
        const res = await fetch("/api/calculate-distance", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ origin: joinAddr(ha.address, ha.city, ha.state, ha.zip), destination }),
        });
        if (res.ok) { const { distanceMiles } = await res.json(); await upsertDistance(cmId, locationId, distanceMiles, "primary"); }
      } catch (e) { console.error("auto-distance failed:", e); }
    }
  }, [rawData, upsertDistance]);

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

  const updateManualTrip = useCallback(async (id: string, patch: Partial<Omit<ManualTrip, "id" | "createdAt">>) => {
    const dbPatch: Record<string, unknown> = {};
    if (patch.crewMemberId !== undefined) dbPatch.crew_member_id = patch.crewMemberId;
    if (patch.date !== undefined) dbPatch.date = patch.date;
    if (patch.destination !== undefined) dbPatch.destination = patch.destination;
    if (patch.locationId !== undefined) dbPatch.location_id = patch.locationId || null;
    if (patch.purpose !== undefined) dbPatch.purpose = patch.purpose;
    if (patch.roundTripMiles !== undefined) dbPatch.round_trip_miles = patch.roundTripMiles;
    if (Object.keys(dbPatch).length === 0) return;
    const { error } = await supabase.from("manual_trips").update(dbPatch).eq("id", id);
    if (error) throw new Error(error.message);
    setRawData(d => ({ ...d, manualTrips: d.manualTrips.map(t => t.id === id ? { ...t, ...patch } : t) }));
  }, []);

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
    const { data: row, error } = await supabase.from("project_types").insert({ id, ...(orgId ? { org_id: orgId } : {}), name: pt.name, lightweight: pt.lightweight || false, applies_to: pt.appliesTo || "any" }).select().single();
    if (error) throw new Error(error.message);
    const type = rowToProjectType(row);
    setRawData(d => ({ ...d, projectTypes: [...d.projectTypes, type].sort((a, b) => a.name.localeCompare(b.name)) }));
    return type;
  }, [orgId]);

  const updateProjectType = useCallback(async (id: string, pt: Partial<ProjectType>) => {
    const dbFields: Record<string, any> = {};
    if (pt.name !== undefined) dbFields.name = pt.name;
    if (pt.lightweight !== undefined) dbFields.lightweight = pt.lightweight;
    if (pt.appliesTo !== undefined) dbFields.applies_to = pt.appliesTo;
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
    const { data: row, error } = await supabase.from("edit_types").insert({ id, ...(orgId ? { org_id: orgId } : {}), name: et.name, applies_to: et.appliesTo || "any" }).select().single();
    if (error) throw new Error(error.message);
    const type = rowToEditType(row);
    setRawData(d => ({ ...d, editTypes: [...d.editTypes, type].sort((a, b) => a.name.localeCompare(b.name)) }));
    return type;
  }, [orgId]);

  const updateEditType = useCallback(async (id: string, et: Partial<EditType>) => {
    const dbFields: Record<string, any> = {};
    if (et.name !== undefined) dbFields.name = et.name;
    if (et.appliesTo !== undefined) dbFields.applies_to = et.appliesTo;
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
  // Append entries to a project's audit trail (best-effort — a logging failure
  // must never block the underlying edit). Actor is the REAL signed-in user,
  // not an impersonated one, so the trail reflects who actually did it.
  const logProjectHistory = useCallback(async (
    projectId: string,
    entries: Array<{ action: ProjectHistoryEntry["action"]; from?: string | null; to?: string | null }>,
  ) => {
    if (!entries.length) return;
    const rows = entries.map(e => ({
      id: nanoid(12),
      org_id: orgId,
      project_id: projectId,
      actor_user_id: profile?.id || null,
      actor_name: profile?.name || "",
      action: e.action,
      from_value: e.from ?? null,
      to_value: e.to ?? null,
    }));
    const { error } = await supabase.from("project_history").insert(rows);
    if (error) console.error("project history log failed:", error.message);
  }, [orgId, profile]);

  const fetchProjectHistory = useCallback(async (projectId: string): Promise<ProjectHistoryEntry[]> => {
    const { data, error } = await supabase
      .from("project_history").select("*").eq("project_id", projectId).order("created_at", { ascending: false });
    if (error) { console.error("fetch project history failed:", error.message); return []; }
    return (data || []).map((r: any) => ({
      id: r.id,
      projectId: r.project_id,
      actorUserId: r.actor_user_id || null,
      actorName: r.actor_name || "",
      action: r.action,
      fromValue: r.from_value ?? null,
      toValue: r.to_value ?? null,
      createdAt: r.created_at,
    }));
  }, []);

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
      billed_hours: p.billedHours ?? null,
      paid_date: p.paidDate || null,
      edit_types: p.editTypes,
      notes: p.notes,
      deliverable_url: p.deliverableUrl || "",
      cancellation_reason: p.cancellationReason || "",
      cancelled_at: p.status === "cancelled" ? (p.cancelledAt || new Date().toISOString()) : (p.cancelledAt || null),
      discount_type: p.discountType || null,
      discount_amount: p.discountAmount ?? 0,
      discount_reason: p.discountReason || "",
      service_category_id: p.serviceCategoryId || null,
      services: p.services ?? [],
      bill_to_id: p.billToId ?? null,
      products: p.products ?? [],
    }).select().single();
    if (error) throw new Error(error.message);
    const project = rowToProject(row);
    setRawData(d => ({ ...d, projects: [...d.projects, project].sort((a, b) => a.date.localeCompare(b.date)) }));
    // Audit trail: record who created it (and the initial date it was set to).
    logProjectHistory(id, [{ action: "created", to: project.date }]);
    return project;
  }, [orgId, logProjectHistory]);

  const updateProject = useCallback(async (id: string, p: Partial<Project>) => {
    // Snapshot the current values so we can log what actually changed.
    const prev = rawData.projects.find(x => x.id === id);
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
    // Auto-finalize editor billing when project transitions to a
    // finished state (editing_done OR delivered).
    if ((p.status === "editing_done" || p.status === "delivered") && !patch.editor_billing) {
      const { data: current } = await supabase.from("projects").select("editor_billing").eq("id", id).single();
      if (current?.editor_billing && !current.editor_billing.finalized) {
        patch.editor_billing = { ...current.editor_billing, finalized: true };
      }
    }
    if (p.projectRate !== undefined) patch.project_rate = p.projectRate;
    if (p.billingModel !== undefined) patch.billing_model = p.billingModel;
    if (p.billingRate !== undefined) patch.billing_rate = p.billingRate;
    if (p.billedHours !== undefined) patch.billed_hours = p.billedHours;
    if (p.paidDate !== undefined) patch.paid_date = p.paidDate;
    if (p.editTypes !== undefined) patch.edit_types = p.editTypes;
    if (p.notes !== undefined) patch.notes = p.notes;
    if (p.deliverableUrl !== undefined) patch.deliverable_url = p.deliverableUrl;
    if (p.cancellationReason !== undefined) patch.cancellation_reason = p.cancellationReason;
    if (p.cancelledAt !== undefined) patch.cancelled_at = p.cancelledAt;
    if (p.onTheWayAt !== undefined) patch.on_the_way_at = p.onTheWayAt;
    if (p.discountType !== undefined) patch.discount_type = p.discountType;
    if (p.discountAmount !== undefined) patch.discount_amount = p.discountAmount;
    if (p.discountReason !== undefined) patch.discount_reason = p.discountReason;
    if (p.serviceCategoryId !== undefined) patch.service_category_id = p.serviceCategoryId || null;
    if (p.services !== undefined) patch.services = p.services;
    if (p.billToId !== undefined) patch.bill_to_id = p.billToId ?? null;
    if (p.products !== undefined) patch.products = p.products;
    // Auto-stamp cancelled_at the first time status flips to "cancelled" if
    // the caller didn't supply one explicitly. Doesn't fire if status is
    // already cancelled or unchanged.
    if (p.status === "cancelled" && p.cancelledAt === undefined) {
      const { data: current } = await supabase.from("projects").select("status,cancelled_at").eq("id", id).single();
      if (current && current.status !== "cancelled" && !current.cancelled_at) {
        patch.cancelled_at = new Date().toISOString();
      }
    }
    const { data: updated, error } = await supabase.from("projects").update(patch).eq("id", id).select().single();
    if (error) throw new Error(error.message);
    if (!updated) throw new Error("Update failed — row not returned (possible RLS restriction)");
    const normalized = rowToProject(updated);
    setRawData(d => ({ ...d, projects: d.projects.map(x => x.id === id ? normalized : x) }));

    // Audit trail: log status / date / time moves (only real changes).
    if (prev) {
      const hist: Array<{ action: ProjectHistoryEntry["action"]; from?: string | null; to?: string | null }> = [];
      if (patch.status !== undefined && patch.status !== prev.status) hist.push({ action: "status_changed", from: prev.status, to: patch.status });
      if (patch.date !== undefined && patch.date !== prev.date) hist.push({ action: "date_changed", from: prev.date, to: patch.date });
      if (patch.start_time !== undefined && patch.start_time !== prev.startTime) hist.push({ action: "time_changed", from: prev.startTime, to: patch.start_time });
      logProjectHistory(id, hist);
    }

    // Notify owners/partners when staff advances a project status. The
    // owner moving things themselves doesn't need a ping (they already
    // know). Best-effort — never block the update on a notification fail.
    if (p.status !== undefined && profile && profile.role !== "owner" && profile.role !== "partner") {
      try {
        const recipients = allProfiles.filter(u => (u.role === "owner" || u.role === "partner") && u.orgId === profile.orgId);
        const projectClient = rawData.clients.find(c => c.id === normalized.clientId);
        const projectType = rawData.projectTypes.find(t => t.id === normalized.projectTypeId);
        const projLabel = `${projectType?.name || "Project"}${projectClient ? ` — ${projectClient.company}` : ""}`;
        const statusLabels: Record<string, string> = {
          filming_done: "Filming Done", in_editing: "In Editing", editing_done: "Editing Done", delivered: "Delivered",
        };
        const newStatusLabel = statusLabels[p.status] || p.status;
        for (const r of recipients) {
          await supabase.from("notifications").insert({
            id: nanoid(12),
            user_id: r.id,
            type: "status_change",
            title: `${profile.name} moved a project`,
            message: `${projLabel} → ${newStatusLabel}`,
            link: "/calendar",
          });
        }
      } catch (err) {
        console.warn("[updateProject] notify owners failed:", err);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, allProfiles, logProjectHistory]);

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
      payment_methods: inv.paymentMethods && inv.paymentMethods.length > 0 ? inv.paymentMethods : ["stripe"],
      view_token: inv.viewToken || null,
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
    if (inv.checkSentAt !== undefined) patch.check_sent_at = inv.checkSentAt;
    if (inv.lineItems !== undefined) patch.line_items = inv.lineItems;
    if (inv.companyInfo !== undefined) patch.company_info = inv.companyInfo;
    if (inv.clientInfo !== undefined) patch.client_info = inv.clientInfo;
    if (inv.notes !== undefined) patch.notes = inv.notes;
    if (inv.paymentMethods !== undefined) patch.payment_methods = inv.paymentMethods;
    if (inv.viewToken !== undefined) patch.view_token = inv.viewToken || null;
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
    if (inv.paidAt !== undefined) patch.paid_at = inv.paidAt;
    if (inv.paymentMethod !== undefined) patch.payment_method = inv.paymentMethod;
    if (inv.paymentReference !== undefined) patch.payment_reference = inv.paymentReference;
    const { error } = await supabase.from("contractor_invoices").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
    const existing = rawData.contractorInvoices.find(x => x.id === id);
    setRawData(d => ({ ...d, contractorInvoices: d.contractorInvoices.map(x => x.id === id ? { ...x, ...inv } : x) }));

    // Notifications:
    //  - Status moved to "sent" (i.e. submitted by staff) → ping owners.
    //  - Status moved to "paid" (i.e. admin marked it) → ping the staff member.
    try {
      if (inv.status === "sent" && existing && profile) {
        const recipients = allProfiles.filter(u => (u.role === "owner" || u.role === "partner") && u.orgId === profile.orgId);
        const submitter = rawData.crewMembers.find(c => c.id === existing.crewMemberId);
        for (const r of recipients) {
          await supabase.from("notifications").insert({
            id: nanoid(12),
            user_id: r.id,
            type: "invoice_submitted",
            title: `${submitter?.name || "A contractor"} submitted an invoice`,
            message: `${existing.invoiceNumber} · $${existing.total.toFixed(2)}`,
            link: "/contractor-invoices",
          });
        }
      }
      if (inv.status === "paid" && existing) {
        // Find the user_profile that maps to this crew member
        const member = rawData.crewMembers.find(c => c.id === existing.crewMemberId);
        const recipientProfile = allProfiles.find(u => u.crewMemberId === existing.crewMemberId)
          || (member?.email ? allProfiles.find(u => u.email === member.email) : null);
        if (recipientProfile) {
          await supabase.from("notifications").insert({
            id: nanoid(12),
            user_id: recipientProfile.id,
            type: "invoice_paid",
            title: "Your invoice was paid",
            message: `${existing.invoiceNumber} · $${existing.total.toFixed(2)}`,
            link: "/my-invoices",
          });
        }
      }
    } catch (err) {
      console.warn("[updateContractorInvoice] notify failed:", err);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, allProfiles]);

  const deleteContractorInvoice = useCallback(async (id: string) => {
    const { error } = await supabase.from("contractor_invoices").delete().eq("id", id);
    if (error) throw new Error(error.message);
    setRawData(d => ({ ...d, contractorInvoices: d.contractorInvoices.filter(x => x.id !== id) }));
  }, []);

  // ---- Crew Payments (owner-logged direct payments) ----
  const addCrewPayment = useCallback(async (p: Omit<CrewPayment, "id" | "createdAt">): Promise<CrewPayment> => {
    const id = nanoid(10);
    const { data: row, error } = await supabase.from("crew_payments").insert({
      id,
      ...(orgId ? { org_id: orgId } : {}),
      crew_member_id: p.crewMemberId,
      project_id: p.projectId,
      role: p.role ?? null,
      amount: p.amount,
      payment_method: p.paymentMethod,
      paid_at: p.paidAt,
      reference: p.reference ?? null,
      note: p.note ?? null,
    }).select().single();
    if (error) throw new Error(error.message);
    const cp = rowToCrewPayment(row);
    setRawData(d => ({ ...d, crewPayments: [cp, ...d.crewPayments] }));
    return cp;
  }, [orgId]);

  const updateCrewPayment = useCallback(async (id: string, p: Partial<CrewPayment>) => {
    const patch: any = {};
    if (p.crewMemberId !== undefined) patch.crew_member_id = p.crewMemberId;
    if (p.projectId !== undefined) patch.project_id = p.projectId;
    if (p.role !== undefined) patch.role = p.role ?? null;
    if (p.amount !== undefined) patch.amount = p.amount;
    if (p.paymentMethod !== undefined) patch.payment_method = p.paymentMethod;
    if (p.paidAt !== undefined) patch.paid_at = p.paidAt;
    if (p.reference !== undefined) patch.reference = p.reference ?? null;
    if (p.note !== undefined) patch.note = p.note ?? null;
    const { error } = await supabase.from("crew_payments").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
    setRawData(d => ({ ...d, crewPayments: d.crewPayments.map(x => x.id === id ? { ...x, ...p } : x) }));
  }, []);

  const deleteCrewPayment = useCallback(async (id: string) => {
    const { error } = await supabase.from("crew_payments").delete().eq("id", id);
    if (error) throw new Error(error.message);
    setRawData(d => ({ ...d, crewPayments: d.crewPayments.filter(x => x.id !== id) }));
  }, []);

  // ---- Products (per-house cost catalog) ----
  const addProduct = useCallback(async (p: Omit<Product, "id" | "orgId" | "createdAt">): Promise<Product> => {
    const id = nanoid(10);
    const { data: row, error } = await supabase.from("products").insert({
      id,
      ...(orgId ? { org_id: orgId } : {}),
      name: p.name,
      unit_cost: p.unitCost,
      active: p.active,
      sort_order: p.sortOrder,
    }).select().single();
    if (error) throw new Error(error.message);
    const product = rowToProduct(row);
    setRawData(d => ({ ...d, products: [...d.products, product].sort((a, b) => a.sortOrder - b.sortOrder) }));
    return product;
  }, [orgId]);

  const updateProduct = useCallback(async (id: string, p: Partial<Product>) => {
    const patch: any = {};
    if (p.name !== undefined) patch.name = p.name;
    if (p.unitCost !== undefined) patch.unit_cost = p.unitCost;
    if (p.active !== undefined) patch.active = p.active;
    if (p.sortOrder !== undefined) patch.sort_order = p.sortOrder;
    const { error } = await supabase.from("products").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
    setRawData(d => ({ ...d, products: d.products.map(x => x.id === id ? { ...x, ...p } : x) }));
  }, []);

  const deleteProduct = useCallback(async (id: string) => {
    const { error } = await supabase.from("products").delete().eq("id", id);
    if (error) throw new Error(error.message);
    setRawData(d => ({ ...d, products: d.products.filter(x => x.id !== id) }));
  }, []);

  // ---- Shoot Requests (agent-submitted, owner-approved) ----
  const addShootRequest = useCallback(async (r: Omit<ShootRequest, "id" | "orgId" | "createdAt" | "status" | "projectId" | "ownerResponse">): Promise<ShootRequest> => {
    const id = nanoid(10);
    const { data: row, error } = await supabase.from("shoot_requests").insert({
      id,
      ...(orgId ? { org_id: orgId } : {}),
      client_id: r.clientId,
      property_address: r.propertyAddress,
      preferred_date: r.preferredDate,
      preferred_time: r.preferredTime,
      preferred_crew_member_id: r.preferredCrewMemberId,
      agent_will_meet: r.agentWillMeet ?? false,
      is_vacant: r.isVacant ?? false,
      notes: r.notes,
      requested_services: r.requestedServices,
    }).select().single();
    if (error) throw new Error(error.message);
    const request = rowToShootRequest(row);
    setRawData(d => ({ ...d, shootRequests: [request, ...d.shootRequests] }));
    return request;
  }, [orgId]);

  const updateShootRequest = useCallback(async (id: string, r: Partial<ShootRequest>) => {
    const patch: any = {};
    if (r.propertyAddress !== undefined) patch.property_address = r.propertyAddress;
    if (r.preferredDate !== undefined) patch.preferred_date = r.preferredDate;
    if (r.preferredTime !== undefined) patch.preferred_time = r.preferredTime;
    if (r.preferredCrewMemberId !== undefined) patch.preferred_crew_member_id = r.preferredCrewMemberId;
    if (r.agentWillMeet !== undefined) patch.agent_will_meet = r.agentWillMeet;
    if (r.isVacant !== undefined) patch.is_vacant = r.isVacant;
    if (r.notes !== undefined) patch.notes = r.notes;
    if (r.requestedServices !== undefined) patch.requested_services = r.requestedServices;
    if (r.status !== undefined) patch.status = r.status;
    if (r.projectId !== undefined) patch.project_id = r.projectId;
    if (r.ownerResponse !== undefined) patch.owner_response = r.ownerResponse;
    const { error } = await supabase.from("shoot_requests").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
    setRawData(d => ({ ...d, shootRequests: d.shootRequests.map(x => x.id === id ? { ...x, ...r } : x) }));
  }, []);

  const deleteShootRequest = useCallback(async (id: string) => {
    const { error } = await supabase.from("shoot_requests").delete().eq("id", id);
    if (error) throw new Error(error.message);
    setRawData(d => ({ ...d, shootRequests: d.shootRequests.filter(x => x.id !== id) }));
  }, []);

  // ---- Availability (per-shooter open times) ----
  const addAvailability = useCallback(async (a: Omit<Availability, "id" | "orgId" | "createdAt">): Promise<Availability> => {
    const id = nanoid(10);
    const { data: row, error } = await supabase.from("availability").insert({
      id,
      ...(orgId ? { org_id: orgId } : {}),
      crew_member_id: a.crewMemberId,
      recurring: a.recurring,
      weekday: a.recurring ? a.weekday : null,
      specific_date: a.recurring ? null : a.specificDate,
      all_day: a.allDay,
      start_time: a.startTime,
      end_time: a.endTime,
    }).select().single();
    if (error) throw new Error(error.message);
    const slot = rowToAvailability(row);
    setRawData(d => ({ ...d, availability: [...d.availability, slot] }));
    return slot;
  }, [orgId]);

  const updateAvailability = useCallback(async (id: string, a: Partial<Availability>) => {
    const patch: any = {};
    if (a.crewMemberId !== undefined) patch.crew_member_id = a.crewMemberId;
    if (a.recurring !== undefined) patch.recurring = a.recurring;
    if (a.weekday !== undefined) patch.weekday = a.weekday;
    if (a.specificDate !== undefined) patch.specific_date = a.specificDate;
    if (a.allDay !== undefined) patch.all_day = a.allDay;
    if (a.startTime !== undefined) patch.start_time = a.startTime;
    if (a.endTime !== undefined) patch.end_time = a.endTime;
    const { error } = await supabase.from("availability").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
    setRawData(d => ({ ...d, availability: d.availability.map(x => x.id === id ? { ...x, ...a } : x) }));
  }, []);

  const deleteAvailability = useCallback(async (id: string) => {
    const { error } = await supabase.from("availability").delete().eq("id", id);
    if (error) throw new Error(error.message);
    setRawData(d => ({ ...d, availability: d.availability.filter(x => x.id !== id) }));
  }, []);

  // ---- Shooter Prefs (per-person operating rules; PK = crew_member_id) ----
  const upsertShooterPref = useCallback(async (p: Omit<ShooterPref, "orgId" | "createdAt">) => {
    const { data: row, error } = await supabase.from("shooter_prefs").upsert({
      crew_member_id: p.crewMemberId,
      ...(orgId ? { org_id: orgId } : {}),
      shoot_minutes: p.shootMinutes,
      buffer_minutes: p.bufferMinutes,
      max_per_day: p.maxPerDay,
      fake_busy_minutes: p.fakeBusyMinutes,
    }, { onConflict: "crew_member_id" }).select().single();
    if (error) throw new Error(error.message);
    const pref = rowToShooterPref(row);
    setRawData(d => ({
      ...d,
      shooterPrefs: d.shooterPrefs.some(x => x.crewMemberId === pref.crewMemberId)
        ? d.shooterPrefs.map(x => x.crewMemberId === pref.crewMemberId ? pref : x)
        : [...d.shooterPrefs, pref],
    }));
  }, [orgId]);

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
    if (s.reviewToken !== undefined) patch.review_token = s.reviewToken;
    if (s.reviewStatus !== undefined) patch.review_status = s.reviewStatus;
    if (s.sentForReviewAt !== undefined) patch.sent_for_review_at = s.sentForReviewAt;
    if (s.clientReviewedAt !== undefined) patch.client_reviewed_at = s.clientReviewedAt;
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
    if (e.approvalStatus !== undefined) patch.approval_status = e.approvalStatus;
    if (e.clientComment !== undefined) patch.client_comment = e.clientComment;
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
      addProject, updateProject, deleteProject, fetchProjectHistory,
      addMarketingExpense, deleteMarketingExpense,
      addInvoice, updateInvoice, deleteInvoice,
      addContractorInvoice, updateContractorInvoice, deleteContractorInvoice,
      addCrewPayment, updateCrewPayment, deleteCrewPayment,
      addProduct, updateProduct, deleteProduct,
      addShootRequest, updateShootRequest, deleteShootRequest,
      addAvailability, updateAvailability, deleteAvailability,
      upsertShooterPref,
      addSeries, updateSeries, deleteSeries,
      addEpisode, updateEpisode, deleteEpisode,
      fetchMessages, addMessage, fetchEpisodes,
      fetchComments, addComment,
      upsertDistance, ensureLocationDistances,
      addManualTrip, updateManualTrip, deleteManualTrip,
      addBusinessExpense, addBusinessExpenses, updateBusinessExpense, deleteBusinessExpense,
      upsertCategoryRule,
      addTimeEntry, updateTimeEntry,
      addContractTemplate, updateContractTemplate, deleteContractTemplate,
      addContract, updateContract, deleteContract,
      addProposalTemplate, updateProposalTemplate, deleteProposalTemplate,
      addProposal, updateProposal, deleteProposal,
      addPipelineLead, updatePipelineLead, deletePipelineLead,
      addPersonalEvent, updatePersonalEvent, deletePersonalEvent,
      addMeeting, updateMeeting, deleteMeeting,
      addPackage, updatePackage, deletePackage,
      addProposalImage, updateProposalImage, deleteProposalImage,
      addDelivery, createReShootGallery, updateDelivery, deleteDelivery, setDeliveryStatus,
      registerDeliveryFile, updateDeliveryFile, deleteDeliveryFile, reorderDeliveryFiles, markSelectionEdited,
      addDeliveryCollection, updateDeliveryCollection, deleteDeliveryCollection,
      addServiceCategory, updateServiceCategory, deleteServiceCategory,
      addService, updateService, deleteService,
      addServiceVariant, updateServiceVariant, deleteServiceVariant,
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
