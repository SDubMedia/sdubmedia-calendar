// ============================================================
// Slate — App Data Context (Supabase)
// ============================================================

import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import type { AppData, Client, CrewMember, Location, ProjectType, Project, MarketingExpense, Invoice, ContractorInvoice, CrewLocationDistance, ManualTrip, Series, SeriesEpisode, SeriesMessage, EpisodeComment, Organization } from "@/lib/types";
import { supabase } from "@/lib/supabase";
import { nanoid } from "nanoid";
import { useAuth } from "./AuthContext";

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
  return { id: r.id, name: r.name, address: r.address, city: r.city, state: r.state, zip: r.zip };
}

function rowToProjectType(r: any): ProjectType {
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
    updatedAt: r.updated_at,
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

function rowToOrg(r: any): Organization {
  return { id: r.id, name: r.name, slug: r.slug, logoUrl: r.logo_url || "", plan: r.plan, createdAt: r.created_at };
}

const emptyData: AppData = {
  clients: [], crewMembers: [], locations: [], projectTypes: [], projects: [], marketingExpenses: [], invoices: [], contractorInvoices: [], crewLocationDistances: [], manualTrips: [], series: [], organization: null,
};

export function AppProvider({ children }: { children: React.ReactNode }) {
  const { profile } = useAuth();
  const orgId = profile?.orgId || "";
  const [data, setData] = useState<AppData>(emptyData);
  const [loading, setLoading] = useState(true);
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
        { data: projects, error: e5 },
        { data: expenses, error: e6 },
        { data: invoices, error: e7 },
        { data: contractorInvs, error: e7b },
        { data: distances, error: _e7c },
        { data: manualTripsData, error: _e7d },
        { data: seriesData, error: e8 },
        { data: orgData, error: _e9 },
      ] = await Promise.all([
        supabase.from("clients").select("*").order("company"),
        supabase.from("crew_members").select("*").order("name"),
        supabase.from("locations").select("*").order("name"),
        supabase.from("project_types").select("*").order("name"),
        supabase.from("projects").select("*").order("date"),
        supabase.from("marketing_expenses").select("*").order("date", { ascending: false }),
        supabase.from("invoices").select("*").order("created_at", { ascending: false }),
        supabase.from("contractor_invoices").select("*").order("created_at", { ascending: false }),
        supabase.from("crew_location_distances").select("*"),
        supabase.from("manual_trips").select("*").order("date", { ascending: false }),
        supabase.from("series").select("*").order("created_at", { ascending: false }),
        orgId ? supabase.from("organizations").select("*").eq("id", orgId).single() : Promise.resolve({ data: null, error: null }),
      ]);

      const firstError = e1 || e2 || e3 || e4 || e5 || e6 || e7 || e7b || e8;
      if (firstError) throw new Error(firstError.message);

      setData({
        clients: (clients || []).map(rowToClient),
        crewMembers: (crew || []).map(rowToCrew),
        locations: (locs || []).map(rowToLocation),
        projectTypes: (types || []).map(rowToProjectType),
        projects: (projects || []).map(rowToProject),
        marketingExpenses: (expenses || []).map(rowToExpense),
        invoices: (invoices || []).map(rowToInvoice),
        contractorInvoices: (contractorInvs || []).map(rowToContractorInvoice),
        crewLocationDistances: (distances || []).map(rowToCrewLocationDistance),
        manualTrips: (manualTripsData || []).map(rowToManualTrip),
        series: (seriesData || []).map(rowToSeries),
        organization: orgData ? rowToOrg(orgData) : null,
      });
    } catch (err: any) {
      setError(err.message || "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ---- Clients ----
  const addClient = useCallback(async (c: Omit<Client, "id" | "createdAt">): Promise<Client> => {
    const id = nanoid(10);
    const { data: row, error } = await supabase.from("clients").insert({
      id, ...(orgId ? { org_id: orgId } : {}), company: c.company, contact_name: c.contactName, phone: c.phone,
      email: c.email, billing_model: c.billingModel ?? "hourly",
      billing_rate_per_hour: c.billingRatePerHour, per_project_rate: c.perProjectRate ?? 0,
      project_type_rates: c.projectTypeRates ?? [],
      allowed_project_type_ids: c.allowedProjectTypeIds ?? [],
      default_project_type_id: c.defaultProjectTypeId ?? "",
      role_billing_multipliers: c.roleBillingMultipliers ?? [],
    }).select().single();
    if (error) throw new Error(error.message);
    const client = rowToClient(row);
    setData(d => ({ ...d, clients: [...d.clients, client].sort((a, b) => a.company.localeCompare(b.company)) }));
    return client;
  }, [orgId]);

  const updateClient = useCallback(async (id: string, c: Partial<Client>) => {
    const patch: any = {};
    if (c.company !== undefined) patch.company = c.company;
    if (c.contactName !== undefined) patch.contact_name = c.contactName;
    if (c.phone !== undefined) patch.phone = c.phone;
    if (c.email !== undefined) patch.email = c.email;
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
    setData(d => ({ ...d, clients: d.clients.map(x => x.id === id ? { ...x, ...c } : x) }));
  }, []);

  const deleteClient = useCallback(async (id: string) => {
    const { error } = await supabase.from("clients").delete().eq("id", id);
    if (error) throw new Error(error.message);
    setData(d => ({ ...d, clients: d.clients.filter(x => x.id !== id) }));
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
    setData(d => ({ ...d, crewMembers: [...d.crewMembers, member].sort((a, b) => a.name.localeCompare(b.name)) }));
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
    const { error } = await supabase.from("crew_members").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
    setData(d => ({ ...d, crewMembers: d.crewMembers.map(x => x.id === id ? { ...x, ...c } : x) }));
  }, []);

  const deleteCrewMember = useCallback(async (id: string) => {
    const { error } = await supabase.from("crew_members").delete().eq("id", id);
    if (error) throw new Error(error.message);
    setData(d => ({ ...d, crewMembers: d.crewMembers.filter(x => x.id !== id) }));
  }, []);

  // ---- Crew Location Distances ----
  const upsertDistance = useCallback(async (crewMemberId: string, locationId: string, distanceMiles: number) => {
    const id = `${crewMemberId}_${locationId}`;
    const { error } = await supabase.from("crew_location_distances").upsert({
      id, crew_member_id: crewMemberId, location_id: locationId, distance_miles: distanceMiles,
    }, { onConflict: "crew_member_id,location_id" });
    if (error) throw new Error(error.message);
    setData(d => {
      const existing = d.crewLocationDistances.find(x => x.crewMemberId === crewMemberId && x.locationId === locationId);
      if (existing) {
        return { ...d, crewLocationDistances: d.crewLocationDistances.map(x => x.id === existing.id ? { ...x, distanceMiles } : x) };
      }
      return { ...d, crewLocationDistances: [...d.crewLocationDistances, { id, crewMemberId, locationId, distanceMiles, createdAt: new Date().toISOString() }] };
    });
  }, []);

  // ---- Manual Trips ----
  const addManualTrip = useCallback(async (t: Omit<ManualTrip, "id" | "createdAt">): Promise<ManualTrip> => {
    const id = nanoid(10);
    const { data: row, error } = await supabase.from("manual_trips").insert({
      id, crew_member_id: t.crewMemberId, date: t.date, destination: t.destination,
      location_id: t.locationId || null, purpose: t.purpose, round_trip_miles: t.roundTripMiles,
    }).select().single();
    if (error) throw new Error(error.message);
    const trip = rowToManualTrip(row);
    setData(d => ({ ...d, manualTrips: [trip, ...d.manualTrips] }));
    return trip;
  }, []);

  const deleteManualTrip = useCallback(async (id: string) => {
    const { error } = await supabase.from("manual_trips").delete().eq("id", id);
    if (error) throw new Error(error.message);
    setData(d => ({ ...d, manualTrips: d.manualTrips.filter(x => x.id !== id) }));
  }, []);

  // ---- Locations ----
  const addLocation = useCallback(async (l: Omit<Location, "id">): Promise<Location> => {
    const id = nanoid(10);
    const { data: row, error } = await supabase.from("locations").insert({
      id, ...(orgId ? { org_id: orgId } : {}), name: l.name, address: l.address, city: l.city, state: l.state, zip: l.zip,
    }).select().single();
    if (error) throw new Error(error.message);
    const loc = rowToLocation(row);
    setData(d => ({ ...d, locations: [...d.locations, loc].sort((a, b) => a.name.localeCompare(b.name)) }));
    return loc;
  }, [orgId]);

  const updateLocation = useCallback(async (id: string, l: Partial<Location>) => {
    const { error } = await supabase.from("locations").update(l).eq("id", id);
    if (error) throw new Error(error.message);
    setData(d => ({ ...d, locations: d.locations.map(x => x.id === id ? { ...x, ...l } : x) }));
  }, []);

  const deleteLocation = useCallback(async (id: string) => {
    const { error } = await supabase.from("locations").delete().eq("id", id);
    if (error) throw new Error(error.message);
    setData(d => ({ ...d, locations: d.locations.filter(x => x.id !== id) }));
  }, []);

  // ---- Project Types ----
  const addProjectType = useCallback(async (pt: Omit<ProjectType, "id">): Promise<ProjectType> => {
    const id = nanoid(10);
    const { data: row, error } = await supabase.from("project_types").insert({ id, ...(orgId ? { org_id: orgId } : {}), name: pt.name }).select().single();
    if (error) throw new Error(error.message);
    const type = rowToProjectType(row);
    setData(d => ({ ...d, projectTypes: [...d.projectTypes, type].sort((a, b) => a.name.localeCompare(b.name)) }));
    return type;
  }, [orgId]);

  const updateProjectType = useCallback(async (id: string, pt: Partial<ProjectType>) => {
    const { error } = await supabase.from("project_types").update(pt).eq("id", id);
    if (error) throw new Error(error.message);
    setData(d => ({ ...d, projectTypes: d.projectTypes.map(x => x.id === id ? { ...x, ...pt } : x) }));
  }, []);

  const deleteProjectType = useCallback(async (id: string) => {
    const { error } = await supabase.from("project_types").delete().eq("id", id);
    if (error) throw new Error(error.message);
    setData(d => ({ ...d, projectTypes: d.projectTypes.filter(x => x.id !== id) }));
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
      paid_date: p.paidDate || null,
      edit_types: p.editTypes,
      notes: p.notes,
      deliverable_url: p.deliverableUrl || "",
    }).select().single();
    if (error) throw new Error(error.message);
    const project = rowToProject(row);
    setData(d => ({ ...d, projects: [...d.projects, project].sort((a, b) => a.date.localeCompare(b.date)) }));
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
    if (p.projectRate != null) patch.project_rate = p.projectRate;
    if (p.paidDate !== undefined) patch.paid_date = p.paidDate;
    if (p.editTypes !== undefined) patch.edit_types = p.editTypes;
    if (p.notes !== undefined) patch.notes = p.notes;
    if (p.deliverableUrl !== undefined) patch.deliverable_url = p.deliverableUrl;
    const { data: updated, error } = await supabase.from("projects").update(patch).eq("id", id).select().single();
    if (error) throw new Error(error.message);
    if (updated) {
      const normalized = rowToProject(updated);
      setData(d => ({ ...d, projects: d.projects.map(x => x.id === id ? normalized : x) }));
    }
  }, []);

  const deleteProject = useCallback(async (id: string) => {
    const { error } = await supabase.from("projects").delete().eq("id", id);
    if (error) throw new Error(error.message);
    setData(d => ({ ...d, projects: d.projects.filter(x => x.id !== id) }));
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
    setData(d => ({ ...d, marketingExpenses: [expense, ...d.marketingExpenses].sort((a, b) => b.date.localeCompare(a.date)) }));
    return expense;
  }, [orgId]);

  const deleteMarketingExpense = useCallback(async (id: string) => {
    const { error } = await supabase.from("marketing_expenses").delete().eq("id", id);
    if (error) throw new Error(error.message);
    setData(d => ({ ...d, marketingExpenses: d.marketingExpenses.filter(x => x.id !== id) }));
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
    setData(d => ({ ...d, invoices: [invoice, ...d.invoices] }));
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
      setData(d => ({
        ...d,
        invoices: d.invoices.map(x => x.id === id ? { ...x, ...inv, updatedAt: patch.updated_at } : x),
        projects: d.projects.map(p => projectIds.includes(p.id) ? { ...p, paidDate: today } : p),
      }));
    } else {
      setData(d => ({ ...d, invoices: d.invoices.map(x => x.id === id ? { ...x, ...inv, updatedAt: patch.updated_at } : x) }));
    }
  }, [data.invoices]);

  const deleteInvoice = useCallback(async (id: string) => {
    const { error } = await supabase.from("invoices").delete().eq("id", id);
    if (error) throw new Error(error.message);
    setData(d => ({ ...d, invoices: d.invoices.filter(x => x.id !== id) }));
  }, []);

  // ---- Contractor Invoices ----
  const addContractorInvoice = useCallback(async (inv: Omit<ContractorInvoice, "id" | "createdAt">): Promise<ContractorInvoice> => {
    const id = nanoid(10);
    const { data: row, error } = await supabase.from("contractor_invoices").insert({
      id,
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
    setData(d => ({ ...d, contractorInvoices: [cinv, ...d.contractorInvoices] }));
    return cinv;
  }, []);

  const updateContractorInvoice = useCallback(async (id: string, inv: Partial<ContractorInvoice>) => {
    const patch: any = {};
    if (inv.status !== undefined) patch.status = inv.status;
    if (inv.notes !== undefined) patch.notes = inv.notes;
    if (inv.lineItems !== undefined) patch.line_items = inv.lineItems;
    if (inv.total !== undefined) patch.total = inv.total;
    const { error } = await supabase.from("contractor_invoices").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
    setData(d => ({ ...d, contractorInvoices: d.contractorInvoices.map(x => x.id === id ? { ...x, ...inv } : x) }));
  }, []);

  const deleteContractorInvoice = useCallback(async (id: string) => {
    const { error } = await supabase.from("contractor_invoices").delete().eq("id", id);
    if (error) throw new Error(error.message);
    setData(d => ({ ...d, contractorInvoices: d.contractorInvoices.filter(x => x.id !== id) }));
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
    setData(d => ({ ...d, series: [series, ...d.series] }));
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
    setData(d => ({ ...d, series: d.series.map(x => x.id === id ? { ...x, ...s } : x) }));
  }, []);

  const deleteSeries = useCallback(async (id: string) => {
    const { error } = await supabase.from("series").delete().eq("id", id);
    if (error) throw new Error(error.message);
    setData(d => ({ ...d, series: d.series.filter(x => x.id !== id) }));
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
