// ============================================================
// RealEstatePage — owner REPORT for the real-estate line: who's enrolled and how
// much each agent uses you (week/month/year), so you can see best vs. quietest
// clients. The shoot pipeline itself lives on the Pipeline tab.
// ============================================================

import { useMemo, useEffect, useState } from "react";
import { Building2, User, Home, Globe, Smartphone, Clock, CircleDashed } from "lucide-react";
import { useScopedData as useApp } from "@/hooks/useScopedData";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { getProjectInvoiceAmount, getProjectPayerId, addDaysIso, weekdayOf } from "@/lib/data";
import type { Client, UserProfile } from "@/lib/types";

const money = (n: number) => "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 });

function presence(clientId: string, profiles: UserProfile[], appUserIds: Set<string>) {
  const p = profiles.find(x => x.role === "client" && x.clientIds.includes(clientId));
  if (!p) return { Icon: CircleDashed, color: "text-muted-foreground/40", label: "Not enrolled", active: false };
  if (p.mustChangePassword) return { Icon: Clock, color: "text-amber-500", label: "Invited — not logged in", active: false };
  if (appUserIds.has(p.id)) return { Icon: Smartphone, color: "text-emerald-500", label: "Active · app", active: true };
  return { Icon: Globe, color: "text-emerald-500", label: "Active · web", active: true };
}

export default function RealEstatePage() {
  const { data } = useApp();
  const { allProfiles } = useAuth();
  const [appUserIds, setAppUserIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: rows } = await supabase.from("device_tokens").select("user_id");
      if (!cancelled && rows) setAppUserIds(new Set((rows as { user_id: string }[]).map(r => r.user_id)));
    })();
    return () => { cancelled = true; };
  }, []);

  const clientsById = useMemo(() => Object.fromEntries(data.clients.map(c => [c.id, c])) as Record<string, Client>, [data.clients]);
  const brokers = useMemo(() => data.clients.filter(c => c.clientType === "broker"), [data.clients]);
  const agents = useMemo(() => data.clients.filter(c => c.clientType === "agent"), [data.clients]);

  const reShoots = useMemo(() => data.projects.filter(p => {
    if (p.status === "cancelled") return false;
    const c = clientsById[p.clientId];
    if (c?.clientType === "agent") return true;
    return clientsById[getProjectPayerId(p, clientsById)]?.clientType === "broker";
  }), [data.projects, clientsById]);

  const now = new Date();
  const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const weekStart = addDaysIso(todayIso, -weekdayOf(todayIso));
  const weekEnd = addDaysIso(weekStart, 6);
  const ym = todayIso.slice(0, 7);
  const yr = todayIso.slice(0, 4);

  const scoreboard = useMemo(() => {
    return agents.map(agent => {
      const shoots = reShoots.filter(p => p.clientId === agent.id);
      const count = (filter: (d: string) => boolean) => shoots.filter(p => filter(p.date)).length;
      const yearShoots = shoots.filter(p => p.date.startsWith(yr));
      return {
        agent,
        broker: agent.brokerId ? clientsById[agent.brokerId] : null,
        week: count(d => d >= weekStart && d <= weekEnd),
        month: count(d => d.startsWith(ym)),
        year: yearShoots.length,
        dollars: yearShoots.reduce((s, p) => s + getProjectInvoiceAmount(p, agent), 0),
      };
    }).sort((a, b) => b.year - a.year || b.dollars - a.dollars);
  }, [agents, reShoots, clientsById, weekStart, weekEnd, ym, yr]);

  const activeAgents = scoreboard.filter(r => presence(r.agent.id, allProfiles, appUserIds).active).length;
  const activeBrokers = brokers.filter(b => presence(b.id, allProfiles, appUserIds).active).length;

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-4 border-b border-border bg-card/50">
        <h1 className="text-xl font-semibold text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Real Estate</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Who's enrolled and how often each agent books you.</p>
      </div>

      <div className="flex-1 overflow-auto p-4 sm:p-6 space-y-8 max-w-4xl w-full mx-auto">
        {/* Enrolled */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-card border border-border rounded-lg p-4">
            <div className="text-xs text-muted-foreground uppercase tracking-wide flex items-center gap-1.5"><Building2 className="w-3 h-3" /> Brokerages</div>
            <div className="text-2xl font-semibold text-foreground mt-1" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{brokers.length}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{activeBrokers} active</div>
          </div>
          <div className="bg-card border border-border rounded-lg p-4">
            <div className="text-xs text-muted-foreground uppercase tracking-wide flex items-center gap-1.5"><User className="w-3 h-3" /> Agents</div>
            <div className="text-2xl font-semibold text-foreground mt-1" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{agents.length}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{activeAgents} active</div>
          </div>
          <div className="bg-card border border-border rounded-lg p-4">
            <div className="text-xs text-muted-foreground uppercase tracking-wide flex items-center gap-1.5"><Home className="w-3 h-3" /> Shoots this month</div>
            <div className="text-2xl font-semibold text-foreground mt-1" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{reShoots.filter(p => p.date.startsWith(ym)).length}</div>
          </div>
          <div className="bg-card border border-border rounded-lg p-4">
            <div className="text-xs text-muted-foreground uppercase tracking-wide flex items-center gap-1.5"><Home className="w-3 h-3" /> Shoots this year</div>
            <div className="text-2xl font-semibold text-foreground mt-1" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{reShoots.filter(p => p.date.startsWith(yr)).length}</div>
          </div>
        </div>

        {/* Agent scoreboard */}
        <div>
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">Agent scoreboard · who to curate</div>
          {scoreboard.length === 0 ? (
            <p className="text-sm text-muted-foreground">No agents yet.</p>
          ) : (
            <div className="bg-card border border-border rounded-lg overflow-hidden">
              <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-2 px-3 py-2 text-[11px] uppercase tracking-wide text-muted-foreground border-b border-border">
                <span className="min-w-0">Agent</span><span className="text-right w-7">Wk</span><span className="text-right w-8">Mo</span><span className="text-right w-8">Yr</span><span className="text-right w-14">$/yr</span>
              </div>
              {scoreboard.map(({ agent, broker, week, month, year, dollars }) => {
                const pres = presence(agent.id, allProfiles, appUserIds);
                return (
                  <div key={agent.id} className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-2 px-3 py-2.5 items-center border-b border-border/40 last:border-b-0">
                    <div className="min-w-0 flex items-center gap-2">
                      <span title={pres.label} className="inline-flex"><pres.Icon className={`w-3.5 h-3.5 flex-shrink-0 ${pres.color}`} /></span>
                      <div className="min-w-0">
                        <div className="text-sm text-foreground truncate">{agent.company}</div>
                        {broker && <div className="text-[11px] text-muted-foreground truncate">{broker.company}</div>}
                      </div>
                    </div>
                    <span className="text-right w-7 text-sm tabular-nums text-foreground">{week}</span>
                    <span className="text-right w-8 text-sm tabular-nums text-foreground">{month}</span>
                    <span className="text-right w-8 text-sm tabular-nums font-medium text-foreground">{year}</span>
                    <span className="text-right w-14 text-sm tabular-nums text-muted-foreground">{money(dollars)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
