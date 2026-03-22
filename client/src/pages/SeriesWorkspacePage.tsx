// ============================================================
// SeriesWorkspacePage — Strategy Chat + Episode Board
// ============================================================

import { useState, useEffect, useCallback } from "react";
import { useApp } from "@/contexts/AppContext";
import { useAuth } from "@/contexts/AuthContext";
import { useParams, Link } from "wouter";
import type { SeriesEpisode, SeriesMessage } from "@/lib/types";
import SeriesChat from "@/components/SeriesChat";
import EpisodeBoard from "@/components/EpisodeBoard";
import { ArrowLeft, MessageSquare, ListOrdered } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function SeriesWorkspacePage() {
  const params = useParams<{ id: string }>();
  const seriesId = params.id || "";
  const { data, fetchEpisodes, addEpisode, updateEpisode, deleteEpisode, fetchMessages, addMessage, updateSeries } = useApp();
  const { profile } = useAuth();
  const [episodes, setEpisodes] = useState<SeriesEpisode[]>([]);
  const [messages, setMessages] = useState<SeriesMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [mobileTab, setMobileTab] = useState<"chat" | "episodes">("chat");

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
    } catch (err: any) {
      toast.error("Failed to save message");
      setSending(false);
      return;
    }

    // Call AI
    try {
      const res = await fetch("/api/series-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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

      // Save assistant message
      const assistantMsg = await addMessage({
        seriesId, role: "assistant", senderName: "Claude", content: result.content, tokensUsed: result.tokensUsed || 0,
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
  }, [series, client, episodes, messages, seriesId, profile, addMessage, updateSeries]);

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
            <h1 className="text-lg font-semibold text-foreground truncate" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              {series.name}
            </h1>
            <p className="text-xs text-muted-foreground">{client?.company}{series.goal ? ` — ${series.goal}` : ""}</p>
          </div>
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
            />
          </div>
        </div>
      </div>
    </div>
  );
}
