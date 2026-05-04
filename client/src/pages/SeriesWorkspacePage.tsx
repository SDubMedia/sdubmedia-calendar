// ============================================================
// SeriesWorkspacePage — Strategy Chat + Episode Board
// ============================================================

import { useState, useEffect, useCallback } from "react";
import { useApp } from "@/contexts/AppContext";
import { useAuth } from "@/contexts/AuthContext";
import { useParams, Link, useLocation } from "wouter";
import type { Series, SeriesEpisode, SeriesMessage } from "@/lib/types";
import SeriesChat from "@/components/SeriesChat";
import EpisodeBoard from "@/components/EpisodeBoard";
import { ArrowLeft, MessageSquare, ListOrdered, Send, Copy, CheckCircle2, Save, Archive } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import ProjectDialog from "@/components/ProjectDialog";
import { getAuthToken } from "@/lib/supabase";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function SeriesWorkspacePage() {
  const params = useParams<{ id: string }>();
  const seriesId = params.id || "";
  const { data, fetchEpisodes, addEpisode, updateEpisode, deleteEpisode, fetchMessages, addMessage, updateSeries, fetchComments, addComment, addProject } = useApp();
  const { profile } = useAuth();
  const [episodes, setEpisodes] = useState<SeriesEpisode[]>([]);
  const [messages, setMessages] = useState<SeriesMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [mobileTab, setMobileTab] = useState<"chat" | "episodes">("chat");
  const [scheduleEpisode, setScheduleEpisode] = useState<SeriesEpisode | null>(null);

  const series = data.series.find(s => s.id === seriesId);
  const client = series ? data.clients.find(c => c.id === series.clientId) : null;

  // Load episodes and messages
  useEffect(() => {
    if (!seriesId) return;
    fetchEpisodes(seriesId).then(setEpisodes).catch(() => {});
    fetchMessages(seriesId).then(setMessages).catch(() => {});
  }, [seriesId, fetchEpisodes, fetchMessages]);

  const handleAddEpisode = useCallback(async () => {
    try {
      const nextNum = episodes.length > 0 ? Math.max(...episodes.map(e => e.episodeNumber)) + 1 : 1;
      const ep = await addEpisode({
        seriesId, episodeNumber: nextNum, title: `Episode ${nextNum}`,
        concept: "", talkingPoints: "", status: "idea", projectId: null,
        draftDate: "", draftStartTime: "", draftEndTime: "", draftLocationId: "", draftCrew: [],
      });
      setEpisodes(prev => [...prev, ep].sort((a, b) => a.episodeNumber - b.episodeNumber));
      toast.success(`Episode ${nextNum} added`);
    } catch (err: any) {
      toast.error(err.message || "Failed to add episode");
    }
  }, [seriesId, episodes, addEpisode]);

  const handleUpdateEpisode = useCallback(async (id: string, updates: Partial<SeriesEpisode>) => {
    try {
      await updateEpisode(id, updates);
      setEpisodes(prev => prev.map(e => e.id === id ? { ...e, ...updates } : e));
    } catch (err: any) {
      toast.error(err.message || "Failed to update episode");
    }
  }, [updateEpisode]);

  const handleScheduleEpisode = useCallback((episode: SeriesEpisode) => {
    setScheduleEpisode(episode);
  }, []);

  const handleProjectCreated = useCallback(async (project: any) => {
    if (scheduleEpisode) {
      try {
        await updateEpisode(scheduleEpisode.id, { projectId: project.id, status: "scheduled" });
        setEpisodes(prev => prev.map(e => e.id === scheduleEpisode.id ? { ...e, projectId: project.id, status: "scheduled" } : e));
        toast.success(`Episode ${scheduleEpisode.episodeNumber} linked to calendar`);
      } catch (_err: any) {
        toast.error("Project created but failed to link episode — link it manually");
      }
      setScheduleEpisode(null);
    }
  }, [scheduleEpisode, updateEpisode]);

  const handlePublishSchedule = useCallback(async () => {
    const draftsToPublish = episodes.filter(e => e.draftDate && !e.projectId && e.status !== "idea");
    if (draftsToPublish.length === 0) { toast.error("No draft schedules to publish"); return; }

    let published = 0;
    for (const ep of draftsToPublish) {
      try {
        const newProject = await addProject({
          clientId: series!.clientId,
          projectTypeId: "",
          locationId: ep.draftLocationId || "",
          date: ep.draftDate,
          startTime: ep.draftStartTime || "09:00",
          endTime: ep.draftEndTime || "12:00",
          status: "upcoming",
          crew: ep.draftCrew.map(crewId => ({ crewMemberId: crewId, role: "", hoursWorked: 0, payRatePerHour: 0 })),
          postProduction: [],
          editorBilling: null,
          editTypes: [],
          notes: `[Series: ${series!.name}] Episode ${ep.episodeNumber}: ${ep.title}\n\n${ep.concept}`,
          deliverableUrl: "",
          cancellationReason: "",
          cancelledAt: null,
        });
        await updateEpisode(ep.id, { projectId: newProject.id, status: "scheduled" });
        setEpisodes(prev => prev.map(e => e.id === ep.id ? { ...e, projectId: newProject.id, status: "scheduled" } : e));
        published++;
      } catch (_err: any) {
        toast.error(`Failed to publish Episode ${ep.episodeNumber}`);
      }
    }
    if (published > 0) toast.success(`${published} episode${published > 1 ? "s" : ""} published to calendar`);
  }, [episodes, series, addProject, updateEpisode]);

  const handleDeleteEpisode = useCallback(async (id: string) => {
    try {
      await deleteEpisode(id);
      setEpisodes(prev => prev.filter(e => e.id !== id));
      toast.success("Episode removed");
    } catch (err: any) {
      toast.error(err.message || "Failed to delete episode");
    }
  }, [deleteEpisode]);

  const handleSendMessage = useCallback(async (content: string) => {
    if (!series || !content.trim()) return;
    setSending(true);

    const senderName = profile?.name || "User";

    // Save user message
    try {
      const userMsg = await addMessage({
        seriesId, role: "user", senderName, content, tokensUsed: 0,
      });
      setMessages(prev => [...prev, userMsg]);
    } catch (_err: any) {
      toast.error("Failed to save message");
      setSending(false);
      return;
    }

    // Call AI
    try {
      const token = await getAuthToken();
      const res = await fetch("/api/series-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({
          seriesId,
          message: content,
          senderName,
          seriesName: series.name,
          seriesGoal: series.goal,
          clientName: client?.company || "",
          clientContact: client?.contactName || "",
          episodes: episodes.map(e => ({ number: e.episodeNumber, title: e.title, concept: e.concept, status: e.status })),
          history: messages.slice(-20).map(m => ({ role: m.role, content: m.content })),
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "AI request failed" }));
        throw new Error(err.error || "AI request failed");
      }

      const result = await res.json();

      // Execute any actions Claude requested
      if (result.actions && result.actions.length > 0) {
        for (const action of result.actions) {
          try {
            if (action.tool === "create_episodes") {
              const newEpisodes = action.input.episodes || [];
              const startNum = episodes.length > 0 ? Math.max(...episodes.map((e: SeriesEpisode) => e.episodeNumber)) + 1 : 1;
              for (let i = 0; i < newEpisodes.length; i++) {
                const ep = await addEpisode({
                  seriesId,
                  episodeNumber: startNum + i,
                  title: newEpisodes[i].title || `Episode ${startNum + i}`,
                  concept: newEpisodes[i].concept || "",
                  talkingPoints: newEpisodes[i].talking_points || "",
                  status: "idea",
                  projectId: null,
                  draftDate: "", draftStartTime: "", draftEndTime: "", draftLocationId: "", draftCrew: [],
                });
                setEpisodes(prev => [...prev, ep].sort((a, b) => a.episodeNumber - b.episodeNumber));
              }
              toast.success(`${newEpisodes.length} episode${newEpisodes.length > 1 ? "s" : ""} added to the board`);
            } else if (action.tool === "update_episode") {
              const epNum = action.input.episode_number;
              const targetEp = episodes.find((e: SeriesEpisode) => e.episodeNumber === epNum);
              if (targetEp) {
                const updates: Partial<SeriesEpisode> = {};
                if (action.input.title) updates.title = action.input.title;
                if (action.input.concept) updates.concept = action.input.concept;
                if (action.input.talking_points) updates.talkingPoints = action.input.talking_points;
                await updateEpisode(targetEp.id, updates);
                setEpisodes(prev => prev.map(e => e.id === targetEp.id ? { ...e, ...updates } : e));
                toast.success(`Episode ${epNum} updated`);
              }
            } else if (action.tool === "develop_episode") {
              const epNum = action.input.episode_number;
              const targetEp = episodes.find((e: SeriesEpisode) => e.episodeNumber === epNum);
              if (targetEp) {
                const concept = action.input.detailed_concept || "";
                const talkingPoints = [
                  action.input.talking_points || "",
                  action.input.visual_notes ? `\n--- Visual Notes ---\n${action.input.visual_notes}` : "",
                ].join("");
                await updateEpisode(targetEp.id, { concept, talkingPoints, status: "concept" });
                setEpisodes(prev => prev.map(e => e.id === targetEp.id ? { ...e, concept, talkingPoints, status: "concept" } : e));
                toast.success(`Episode ${epNum} developed — moved to Concept stage`);
              }
            }
          } catch (err: any) {
            console.error("Action failed:", action.tool, err);
          }
        }
      }

      // Build a "what I did" footer summarizing tool actions so the
      // saved chat history reflects what actually happened. Without
      // this, users scrolling back through history can't see whether
      // the AI just talked or actually created episodes.
      const actionSummaries: string[] = [];
      for (const a of (result.actions || [])) {
        if (a.tool === "create_episodes") {
          const n = a.input?.episodes?.length || 0;
          actionSummaries.push(`✨ Added ${n} episode${n === 1 ? "" : "s"} to the board`);
        } else if (a.tool === "update_episode") {
          actionSummaries.push(`✏️ Updated Episode ${a.input?.episode_number}`);
        } else if (a.tool === "develop_episode") {
          actionSummaries.push(`🎬 Developed Episode ${a.input?.episode_number} (moved to Concept stage)`);
        }
      }
      const finalContent = actionSummaries.length > 0
        ? `${result.content || ""}${result.content ? "\n\n" : ""}${actionSummaries.join("\n")}`.trim()
        : (result.content || "");

      // Save assistant message
      const assistantMsg = await addMessage({
        seriesId, role: "assistant", senderName: "Claude", content: finalContent, tokensUsed: result.tokensUsed || 0,
      });
      setMessages(prev => [...prev, assistantMsg]);

      // Update token usage on series
      if (result.tokensUsed) {
        await updateSeries(seriesId, {
          tokensUsedThisMonth: (series.tokensUsedThisMonth || 0) + result.tokensUsed,
        });
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to get AI response");
    } finally {
      setSending(false);
    }
  }, [series, client, episodes, messages, seriesId, profile, addMessage, updateSeries, addEpisode, updateEpisode]);

  if (!series) {
    return (
      <div className="flex flex-col h-full items-center justify-center">
        <p className="text-muted-foreground">Series not found</p>
        <Link href="/series" className="text-primary text-sm mt-2">Back to Series</Link>
      </div>
    );
  }

  const tokenBudget = {
    used: series.tokensUsedThisMonth || 0,
    limit: series.monthlyTokenLimit || 500000,
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 sm:px-6 py-3 border-b border-border bg-card/50">
        <div className="flex items-center gap-3">
          <Link href="/series" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <EditableSeriesTitle series={series} onSave={async (name) => {
                if (name.trim() && name !== series.name) await updateSeries(series.id, { name: name.trim() });
              }} />
              <ReviewStatusBadge series={series} episodes={episodes} />
            </div>
            <EditableSeriesGoal series={series} onSave={async (goal) => {
              await updateSeries(series.id, { goal });
            }} clientCompany={client?.company || ""} />
            {/* Recipient — pulled from this series's linked client. Always
                visible so the owner knows who Send for Review will email. */}
            {client && (
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Sending review to:{" "}
                <span className="text-foreground">
                  {client.contactName || "(no contact name)"}
                </span>
                {client.email ? (
                  <span className="text-muted-foreground"> &lt;{client.email}&gt;</span>
                ) : (
                  <span className="text-amber-400"> · no email on file</span>
                )}
              </p>
            )}
          </div>
          <SendForReviewButton series={series} episodes={episodes} onTokenIssued={async () => {
            // refresh series row so review_status flips locally
            await updateSeries(seriesId, {});
          }} />
          <ArchiveSeriesButton series={series} />
        </div>

        {/* Mobile tab toggle */}
        <div className="flex gap-2 mt-2 lg:hidden">
          <button
            onClick={() => setMobileTab("chat")}
            className={cn("flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
              mobileTab === "chat" ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"
            )}
          >
            <MessageSquare className="w-3.5 h-3.5" /> Chat
          </button>
          <button
            onClick={() => setMobileTab("episodes")}
            className={cn("flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
              mobileTab === "episodes" ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"
            )}
          >
            <ListOrdered className="w-3.5 h-3.5" /> Episodes ({episodes.length})
          </button>
        </div>
      </div>

      {/* Content — split on desktop, tabs on mobile */}
      <div className="flex-1 overflow-hidden flex">
        {/* Chat Panel */}
        <div className={cn("flex-1 flex flex-col border-r border-border",
          mobileTab !== "chat" && "hidden lg:flex"
        )}>
          <SeriesChat
            seriesId={seriesId}
            messages={messages}
            onSendMessage={handleSendMessage}
            sending={sending}
            tokenBudget={tokenBudget}
          />
        </div>

        {/* Episode Board */}
        <div className={cn("w-full lg:w-[400px] xl:w-[450px] flex flex-col overflow-auto",
          mobileTab !== "episodes" && "hidden lg:flex"
        )}>
          <div className="p-3 sm:p-4">
            <EpisodeBoard
              episodes={episodes}
              onUpdateEpisode={handleUpdateEpisode}
              onAddEpisode={handleAddEpisode}
              onDeleteEpisode={handleDeleteEpisode}
              onScheduleEpisode={handleScheduleEpisode}
              onPublishSchedule={handlePublishSchedule}
              seriesId={seriesId}
              userName={profile?.name || "User"}
              userRole={profile?.role || "client"}
              onFetchComments={fetchComments}
              onAddComment={addComment}
              locations={data.locations}
              crewMembers={data.crewMembers}
              existingProjects={data.projects}
            />
          </div>
        </div>
      </div>

      {/* Schedule Episode as Project */}
      {scheduleEpisode && (
        <ProjectDialog
          open={true}
          onClose={() => setScheduleEpisode(null)}
          defaultClientId={series.clientId}
          defaultNotes={`[Series: ${series.name}] Episode ${scheduleEpisode.episodeNumber}: ${scheduleEpisode.title}\n\n${scheduleEpisode.concept}\n\nTalking Points:\n${scheduleEpisode.talkingPoints}`}
          onCreated={handleProjectCreated}
        />
      )}
    </div>
  );
}

// ── Archive / unarchive button ──────────────────────────────────
// Hides the series from the main list. Doesn't delete — owner can
// flip back via the Archived tab on the Series page.
function ArchiveSeriesButton({ series }: { series: Series }) {
  const [, setLocation] = useLocation();
  const { updateSeries } = useApp();
  const isArchived = series.status === "archived";
  return (
    <button
      type="button"
      onClick={async () => {
        if (isArchived) {
          await updateSeries(series.id, { status: "active" });
          toast.success("Restored to active series");
        } else {
          if (!confirm(`Archive "${series.name}"? You can restore it later from the Series page.`)) return;
          await updateSeries(series.id, { status: "archived" });
          toast.success("Series archived");
          setLocation("/series");
        }
      }}
      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors shrink-0"
    >
      <Archive className="w-3.5 h-3.5" />
      {isArchived ? "Restore" : "Archive"}
    </button>
  );
}

// ── Editable series title / goal ────────────────────────────────
// Click the title to rename in place — saves on blur. Same for the
// goal subtitle. Avoids needing a separate edit-series modal for
// the most-common renames.
function EditableSeriesTitle({ series, onSave }: { series: Series; onSave: (name: string) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(series.name);
  useEffect(() => { setDraft(series.name); }, [series.name]);

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="text-lg font-semibold text-foreground truncate hover:text-primary transition-colors text-left"
        style={{ fontFamily: "'Space Grotesk', sans-serif" }}
        title="Click to rename"
      >
        {series.name}
      </button>
    );
  }
  return (
    <input
      autoFocus
      value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={async () => { await onSave(draft); setEditing(false); }}
      onKeyDown={async (e) => {
        if (e.key === "Enter") { await onSave(draft); setEditing(false); }
        if (e.key === "Escape") { setDraft(series.name); setEditing(false); }
      }}
      className="text-lg font-semibold bg-secondary border border-border rounded px-2 py-0.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary min-w-0 flex-1"
      style={{ fontFamily: "'Space Grotesk', sans-serif" }}
    />
  );
}

function EditableSeriesGoal({ series, onSave, clientCompany }: { series: Series; onSave: (goal: string) => Promise<void>; clientCompany: string }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(series.goal);
  useEffect(() => { setDraft(series.goal); }, [series.goal]);

  if (!editing) {
    return (
      <p className="text-xs text-muted-foreground">
        {clientCompany}
        {series.goal ? " — " : ""}
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="hover:text-foreground transition-colors text-left"
          title="Click to edit goal"
        >
          {series.goal || <span className="italic underline decoration-dotted">add goal</span>}
        </button>
      </p>
    );
  }
  return (
    <div className="flex items-center gap-2 mt-0.5">
      <span className="text-xs text-muted-foreground">{clientCompany}{clientCompany ? " — " : ""}</span>
      <input
        autoFocus
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={async () => { await onSave(draft); setEditing(false); }}
        onKeyDown={async (e) => {
          if (e.key === "Enter") { await onSave(draft); setEditing(false); }
          if (e.key === "Escape") { setDraft(series.goal); setEditing(false); }
        }}
        className="text-xs bg-secondary border border-border rounded px-2 py-0.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary flex-1 min-w-0"
        placeholder="Goal of this series"
      />
    </div>
  );
}

// ── Edit-message modal for sending series for review ───────────
// Shows the saved (or default) template with placeholders, a live
// preview with substituted values, and clear recipient info pulled
// from the linked client. Save & Copy persists the template back
// to the org so future sends pre-fill with the edited version.
function ReviewMessageEditor({
  open, onClose, initialTemplate, messageVars, recipientEmail, recipientName,
  onSendEmail, onSaveAndCopy, onCopyOnce,
}: {
  open: boolean;
  onClose: () => void;
  initialTemplate: string;
  messageVars: { first_name: string; company: string; url: string };
  recipientEmail: string;
  recipientName: string;
  onSendEmail: (template: string) => Promise<void>;
  onSaveAndCopy: (template: string) => Promise<void>;
  onCopyOnce: (template: string) => Promise<void>;
}) {
  const [template, setTemplate] = useState(initialTemplate);
  const [sending, setSending] = useState(false);
  // Reset whenever the modal opens with a different starting value.
  useEffect(() => { if (open) setTemplate(initialTemplate); }, [open, initialTemplate]);

  if (!open) return null;
  const preview = substituteMessage(template, messageVars);
  const canEmail = !!recipientEmail;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-lg max-w-2xl w-full max-h-[90dvh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-border">
          <h2 className="text-lg font-semibold" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Send for review</h2>
          <p className="text-xs text-muted-foreground mt-1">Edit the message, then copy. We'll save your edits as the default for next time.</p>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Recipient — pulled from the linked client. Owner sees who's
              about to get the message before they paste it. To change
              this permanently, edit the Client record. */}
          <div className="rounded-md border border-border bg-secondary/40 p-3 text-xs space-y-0.5">
            <div className="text-muted-foreground">Going to</div>
            <div className="font-medium text-foreground">
              {recipientName || messageVars.first_name || "(no contact name)"}
              {messageVars.company ? ` · ${messageVars.company}` : ""}
            </div>
            {recipientEmail ? (
              <div className="text-muted-foreground text-[11px]">{recipientEmail}</div>
            ) : (
              <div className="text-amber-400 text-[11px]">No email on file — email send unavailable. Add one on the Clients page or use Copy.</div>
            )}
            <div className="text-muted-foreground text-[10px] pt-0.5">Pulled from this series's linked client. Edit the client record in Clients to change permanently.</div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Message template</Label>
            <p className="text-[11px] text-muted-foreground">
              Use <code className="text-primary">{"{first_name}"}</code>, <code className="text-primary">{"{company}"}</code>, <code className="text-primary">{"{url}"}</code> as placeholders.
            </p>
            <Textarea
              value={template}
              onChange={e => setTemplate(e.target.value)}
              rows={8}
              className="bg-secondary border-border text-sm resize-y"
              placeholder="Write what you'd send to a client..."
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Preview (what gets copied)</Label>
            <div className="rounded-md border border-border bg-background p-3 text-sm whitespace-pre-wrap text-foreground/90 leading-relaxed">
              {preview || <span className="text-muted-foreground italic">Nothing to preview.</span>}
            </div>
          </div>
        </div>

        <div className="px-5 py-3 border-t border-border flex flex-col-reverse sm:flex-row sm:justify-end gap-2 sm:flex-wrap">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="outline" onClick={() => onCopyOnce(template)}>
            <Copy className="w-3.5 h-3.5 mr-1.5" /> Just copy
          </Button>
          <Button variant="outline" onClick={() => onSaveAndCopy(template)} className="gap-1.5">
            <Save className="w-3.5 h-3.5" />
            Save & Copy
          </Button>
          <Button
            onClick={async () => { setSending(true); try { await onSendEmail(template); } finally { setSending(false); } }}
            disabled={!canEmail || sending}
            className="gap-1.5"
          >
            <Send className="w-3.5 h-3.5" />
            {sending ? "Sending…" : "Send Email"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Review status badge ─────────────────────────────────────────
// Shows where the series sits in the client review workflow at a
// glance. Counts approved / changes-requested episodes so the
// owner sees "in review · 3 of 10 approved · 1 changes requested".
function ReviewStatusBadge({ series, episodes }: { series: Series; episodes: SeriesEpisode[] }) {
  const status = series.reviewStatus || "draft";
  if (status === "draft") return null;

  const approved = episodes.filter(e => e.approvalStatus === "approved").length;
  const changes = episodes.filter(e => e.approvalStatus === "changes_requested").length;
  const total = episodes.length;

  if (status === "approved") {
    return (
      <span className="shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
        <CheckCircle2 className="w-3 h-3" /> Approved
      </span>
    );
  }
  if (status === "changes_requested" || changes > 0) {
    return (
      <span className="shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium bg-amber-500/15 text-amber-300 border border-amber-500/30">
        Changes requested · {approved}/{total} approved · {changes} need work
      </span>
    );
  }
  // Sent / in review
  return (
    <span className="shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium bg-blue-500/15 text-blue-300 border border-blue-500/30">
      In review · {approved}/{total} approved
    </span>
  );
}

// ── Send-for-Review button + share-link popover ─────────────────
// Generates the public review token via /api/series-send-for-review
// then surfaces the link for the owner to copy. Once the series
// has a token, button reads "Copy Review Link" — token is reused.
// Default template — only used if the org hasn't saved a custom one.
// Placeholders are substituted at copy time so the template stays
// generic across clients.
const DEFAULT_REVIEW_MESSAGE_TEMPLATE = `Hi {first_name}! Here's the video series plan we put together for {company}. Take a look and approve or request changes whenever you have a moment:

{url}

Looking forward to your feedback!`;

function substituteMessage(template: string, vars: { first_name: string; company: string; url: string }): string {
  return template
    .replaceAll("{first_name}", vars.first_name)
    .replaceAll("{company}", vars.company)
    .replaceAll("{url}", vars.url);
}

function SendForReviewButton({ series, episodes, onTokenIssued }: { series: Series; episodes: SeriesEpisode[]; onTokenIssued: () => Promise<void> }) {
  const { data, updateOrganization } = useApp();
  const client = data.clients.find(c => c.id === series.clientId);
  const [busy, setBusy] = useState(false);
  const [token, setToken] = useState<string | null>(series.reviewToken || null);
  const [copied, setCopied] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);

  const url = token ? `${window.location.origin}/review/series/${token}` : "";
  const savedTemplate = data.organization?.seriesReviewMessageTemplate || "";
  const activeTemplate = savedTemplate || DEFAULT_REVIEW_MESSAGE_TEMPLATE;
  const messageVars = {
    first_name: client?.contactName ? client.contactName.split(" ")[0] : "",
    company: client?.company || "",
    url,
  };
  const shareMessage = url ? substituteMessage(activeTemplate, messageVars) : "";

  async function sendForReview() {
    if (episodes.length === 0) {
      toast.error("Add some episodes first");
      return;
    }
    setBusy(true);
    try {
      const authToken = await getAuthToken();
      const res = await fetch("/api/series-send-for-review", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ seriesId: series.id }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Request failed" }));
        throw new Error(err.error || "Failed to generate link");
      }
      const body = await res.json();
      setToken(body.token);
      await onTokenIssued();
      toast.success("Review link ready — copy and share with your client");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  function copyLinkOnly() {
    if (!url) return;
    void navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  // Email send — actually delivers the message to the client's email
  // address via Resend. Saves the template too if it changed.
  async function handleSendEmail(editedTemplate: string) {
    if (!client?.email) {
      toast.error("This client doesn't have an email on file. Add one in Clients first.");
      return;
    }
    try {
      // Save the (possibly edited) template first so future sends
      // pre-fill with the latest version.
      if (editedTemplate.trim() && editedTemplate !== savedTemplate) {
        await updateOrganization({ seriesReviewMessageTemplate: editedTemplate });
      }
      const final = substituteMessage(editedTemplate, messageVars);
      const authToken = await getAuthToken();
      const res = await fetch("/api/send-series-review-email", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({
          seriesId: series.id,
          subject: `Video series for review: ${series.name}`,
          body: final,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Send failed" }));
        throw new Error(err.error || "Send failed");
      }
      toast.success(`Email sent to ${client.email}`);
      setEditorOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't send");
    }
  }

  // Editor modal saves the (edited) template back to the org so future
  // sends pre-fill with the saved version. Returns the substituted
  // message that the modal copies to clipboard.
  async function handleSaveAndCopy(editedTemplate: string) {
    try {
      if (editedTemplate.trim() && editedTemplate !== savedTemplate) {
        await updateOrganization({ seriesReviewMessageTemplate: editedTemplate });
      }
      const final = substituteMessage(editedTemplate, messageVars);
      await navigator.clipboard.writeText(final);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
      setEditorOpen(false);
      toast.success("Message copied — saved as your default");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save");
    }
  }
  async function handleCopyOnce(editedTemplate: string) {
    const final = substituteMessage(editedTemplate, messageVars);
    await navigator.clipboard.writeText(final);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
    setEditorOpen(false);
    toast.success("Message copied (template not changed)");
  }

  if (token) {
    return (
      <>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setEditorOpen(true)}
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs font-medium transition-colors",
              copied
                ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300"
                : "bg-secondary border-border text-foreground hover:border-primary/40",
            )}
            title="Edit + copy the share message — saves your edits as the default for next time"
          >
            {copied ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? "Copied!" : "Copy Message"}
          </button>
          <button
            type="button"
            onClick={copyLinkOnly}
            className="text-[10px] text-muted-foreground hover:text-foreground underline disabled:opacity-50"
            title="Copy just the URL"
          >
            link only
          </button>
          <button
            type="button"
            onClick={sendForReview}
            disabled={busy}
            className="text-[10px] text-muted-foreground hover:text-foreground underline disabled:opacity-50"
            title="Reset approvals and re-send for another round of review"
          >
            re-issue
          </button>
        </div>

        <ReviewMessageEditor
          open={editorOpen}
          onClose={() => setEditorOpen(false)}
          initialTemplate={activeTemplate}
          messageVars={messageVars}
          recipientEmail={client?.email || ""}
          recipientName={client?.contactName || ""}
          onSendEmail={handleSendEmail}
          onSaveAndCopy={handleSaveAndCopy}
          onCopyOnce={handleCopyOnce}
        />
      </>
    );
  }

  return (
    <button
      type="button"
      onClick={sendForReview}
      disabled={busy || episodes.length === 0}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 shrink-0"
    >
      <Send className="w-3.5 h-3.5" />
      {busy ? "Generating..." : "Send for Review"}
    </button>
  );
}
