// ============================================================
// AgentQuickView — tap an agent's name on the Brokers page to pull them up:
// see what they have on the production calendar (their shoots) and book a new
// shoot in one tap. Read-only list; editing details still happens via the
// agent's profile (the pencil). Owner-facing.
// ============================================================

import { useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Building2, CalendarPlus, MapPin, CalendarClock } from "lucide-react";
import { useScopedData as useApp } from "@/hooks/useScopedData";
import { cn } from "@/lib/utils";
import type { Client, Project } from "@/lib/types";

const STATUS_LABELS: Record<string, string> = {
  tentative: "Tentative",
  upcoming: "Upcoming",
  filming_done: "Filmed",
  in_editing: "Editing",
  editing_done: "Editing Done",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fmtDate(iso: string): string {
  if (!iso) return "";
  const [y, mo, d] = iso.split("-").map(Number);
  return new Date(y, (mo || 1) - 1, d || 1).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

interface Props {
  agent: Client | null;
  onClose: () => void;
  /** Open the booking dialog pre-filled for this agent. */
  onBook: (agentId: string) => void;
}

export default function AgentQuickView({ agent, onClose, onBook }: Props) {
  const { data } = useApp();

  const broker = useMemo(
    () => (agent?.brokerId ? data.clients.find(c => c.id === agent.brokerId) : null),
    [data.clients, agent?.brokerId],
  );

  const { upcoming, past } = useMemo(() => {
    const t = todayIso();
    const mine = agent ? data.projects.filter(p => p.clientId === agent.id) : [];
    const isUpcoming = (p: Project) => p.date >= t && p.status !== "cancelled" && p.status !== "delivered";
    return {
      upcoming: mine.filter(isUpcoming).sort((a, b) => a.date.localeCompare(b.date)),
      past: mine.filter(p => !isUpcoming(p)).sort((a, b) => b.date.localeCompare(a.date)),
    };
  }, [data.projects, agent]);

  const locFor = (p: Project) => {
    const l = data.locations.find(x => x.id === p.locationId);
    return l ? (l.address || l.name || "") : "";
  };
  const typeFor = (p: Project) => data.projectTypes.find(x => x.id === p.projectTypeId)?.name ?? "Shoot";

  const Row = ({ p }: { p: Project }) => (
    <div className="flex items-center gap-3 rounded-md border border-border px-3 py-2 text-sm min-w-0">
      <div className="w-12 shrink-0 text-center">
        <div className="text-[10px] uppercase text-muted-foreground">{fmtDate(p.date).split(" ")[1]}</div>
        <div className="text-base font-bold leading-tight" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{fmtDate(p.date).split(" ")[2]}</div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-medium text-foreground truncate">{typeFor(p)}</div>
        {locFor(p) && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground truncate">
            <MapPin className="w-3 h-3 shrink-0" /> <span className="truncate">{locFor(p)}</span>
          </div>
        )}
      </div>
      <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 border shrink-0",
        p.status === "upcoming" && "border-blue-500/40 text-blue-600 dark:text-blue-300",
        p.status === "tentative" && "border-amber-500/40 border-dashed text-amber-600 dark:text-amber-300",
        p.status === "delivered" && "border-green-500/40 text-green-600 dark:text-green-300",
        p.status === "cancelled" && "border-red-500/40 text-red-600 dark:text-red-300",
      )}>
        {STATUS_LABELS[p.status] ?? p.status}
      </Badge>
    </div>
  );

  return (
    <Dialog open={!!agent} onOpenChange={o => !o && onClose()}>
      <DialogContent className="bg-card border-border text-foreground max-w-md">
        <DialogHeader>
          <DialogTitle style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{agent?.company}</DialogTitle>
          {broker && (
            <p className="text-xs text-muted-foreground flex items-center gap-1"><Building2 className="w-3 h-3" /> {broker.company}</p>
          )}
        </DialogHeader>

        <Button onClick={() => agent && onBook(agent.id)} className="w-full gap-2 bg-primary text-primary-foreground hover:bg-primary/90">
          <CalendarPlus className="w-4 h-4" /> Book a shoot
        </Button>

        <div className="mt-1 max-h-[55vh] overflow-y-auto space-y-4">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium mb-2 flex items-center gap-1.5">
              <CalendarClock className="w-3 h-3" /> Upcoming shoots
            </div>
            {upcoming.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing on the calendar yet — book their first shoot above.</p>
            ) : (
              <div className="space-y-2">{upcoming.map(p => <Row key={p.id} p={p} />)}</div>
            )}
          </div>

          {past.length > 0 && (
            <div>
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium mb-2">Past & delivered</div>
              <div className="space-y-2">{past.slice(0, 20).map(p => <Row key={p.id} p={p} />)}</div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
