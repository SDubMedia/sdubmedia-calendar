// ============================================================
// SeriesReviewPage — public, no-login client review of a series.
// Mounted outside AuthProvider in App.tsx so anyone with the
// link can see it. Token comes from the URL path.
//
// Client can:
//   - Approve / Request Changes per episode (with optional comment)
//   - Leave a comment without approving / rejecting
//   - Approve the whole series in one shot at the bottom
// All actions hit /api/series-public-action which validates the
// token + records the result + notifies the owner via the bell.
// ============================================================

import { useEffect, useState, useCallback } from "react";
import { useParams } from "wouter";
import { ThumbsUp, ThumbsDown, MessageSquare, CheckCircle2, Clock, AlertCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface PublicEpisode {
  id: string;
  episodeNumber: number;
  title: string;
  concept: string;
  talkingPoints: string;
  approvalStatus: "pending" | "approved" | "changes_requested";
  clientComment: string;
  draftDate: string;
}
interface PublicSeries {
  id: string;
  name: string;
  goal: string;
  reviewStatus: string;
  sentForReviewAt: string | null;
  clientReviewedAt: string | null;
}
interface PublicView {
  series: PublicSeries;
  client: { company: string; contactName: string } | null;
  org: { name: string; logoUrl: string; businessInfo: { phone?: string; email?: string } } | null;
  episodes: PublicEpisode[];
}

export default function SeriesReviewPage() {
  const params = useParams<{ token: string }>();
  const token = params.token || "";
  const [data, setData] = useState<PublicView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyEpisode, setBusyEpisode] = useState<string | null>(null);
  const [seriesApproving, setSeriesApproving] = useState(false);
  const [commentDraft, setCommentDraft] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`/api/series-public-view?token=${encodeURIComponent(token)}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const body: PublicView = await res.json();
      setData(body);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load review");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  async function postAction(action: Record<string, unknown>) {
    const res = await fetch("/api/series-public-action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, action }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: "Action failed" }));
      throw new Error(body.error || "Action failed");
    }
  }

  async function approveEpisode(ep: PublicEpisode) {
    setBusyEpisode(ep.id);
    try {
      await postAction({ type: "approve_episode", episodeId: ep.id });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to approve");
    } finally {
      setBusyEpisode(null);
    }
  }
  async function requestChanges(ep: PublicEpisode) {
    setBusyEpisode(ep.id);
    try {
      await postAction({ type: "request_changes_episode", episodeId: ep.id, comment: commentDraft[ep.id] || "" });
      setCommentDraft(prev => ({ ...prev, [ep.id]: "" }));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit");
    } finally {
      setBusyEpisode(null);
    }
  }
  async function saveComment(ep: PublicEpisode) {
    setBusyEpisode(ep.id);
    try {
      await postAction({ type: "comment_episode", episodeId: ep.id, comment: commentDraft[ep.id] || "" });
      setCommentDraft(prev => ({ ...prev, [ep.id]: "" }));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit");
    } finally {
      setBusyEpisode(null);
    }
  }
  async function approveSeries() {
    setSeriesApproving(true);
    try {
      await postAction({ type: "approve_series" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to approve");
    } finally {
      setSeriesApproving(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="text-center space-y-2 max-w-md">
          <AlertCircle className="w-8 h-8 text-destructive mx-auto" />
          <p className="text-foreground font-semibold">Couldn't load this review</p>
          <p className="text-sm text-muted-foreground">{error || "The link may have expired or been retracted."}</p>
        </div>
      </div>
    );
  }

  const { series, client, org, episodes: allEpisodes } = data;
  // Single-episode review mode: ?episode=<id> in the URL filters the
  // page to one episode + shows a banner. Owner sends per-episode
  // links so the client can focus on just the one being reviewed.
  const focusedEpisodeId = typeof window !== "undefined"
    ? new URLSearchParams(window.location.search).get("episode") || ""
    : "";
  const focusedEpisode = focusedEpisodeId ? allEpisodes.find(e => e.id === focusedEpisodeId) : null;
  const episodes = focusedEpisode ? [focusedEpisode] : allEpisodes;
  const isSingleEpisodeMode = !!focusedEpisode;
  const allDecided = episodes.every(e => e.approvalStatus !== "pending");
  const seriesApproved = series.reviewStatus === "approved";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-3xl mx-auto p-4 sm:p-8 space-y-6">

        {/* Header */}
        <div className="space-y-2 pb-4 border-b border-border">
          {org?.logoUrl && (
            <img src={org.logoUrl} alt={org.name} className="h-10 mb-2" />
          )}
          <h1 className="text-2xl sm:text-3xl font-semibold" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            {series.name}
          </h1>
          <p className="text-sm text-muted-foreground">
            From <span className="text-foreground">{org?.name || "Production"}</span>
            {client?.company ? <> for <span className="text-foreground">{client.company}</span></> : null}
          </p>
          {series.goal && (
            <p className="text-sm text-muted-foreground italic">"{series.goal}"</p>
          )}
        </div>

        {/* Review status */}
        {seriesApproved ? (
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-emerald-200">Series approved</p>
              <p className="text-xs text-muted-foreground">
                {series.clientReviewedAt ? `Approved ${new Date(series.clientReviewedAt).toLocaleDateString()}` : ""}
                — the production team has been notified.
              </p>
            </div>
          </div>
        ) : isSingleEpisodeMode ? (
          <div className="rounded-lg border border-primary/40 bg-primary/10 p-4 space-y-1">
            <p className="text-sm font-semibold">Reviewing one episode</p>
            <p className="text-xs text-muted-foreground">
              You're reviewing a single episode in the {series.name} series. Approve it or request changes below.
            </p>
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-secondary/40 p-4 space-y-1">
            <p className="text-sm font-semibold">Please review the episodes below</p>
            <p className="text-xs text-muted-foreground">
              Approve or request changes on each one. You can also approve the entire plan at the bottom.
            </p>
          </div>
        )}

        {/* Episodes */}
        <div className="space-y-4">
          {episodes.map((ep) => {
            const status = ep.approvalStatus;
            const busy = busyEpisode === ep.id;
            return (
              <div key={ep.id} className={cn(
                "rounded-lg border p-4 space-y-3",
                status === "approved" && "border-emerald-500/40 bg-emerald-500/5",
                status === "changes_requested" && "border-amber-500/40 bg-amber-500/5",
                status === "pending" && "border-border bg-card",
              )}>
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="text-xs text-muted-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                      Episode {ep.episodeNumber}
                    </div>
                    <h2 className="text-lg font-semibold text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                      {ep.title || `Episode ${ep.episodeNumber}`}
                    </h2>
                  </div>
                  <StatusBadge status={status} />
                </div>

                {ep.concept && (
                  <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{ep.concept}</p>
                )}

                {ep.talkingPoints && (
                  <details className="group">
                    <summary className="cursor-pointer text-xs text-primary hover:underline">
                      Show talking points / script
                    </summary>
                    <pre className="mt-2 text-xs text-muted-foreground whitespace-pre-wrap font-mono leading-relaxed bg-secondary/30 rounded p-3">{ep.talkingPoints}</pre>
                  </details>
                )}

                {ep.draftDate && (
                  <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <Clock className="w-3 h-3" /> Tentative shoot: {new Date(ep.draftDate + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                  </div>
                )}

                {/* Existing client comment (read-only display) */}
                {ep.clientComment && (
                  <div className="rounded bg-secondary/40 p-2.5 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">Your note: </span>
                    {ep.clientComment}
                  </div>
                )}

                {/* Action row */}
                {!seriesApproved && (
                  <div className="space-y-2 pt-2 border-t border-border">
                    <textarea
                      value={commentDraft[ep.id] ?? ""}
                      onChange={(e) => setCommentDraft(prev => ({ ...prev, [ep.id]: e.target.value }))}
                      placeholder="Optional note (visible to the production team)"
                      rows={2}
                      className="w-full text-xs bg-secondary/50 border border-border rounded px-2.5 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                    <div className="flex gap-2 flex-wrap">
                      <button
                        onClick={() => approveEpisode(ep)}
                        disabled={busy}
                        className={cn(
                          "inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors",
                          status === "approved"
                            ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                            : "bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/20",
                          "disabled:opacity-50",
                        )}
                      >
                        <ThumbsUp className="w-3.5 h-3.5" />
                        {status === "approved" ? "Approved" : "Approve"}
                      </button>
                      <button
                        onClick={() => requestChanges(ep)}
                        disabled={busy}
                        className={cn(
                          "inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors",
                          status === "changes_requested"
                            ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                            : "bg-amber-500/10 text-amber-300 border border-amber-500/30 hover:bg-amber-500/20",
                          "disabled:opacity-50",
                        )}
                      >
                        <ThumbsDown className="w-3.5 h-3.5" />
                        Request changes
                      </button>
                      <button
                        onClick={() => saveComment(ep)}
                        disabled={busy || !((commentDraft[ep.id] || "").trim())}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium border border-border text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors disabled:opacity-30"
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                        Save comment
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Whole-series approval — hidden when reviewing a single
            episode, since "approve everything" doesn't apply. */}
        {!seriesApproved && !isSingleEpisodeMode && (
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 sm:p-5 space-y-3">
            <div className="space-y-1">
              <p className="font-semibold text-foreground">Approve the whole series</p>
              <p className="text-xs text-muted-foreground">
                Tap the button below to approve everything you haven't already weighed in on. This signals the team to move forward on the full plan.
              </p>
            </div>
            <button
              onClick={approveSeries}
              disabled={seriesApproving}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-md bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {seriesApproving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              {allDecided ? "Confirm and lock in approvals" : "Approve everything pending"}
            </button>
          </div>
        )}

        <div className="text-center text-[11px] text-muted-foreground pt-4 border-t border-border">
          Sent for review {series.sentForReviewAt ? new Date(series.sentForReviewAt).toLocaleDateString() : "—"} ·
          Powered by Slate
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: "pending" | "approved" | "changes_requested" }) {
  if (status === "approved") {
    return <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 inline-flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />Approved</span>;
  }
  if (status === "changes_requested") {
    return <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 inline-flex items-center gap-1"><AlertCircle className="w-3 h-3" />Changes requested</span>;
  }
  return <span className="text-xs px-2 py-0.5 rounded-full bg-secondary text-muted-foreground border border-border inline-flex items-center gap-1"><Clock className="w-3 h-3" />Pending</span>;
}
