// ============================================================
// TimerWidget — Persistent timer in header bar
// Supports pause/resume, auto-stops at 2 hours
// ============================================================

import { useState, useEffect, useMemo, useRef } from "react";
import { useApp } from "@/contexts/AppContext";
import { useAuth } from "@/contexts/AuthContext";
import { Play, Square, Clock, Pause } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const AUTO_STOP_MINUTES = 120; // 2 hours

function formatElapsed(seconds: number): string {
  const s = Math.max(0, seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
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

  const isPaused = !!activeTimer?.pausedAt;

  // Latest stopTimer in a ref so the tick interval always invokes the current
  // version without re-arming on every parent render.
  const stopTimerRef = useRef<(auto?: boolean) => void>(() => {});

  // Tick the timer. Deps are deliberately narrowed to the fields that need
  // to re-arm the interval; the closure over activeTimer is otherwise safe
  // because those three fields (id/pausedAt/totalPausedMs) are everything
  // tick() reads from it.
  useEffect(() => {
    if (!activeTimer) { setElapsed(0); return; }

    const startTime = new Date(activeTimer.startTime).getTime();
    const totalPausedMs = activeTimer.totalPausedMs || 0;
    const pausedAt = activeTimer.pausedAt;

    const tick = () => {
      const now = Date.now();
      const activePauseMs = pausedAt ? now - new Date(pausedAt).getTime() : 0;
      const secs = Math.floor((now - startTime - totalPausedMs - activePauseMs) / 1000);
      setElapsed(secs);

      // Auto-stop at 2 hours of active time
      if (secs >= AUTO_STOP_MINUTES * 60) {
        stopTimerRef.current(true);
      }
    };

    tick();
    // Tick every second when running, every 10s when paused (just to stay in sync)
    const interval = setInterval(tick, pausedAt ? 10000 : 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTimer?.id, activeTimer?.pausedAt, activeTimer?.totalPausedMs]);

  // Keep stopTimerRef pointing at the freshest stopTimer (which closes over
  // the latest activeTimer). Runs after every render.
  useEffect(() => {
    stopTimerRef.current = (auto?: boolean) => { void stopTimer(auto); };
  });

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
        pausedAt: null,
        totalPausedMs: 0,
        notes: "",
      });
      toast.success("Timer started");
      setStartDialogOpen(false);
      setSelectedProjectId("");
    } catch (e: any) {
      toast.error(e.message || "Failed to start timer");
    }
  }

  async function pauseTimer() {
    if (!activeTimer || isPaused) return;
    try {
      await updateTimeEntry(activeTimer.id, {
        pausedAt: new Date().toISOString(),
      });
      toast.success("Timer paused");
    } catch (e: any) {
      toast.error(e.message || "Failed to pause timer");
    }
  }

  async function resumeTimer() {
    if (!activeTimer || !activeTimer.pausedAt) return;
    const pausedMs = Date.now() - new Date(activeTimer.pausedAt).getTime();
    try {
      await updateTimeEntry(activeTimer.id, {
        pausedAt: null,
        totalPausedMs: (activeTimer.totalPausedMs || 0) + pausedMs,
      });
      toast.success("Timer resumed");
    } catch (e: any) {
      toast.error(e.message || "Failed to resume timer");
    }
  }

  async function stopTimer(auto = false) {
    if (!activeTimer) return;

    const endTime = new Date().toISOString();
    const startMs = new Date(activeTimer.startTime).getTime();
    const endMs = new Date(endTime).getTime();

    // Account for any active pause at stop time
    let totalPausedMs = activeTimer.totalPausedMs || 0;
    if (activeTimer.pausedAt) {
      totalPausedMs += endMs - new Date(activeTimer.pausedAt).getTime();
    }

    let activeMs = endMs - startMs - totalPausedMs;

    // Cap at 2 hours if auto-stopped
    if (auto && activeMs > AUTO_STOP_MINUTES * 60 * 1000) {
      activeMs = AUTO_STOP_MINUTES * 60 * 1000;
    }

    const durationMinutes = Math.round((activeMs / 1000 / 60) * 100) / 100;

    try {
      await updateTimeEntry(activeTimer.id, {
        endTime,
        durationMinutes: Math.max(0, durationMinutes),
        autoStopped: auto,
        pausedAt: null,
        totalPausedMs,
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
        // Running or paused timer
        <div className="flex items-center gap-1">
          <button
            onClick={() => stopTimer(false)}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-l-lg text-xs font-medium transition-colors",
              isPaused
                ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                : elapsed >= (AUTO_STOP_MINUTES - 10) * 60
                  ? "bg-red-500/20 text-red-300 border border-red-500/30 animate-pulse"
                  : "bg-green-500/20 text-green-300 border border-green-500/30"
            )}
          >
            {isPaused ? (
              <div className="w-2 h-2 rounded-sm bg-amber-400" />
            ) : (
              <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            )}
            <span className="font-mono">{formatElapsed(elapsed)}</span>
            <span className="hidden sm:inline text-inherit opacity-70">
              {activeProject?.name}{isPaused ? " (paused)" : ""}
            </span>
            <Square className="w-3 h-3 ml-1" />
          </button>
          <button
            onClick={isPaused ? resumeTimer : pauseTimer}
            className={cn(
              "flex items-center justify-center w-8 h-[34px] rounded-r-lg text-xs font-medium transition-colors border",
              isPaused
                ? "bg-green-500/20 text-green-300 border-green-500/30 hover:bg-green-500/30"
                : "bg-amber-500/20 text-amber-300 border-amber-500/30 hover:bg-amber-500/30"
            )}
            title={isPaused ? "Resume" : "Pause"}
          >
            {isPaused ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
          </button>
        </div>
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
