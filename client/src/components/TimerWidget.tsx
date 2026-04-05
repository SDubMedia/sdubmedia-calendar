// ============================================================
// TimerWidget — Persistent timer in header bar
// Auto-stops at 2 hours if forgotten
// ============================================================

import { useState, useEffect, useMemo } from "react";
import { useApp } from "@/contexts/AppContext";
import { useAuth } from "@/contexts/AuthContext";
import { Play, Square, Clock } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const AUTO_STOP_MINUTES = 120; // 2 hours

function formatElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function TimerWidget() {
  const { data, addTimeEntry, updateTimeEntry } = useApp();
  const { profile } = useAuth();
  const crewMemberId = profile?.crewMemberId || "";

  const [startDialogOpen, setStartDialogOpen] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [elapsed, setElapsed] = useState(0);

  // Find active timer (no end_time)
  const activeTimer = useMemo(() => {
    if (!crewMemberId) return null;
    return data.timeEntries.find(t => t.crewMemberId === crewMemberId && !t.endTime) || null;
  }, [data.timeEntries, crewMemberId]);

  // Tick the timer
  useEffect(() => {
    if (!activeTimer) { setElapsed(0); return; }

    const startTime = new Date(activeTimer.startTime).getTime();

    const tick = () => {
      const now = Date.now();
      const secs = Math.floor((now - startTime) / 1000);
      setElapsed(secs);

      // Auto-stop at 2 hours
      if (secs >= AUTO_STOP_MINUTES * 60) {
        stopTimer(true);
      }
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [activeTimer?.id]);

  // Get project name for active timer
  const activeProject = useMemo(() => {
    if (!activeTimer) return null;
    const project = data.projects.find(p => p.id === activeTimer.projectId);
    const pType = project ? data.projectTypes.find(t => t.id === project.projectTypeId) : null;
    const client = project ? data.clients.find(c => c.id === project.clientId) : null;
    return { name: pType?.name || "Project", client: client?.company || "" };
  }, [activeTimer, data.projects, data.projectTypes, data.clients]);

  // Projects this crew member is assigned to
  const myProjects = useMemo(() => {
    if (!crewMemberId) return data.projects;
    return data.projects.filter(p =>
      p.status !== "completed" && (
        p.crew.some(c => c.crewMemberId === crewMemberId) ||
        p.postProduction.some(c => c.crewMemberId === crewMemberId)
      )
    );
  }, [data.projects, crewMemberId]);

  async function startTimer() {
    if (!selectedProjectId) { toast.error("Select a project"); return; }
    if (!crewMemberId) { toast.error("No crew profile linked"); return; }

    try {
      await addTimeEntry({
        crewMemberId,
        projectId: selectedProjectId,
        startTime: new Date().toISOString(),
        endTime: null,
        durationMinutes: null,
        autoStopped: false,
        notes: "",
      });
      toast.success("Timer started");
      setStartDialogOpen(false);
      setSelectedProjectId("");
    } catch (e: any) {
      toast.error(e.message || "Failed to start timer");
    }
  }

  async function stopTimer(auto = false) {
    if (!activeTimer) return;

    const endTime = new Date().toISOString();
    const startMs = new Date(activeTimer.startTime).getTime();
    let durationMs = new Date(endTime).getTime() - startMs;

    // Cap at 2 hours if auto-stopped
    if (auto && durationMs > AUTO_STOP_MINUTES * 60 * 1000) {
      durationMs = AUTO_STOP_MINUTES * 60 * 1000;
    }

    const durationMinutes = Math.round((durationMs / 1000 / 60) * 100) / 100;

    try {
      await updateTimeEntry(activeTimer.id, {
        endTime,
        durationMinutes,
        autoStopped: auto,
      });

      const hrs = Math.floor(durationMinutes / 60);
      const mins = Math.round(durationMinutes % 60);
      const timeStr = hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
      toast.success(auto
        ? `Timer auto-stopped at 2 hours (${timeStr} logged)`
        : `Timer stopped — ${timeStr} logged`
      );
    } catch (e: any) {
      toast.error(e.message || "Failed to stop timer");
    }
  }

  if (!crewMemberId) return null;

  return (
    <>
      {activeTimer ? (
        // Running timer
        <button
          onClick={() => stopTimer(false)}
          className={cn(
            "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
            elapsed >= (AUTO_STOP_MINUTES - 10) * 60
              ? "bg-red-500/20 text-red-300 border border-red-500/30 animate-pulse"
              : "bg-green-500/20 text-green-300 border border-green-500/30"
          )}
        >
          <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          <span className="font-mono">{formatElapsed(elapsed)}</span>
          <span className="hidden sm:inline text-green-400/70">
            {activeProject?.name}
          </span>
          <Square className="w-3 h-3 ml-1" />
        </button>
      ) : (
        // Start button
        <button
          onClick={() => setStartDialogOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary border border-border text-xs text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors"
        >
          <Play className="w-3 h-3" />
          <span className="hidden sm:inline">Timer</span>
        </button>
      )}

      {/* Start Timer Dialog */}
      <Dialog open={startDialogOpen} onOpenChange={setStartDialogOpen}>
        <DialogContent className="bg-card border-border text-foreground max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              <Clock className="w-5 h-5 text-primary" />
              Start Timer
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Select Project</label>
              <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
                <SelectTrigger className="bg-secondary border-border">
                  <SelectValue placeholder="Choose a project..." />
                </SelectTrigger>
                <SelectContent className="bg-popover border-border">
                  {myProjects.map(p => {
                    const pType = data.projectTypes.find(t => t.id === p.projectTypeId);
                    const client = data.clients.find(c => c.id === p.clientId);
                    return (
                      <SelectItem key={p.id} value={p.id}>
                        {pType?.name || "Project"} — {client?.company || ""} ({p.date})
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Timer will auto-stop after 2 hours if not manually stopped.
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setStartDialogOpen(false)}>Cancel</Button>
            <Button onClick={startTimer} className="gap-2">
              <Play className="w-4 h-4" /> Start
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
