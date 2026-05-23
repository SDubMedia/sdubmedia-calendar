// ============================================================
// SeriesPage — List and create content series
// ============================================================

import { useState } from "react";
import { useScopedData as useApp } from "@/hooks/useScopedData";
import { Link } from "wouter";
import type { SeriesStatus } from "@/lib/types";
import { Plus, X, Film, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const STATUS_COLORS: Record<SeriesStatus, string> = {
  draft: "bg-zinc-500/20 text-zinc-300 border-zinc-500/30",
  active: "bg-green-500/20 text-green-300 border-green-500/30",
  completed: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  archived: "bg-stone-500/15 text-stone-400 border-stone-500/30",
};

const STATUS_LABELS: Record<SeriesStatus, string> = {
  draft: "Draft",
  active: "Active",
  completed: "Completed",
  archived: "Archived",
};

export default function SeriesPage() {
  const { data, addSeries } = useApp();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [clientId, setClientId] = useState("");
  const [goal, setGoal] = useState("");
  const [creating, setCreating] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const visibleSeries = data.series.filter(s => showArchived ? s.status === "archived" : s.status !== "archived");
  const archivedCount = data.series.filter(s => s.status === "archived").length;

  const handleCreate = async () => {
    if (!name || !clientId) { toast.error("Please fill in name and client"); return; }
    setCreating(true);
    try {
      await addSeries({
        name, clientId, goal, status: "draft",
        monthlyTokenLimit: 500000, tokensUsedThisMonth: 0, tokenResetDate: "",
      });
      toast.success(`Series "${name}" created`);
      setShowForm(false);
      setName(""); setClientId(""); setGoal("");
    } catch (err: any) {
      toast.error(err.message || "Failed to create series");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-border bg-card/50">
        <div>
          <h1 className="text-xl font-semibold text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            Content Series
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Plan and manage video series with your clients</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-3 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors text-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">New Series</span>
        </button>
      </div>

      <div className="flex-1 overflow-auto p-3 sm:p-6 space-y-5">
        {showForm && (
          <div className="bg-card border border-border rounded-lg p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                Create New Series
              </h3>
              <button onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground uppercase tracking-wider block mb-1">Series Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g., 10-Day Agent Series"
                  className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground uppercase tracking-wider block mb-1">Client</label>
                <select
                  value={clientId}
                  onChange={e => setClientId(e.target.value)}
                  className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="">Select client...</option>
                  {data.clients.map(c => (
                    <option key={c.id} value={c.id}>{c.company}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground uppercase tracking-wider block mb-1">Goal / Description</label>
              <textarea
                value={goal}
                onChange={e => setGoal(e.target.value)}
                placeholder="What is this series about? What do you want to achieve?"
                rows={3}
                className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
              />
            </div>
            <div className="flex justify-end">
              <button
                onClick={handleCreate}
                disabled={creating}
                className="px-4 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors text-sm font-medium disabled:opacity-50"
              >
                {creating ? "Creating..." : "Create Series"}
              </button>
            </div>
          </div>
        )}

        {/* Archive toggle — only render when there's archived data
            to avoid noise in early-empty state. */}
        {archivedCount > 0 && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowArchived(false)}
              className={cn(
                "px-2.5 py-1 rounded text-xs border transition-colors",
                !showArchived ? "bg-primary/20 border-primary/50 text-primary" : "border-border text-muted-foreground hover:border-primary/30",
              )}
            >
              Active
            </button>
            <button
              type="button"
              onClick={() => setShowArchived(true)}
              className={cn(
                "px-2.5 py-1 rounded text-xs border transition-colors",
                showArchived ? "bg-primary/20 border-primary/50 text-primary" : "border-border text-muted-foreground hover:border-primary/30",
              )}
            >
              Archived ({archivedCount})
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {visibleSeries.length === 0 && !showForm ? (
            <div className="col-span-full bg-card border border-border rounded-lg p-10 text-center max-w-2xl mx-auto">
              <Film className="w-10 h-10 text-primary mx-auto mb-4 opacity-80" />
              <h3 className="text-base font-semibold text-foreground mb-2" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                {showArchived ? "Nothing archived yet" : "Plan a video series with AI"}
              </h3>
              {!showArchived && (
                <>
                  <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
                    Brainstorm episodes with Claude, develop talking points and visuals,<br className="hidden sm:inline" />
                    schedule shoots, and send the plan to your client for approval — all in one workspace.
                  </p>
                  <button
                    onClick={() => setShowForm(true)}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors text-sm font-medium"
                  >
                    <Plus className="w-4 h-4" />
                    Create your first series
                  </button>
                </>
              )}
            </div>
          ) : (
            visibleSeries.map(s => {
              const client = data.clients.find(c => c.id === s.clientId);
              return (
                <Link key={s.id} href={`/series/${s.id}`}>
                  <div className="bg-card border border-border rounded-lg p-4 hover:border-primary/30 transition-colors cursor-pointer h-full">
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="text-sm font-semibold text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                        {s.name}
                      </h3>
                      <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded border shrink-0", STATUS_COLORS[s.status])}>
                        {STATUS_LABELS[s.status]}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mb-3">{client?.company}</p>
                    {s.goal && (
                      <p className="text-xs text-muted-foreground/70 line-clamp-2 mb-3">{s.goal}</p>
                    )}
                    <div className="flex items-center justify-end text-xs text-primary">
                      Open Workspace <ArrowRight className="w-3 h-3 ml-1" />
                    </div>
                  </div>
                </Link>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
