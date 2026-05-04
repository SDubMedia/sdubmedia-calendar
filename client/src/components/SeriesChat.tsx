// ============================================================
// SeriesChat — Collaborative chat interface for Content Strategy Studio
// Users and Claude brainstorm content series ideas together
// ============================================================

import { useEffect, useRef, useState, KeyboardEvent } from "react";
import { Send, Bot, User, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SeriesMessage } from "@/lib/types";

interface SeriesChatProps {
  seriesId: string;
  messages: SeriesMessage[];
  onSendMessage: (content: string) => Promise<void>;
  sending: boolean;
  tokenBudget: { used: number; limit: number };
}

export default function SeriesChat({
  seriesId: _seriesId,
  messages,
  onSendMessage,
  sending,
  tokenBudget,
}: SeriesChatProps) {
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  const budgetPercent = tokenBudget.limit > 0
    ? Math.min(100, Math.round((tokenBudget.used / tokenBudget.limit) * 100))
    : 0;

  const budgetColor =
    budgetPercent > 90
      ? "bg-red-500"
      : budgetPercent > 75
        ? "bg-amber-500"
        : "bg-primary";

  async function handleSend() {
    const trimmed = input.trim();
    if (!trimmed || sending) return;
    setInput("");
    await onSendMessage(trimmed);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  // Common starter prompts that reliably trigger episode-creation
  // tools. Shown only on an empty chat so users have a clear path
  // from "I want a series" to "episodes appearing on the board".
  const SUGGESTED_PROMPTS = [
    "Brainstorm 5 episodes for this series",
    "Lay out 10 episodes covering the main goals",
    "Give me episode ideas focused on customer stories",
    "Develop Episode 1 with detailed talking points",
  ];

  return (
    <div className="flex flex-col h-full bg-card border border-border rounded-lg overflow-hidden">
      {/* Message list */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && !sending ? (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <p className="text-muted-foreground text-sm text-center max-w-sm">
              Start brainstorming! Tap a starter below or type your own request — Claude will add episodes directly to the board.
            </p>
            <div className="flex flex-col gap-2 w-full max-w-sm">
              {SUGGESTED_PROMPTS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => { setInput(p); setTimeout(() => textareaRef.current?.focus(), 0); }}
                  className="text-left text-xs px-3 py-2 rounded-md border border-border bg-secondary/40 text-foreground hover:border-primary/40 hover:bg-secondary/60 transition-colors"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}
            {sending && <TypingIndicator />}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* "Commit to board" action — explicit way to push everything
          discussed into actual episodes on the right. Sends a forceful
          prompt so the AI calls create_episodes / develop_episode
          instead of just describing more. Only visible when there's
          conversation history to pull from. */}
      {messages.length > 0 && !sending && (
        <div className="px-4 pt-3 pb-1">
          <button
            type="button"
            onClick={() => onSendMessage("Based on everything we've discussed so far, create all the episodes on the board now. Use create_episodes for any episodes that don't exist yet, and develop_episode for any that need fleshing out. Don't describe — just create them.")}
            className={cn(
              "w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-md border border-primary/40 bg-primary/10 text-primary text-sm font-medium",
              "hover:bg-primary/20 transition-colors",
            )}
          >
            <Sparkles className="h-4 w-4" />
            Create episodes on the board from this discussion
          </button>
        </div>
      )}

      {/* Token budget indicator */}
      <div className="px-4 pt-2">
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
            <div
              className={cn("h-full rounded-full transition-all", budgetColor)}
              style={{ width: `${budgetPercent}%` }}
            />
          </div>
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {budgetPercent}% of token budget used
          </span>
        </div>
      </div>

      {/* Input area */}
      <div className="p-4 border-t border-border">
        <div className="flex gap-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={sending ? "Waiting for response..." : "Type a message..."}
            disabled={sending}
            rows={1}
            className={cn(
              "flex-1 resize-none rounded-md border border-border bg-secondary px-3 py-2",
              "text-sm text-foreground placeholder:text-muted-foreground",
              "focus:outline-none focus:ring-1 focus:ring-primary",
              "disabled:opacity-50 disabled:cursor-not-allowed",
            )}
          />
          <button
            onClick={handleSend}
            disabled={sending || !input.trim()}
            className={cn(
              "shrink-0 rounded-md px-3 py-2 bg-primary text-primary-foreground",
              "hover:bg-primary/90 transition-colors",
              "disabled:opacity-50 disabled:cursor-not-allowed",
            )}
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Message Bubble ──────────────────────────────────────────

function MessageBubble({ message }: { message: SeriesMessage }) {
  const isUser = message.role === "user";

  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[80%] rounded-lg px-4 py-2.5 border",
          isUser
            ? "bg-primary/20 border-primary/30"
            : "bg-secondary border-border",
        )}
      >
        <div className="flex items-center gap-1.5 mb-1">
          {isUser ? (
            <User className="h-3 w-3 text-muted-foreground" />
          ) : (
            <Bot className="h-3 w-3 text-muted-foreground" />
          )}
          <span className="text-xs text-muted-foreground">
            {message.senderName}
          </span>
        </div>
        <p className="text-sm text-foreground whitespace-pre-wrap">
          {message.content}
        </p>
      </div>
    </div>
  );
}

// ── Typing Indicator ────────────────────────────────────────

function TypingIndicator() {
  return (
    <div className="flex justify-start">
      <div className="bg-secondary border border-border rounded-lg px-4 py-3">
        <div className="flex items-center gap-1.5 mb-1">
          <Bot className="h-3 w-3 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Claude</span>
        </div>
        <div className="flex gap-1">
          <span className="h-2 w-2 bg-muted-foreground/50 rounded-full animate-bounce [animation-delay:0ms]" />
          <span className="h-2 w-2 bg-muted-foreground/50 rounded-full animate-bounce [animation-delay:150ms]" />
          <span className="h-2 w-2 bg-muted-foreground/50 rounded-full animate-bounce [animation-delay:300ms]" />
        </div>
      </div>
    </div>
  );
}
