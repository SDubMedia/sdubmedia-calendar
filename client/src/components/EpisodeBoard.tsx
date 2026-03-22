import { useState, useCallback, useRef } from "react";
import { Plus, ChevronDown, ChevronUp, Trash2, CalendarPlus, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SeriesEpisode, EpisodeStatus } from "@/lib/types";

interface EpisodeBoardProps {
  episodes: SeriesEpisode[];
  onUpdateEpisode: (id: string, updates: Partial<SeriesEpisode>) => void;
  onAddEpisode: () => void;
  onDeleteEpisode: (id: string) => void;
  onScheduleEpisode?: (episode: SeriesEpisode) => void;
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

              {ep.concept && !isExpanded && (
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
              />
            )}
          </div>
        );
      })}

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

/** Episode detail with local state — saves on blur to avoid per-keystroke API calls */
function EpisodeDetail({ ep, onUpdateEpisode, onDeleteEpisode, onScheduleEpisode }: {
  ep: SeriesEpisode;
  onUpdateEpisode: (id: string, updates: Partial<SeriesEpisode>) => void;
  onDeleteEpisode: (id: string) => void;
  onScheduleEpisode?: (episode: SeriesEpisode) => void;
}) {
  const [title, setTitle] = useState(ep.title);
  const [concept, setConcept] = useState(ep.concept);
  const [talkingPoints, setTalkingPoints] = useState(ep.talkingPoints);

  const saveField = useCallback((field: string, value: string) => {
    const current = field === "title" ? ep.title : field === "concept" ? ep.concept : ep.talkingPoints;
    if (value !== current) {
      onUpdateEpisode(ep.id, { [field]: value } as Partial<SeriesEpisode>);
    }
  }, [ep, onUpdateEpisode]);

  return (
    <div className="border-t border-border px-4 py-4 flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted-foreground">Title</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => saveField("title", title)}
          className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          placeholder="Episode title"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted-foreground">Concept</label>
        <textarea
          value={concept}
          onChange={(e) => setConcept(e.target.value)}
          onBlur={() => saveField("concept", concept)}
          rows={3}
          className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-y"
          placeholder="Episode concept..."
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted-foreground">Talking Points</label>
        <textarea
          value={talkingPoints}
          onChange={(e) => setTalkingPoints(e.target.value)}
          onBlur={() => saveField("talkingPoints", talkingPoints)}
          rows={4}
          className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-y"
          placeholder="Talking points..."
        />
      </div>

      <div className="flex items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">Status</label>
          <select
            value={ep.status}
            onChange={(e) => onUpdateEpisode(ep.id, { status: e.target.value as EpisodeStatus })}
            className="rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          {!ep.projectId && onScheduleEpisode && ep.status !== "idea" && (
            <button type="button" onClick={() => onScheduleEpisode(ep)}
              className="flex items-center gap-1.5 rounded-md px-3 py-2 text-sm text-cyan-400 hover:bg-cyan-950/40 transition-colors">
              <CalendarPlus className="h-4 w-4" /> Schedule Shoot
            </button>
          )}
          <button type="button" onClick={() => onDeleteEpisode(ep.id)}
            className="flex items-center gap-1.5 rounded-md px-3 py-2 text-sm text-red-400 hover:bg-red-950/40 transition-colors">
            <Trash2 className="h-4 w-4" /> Delete
          </button>
        </div>
      </div>

      {ep.projectId && (
        <div className="flex items-center gap-2 text-xs text-green-400 bg-green-500/10 rounded-md px-3 py-2">
          <ExternalLink className="h-3.5 w-3.5" />
          Linked to calendar project — status syncs automatically
        </div>
      )}
    </div>
  );
}
