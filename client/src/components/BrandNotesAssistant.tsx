// ============================================================
// BrandNotesAssistant — guided AI interview that drafts brand
// notes for one client. Owner answers a handful of questions,
// then clicks "Draft notes" — Claude condenses the conversation
// into a markdown blob the owner can apply to the client record.
// ============================================================

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Sparkles, Send, Loader2, X, Check } from "lucide-react";
import { getAuthToken } from "@/lib/supabase";
import { toast } from "sonner";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientName: string;
  // Called with the final markdown draft when the owner clicks Apply.
  onApply: (draft: string) => void;
}

export default function BrandNotesAssistant({ open, onOpenChange, clientName, onApply }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Reset on open. Each session is its own interview — no resume.
  useEffect(() => {
    if (open) {
      setMessages([]);
      setInput("");
      setDraft(null);
      // Kick off with the first AI question.
      void seedFirstQuestion();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, draft]);

  async function callChat(history: ChatMessage[]): Promise<string> {
    const token = await getAuthToken();
    const res = await fetch("/api/brand-notes-chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ mode: "chat", clientName, history }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || "Chat failed");
    return body.reply || "";
  }

  async function seedFirstQuestion() {
    setSending(true);
    try {
      const reply = await callChat([]);
      setMessages([{ role: "assistant", content: reply }]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't start interview");
    } finally {
      setSending(false);
    }
  }

  async function send() {
    const text = input.trim();
    if (!text || sending) return;
    const newHistory: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages(newHistory);
    setInput("");
    setSending(true);
    try {
      const reply = await callChat(newHistory);
      setMessages(h => [...h, { role: "assistant", content: reply }]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Send failed");
    } finally {
      setSending(false);
    }
  }

  async function handleDraftNotes() {
    if (messages.length < 2 || drafting) return;
    setDrafting(true);
    try {
      const token = await getAuthToken();
      const res = await fetch("/api/brand-notes-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ mode: "draft", clientName, history: messages }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Draft failed");
      setDraft(body.draft || "");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't draft notes");
    } finally {
      setDrafting(false);
    }
  }

  function handleApply() {
    if (!draft) return;
    onApply(draft);
    toast.success("Brand notes added — remember to save the client");
    onOpenChange(false);
  }

  if (!open) return null;
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[60] bg-black/85 flex items-center justify-center p-4 pointer-events-auto"
      onClick={() => onOpenChange(false)}
    >
      <div
        className="bg-card border border-border rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Brand Notes Interview{clientName ? ` — ${clientName}` : ""}</h3>
          </div>
          <button onClick={() => onOpenChange(false)} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Conversation */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.length === 0 && sending && (
            <div className="text-center py-8 text-muted-foreground text-sm">
              <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
              Starting interview…
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
              <div className={`max-w-[80%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
                m.role === "user"
                  ? "bg-primary/15 text-primary border border-primary/30"
                  : "bg-secondary text-foreground border border-border"
              }`}>
                {m.content}
              </div>
            </div>
          ))}
          {sending && messages.length > 0 && (
            <div className="flex justify-start">
              <div className="bg-secondary text-muted-foreground border border-border rounded-lg px-3 py-2 text-sm flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Thinking…
              </div>
            </div>
          )}

          {/* Draft preview */}
          {draft && (
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-4 mt-4 space-y-2">
              <div className="flex items-center gap-2 text-emerald-300 text-xs uppercase tracking-wider font-semibold">
                <Check className="w-3.5 h-3.5" /> Draft ready
              </div>
              <pre className="whitespace-pre-wrap text-sm text-foreground font-sans">{draft}</pre>
              <p className="text-[11px] text-emerald-300/80">Click Apply to add this to the Brand Notes field. You can still edit it before saving the client.</p>
            </div>
          )}
        </div>

        {/* Input row */}
        {!draft && (
          <div className="border-t border-border p-3 space-y-2">
            <div className="flex gap-2">
              <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
                placeholder="Type your answer…"
                rows={2}
                disabled={sending}
                className="flex-1 bg-background border border-border rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
              />
              <button
                onClick={send}
                disabled={sending || !input.trim()}
                className="self-end bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
                aria-label="Send"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
            <div className="flex items-center justify-between">
              <p className="text-[11px] text-muted-foreground">{messages.length < 2 ? "Answer a few questions, then draft the notes." : `${Math.floor(messages.filter(m => m.role === "user").length)} answers given`}</p>
              <button
                onClick={handleDraftNotes}
                disabled={drafting || messages.filter(m => m.role === "user").length < 2}
                className="text-xs px-3 py-1.5 rounded-md bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {drafting ? "Drafting…" : "Draft notes"}
              </button>
            </div>
          </div>
        )}

        {/* Draft action row */}
        {draft && (
          <div className="border-t border-border p-3 flex items-center justify-end gap-2">
            <button
              onClick={() => setDraft(null)}
              className="text-xs px-3 py-1.5 rounded-md border border-border text-muted-foreground hover:text-foreground"
            >
              Keep going
            </button>
            <button
              onClick={handleApply}
              className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-emerald-500 text-white hover:bg-emerald-600"
            >
              <Check className="w-3.5 h-3.5" /> Apply to brand notes
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
