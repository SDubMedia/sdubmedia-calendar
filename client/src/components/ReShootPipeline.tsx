// ============================================================
// ReShootPipeline — the real-estate SHOOT pipeline (kanban by stage). Reused on
// the Real Estate hub and stacked under the Event Pipeline on the Pipeline tab.
// ============================================================

import { useMemo, useState } from "react";
import { useScopedData as useApp } from "@/hooks/useScopedData";
import { getProjectPayerId } from "@/lib/data";
import ProjectDetailSheet from "@/components/ProjectDetailSheet";
import type { Project, Client } from "@/lib/types";

const STAGES = [
  { id: "booked", label: "Booked", color: "border-blue-500/40" },
  { id: "shot", label: "Shot", color: "border-yellow-500/40" },
  { id: "editing", label: "In Editing", color: "border-purple-500/40" },
  { id: "delivered", label: "Delivered", color: "border-emerald-500/40" },
  { id: "paid", label: "Paid", color: "border-green-600/40" },
] as const;
type StageId = typeof STAGES[number]["id"];

function reStage(p: Project): StageId | null {
  if (p.status === "cancelled") return null;
  if (p.paidDate) return "paid";
  if (p.status === "delivered") return "delivered";
  if (p.status === "in_editing" || p.status === "editing_done") return "editing";
  if (p.status === "filming_done") return "shot";
  return "booked"; // tentative / upcoming
}

function fmtDate(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function ReShootPipeline({ heading = "Real Estate" }: { heading?: string }) {
  const { data } = useApp();
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);

  const clientsById = useMemo(() => Object.fromEntries(data.clients.map(c => [c.id, c])) as Record<string, Client>, [data.clients]);

  const reShoots = useMemo(() => data.projects.filter(p => {
    if (p.status === "cancelled") return false;
    const c = clientsById[p.clientId];
    if (c?.clientType === "agent") return true;
    return clientsById[getProjectPayerId(p, clientsById)]?.clientType === "broker";
  }), [data.projects, clientsById]);

  const byStage = useMemo(() => {
    const m: Record<StageId, Project[]> = { booked: [], shot: [], editing: [], delivered: [], paid: [] };
    for (const p of reShoots) { const s = reStage(p); if (s) m[s].push(p); }
    for (const k of Object.keys(m) as StageId[]) m[k].sort((a, b) => b.date.localeCompare(a.date));
    return m;
  }, [reShoots]);

  return (
    <div>
      {heading && <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">{heading}</div>}
      <div className="flex gap-3 overflow-x-auto pb-2">
        {STAGES.map(stage => (
          <div key={stage.id} className="flex-shrink-0 w-56">
            <div className={`text-xs font-medium text-foreground mb-2 pb-1.5 border-b-2 ${stage.color} flex items-center justify-between`}>
              <span>{stage.label}</span>
              <span className="text-muted-foreground">{byStage[stage.id].length}</span>
            </div>
            <div className="space-y-2">
              {byStage[stage.id].map(p => {
                const agent = clientsById[p.clientId];
                const loc = data.locations.find(l => l.id === p.locationId);
                return (
                  <button key={p.id} onClick={() => setSelectedProject(p)} className="w-full text-left bg-card border border-border rounded-lg p-2.5 hover:border-border/80 transition-colors">
                    <div className="text-xs font-medium text-foreground truncate">{loc?.name || "Address TBD"}</div>
                    <div className="text-[11px] text-muted-foreground truncate">{agent?.company || ""}{p.date ? ` · ${fmtDate(p.date)}` : ""}</div>
                  </button>
                );
              })}
              {byStage[stage.id].length === 0 && <div className="text-[11px] text-muted-foreground/50 py-2">—</div>}
            </div>
          </div>
        ))}
      </div>
      {selectedProject && (
        <ProjectDetailSheet project={selectedProject} onClose={() => setSelectedProject(null)} />
      )}
    </div>
  );
}
