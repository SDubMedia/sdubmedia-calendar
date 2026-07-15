// ============================================================
// ProjectHistorySection — the audit trail shown at the bottom of a project's
// edit dialog: who created it and every status / date / time move since.
// Read-only. Fetches on mount for the given project.
// ============================================================

import { useEffect, useState } from "react";
import { History, Plus, ArrowRight, Loader2 } from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import type { ProjectHistoryEntry } from "@/lib/types";

const STATUS_LABELS: Record<string, string> = {
  tentative: "Tentative",
  upcoming: "Upcoming",
  filming_done: "Filmed",
  in_editing: "In Editing",
  editing_done: "Editing Done",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function fmtStamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + " · " +
    d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function describe(e: ProjectHistoryEntry): { label: string; from?: string; to?: string } {
  switch (e.action) {
    case "created":
      return { label: "Created" };
    case "status_changed":
      return { label: "Status", from: STATUS_LABELS[e.fromValue || ""] || e.fromValue || "—", to: STATUS_LABELS[e.toValue || ""] || e.toValue || "—" };
    case "date_changed":
      return { label: "Date", from: fmtDate(e.fromValue), to: fmtDate(e.toValue) };
    case "time_changed":
      return { label: "Time", from: e.fromValue || "—", to: e.toValue || "—" };
    default:
      return { label: e.action };
  }
}

export default function ProjectHistorySection({ projectId }: { projectId: string }) {
  const { fetchProjectHistory } = useApp();
  const [entries, setEntries] = useState<ProjectHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchProjectHistory(projectId).then((rows) => { if (alive) { setEntries(rows); setLoading(false); } });
    return () => { alive = false; };
  }, [projectId, fetchProjectHistory]);

  return (
    <div className="rounded-lg border border-border bg-secondary/20 p-3 space-y-2">
      <div className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
        <History className="w-3.5 h-3.5" /> History
      </div>

      {loading ? (
        <div className="text-xs text-muted-foreground flex items-center gap-2 py-1"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…</div>
      ) : entries.length === 0 ? (
        <p className="text-xs text-muted-foreground">No history recorded yet. Changes made from now on will show here.</p>
      ) : (
        <div className="space-y-1.5">
          {entries.map((e) => {
            const d = describe(e);
            return (
              <div key={e.id} className="flex items-start gap-2 text-xs">
                <div className="mt-0.5 shrink-0 text-muted-foreground">
                  {e.action === "created" ? <Plus className="w-3 h-3" /> : <ArrowRight className="w-3 h-3" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-foreground">
                    <span className="font-medium">{d.label}</span>
                    {d.from !== undefined && (
                      <span className="text-muted-foreground"> · {d.from} → {d.to}</span>
                    )}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {e.actorName || "Someone"} · {fmtStamp(e.createdAt)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
