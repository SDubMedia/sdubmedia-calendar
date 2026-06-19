// ============================================================
// BrokersPage — dedicated home for real-estate brokers and their agents.
// Brokers (offices that pay for their agents' shoots) and their agents are
// managed here, separate from regular Clients. Each broker shows this month's
// roll-up (homes, revenue, your profit) and a one-tap month-end invoice.
// ============================================================

import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useScopedData as useApp } from "@/hooks/useScopedData";
import { Button } from "@/components/ui/button";
import { Plus, Building2, User, Pencil, FileText, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import ClientProfileSheet from "@/components/ClientProfileSheet";
import { getProjectPayerId, getProjectInvoiceAmount, getProjectProfit } from "@/lib/data";
import { buildInvoice, generateInvoiceNumberFromDB } from "@/lib/invoice";
import { supabase } from "@/lib/supabase";
import type { Client } from "@/lib/types";

function fmt(n: number): string {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function currentMonthBounds(): { start: string; end: string; label: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const pad = (n: number) => String(n).padStart(2, "0");
  const lastDay = new Date(y, m + 1, 0).getDate();
  return {
    start: `${y}-${pad(m + 1)}-01`,
    end: `${y}-${pad(m + 1)}-${pad(lastDay)}`,
    label: now.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
  };
}

export default function BrokersPage() {
  const { data, addInvoice } = useApp();
  const [, setLocation] = useLocation();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetClient, setSheetClient] = useState<Client | null>(null);
  const [sheetType, setSheetType] = useState<"broker" | "agent">("broker");
  const [sheetBrokerId, setSheetBrokerId] = useState<string | null>(null);
  const [generating, setGenerating] = useState<string | null>(null);

  const month = useMemo(currentMonthBounds, []);
  const clientsById = useMemo(() => Object.fromEntries(data.clients.map(c => [c.id, c])), [data.clients]);

  const brokers = useMemo(
    () => data.clients.filter(c => c.clientType === "broker").sort((a, b) => a.company.localeCompare(b.company)),
    [data.clients],
  );
  const agentsByBroker = useMemo(() => {
    const map: Record<string, Client[]> = {};
    for (const c of data.clients) {
      if (c.clientType === "agent" && c.brokerId) (map[c.brokerId] ||= []).push(c);
    }
    for (const k of Object.keys(map)) map[k].sort((a, b) => a.company.localeCompare(b.company));
    return map;
  }, [data.clients]);

  // This month's billable houses for each broker (payer-resolved, not cancelled/upcoming).
  const rollupByBroker = useMemo(() => {
    const out: Record<string, { homes: number; revenue: number; profit: number }> = {};
    for (const p of data.projects) {
      if (p.date < month.start || p.date > month.end) continue;
      if (p.status === "cancelled" || p.status === "upcoming" || p.status === "tentative") continue;
      const payer = getProjectPayerId(p, clientsById);
      const broker = clientsById[payer];
      if (broker?.clientType !== "broker") continue;
      const agent = clientsById[p.clientId] || broker;
      const r = (out[payer] ||= { homes: 0, revenue: 0, profit: 0 });
      r.homes += 1;
      r.revenue += getProjectInvoiceAmount(p, agent);
      r.profit += getProjectProfit(p, agent);
    }
    return out;
  }, [data.projects, clientsById, month]);

  function openAddBroker() {
    setSheetClient(null); setSheetType("broker"); setSheetBrokerId(null); setSheetOpen(true);
  }
  function openAddAgent(brokerId: string) {
    setSheetClient(null); setSheetType("agent"); setSheetBrokerId(brokerId); setSheetOpen(true);
  }
  function openEdit(client: Client) {
    setSheetClient(client); setSheetType(client.clientType === "agent" ? "agent" : "broker"); setSheetBrokerId(client.brokerId ?? null); setSheetOpen(true);
  }

  async function generateBrokerInvoice(broker: Client) {
    const roll = rollupByBroker[broker.id];
    if (!roll || roll.homes === 0) { toast.error("No homes to bill this broker this month yet"); return; }
    setGenerating(broker.id);
    try {
      const draft = buildInvoice(broker, data.projects, data.projectTypes, data.locations, data.invoices, month.start, month.end, data.organization, data.clients);
      if (draft.lineItems.length === 0) { toast.error("Nothing left to bill — these houses may already be invoiced"); return; }
      draft.invoiceNumber = await generateInvoiceNumberFromDB(supabase);
      await addInvoice(draft);
      toast.success(`Invoice ${draft.invoiceNumber} created for ${broker.company}`, { description: "Opening Invoices so you can review and send it." });
      setLocation("/invoices");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to generate invoice");
    } finally {
      setGenerating(null);
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card/50">
        <div>
          <h1 className="text-xl font-semibold text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Brokers</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Brokerages that pay for their agents' shoots. Bill the broker monthly for all their homes.
          </p>
        </div>
        <Button onClick={openAddBroker} className="bg-primary text-primary-foreground hover:bg-primary/90 gap-2">
          <Plus className="w-4 h-4" /> Add Broker
        </Button>
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-4">
        {brokers.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
            <Building2 className="w-12 h-12 mb-3 opacity-30" />
            <p className="text-sm">No brokers yet.</p>
            <p className="text-xs mt-1">Add a brokerage (e.g. Realty ONE), then add its agents.</p>
          </div>
        ) : brokers.map(broker => {
          const agents = agentsByBroker[broker.id] || [];
          const roll = rollupByBroker[broker.id];
          return (
            <div key={broker.id} className="bg-card border border-border rounded-lg overflow-hidden">
              {/* Broker header + month roll-up */}
              <div className="p-4 flex items-start justify-between gap-4 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-primary" />
                    <span className="font-semibold">{broker.company}</span>
                    <button onClick={() => openEdit(broker)} className="text-muted-foreground hover:text-foreground" title="Edit broker"><Pencil className="w-3.5 h-3.5" /></button>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">{agents.length} agent{agents.length !== 1 ? "s" : ""}</div>
                </div>
                <div className="flex items-center gap-4 flex-wrap">
                  <div className="text-right">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{month.label}</div>
                    <div className="text-sm">
                      <span className="font-semibold">{roll?.homes ?? 0}</span> home{(roll?.homes ?? 0) !== 1 ? "s" : ""}
                      {" · "}<span className="text-primary tabular-nums">{fmt(roll?.revenue ?? 0)}</span>
                      {" · "}<span className={`tabular-nums ${(roll?.profit ?? 0) >= 0 ? "text-green-400" : "text-red-400"}`}>{fmt(roll?.profit ?? 0)} profit</span>
                    </div>
                  </div>
                  <Button size="sm" onClick={() => generateBrokerInvoice(broker)} disabled={generating === broker.id || !roll?.homes} className="gap-1.5">
                    <FileText className="w-3.5 h-3.5" /> {generating === broker.id ? "Generating…" : "Generate invoice"}
                  </Button>
                </div>
              </div>

              {/* Agents */}
              <div className="border-t border-border bg-secondary/20">
                {agents.length === 0 ? (
                  <div className="px-4 py-3 text-xs text-muted-foreground">No agents yet.</div>
                ) : agents.map(agent => (
                  <div key={agent.id} className="px-4 py-2.5 flex items-center justify-between gap-3 border-b border-border/40 last:border-b-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <User className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="text-sm truncate">{agent.company}</span>
                      {agent.contactName && <span className="text-xs text-muted-foreground truncate">· {agent.contactName}</span>}
                    </div>
                    <button onClick={() => openEdit(agent)} className="text-muted-foreground hover:text-foreground shrink-0" title="Edit agent"><Pencil className="w-3.5 h-3.5" /></button>
                  </div>
                ))}
                <button onClick={() => openAddAgent(broker.id)} className="w-full px-4 py-2.5 text-xs text-primary hover:bg-primary/5 flex items-center gap-1.5">
                  <Plus className="w-3.5 h-3.5" /> Add agent to {broker.company} <ChevronRight className="w-3 h-3 ml-auto opacity-50" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <ClientProfileSheet
        client={sheetClient}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        initialClientType={sheetClient ? undefined : sheetType}
        initialBrokerId={sheetClient ? undefined : sheetBrokerId}
      />
    </div>
  );
}
