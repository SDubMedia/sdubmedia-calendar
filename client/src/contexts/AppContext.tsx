// ============================================================
// SDub Media FilmProject Pro — App Data Context (Supabase)
// Billing Model: Hourly — client billed at flat rate, crew paid individually
// ============================================================

import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import type { AppData, Client, CrewMember, Location, ProjectType, Project, MarketingExpense } from "@/lib/types";
import { supabase } from "@/lib/supabase";
import { nanoid } from "nanoid";

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
    billingRatePerHour: Number(r.billing_rate_per_hour ?? 0),
    roleBillingMultipliers: r.role_billing_multipliers || [],
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
    editTypes: r.edit_types || [],
    notes: r.notes || "",
    createdAt: r.created_at,
  };
}

function rowToExpense(r: any): MarketingExpense {
  return {
    id: r.id,
    date: r.date,
    category: r.category,
    description: r.description,
    notes: r.notes || "",
    amount: Number(r.amount ?? 0),
    createdAt: r.created_at,
  };
}

const emptyData: AppData = {
  clients: [], crewMembers: [], locations: [], projectTypes: [], projects: [], marketingExpenses: [],
};

export function AppProvider({ children }: { children: React.ReactNode }) {
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
      ] = await Promise.all([
        supabase.from("clients").select("*").order("company"),
        supabase.from("crew_members").select("*").order("name"),
        supabase.from("locations").select("*").order("name"),
        supabase.from("project_types").select("*").order("name"),
        supabase.from("projects").select("*").order("date"),
        supabase.from("marketing_expenses").select("*").order("date", { ascending: false }),
      ]);

      const firstError = e1 || e2 || e3 || e4 || e5 || e6;
      if (firstError) throw new Error(firstError.message);

      setData({
        clients: (clients || []).map(rowToClient),
        crewMembers: (crew || []).map(rowToCrew),
        locations: (locs || []).map(rowToLocation),
        projectTypes: (types || []).map(rowToProjectType),
        projects: (projects || []).map(rowToProject),
        marketingExpenses: (expenses || []).map(rowToExpense),
      });
    } catch (err: any) {
      setError(err.message || "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ---- Clients ----
  const addClient = useCallback(async (c: Omit<Client, "id" | "createdAt">): Promise<Client> => {
    const id = nanoid(10);
    const { data: row, error } = await supabase.from("clients").insert({
      id, company: c.company, contact_name: c.contactName, phone: c.phone,
      email: c.email, billing_rate_per_hour: c.billingRatePerHour,
      role_billing_multipliers: c.roleBillingMultipliers ?? [],
    }).select().single();
    if (error) throw new Error(error.message);
    const client = rowToClient(row);
    setData(d => ({ ...d, clients: [...d.clients, client].sort((a, b) => a.company.localeCompare(b.company)) }));
    return client;
  }, []);

  const updateClient = useCallback(async (id: string, c: Partial<Client>) => {
    const patch: any = {};
    if (c.company !== undefined) patch.company = c.company;
    if (c.contactName !== undefined) patch.contact_name = c.contactName;
    if (c.phone !== undefined) patch.phone = c.phone;
    if (c.email !== undefined) patch.email = c.email;
    if (c.billingRatePerHour !== undefined) patch.billing_rate_per_hour = c.billingRatePerHour;
    if (c.roleBillingMultipliers !== undefined) patch.role_billing_multipliers = c.roleBillingMultipliers;
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
      id, name: c.name, role_rates: c.roleRates ?? [], phone: c.phone, email: c.email,
      default_pay_rate_per_hour: c.defaultPayRatePerHour,
    }).select().single();
    if (error) throw new Error(error.message);
    const member = rowToCrew(row);
    setData(d => ({ ...d, crewMembers: [...d.crewMembers, member].sort((a, b) => a.name.localeCompare(b.name)) }));
    return member;
  }, []);

  const updateCrewMember = useCallback(async (id: string, c: Partial<CrewMember>) => {
    const patch: any = {};
    if (c.name !== undefined) patch.name = c.name;
    if (c.roleRates !== undefined) patch.role_rates = c.roleRates;
    if (c.phone !== undefined) patch.phone = c.phone;
    if (c.email !== undefined) patch.email = c.email;
    if (c.defaultPayRatePerHour !== undefined) patch.default_pay_rate_per_hour = c.defaultPayRatePerHour;
    const { error } = await supabase.from("crew_members").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
    setData(d => ({ ...d, crewMembers: d.crewMembers.map(x => x.id === id ? { ...x, ...c } : x) }));
  }, []);

  const deleteCrewMember = useCallback(async (id: string) => {
    const { error } = await supabase.from("crew_members").delete().eq("id", id);
    if (error) throw new Error(error.message);
    setData(d => ({ ...d, crewMembers: d.crewMembers.filter(x => x.id !== id) }));
  }, []);

  // ---- Locations ----
  const addLocation = useCallback(async (l: Omit<Location, "id">): Promise<Location> => {
    const id = nanoid(10);
    const { data: row, error } = await supabase.from("locations").insert({
      id, name: l.name, address: l.address, city: l.city, state: l.state, zip: l.zip,
    }).select().single();
    if (error) throw new Error(error.message);
    const loc = rowToLocation(row);
    setData(d => ({ ...d, locations: [...d.locations, loc].sort((a, b) => a.name.localeCompare(b.name)) }));
    return loc;
  }, []);

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
    const { data: row, error } = await supabase.from("project_types").insert({ id, name: pt.name }).select().single();
    if (error) throw new Error(error.message);
    const type = rowToProjectType(row);
    setData(d => ({ ...d, projectTypes: [...d.projectTypes, type].sort((a, b) => a.name.localeCompare(b.name)) }));
    return type;
  }, []);

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
      client_id: p.clientId,
      project_type_id: p.projectTypeId,
      location_id: p.locationId || null,
      date: p.date,
      start_time: p.startTime,
      end_time: p.endTime,
      status: p.status,
      crew: p.crew,
      post_production: p.postProduction,
      edit_types: p.editTypes,
      notes: p.notes,
    }).select().single();
    if (error) throw new Error(error.message);
    const project = rowToProject(row);
    setData(d => ({ ...d, projects: [...d.projects, project].sort((a, b) => a.date.localeCompare(b.date)) }));
    return project;
  }, []);

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
    if (p.editTypes !== undefined) patch.edit_types = p.editTypes;
    if (p.notes !== undefined) patch.notes = p.notes;
    const { error } = await supabase.from("projects").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
    setData(d => ({ ...d, projects: d.projects.map(x => x.id === id ? { ...x, ...p } : x) }));
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
      id, date: e.date, category: e.category, description: e.description,
      notes: e.notes, amount: e.amount,
    }).select().single();
    if (error) throw new Error(error.message);
    const expense = rowToExpense(row);
    setData(d => ({ ...d, marketingExpenses: [expense, ...d.marketingExpenses].sort((a, b) => b.date.localeCompare(a.date)) }));
    return expense;
  }, []);

  const deleteMarketingExpense = useCallback(async (id: string) => {
    const { error } = await supabase.from("marketing_expenses").delete().eq("id", id);
    if (error) throw new Error(error.message);
    setData(d => ({ ...d, marketingExpenses: d.marketingExpenses.filter(x => x.id !== id) }));
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
