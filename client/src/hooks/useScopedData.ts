// ============================================================
// useScopedData — role-aware data filtering
// Staff sees only their own data. Clients see only their projects.
// Owner/Partner see everything.
// ============================================================

import { useMemo } from "react";
import { useApp } from "@/contexts/AppContext";
import { useAuth } from "@/contexts/AuthContext";

export function useScopedData() {
  const appContext = useApp();
  const { data } = appContext;
  const { effectiveProfile } = useAuth();
  const role = effectiveProfile?.role;
  const crewMemberId = effectiveProfile?.crewMemberId;
  // Memoize the fallback empty array so a missing clientIds doesn't produce
  // a new reference on every render and bust the scopedData useMemo below.
  const profileClientIds = effectiveProfile?.clientIds;
  const clientIds = useMemo(() => profileClientIds || [], [profileClientIds]);

  const scopedData = useMemo(() => {
    // Owner and partner see everything
    if (!role || role === "owner" || role === "partner") return data;

    // Staff: filter to projects they're assigned to + their own crew data
    if (role === "staff" && crewMemberId) {
      const myProjects = data.projects.filter(p =>
        (p.crew || []).some(c => c.crewMemberId === crewMemberId) ||
        (p.postProduction || []).some(pp => pp.crewMemberId === crewMemberId)
      );
      const myProjectIds = new Set(myProjects.map(p => p.id));
      return {
        ...data,
        projects: myProjects,
        crewMembers: data.crewMembers.filter(c => c.id === crewMemberId),
        invoices: data.invoices.filter(inv =>
          (inv.lineItems || []).some((li: any) => myProjectIds.has(li.projectId))
        ),
        contractorInvoices: data.contractorInvoices.filter(ci => ci.crewMemberId === crewMemberId),
        manualTrips: data.manualTrips.filter(t => t.crewMemberId === crewMemberId),
        timeEntries: data.timeEntries.filter(t => t.crewMemberId === crewMemberId),
        crewLocationDistances: data.crewLocationDistances.filter(d => d.crewMemberId === crewMemberId),
        // Staff see only to-dos assigned to them (matches RLS).
        todos: data.todos.filter(t => t.assignedCrewMemberId === crewMemberId),
      };
    }

    // Family: can view production projects (read-only) + personal events, but no financial data
    if (role === "family") {
      return {
        ...data,
        // Keep projects, clients, locations, projectTypes for read-only calendar view
        invoices: [],
        contractorInvoices: [],
        proposals: [],
        contracts: [],
        series: [],
        pipelineLeads: [],
        businessExpenses: [],
        manualTrips: [],
        timeEntries: [],
        crewMembers: [],
        todos: [],
      };
    }

    // Client: filter to their own projects/invoices/proposals/contracts
    if (role === "client" && clientIds.length > 0) {
      const allowed = new Set(clientIds);
      const clientById = new Map(data.clients.map(c => [c.id, c]));
      return {
        ...data,
        // A broker (client_type='broker') also sees their agents — agent
        // records are linked by broker_id, not by being in the login's
        // clientIds — and those agents' shoots (stored under the agent) and
        // anything billed to the broker. Mirrors the broker_read_agents RLS
        // policy + the AppContext impersonation scoping. Without the agent
        // branch here, brokers saw zero agents even though the fetch returned
        // them.
        projects: data.projects.filter(p => {
          if (allowed.has(p.clientId)) return true;
          if (p.billToId && allowed.has(p.billToId)) return true;
          const c = clientById.get(p.clientId);
          return !!(c && c.clientType === "agent" && c.brokerId && allowed.has(c.brokerId));
        }),
        clients: data.clients.filter(c =>
          allowed.has(c.id) || (c.clientType === "agent" && !!c.brokerId && allowed.has(c.brokerId))
        ),
        invoices: data.invoices.filter(inv => allowed.has(inv.clientId)),
        proposals: data.proposals.filter(prop => allowed.has(prop.clientId)),
        contracts: data.contracts.filter(con => allowed.has(con.clientId)),
        series: data.series.filter(s => allowed.has(s.clientId)),
        pipelineLeads: data.pipelineLeads.filter(l => l.clientId && allowed.has(l.clientId)),
        todos: [],
      };
    }

    return data;
  }, [data, role, crewMemberId, clientIds]);

  return { ...appContext, data: scopedData };
}
