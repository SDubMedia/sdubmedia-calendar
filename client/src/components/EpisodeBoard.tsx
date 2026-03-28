import { useState, useCallback, useEffect, useMemo } from "react";
import { Plus, ChevronDown, ChevronUp, Trash2, CalendarPlus, ExternalLink, MessageSquare, Send, CheckCircle, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SeriesEpisode, EpisodeStatus, EpisodeComment, Location, CrewMember, Project } from "@/lib/types";

interface EpisodeBoardProps {
  episodes: SeriesEpisode[];
  onUpdateEpisode: (id: string, updates: Partial<SeriesEpisode>) => void;
  onAddEpisode: () => void;
  onDeleteEpisode: (id: string) => void;
  onScheduleEpisode?: (episode: SeriesEpisode) => void;
  onPublishSchedule?: () => void;
  seriesId: string;
  userName: string;
  userRole: string;
  onFetchComments: (episodeId: string) => Promise<EpisodeComment[]>;
  onAddComment: (comment: Omit<EpisodeComment, "id" | "createdAt">) => Promise<EpisodeComment>;
  locations: Location[];
  crewMembers: CrewMember[];
  existingProjects: Project[];
}

const STATUS_OPTIONS: { value: EpisodeStatus; label: string }[] = [
  { value: "idea", label: "Idea" },
  { value: "concept", label: "Concept" },
  { value: "script", label: "Script" },
  { value: "client_review", label: "Client Review" },
  { value: "scheduled", label: "Scheduled" },
  { value: "filming", label: "Filming" },
  { value: "editing", label: "Editing" },
  { value: "review", label: "Review" },
  { value: "delivered", label: "Delivered" },
];

const STATUS_COLORS: Record<EpisodeStatus, string> = {
  idea: "bg-zinc-600 text-zinc-100",
  concept: "bg-blue-600 text-blue-100",
  script: "bg-indigo-600 text-indigo-100",
  client_review: "bg-amber-600 text-amber-100",
  scheduled: "bg-cyan-600 text-cyan-100",
  filming: "bg-yellow-600 text-yellow-100",
  editing: "bg-purple-600 text-purple-100",
  review: "bg-amber-600 text-amber-100",
  delivered: "bg-green-600 text-green-100",
};

function getStatusLabel(status: EpisodeStatus): string {
  return STATUS_OPTIONS.find((s) => s.value === status)?.label ?? status;
}

export default function EpisodeBoard({
  episodes,
  onUpdateEpisode,
  onAddEpisode,
  onDeleteEpisode,
  onScheduleEpisode,
  onPublishSchedule,
  seriesId,
  userName,
  userRole,
  onFetchComments,
  onAddComment,
  locations,
  crewMembers,
  existingProjects,
}: EpisodeBoardProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const sorted = [...episodes].sort(
    (a, b) => a.episodeNumber - b.episodeNumber
  );

  return (
    <div className="flex flex-col gap-3">
      {sorted.map((ep) => {
        const isExpanded = expandedId === ep.id;

        return (
          <div
            key={ep.id}
            className="rounded-lg border border-border bg-card overflow-hidden"
          >
            {/* Collapsed row */}
            <button
              type="button"
              onClick={() => setExpandedId(isExpanded ? null : ep.id)}
              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/40 transition-colors"
            >
              <span
                className="shrink-0 text-sm font-semibold text-muted-foreground"
                style={{ fontFamily: "'Space Grotesk', sans-serif" }}
              >
                #{ep.episodeNumber}
              </span>

              <span
                className="flex-1 truncate text-foreground font-medium"
                style={{ fontFamily: "'Space Grotesk', sans-serif" }}
              >
                {ep.title || "Untitled"}
              </span>

              <span
                className={cn(
                  "shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium",
                  STATUS_COLORS[ep.status]
                )}
              >
                {getStatusLabel(ep.status)}
              </span>

              {ep.draftDate && !ep.projectId && !isExpanded && (
                <span className="hidden sm:block shrink-0 text-xs text-cyan-400">
                  {ep.draftDate}
                </span>
              )}
              {!ep.draftDate && ep.concept && !isExpanded && (
                <span className="hidden sm:block shrink-0 max-w-[200px] truncate text-xs text-muted-foreground">
                  {ep.concept}
                </span>
              )}

              {isExpanded ? (
                <ChevronUp className="shrink-0 h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="shrink-0 h-4 w-4 text-muted-foreground" />
              )}
            </button>

            {/* Expanded detail */}
            {isExpanded && (
              <EpisodeDetail
                ep={ep}
                onUpdateEpisode={onUpdateEpisode}
                onDeleteEpisode={onDeleteEpisode}
                onScheduleEpisode={onScheduleEpisode}
                seriesId={seriesId}
                userName={userName}
                userRole={userRole}
                onFetchComments={onFetchComments}
                onAddComment={onAddComment}
                locations={locations}
                crewMembers={crewMembers}
                existingProjects={existingProjects}
                allEpisodes={sorted}
              />
            )}
          </div>
        );
      })}

      {/* Publish Schedule */}
      {onPublishSchedule && sorted.some(e => e.draftDate && !e.projectId && e.status !== "idea") && (
        <button
          type="button"
          onClick={onPublishSchedule}
          className="flex items-center justify-center gap-2 rounded-lg bg-primary/20 border border-primary/30 py-3 text-sm text-primary font-medium hover:bg-primary/30 transition-colors"
        >
          <CalendarPlus className="h-4 w-4" />
          Publish Schedule ({sorted.filter(e => e.draftDate && !e.projectId && e.status !== "idea").length} episodes)
        </button>
      )}

      {/* Add Episode */}
      <button
        type="button"
        onClick={onAddEpisode}
        className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-border py-3 text-sm text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
      >
        <Plus className="h-4 w-4" />
        Add Episode
      </button>
    </div>
  );
}

/** Episode detail with local state, draft scheduling, comments, and approve/request changes */
function EpisodeDetail({ ep, onUpdateEpisode, onDeleteEpisode, onScheduleEpisode, seriesId, userName, userRole, onFetchComments, onAddComment, locations, crewMembers, existingProjects, allEpisodes }: {
  ep: SeriesEpisode;
  onUpdateEpisode: (id: string, updates: Partial<SeriesEpisode>) => void;
  onDeleteEpisode: (id: string) => void;
  onScheduleEpisode?: (episode: SeriesEpisode) => void;
  seriesId: string;
  userName: string;
  userRole: string;
  onFetchComments: (episodeId: string) => Promise<EpisodeComment[]>;
  onAddComment: (comment: Omit<EpisodeComment, "id" | "createdAt">) => Promise<EpisodeComment>;
  locations: Location[];
  crewMembers: CrewMember[];
  existingProjects: Project[];
  allEpisodes: SeriesEpisode[];
}) {
  const [title, setTitle] = useState(ep.title);
  const [concept, setConcept] = useState(ep.concept);
  const [talkingPoints, setTalkingPoints] = useState(ep.talkingPoints);
  const [comments, setComments] = useState<EpisodeComment[]>([]);
  const [commentText, setCommentText] = useState("");
  const [showComments, setShowComments] = useState(false);
  const [changesText, setChangesText] = useState("");
  const [showChangesInput, setShowChangesInput] = useState(false);

  // Draft scheduling
  const [draftDate, setDraftDate] = useState(ep.draftDate || "");
  const [draftStartTime, setDraftStartTime] = useState(ep.draftStartTime || "09:00");
  const [draftEndTime, setDraftEndTime] = useState(ep.draftEndTime || "12:00");
  const [draftLocationId, setDraftLocationId] = useState(ep.draftLocationId || "");
  const [draftCrew, setDraftCrew] = useState<string[]>(ep.draftCrew || []);

  const saveDraft = useCallback(() => {
    onUpdateEpisode(ep.id, { draftDate, draftStartTime, draftEndTime, draftLocationId, draftCrew });
  }, [ep.id, draftDate, draftStartTime, draftEndTime, draftLocationId, draftCrew, onUpdateEpisode]);

  // Conflict detection
  const conflicts = useMemo(() => {
    if (!draftDate) return [];
    const issues: string[] = [];
    // Check existing calendar projects
    for (const p of existingProjects) {
      if (p.date !== draftDate) continue;
      // Check crew conflicts
      for (const crewId of draftCrew) {
        const inCrew = p.crew.some(c => c.crewMemberId === crewId);
        const inPost = p.postProduction.some(c => c.crewMemberId === crewId);
        if (inCrew || inPost) {
          const name = crewMembers.find(cm => cm.id === crewId)?.name || "Unknown";
          issues.push(`${name} is already booked on ${draftDate} (${p.startTime}–${p.endTime})`);
        }
      }
      // Check location conflicts
      if (draftLocationId && p.locationId === draftLocationId) {
        const locName = locations.find(l => l.id === draftLocationId)?.name || "location";
        issues.push(`${locName} has another shoot on ${draftDate} (${p.startTime}–${p.endTime})`);
      }
    }
    // Check other draft episodes in this series
    for (const other of allEpisodes) {
      if (other.id === ep.id || !other.draftDate || other.draftDate !== draftDate) continue;
      for (const crewId of draftCrew) {
        if (other.draftCrew?.includes(crewId)) {
          const name = crewMembers.find(cm => cm.id === crewId)?.name || "Unknown";
          issues.push(`${name} is also drafted for Episode ${other.episodeNumber} on ${draftDate}`);
        }
      }
    }
    return issues;
  }, [draftDate, draftCrew, draftLocationId, existingProjects, allEpisodes, ep.id, crewMembers, locations]);

  const toggleCrewMember = (crewId: string) => {
    setDraftCrew(prev => prev.includes(crewId) ? prev.filter(id => id !== crewId) : [...prev, crewId]);
  };

  // Load comments when expanded
  useEffect(() => {
    if (showComments) {
      onFetchComments(ep.id).then(setComments).catch(() => {});
    }
  }, [showComments, ep.id, onFetchComments]);

  const saveField = useCallback((field: string, value: string) => {
    const current = field === "title" ? ep.title : field === "concept" ? ep.concept : ep.talkingPoints;
    if (value !== current) {
      onUpdateEpisode(ep.id, { [field]: value } as Partial<SeriesEpisode>);
    }
  }, [ep, onUpdateEpisode]);

  const handleAddComment = async () => {
    if (!commentText.trim()) return;
    try {
      const c = await onAddComment({ episodeId: ep.id, seriesId, userName, userRole, content: commentText.trim() });
      setComments(prev => [...prev, c]);
      setCommentText("");
    } catch { /* ignore */ }
  };

  const handleApprove = () => {
    const nextStatus: EpisodeStatus = ep.status === "client_review" ? "scheduled" : "delivered";
    onUpdateEpisode(ep.id, { status: nextStatus });
    onAddComment({ episodeId: ep.id, seriesId, userName, userRole, content: `Approved this episode` }).catch(() => {});
  };

  const handleRequestChanges = async () => {
    if (!changesText.trim()) return;
    const revertStatus: EpisodeStatus = ep.status === "client_review" ? "concept" : "editing";
    onUpdateEpisode(ep.id, { status: revertStatus });
    const c = await onAddComment({ episodeId: ep.id, seriesId, userName, userRole, content: `Requested changes: ${changesText.trim()}` });
    setComments(prev => [...prev, c]);
    setChangesText("");
    setShowChangesInput(false);
  };

  const isReviewStatus = ep.status === "client_review" || ep.status === "review";

  return (
    <div className="border-t border-border px-4 py-4 flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted-foreground">Title</label>
        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} onBlur={() => saveField("title", title)}
          className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring" placeholder="Episode title" />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted-foreground">Concept</label>
        <textarea value={concept} onChange={(e) => setConcept(e.target.value)} onBlur={() => saveField("concept", concept)} rows={3}
          className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-y" placeholder="Episode concept..." />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted-foreground">Talking Points</label>
        <textarea value={talkingPoints} onChange={(e) => setTalkingPoints(e.target.value)} onBlur={() => saveField("talkingPoints", talkingPoints)} rows={4}
          className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-y" placeholder="Talking points..." />
      </div>

      {/* Draft Schedule */}
      {!ep.projectId && (
        <div className="bg-secondary/30 rounded-lg p-3 space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Draft Schedule</p>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-[10px] text-muted-foreground">Date</label>
              <input type="date" value={draftDate} onChange={e => setDraftDate(e.target.value)} onBlur={saveDraft}
                className="w-full rounded-md border border-border bg-card px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground">Start</label>
              <input type="time" value={draftStartTime} onChange={e => setDraftStartTime(e.target.value)} onBlur={saveDraft}
                className="w-full rounded-md border border-border bg-card px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground">End</label>
              <input type="time" value={draftEndTime} onChange={e => setDraftEndTime(e.target.value)} onBlur={saveDraft}
                className="w-full rounded-md border border-border bg-card px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
            </div>
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground">Location</label>
            <select value={draftLocationId} onChange={e => { setDraftLocationId(e.target.value); setTimeout(saveDraft, 0); }}
              className="w-full rounded-md border border-border bg-card px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring">
              <option value="">Select location...</option>
              {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground block mb-1">Crew</label>
            <div className="flex flex-wrap gap-1.5">
              {crewMembers.map(cm => (
                <button key={cm.id} type="button"
                  onClick={() => { toggleCrewMember(cm.id); setTimeout(saveDraft, 0); }}
                  className={cn("px-2 py-1 rounded text-xs border transition-colors",
                    draftCrew.includes(cm.id)
                      ? "bg-primary/20 border-primary/50 text-primary"
                      : "border-border text-muted-foreground hover:border-primary/30"
                  )}>
                  {cm.name}
                </button>
              ))}
            </div>
          </div>

          {/* Conflict warnings */}
          {conflicts.length > 0 && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-md p-2 space-y-1">
              {conflicts.map((c: string, i: number) => (
                <p key={i} className="text-xs text-red-400 flex items-start gap-1">
                  <span className="shrink-0">⚠</span> {c}
                </p>
              ))}
            </div>
          )}

          {draftDate && (
            <p className="text-[10px] text-primary/60">Draft — will be published to calendar when approved</p>
          )}
        </div>
      )}

      {/* Approve / Request Changes — shown when in review status */}
      {isReviewStatus && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 space-y-3">
          <p className="text-xs font-semibold text-amber-300">Awaiting Review</p>
          {!showChangesInput ? (
            <div className="flex gap-2">
              <button onClick={handleApprove} className="flex items-center gap-1.5 px-3 py-2 rounded-md text-sm bg-green-500/20 text-green-300 hover:bg-green-500/30 transition-colors">
                <CheckCircle className="h-4 w-4" /> Approve
              </button>
              <button onClick={() => setShowChangesInput(true)} className="flex items-center gap-1.5 px-3 py-2 rounded-md text-sm bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors">
                <RotateCcw className="h-4 w-4" /> Request Changes
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <textarea value={changesText} onChange={(e) => setChangesText(e.target.value)} rows={2} placeholder="Describe the changes needed..."
                className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none" />
              <div className="flex gap-2">
                <button onClick={handleRequestChanges} disabled={!changesText.trim()} className="px-3 py-1.5 rounded-md text-xs bg-red-500/20 text-red-400 hover:bg-red-500/30 disabled:opacity-50">Submit Feedback</button>
                <button onClick={() => setShowChangesInput(false)} className="px-3 py-1.5 rounded-md text-xs bg-secondary text-muted-foreground">Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flex items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">Status</label>
          <select value={ep.status} onChange={(e) => onUpdateEpisode(ep.id, { status: e.target.value as EpisodeStatus })}
            className="rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring">
            {STATUS_OPTIONS.map((opt) => (<option key={opt.value} value={opt.value}>{opt.label}</option>))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          {!ep.projectId && onScheduleEpisode && ep.status !== "idea" && (
            <button type="button" onClick={() => onScheduleEpisode(ep)} className="flex items-center gap-1.5 rounded-md px-3 py-2 text-sm text-cyan-400 hover:bg-cyan-950/40 transition-colors">
              <CalendarPlus className="h-4 w-4" /> Schedule Shoot
            </button>
          )}
          <button type="button" onClick={() => onDeleteEpisode(ep.id)} className="flex items-center gap-1.5 rounded-md px-3 py-2 text-sm text-red-400 hover:bg-red-950/40 transition-colors">
            <Trash2 className="h-4 w-4" /> Delete
          </button>
        </div>
      </div>

      {ep.projectId && (
        <div className="flex items-center gap-2 text-xs text-green-400 bg-green-500/10 rounded-md px-3 py-2">
          <ExternalLink className="h-3.5 w-3.5" /> Linked to calendar project — status syncs automatically
        </div>
      )}

      {/* Comments */}
      <div>
        <button onClick={() => setShowComments(!showComments)} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
          <MessageSquare className="h-3.5 w-3.5" /> {showComments ? "Hide" : "Show"} Comments {comments.length > 0 && `(${comments.length})`}
        </button>

        {showComments && (
          <div className="mt-3 space-y-3">
            {comments.length === 0 && <p className="text-xs text-muted-foreground/60">No comments yet</p>}
            {comments.map(c => (
              <div key={c.id} className="bg-secondary/50 rounded-md px-3 py-2">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-medium text-foreground">{c.userName}</span>
                  <span className="text-[10px] text-muted-foreground/60">{c.userRole}</span>
                  <span className="text-[10px] text-muted-foreground/60">{new Date(c.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
                </div>
                <p className="text-sm text-foreground whitespace-pre-wrap">{c.content}</p>
              </div>
            ))}

            <div className="flex gap-2">
              <input type="text" value={commentText} onChange={(e) => setCommentText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddComment()}
                placeholder="Add a comment..."
                className="flex-1 rounded-md border border-border bg-card px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
              <button onClick={handleAddComment} disabled={!commentText.trim()} className="px-2 py-1.5 rounded-md bg-primary text-primary-foreground disabled:opacity-50">
                <Send className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
