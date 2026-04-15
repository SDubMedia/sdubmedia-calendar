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
  const clientIds = effectiveProfile?.clientIds || [];

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
      };
    }

    // Family: only personal events, no production data
    if (role === "family") {
      return {
        ...data,
        projects: [],
        clients: [],
        crewMembers: [],
        invoices: [],
        contractorInvoices: [],
        proposals: [],
        contracts: [],
        series: [],
        pipelineLeads: [],
        businessExpenses: [],
        manualTrips: [],
        timeEntries: [],
      };
    }

    // Client: filter to their own projects/invoices/proposals/contracts
    if (role === "client" && clientIds.length > 0) {
      return {
        ...data,
        projects: data.projects.filter(p => clientIds.includes(p.clientId)),
        clients: data.clients.filter(c => clientIds.includes(c.id)),
        invoices: data.invoices.filter(inv => clientIds.includes(inv.clientId)),
        proposals: data.proposals.filter(prop => clientIds.includes(prop.clientId)),
        contracts: data.contracts.filter(con => clientIds.includes(con.clientId)),
        series: data.series.filter(s => clientIds.includes(s.clientId)),
        pipelineLeads: data.pipelineLeads.filter(l => l.clientId && clientIds.includes(l.clientId)),
      };
    }

    return data;
  }, [data, role, crewMemberId, clientIds]);

  return { ...appContext, data: scopedData };
}
