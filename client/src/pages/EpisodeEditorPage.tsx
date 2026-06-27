// ============================================================
// EpisodeEditorPage — full-page editor for one series episode.
// Owner-only (Series feature is owner-only).
//
// Replaces the inline-expand episode editor inside EpisodeBoard
// for the "deep edit" use case. The board is still where you
// quickly scan + reorder episodes; this page is where you spend
// time writing the concept, talking points, B-roll notes, and
// scheduling.
//
// Autosave: every editable field saves 600ms after the last
// keystroke. A flush-on-unmount effect catches any pending edit
// when the user navigates away mid-debounce. Save status badge
// shows "Saving…" / "Saved · 3s ago" near the title.
// ============================================================

import { useEffect, useRef, useState } from "react";
import { useParams, useLocation, Link } from "wouter";
import { useApp } from "@/contexts/AppContext";
import { useAuth } from "@/contexts/AuthContext";
import type { SeriesEpisode, EpisodeStatus } from "@/lib/types";
import { ArrowLeft, Calendar, Clock, MapPin, Users, FileText, Lightbulb, ListChecks, CheckCircle2, AlertCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { DateField, TimeField } from "@/components/DateTimeField";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const STATUS_LABELS: Record<EpisodeStatus, string> = {
  idea: "Idea",
  concept: "Concept",
  script: "Scripted",
  client_review: "In Client Review",
  scheduled: "Scheduled",
  filming: "Filming",
  editing: "Editing",
  review: "Internal Review",
  delivered: "Delivered",
};

const STATUS_FLOW: EpisodeStatus[] = ["idea", "concept", "script", "client_review", "scheduled", "filming", "editing", "review", "delivered"];

export default function EpisodeEditorPage() {
  const params = useParams<{ id: string; episodeId: string }>();
  const seriesId = params.id || "";
  const episodeId = params.episodeId || "";
  const [, setLocation] = useLocation();
  const { data, fetchEpisodes, updateEpisode } = useApp();
  const { profile } = useAuth();

  const series = data.series.find(s => s.id === seriesId);
  const client = series ? data.clients.find(c => c.id === series.clientId) : null;

  const [episode, setEpisode] = useState<SeriesEpisode | null>(null);
  const [loadingError, setLoadingError] = useState<string | null>(null);

  // Form fields
  const [title, setTitle] = useState("");
  const [concept, setConcept] = useState("");
  const [talkingPoints, setTalkingPoints] = useState("");
  const [status, setStatus] = useState<EpisodeStatus>("idea");
  const [draftDate, setDraftDate] = useState("");
  const [draftStartTime, setDraftStartTime] = useState("");
  const [draftEndTime, setDraftEndTime] = useState("");
  const [draftLocationId, setDraftLocationId] = useState("");
  const [draftCrew, setDraftCrew] = useState<string[]>([]);

  // Autosave plumbing
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const dirtyRef = useRef(false);
  const saveTimerRef = useRef<number | null>(null);
  const saveFnRef = useRef<() => Promise<void>>(() => Promise.resolve());
  const hydratedRef = useRef(false);

  // Load episode
  useEffect(() => {
    if (!seriesId || !episodeId) return;
    let cancelled = false;
    fetchEpisodes(seriesId)
      .then(list => {
        if (cancelled) return;
        const ep = list.find(e => e.id === episodeId);
        if (!ep) {
          setLoadingError("Episode not found.");
          return;
        }
        setEpisode(ep);
        setTitle(ep.title);
        setConcept(ep.concept);
        setTalkingPoints(ep.talkingPoints);
        setStatus(ep.status);
        setDraftDate(ep.draftDate || "");
        setDraftStartTime(ep.draftStartTime || "");
        setDraftEndTime(ep.draftEndTime || "");
        setDraftLocationId(ep.draftLocationId || "");
        setDraftCrew(ep.draftCrew || []);
        // Defer hydratedRef flip so the first autosave-effect render
        // (with the freshly-set values) doesn't immediately mark
        // the form dirty + fire a save round-trip on mount.
        setTimeout(() => { hydratedRef.current = true; }, 0);
      })
      .catch(err => {
        if (!cancelled) setLoadingError(err?.message || "Failed to load episode.");
      });
    return () => { cancelled = true; };
  }, [seriesId, episodeId, fetchEpisodes]);

  // Save callback wired to a ref so the unmount-flush effect can
  // call it with the latest field values without recreating the
  // effect every keystroke.
  useEffect(() => {
    saveFnRef.current = async () => {
      if (!episodeId) return;
      try {
        await updateEpisode(episodeId, {
          title, concept, talkingPoints, status,
          draftDate, draftStartTime, draftEndTime,
          draftLocationId, draftCrew,
        });
        dirtyRef.current = false;
        setSaveStatus("saved");
        setLastSavedAt(Date.now());
      } catch (err) {
        setSaveStatus("error");
        console.error("[EpisodeEditor] save failed:", err);
      }
    };
  }, [episodeId, title, concept, talkingPoints, status, draftDate, draftStartTime, draftEndTime, draftLocationId, draftCrew, updateEpisode]);

  // Debounced autosave: 600ms after the user's last keystroke.
  // Every render after hydration that detects a value change schedules
  // a save. dirtyRef is set immediately so the unmount-flush below
  // can detect "save in flight" and flush it before navigating away.
  useEffect(() => {
    if (!hydratedRef.current) return;
    dirtyRef.current = true;
    setSaveStatus("saving");
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => { void saveFnRef.current(); }, 600);
    return () => { if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current); };
  }, [title, concept, talkingPoints, status, draftDate, draftStartTime, draftEndTime, draftLocationId, draftCrew]);

  // Flush on unmount — catch any pending debounced save when
  // the user navigates away. Same pattern as EditContractPage
  // and EditContractTemplatePage.
  useEffect(() => {
    return () => {
      if (dirtyRef.current) void saveFnRef.current();
    };
  }, []);

  if (profile?.role !== "owner") {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 gap-4">
        <p className="text-muted-foreground">Series is owner-only.</p>
        <Button variant="outline" onClick={() => setLocation("/")}>Back to Dashboard</Button>
      </div>
    );
  }

  if (loadingError) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 gap-4">
        <p className="text-muted-foreground">{loadingError}</p>
        <Button variant="outline" onClick={() => setLocation(`/series/${seriesId}`)}>Back to Series</Button>
      </div>
    );
  }

  if (!episode || !series) {
    return (
      <div className="flex items-center justify-center h-full p-8">
        <p className="text-sm text-muted-foreground">Loading episode…</p>
      </div>
    );
  }

  const toggleCrew = (crewId: string) => {
    setDraftCrew(prev => prev.includes(crewId) ? prev.filter(id => id !== crewId) : [...prev, crewId]);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b border-border bg-card/50 px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <Link href={`/series/${seriesId}`} className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="min-w-0">
            <div className="text-xs text-muted-foreground truncate">
              {series.name}{client ? ` · ${client.company}` : ""} · Episode {episode.episodeNumber}
            </div>
            <h1 className="text-lg sm:text-xl font-semibold text-foreground truncate" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              {title || `Episode ${episode.episodeNumber}`}
            </h1>
          </div>
        </div>
        <SaveStatusBadge status={saveStatus} lastSavedAt={lastSavedAt} />
      </div>

      <div className="flex-1 overflow-auto">
        <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-6">

          {/* Title */}
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <FileText className="w-3 h-3" /> Title
            </Label>
            <Input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder={`Episode ${episode.episodeNumber}`}
              className="bg-secondary border-border text-base"
            />
          </div>

          {/* Status */}
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Status</Label>
            <div className="flex flex-wrap gap-1">
              {STATUS_FLOW.map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatus(s)}
                  className={cn(
                    "px-2.5 py-1.5 rounded-md text-xs border transition-colors",
                    status === s
                      ? "bg-primary/20 border-primary/50 text-primary font-medium"
                      : "border-border text-muted-foreground hover:border-primary/30 hover:text-foreground",
                  )}
                >
                  {STATUS_LABELS[s]}
                </button>
              ))}
            </div>
          </div>

          {/* Concept */}
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Lightbulb className="w-3 h-3" /> Concept
            </Label>
            <p className="text-[11px] text-muted-foreground">What is this episode about? Why does it matter to the audience?</p>
            <Textarea
              value={concept}
              onChange={e => setConcept(e.target.value)}
              placeholder="Brief description of the episode — story arc, hook, emotional moments..."
              className="bg-secondary border-border resize-y min-h-[100px]"
            />
          </div>

          {/* Talking Points */}
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <ListChecks className="w-3 h-3" /> Talking Points / Script
            </Label>
            <p className="text-[11px] text-muted-foreground">Key questions, beats, or script. One per line so they're easy to follow on shoot day.</p>
            <Textarea
              value={talkingPoints}
              onChange={e => setTalkingPoints(e.target.value)}
              placeholder={"Opening hook — why are we here?\nQuestion 1\nQuestion 2\n..."}
              className="bg-secondary border-border resize-y min-h-[200px] font-mono text-xs leading-relaxed"
            />
          </div>

          {/* Schedule */}
          <div className="space-y-3 pt-2 border-t border-border">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-1.5" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              <Calendar className="w-4 h-4 text-primary" />
              Proposed Schedule
            </h2>
            <p className="text-[11px] text-muted-foreground -mt-2">
              Tentative shoot details — turn into a real calendar project from the Episode Board.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Date</Label>
                <DateField value={draftDate} onChange={setDraftDate} className="bg-secondary border-border" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3" />Start</Label>
                <TimeField value={draftStartTime} onChange={setDraftStartTime} className="bg-secondary border-border" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3" />End</Label>
                <TimeField value={draftEndTime} onChange={setDraftEndTime} className="bg-secondary border-border" />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground flex items-center gap-1"><MapPin className="w-3 h-3" />Location</Label>
              <select
                value={draftLocationId}
                onChange={e => setDraftLocationId(e.target.value)}
                className="w-full bg-secondary border border-border rounded-md px-3 py-2 text-sm"
              >
                <option value="">— pick a location —</option>
                {data.locations.map(l => (
                  <option key={l.id} value={l.id}>{l.name}{l.city ? ` (${l.city})` : ""}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground flex items-center gap-1"><Users className="w-3 h-3" />Crew (proposed)</Label>
              <div className="flex flex-wrap gap-1.5">
                {data.crewMembers.map(c => {
                  const checked = draftCrew.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => toggleCrew(c.id)}
                      className={cn(
                        "px-2.5 py-1 rounded-full border text-xs transition-colors",
                        checked ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground border-border hover:text-foreground",
                      )}
                    >
                      {c.name}
                    </button>
                  );
                })}
                {data.crewMembers.length === 0 && (
                  <span className="text-xs text-muted-foreground">No crew yet. Add some on the Staff page first.</span>
                )}
              </div>
            </div>
          </div>

          {/* Client review feedback (if any) — surfaces what the
              client wrote via the public review link. Read-only.
              "Mark addressed" clears the changes-requested state
              once the owner has revised the episode, so the pill
              on the board flips back to neutral and the client
              gets a fresh ask on the next review round. */}
          {episode.clientComment && (
            <div className={cn(
              "rounded-lg border p-3 space-y-2",
              episode.approvalStatus === "changes_requested"
                ? "border-amber-500/40 bg-amber-500/5"
                : "border-border bg-secondary/40",
            )}>
              <div className="text-xs font-semibold text-foreground mb-1">
                Client {episode.approvalStatus === "changes_requested" ? "requested changes" : "left a note"}
              </div>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{episode.clientComment}</p>
              {episode.approvalStatus === "changes_requested" && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    await updateEpisode(episode.id, { approvalStatus: "pending", clientComment: "" });
                    setEpisode(prev => prev ? { ...prev, approvalStatus: "pending", clientComment: "" } : prev);
                    toast.success("Marked addressed — re-issue review when you're ready");
                  }}
                  className="gap-1.5"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" /> Mark addressed
                </Button>
              )}
            </div>
          )}

          {/* Linked project (read-only info) */}
          {episode.projectId && (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-xs text-emerald-200 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>This episode is already on the production calendar.</span>
              <Link href="/calendar" className="ml-auto underline hover:text-emerald-100">View on calendar →</Link>
            </div>
          )}

          {/* AI revise box — sends the current episode contents to
              Claude with a "develop_episode" instruction. The AI's
              update saves directly to this episode (via the same
              tool path the chat uses). User describes what they
              want changed, AI applies it. */}
          <ReviseWithAI
            seriesId={seriesId}
            episode={episode}
            currentTitle={title}
            currentConcept={concept}
            currentTalkingPoints={talkingPoints}
            onApplied={async () => {
              // Reload from server to pick up AI's changes.
              const list = await fetchEpisodes(seriesId);
              const refreshed = list.find(e => e.id === episodeId);
              if (refreshed) {
                setEpisode(refreshed);
                setTitle(refreshed.title);
                setConcept(refreshed.concept);
                setTalkingPoints(refreshed.talkingPoints);
              }
              toast.success("AI applied your revision");
            }}
          />

        </div>
      </div>
    </div>
  );
}

// ── Inline AI revise box ─────────────────────────────────────
// Sits at the bottom of the editor. User types a revision request
// (e.g. "make the concept more punchy", "add 3 more talking
// points about pricing") and clicks Revise. We hit /api/series-chat
// with a forced develop_episode tool call so the AI rewrites
// THIS episode directly. The endpoint persists via the same path
// the chat uses, then onApplied refetches.
function ReviseWithAI({
  seriesId,
  episode,
  currentTitle,
  currentConcept,
  currentTalkingPoints,
  onApplied,
}: {
  seriesId: string;
  episode: SeriesEpisode;
  currentTitle: string;
  currentConcept: string;
  currentTalkingPoints: string;
  onApplied: () => Promise<void>;
}) {
  const { data, addMessage, updateEpisode, fetchEpisodes, fetchMessages } = useApp();
  const { profile } = useAuth();
  const [request, setRequest] = useState("");
  const [busy, setBusy] = useState(false);
  const series = data.series.find(s => s.id === seriesId);
  const client = series ? data.clients.find(c => c.id === series.clientId) : null;

  async function revise() {
    if (!request.trim() || busy || !series) return;
    setBusy(true);
    try {
      const authToken = await (await import("@/lib/supabase")).getAuthToken();
      // Pull the rest of the series + chat history so the AI has the
      // full context: every other episode's title/concept/talking
      // points, plus the recent conversation. This is the "stay on
      // message" fix — without it the AI rewrites in a vacuum and
      // can drift away from established voice/tone/topic.
      const [allEpisodes, allMessages] = await Promise.all([
        fetchEpisodes(seriesId),
        fetchMessages(seriesId),
      ]);
      const otherEpisodes = allEpisodes
        .filter(e => e.id !== episode.id)
        .map(e => ({
          number: e.episodeNumber,
          title: e.title,
          concept: e.concept,
          // Include first ~250 chars of talking points so AI can match voice
          talking_points_preview: (e.talkingPoints || "").slice(0, 250),
          status: e.status,
        }));

      const message = `Revise Episode ${episode.episodeNumber} based on this request:

"${request.trim()}"

CURRENT STATE OF EPISODE ${episode.episodeNumber}:
Title: ${currentTitle}
Concept: ${currentConcept}
Talking points / script:
${currentTalkingPoints || "(none yet)"}

STAY ON MESSAGE: Read the current talking points carefully. The voice, tone, and topic established in those talking points are the source of truth — preserve them. Only change what the user explicitly asked for. Don't rewrite for the sake of rewriting. The other episodes in this series (passed below) establish the broader voice for the series — keep this episode consistent with that voice.

Apply the change by calling develop_episode (or update_episode for smaller edits). Don't describe what you'd do — just call the tool and do it.`;

      const res = await fetch("/api/series-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({
          seriesId,
          message,
          senderName: profile?.name || "Owner",
          seriesName: series.name,
          seriesGoal: series.goal,
          clientName: client?.company || "",
          clientContact: client?.contactName || "",
          episodes: [
            { number: episode.episodeNumber, title: currentTitle, concept: currentConcept, status: episode.status },
            ...otherEpisodes,
          ],
          // Last 10 messages so the AI remembers earlier instructions
          // ("make these more conversational", "shorter intros", etc.)
          history: allMessages.slice(-10).map(m => ({ role: m.role, content: m.content })),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "AI request failed" }));
        throw new Error(err.error || "AI request failed");
      }
      const result = await res.json();

      // Apply tool actions client-side. AI normally returns an
      // update_episode or develop_episode call.
      let applied = false;
      for (const action of (result.actions || [])) {
        if (action.tool === "develop_episode" && action.input?.episode_number === episode.episodeNumber) {
          const concept = action.input.detailed_concept || "";
          const tp = [
            action.input.talking_points || "",
            action.input.visual_notes ? `\n--- Visual Notes ---\n${action.input.visual_notes}` : "",
          ].join("");
          await updateEpisode(episode.id, { concept, talkingPoints: tp });
          applied = true;
        } else if (action.tool === "update_episode" && action.input?.episode_number === episode.episodeNumber) {
          const updates: Partial<SeriesEpisode> = {};
          if (action.input.title) updates.title = action.input.title;
          if (action.input.concept) updates.concept = action.input.concept;
          if (action.input.talking_points) updates.talkingPoints = action.input.talking_points;
          if (Object.keys(updates).length > 0) {
            await updateEpisode(episode.id, updates);
            applied = true;
          }
        }
      }

      // Save the assistant message into the conversation so the
      // chat history reflects this revision request too.
      try {
        await addMessage({ seriesId, role: "user", senderName: profile?.name || "Owner", content: `↪︎ Revise Episode ${episode.episodeNumber}: ${request.trim()}`, tokensUsed: 0 });
        await addMessage({ seriesId, role: "assistant", senderName: "Claude", content: applied ? `✏️ Updated Episode ${episode.episodeNumber}` : (result.content || ""), tokensUsed: result.tokensUsed || 0 });
      } catch {
        // Best-effort message logging — don't block on it.
      }

      if (applied) {
        await onApplied();
        setRequest("");
      } else {
        toast.error("AI didn't apply changes — try a more direct request.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Revision failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Lightbulb className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
          Revise with AI
        </h3>
      </div>
      <p className="text-[11px] text-muted-foreground -mt-1">
        Describe what you want changed and Claude will rewrite the concept and talking points. (Examples: "make it punchier", "add 3 talking points about pricing", "simplify the hook for a younger audience".)
      </p>
      <Textarea
        value={request}
        onChange={(e) => setRequest(e.target.value)}
        placeholder="What should Claude change?"
        rows={3}
        className="bg-secondary border-border resize-y text-sm"
      />
      <div className="flex justify-end">
        <Button
          onClick={revise}
          disabled={busy || !request.trim()}
          className="gap-1.5"
        >
          {busy ? <span className="w-3 h-3 rounded-full bg-primary-foreground/40 animate-pulse" /> : <Lightbulb className="w-3.5 h-3.5" />}
          {busy ? "Revising…" : "Revise this episode"}
        </Button>
      </div>
    </div>
  );
}

function SaveStatusBadge({ status, lastSavedAt }: { status: "idle" | "saving" | "saved" | "error"; lastSavedAt: number | null }) {
  // "Saved · 3s ago" needs to tick on the wall clock without re-rendering
  // the whole editor. Track the elapsed-seconds derivation in local state
  // updated by a 1s interval — avoids calling Date.now() during render
  // (would violate React purity).
  const [secsAgo, setSecsAgo] = useState<number>(0);
  useEffect(() => {
    if (status !== "saved" || !lastSavedAt) return;
    setSecsAgo(Math.round((Date.now() - lastSavedAt) / 1000));
    const t = setInterval(() => {
      setSecsAgo(Math.round((Date.now() - lastSavedAt) / 1000));
    }, 1000);
    return () => clearInterval(t);
  }, [status, lastSavedAt]);

  if (status === "saving") return <span className="text-xs text-muted-foreground inline-flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />Saving…</span>;
  if (status === "error") return <span className="text-xs text-destructive inline-flex items-center gap-1.5"><AlertCircle className="w-3.5 h-3.5" />Save failed</span>;
  if (status === "saved" && lastSavedAt) {
    return <span className="text-xs text-muted-foreground inline-flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />Saved{secsAgo < 5 ? "" : ` · ${secsAgo}s ago`}</span>;
  }
  return null;
}
