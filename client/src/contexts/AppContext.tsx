// ============================================================
// SDub Media FilmProject Pro — App Data Context
// ============================================================

import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import type { AppData, Client, CrewMember, Location, ProjectType, Project, RetainerPayment } from "@/lib/types";
import { loadData, saveData, generateId } from "@/lib/data";

interface AppContextValue {
  data: AppData;
  // Clients
  addClient: (c: Omit<Client, "id" | "createdAt">) => Client;
  updateClient: (id: string, c: Partial<Client>) => void;
  deleteClient: (id: string) => void;
  // Crew
  addCrewMember: (c: Omit<CrewMember, "id">) => CrewMember;
  updateCrewMember: (id: string, c: Partial<CrewMember>) => void;
  deleteCrewMember: (id: string) => void;
  // Locations
  addLocation: (l: Omit<Location, "id">) => Location;
  updateLocation: (id: string, l: Partial<Location>) => void;
  deleteLocation: (id: string) => void;
  // Project Types
  addProjectType: (pt: Omit<ProjectType, "id">) => ProjectType;
  updateProjectType: (id: string, pt: Partial<ProjectType>) => void;
  deleteProjectType: (id: string) => void;
  // Projects
  addProject: (p: Omit<Project, "id" | "createdAt">) => Project;
  updateProject: (id: string, p: Partial<Project>) => void;
  deleteProject: (id: string) => void;
  // Retainer Payments
  addPayment: (p: Omit<RetainerPayment, "id">) => RetainerPayment;
  updatePayment: (id: string, p: Partial<RetainerPayment>) => void;
  deletePayment: (id: string) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<AppData>(() => loadData());

  // Persist on every change
  useEffect(() => {
    saveData(data);
  }, [data]);

  const mutate = useCallback((updater: (prev: AppData) => AppData) => {
    setData((prev) => updater(prev));
  }, []);

  // ---- Clients ----
  const addClient = useCallback((c: Omit<Client, "id" | "createdAt">): Client => {
    const client: Client = { ...c, id: generateId(), createdAt: new Date().toISOString() };
    mutate((d) => ({ ...d, clients: [...d.clients, client] }));
    return client;
  }, [mutate]);

  const updateClient = useCallback((id: string, c: Partial<Client>) => {
    mutate((d) => ({ ...d, clients: d.clients.map((x) => x.id === id ? { ...x, ...c } : x) }));
  }, [mutate]);

  const deleteClient = useCallback((id: string) => {
    mutate((d) => ({ ...d, clients: d.clients.filter((x) => x.id !== id) }));
  }, [mutate]);

  // ---- Crew ----
  const addCrewMember = useCallback((c: Omit<CrewMember, "id">): CrewMember => {
    const member: CrewMember = { ...c, id: generateId() };
    mutate((d) => ({ ...d, crewMembers: [...d.crewMembers, member] }));
    return member;
  }, [mutate]);

  const updateCrewMember = useCallback((id: string, c: Partial<CrewMember>) => {
    mutate((d) => ({ ...d, crewMembers: d.crewMembers.map((x) => x.id === id ? { ...x, ...c } : x) }));
  }, [mutate]);

  const deleteCrewMember = useCallback((id: string) => {
    mutate((d) => ({ ...d, crewMembers: d.crewMembers.filter((x) => x.id !== id) }));
  }, [mutate]);

  // ---- Locations ----
  const addLocation = useCallback((l: Omit<Location, "id">): Location => {
    const loc: Location = { ...l, id: generateId() };
    mutate((d) => ({ ...d, locations: [...d.locations, loc] }));
    return loc;
  }, [mutate]);

  const updateLocation = useCallback((id: string, l: Partial<Location>) => {
    mutate((d) => ({ ...d, locations: d.locations.map((x) => x.id === id ? { ...x, ...l } : x) }));
  }, [mutate]);

  const deleteLocation = useCallback((id: string) => {
    mutate((d) => ({ ...d, locations: d.locations.filter((x) => x.id !== id) }));
  }, [mutate]);

  // ---- Project Types ----
  const addProjectType = useCallback((pt: Omit<ProjectType, "id">): ProjectType => {
    const type: ProjectType = { ...pt, id: generateId() };
    mutate((d) => ({ ...d, projectTypes: [...d.projectTypes, type] }));
    return type;
  }, [mutate]);

  const updateProjectType = useCallback((id: string, pt: Partial<ProjectType>) => {
    mutate((d) => ({ ...d, projectTypes: d.projectTypes.map((x) => x.id === id ? { ...x, ...pt } : x) }));
  }, [mutate]);

  const deleteProjectType = useCallback((id: string) => {
    mutate((d) => ({ ...d, projectTypes: d.projectTypes.filter((x) => x.id !== id) }));
  }, [mutate]);

  // ---- Projects ----
  const addProject = useCallback((p: Omit<Project, "id" | "createdAt">): Project => {
    const project: Project = { ...p, id: generateId(), createdAt: new Date().toISOString() };
    mutate((d) => ({ ...d, projects: [...d.projects, project] }));
    return project;
  }, [mutate]);

  const updateProject = useCallback((id: string, p: Partial<Project>) => {
    mutate((d) => ({ ...d, projects: d.projects.map((x) => x.id === id ? { ...x, ...p } : x) }));
  }, [mutate]);

  const deleteProject = useCallback((id: string) => {
    mutate((d) => ({ ...d, projects: d.projects.filter((x) => x.id !== id) }));
  }, [mutate]);

  // ---- Retainer Payments ----
  const addPayment = useCallback((p: Omit<RetainerPayment, "id">): RetainerPayment => {
    const payment: RetainerPayment = { ...p, id: generateId() };
    mutate((d) => ({ ...d, retainerPayments: [...d.retainerPayments, payment] }));
    return payment;
  }, [mutate]);

  const updatePayment = useCallback((id: string, p: Partial<RetainerPayment>) => {
    mutate((d) => ({ ...d, retainerPayments: d.retainerPayments.map((x) => x.id === id ? { ...x, ...p } : x) }));
  }, [mutate]);

  const deletePayment = useCallback((id: string) => {
    mutate((d) => ({ ...d, retainerPayments: d.retainerPayments.filter((x) => x.id !== id) }));
  }, [mutate]);

  return (
    <AppContext.Provider value={{
      data,
      addClient, updateClient, deleteClient,
      addCrewMember, updateCrewMember, deleteCrewMember,
      addLocation, updateLocation, deleteLocation,
      addProjectType, updateProjectType, deleteProjectType,
      addProject, updateProject, deleteProject,
      addPayment, updatePayment, deletePayment,
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
