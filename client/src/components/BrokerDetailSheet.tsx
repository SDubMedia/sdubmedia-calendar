// ============================================================
// BrokerDetailSheet — tap a brokerage on the Brokers page to pull it up:
// see what's billable this month / this year, every shoot grouped by agent,
// past invoices, and a one-tap month-end Generate. Read-only list + actions;
// editing the brokerage's profile still happens via the pencil. Owner-facing.
// ============================================================

import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Building2, User, MapPin, FileText, Pencil, Receipt } from "lucide-react";
import { useScopedData as useApp } from "@/hooks/useScopedData";
import { getProjectPayerId, getProjectInvoiceAmount, getProjectProfit } from "@/lib/data";
import { cn } from "@/lib/utils";
import type { Client, Project } from "@/lib/types";

const STATUS_LABELS: Record<string, string> = {
  tentative: "Tentative", upcoming: "Upcoming", filming_done: "Filmed",
  in_editing: "Editing", editing_done: "Editing Done", delivered: "Delivered", cancelled: "Cancelled",
};
// Statuses that count toward the bill (match the Brokers-page roll-up).
const BILLABLE = new Set(["filming_done", "in_editing", "editing_done", "delivered"]);

function money(n: number): string {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtDate(iso: string): string {
  if (!iso) return "";
  const [y, mo, d] = iso.split("-").map(Number);
  return new Date(y, (mo || 1) - 1, d || 1).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

interface Props {
  broker: Client | null;
  onClose: () => void;
  /** Open one of the broker's shoots to edit it (returns here on close). */
  onOpenShoot: (project: Project) => void;
  /** Generate this month's invoice for the broker. */
  onGenerate: (broker: Client) => void;
  generating: boolean;
  /** Jump to the Invoices page. */
  onOpenInvoices: () => void;
}

export default function BrokerDetailSheet({ broker, onClose, onOpenShoot, onGenerate, generating, onOpenInvoices }: Props) {
  const { data } = useApp();
  const [period, setPeriod] = useState<"month" | "year">("month");

  const clientsById = useMemo(() => Object.fromEntries(data.clients.map(c => [c.id, c])), [data.clients]);

  const view = useMemo(() => {
    if (!broker) return null;
    const now = new Date();
    const y = now.getFullYear();
    const pad = (n: number) => String(n).padStart(2, "0");
    const lastDay = new Date(y, now.getMonth() + 1, 0).getDate();
    const bounds = period === "month"
      ? { start: `${y}-${pad(now.getMonth() + 1)}-01`, end: `${y}-${pad(now.getMonth() + 1)}-${pad(lastDay)}` }
      : { start: `${y}-01-01`, end: `${y}-12-31` };

    const mine = data.projects.filter(p =>
      getProjectPayerId(p, clientsById) === broker.id &&
      p.date >= bounds.start && p.date <= bounds.end &&
      p.status !== "cancelled",
    ).sort((a, b) => b.date.localeCompare(a.date));

    let homes = 0, revenue = 0, profit = 0;
    for (const p of mine) {
      if (!BILLABLE.has(p.status)) continue;
      const agent = clientsById[p.clientId] || broker;
      homes += 1;
      revenue += getProjectInvoiceAmount(p, agent);
      profit += getProjectProfit(p, agent);
    }

    // Group the shoot list by agent.
    const groups = new Map<string, Project[]>();
    for (const p of mine) {
      const list = groups.get(p.clientId) ?? [];
      list.push(p);
      groups.set(p.clientId, list);
    }
    const byAgent = Array.from(groups.entries())
      .map(([clientId, projects]) => ({ name: clientsById[clientId]?.company ?? "—", projects }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const invoices = data.invoices
      .filter(inv => inv.clientId === broker.id)
      .sort((a, b) => (b.issueDate || b.createdAt || "").localeCompare(a.issueDate || a.createdAt || ""));

    return { homes, revenue, profit, byAgent, invoices, totalShoots: mine.length };
  }, [broker, period, data.projects, data.invoices, clientsById]);

  const locFor = (p: Project) => {
    const l = data.locations.find(x => x.id === p.locationId);
    return l ? (l.address || l.name || "") : "";
  };

  const Row = ({ p }: { p: Project }) => {
    const agent = clientsById[p.clientId] || broker!;
    return (
      <button type="button" onClick={() => onOpenShoot(p)} className="w-full text-left flex items-center gap-3 rounded-md border border-border px-3 py-2 text-sm min-w-0 hover:bg-muted transition-colors">
        <div className="w-10 shrink-0 text-center">
          <div className="text-[10px] uppercase text-muted-foreground">{fmtDate(p.date).split(" ")[0]}</div>
          <div className="text-base font-bold leading-tight" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{fmtDate(p.date).split(" ")[1]}</div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-foreground truncate">{locFor(p) || STATUS_LABELS[p.status] || "Shoot"}</div>
          <div className="text-xs text-muted-foreground">{money(getProjectInvoiceAmount(p, agent))}</div>
        </div>
        <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 border shrink-0",
          p.status === "upcoming" && "border-blue-500/40 text-blue-600 dark:text-blue-300",
          BILLABLE.has(p.status) && "border-emerald-500/40 text-emerald-600 dark:text-emerald-300",
        )}>
          {STATUS_LABELS[p.status] ?? p.status}
        </Badge>
        <Pencil className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0" />
      </button>
    );
  };

  return (
    <Dialog open={!!broker} onOpenChange={o => !o && onClose()}>
      <DialogContent className="bg-card border-border text-foreground max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            <Building2 className="w-4 h-4 text-primary" /> {broker?.company}
          </DialogTitle>
        </DialogHeader>

        {/* Month / Year toggle */}
        <div className="flex gap-1 rounded-md bg-secondary p-1 text-sm">
          {(["month", "year"] as const).map(pp => (
            <button key={pp} onClick={() => setPeriod(pp)}
              className={cn("flex-1 rounded px-3 py-1.5 capitalize transition-colors", period === pp ? "bg-background text-foreground font-medium" : "text-muted-foreground")}>
              This {pp}
            </button>
          ))}
        </div>

        {/* Totals */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg border border-border p-2">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Homes</div>
            <div className="text-lg font-bold">{view?.homes ?? 0}</div>
          </div>
          <div className="rounded-lg border border-border p-2">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">To invoice</div>
            <div className="text-lg font-bold text-primary tabular-nums">{money(view?.revenue ?? 0)}</div>
          </div>
          <div className="rounded-lg border border-border p-2">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Profit</div>
            <div className={cn("text-lg font-bold tabular-nums", (view?.profit ?? 0) >= 0 ? "text-green-500" : "text-red-500")}>{money(view?.profit ?? 0)}</div>
          </div>
        </div>

        {broker && (
          <Button onClick={() => onGenerate(broker)} disabled={generating || !view?.homes} className="w-full gap-2 bg-primary text-primary-foreground hover:bg-primary/90">
            <FileText className="w-4 h-4" /> {generating ? "Generating…" : "Generate this month's invoice"}
          </Button>
        )}

        <div className="max-h-[45vh] overflow-y-auto space-y-4">
          {/* Shoots grouped by agent */}
          <div>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium mb-2">Shoots this {period} <span className="normal-case font-normal">· tap to edit</span></div>
            {!view || view.totalShoots === 0 ? (
              <p className="text-sm text-muted-foreground">No shoots this {period} yet.</p>
            ) : (
              <div className="space-y-3">
                {view.byAgent.map(g => (
                  <div key={g.name} className="space-y-1.5">
                    <div className="text-xs text-foreground flex items-center gap-1.5"><User className="w-3 h-3 text-muted-foreground" /> {g.name} · {g.projects.length}</div>
                    <div className="space-y-1.5">{g.projects.map(p => <Row key={p.id} p={p} />)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Past invoices */}
          {view && view.invoices.length > 0 && (
            <div>
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium mb-2 flex items-center gap-1.5"><Receipt className="w-3 h-3" /> Invoices</div>
              <div className="space-y-1.5">
                {view.invoices.slice(0, 12).map(inv => (
                  <button key={inv.id} type="button" onClick={onOpenInvoices} className="w-full text-left flex items-center gap-3 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted transition-colors">
                    <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span className="flex-1 min-w-0 truncate">{inv.invoiceNumber || "Invoice"}</span>
                    <span className="tabular-nums text-muted-foreground shrink-0">{money(inv.total || 0)}</span>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-border shrink-0 capitalize">{inv.status}</Badge>
                  </button>
                ))}
              </div>
              <button onClick={onOpenInvoices} className="mt-2 text-xs text-primary hover:underline flex items-center gap-1"><MapPin className="w-3 h-3 opacity-0" />Open Invoices →</button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
