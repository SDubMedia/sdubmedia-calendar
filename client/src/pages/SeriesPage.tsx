// ============================================================
// SeriesPage — List and create content series
// ============================================================

import { useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { Link } from "wouter";
import type { SeriesStatus } from "@/lib/types";
import { Plus, X, Film, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const STATUS_COLORS: Record<SeriesStatus, string> = {
  draft: "bg-zinc-500/20 text-zinc-300 border-zinc-500/30",
  active: "bg-green-500/20 text-green-300 border-green-500/30",
  completed: "bg-blue-500/20 text-blue-300 border-blue-500/30",
};

const STATUS_LABELS: Record<SeriesStatus, string> = {
  draft: "Draft",
  active: "Active",
  completed: "Completed",
};

export default function SeriesPage() {
  const { data, addSeries } = useApp();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [clientId, setClientId] = useState("");
  const [goal, setGoal] = useState("");
  const [creating, setCreating] = useState(false);

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

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {data.series.length === 0 && !showForm ? (
            <div className="col-span-full bg-card border border-border rounded-lg p-8 text-center">
              <Film className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">No series yet</p>
              <p className="text-sm text-muted-foreground/60 mt-1">Create your first content series to start collaborating with clients.</p>
            </div>
          ) : (
            data.series.map(s => {
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
