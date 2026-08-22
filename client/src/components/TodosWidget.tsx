// ============================================================
// TodosWidget — dashboard card for open to-dos (owner + staff).
// Owner sees all open to-dos, staff see their own (scoping comes from
// useScopedData, same as TodosPage — the dashboard's raw useApp data is
// deliberately NOT used here so staff never see the whole org's list).
// Quick-add mirrors TodosPage semantics: staff add for themselves, an
// owner's dashboard add is unassigned (their own list). Full editing,
// assignment and notes stay on /todos.
// ============================================================

import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useScopedData as useApp } from "@/hooks/useScopedData";
import { useAuth } from "@/contexts/AuthContext";
import type { Todo } from "@/lib/types";
import { ArrowRight, Plus, ListChecks, AlertTriangle, PenTool } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const SHOW_LIMIT = 6;

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatDue(dateStr: string): string {
  if (!dateStr) return "";
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function TodosWidget() {
  const { data, addTodo, updateTodo } = useApp();
  const { effectiveProfile } = useAuth();
  const isOwner = effectiveProfile?.role === "owner";
  const myCrewId = effectiveProfile?.crewMemberId || null;

  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const today = todayStr();

  const open = useMemo(() => {
    return data.todos
      .filter(t => !t.done)
      .sort((a, b) => {
        // Same order as TodosPage: overdue first, then dated before undated,
        // then newest.
        const ao = a.dueDate && a.dueDate < today ? 0 : 1;
        const bo = b.dueDate && b.dueDate < today ? 0 : 1;
        if (ao !== bo) return ao - bo;
        if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
        if (a.dueDate) return -1;
        if (b.dueDate) return 1;
        return (b.createdAt || "").localeCompare(a.createdAt || "");
      });
  }, [data.todos, today]);

  const complete = async (t: Todo) => {
    try { await updateTodo(t.id, { done: true }); }
    catch (err) { toast.error(err instanceof Error ? err.message : "Couldn't update"); }
  };

  const quickAdd = async () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      await addTodo({
        title: trimmed,
        notes: "",
        assignedCrewMemberId: isOwner ? null : myCrewId,
        projectId: null,
        dueDate: "",
      });
      setTitle("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't add to-do");
    } finally {
      setSaving(false);
    }
  };

  const crewName = (id: string | null) => data.crewMembers.find(c => c.id === id)?.name || null;

  // Derived action items, never stored: proposals awaiting the owner's
  // countersignature appear the moment a client signs and disappear the
  // moment the owner countersigns. Owner-only — staff don't sign proposals.
  const countersignItems = isOwner
    ? data.proposals.filter(t => t.status === "accepted" && !t.deletedAt)
    : [];

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h3 className="text-sm font-semibold text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
          To-Dos
        </h3>
        <Link href="/todos" className="flex items-center gap-1 text-xs text-primary hover:text-primary/80">
          All To-Dos <ArrowRight className="w-3 h-3" />
        </Link>
      </div>

      <div className="px-4 py-2.5 border-b border-border flex items-center gap-2">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") quickAdd(); }}
          placeholder="Add a to-do…"
          className="flex-1 min-w-0 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
        />
        <button
          onClick={quickAdd}
          disabled={saving || !title.trim()}
          aria-label="Add to-do"
          className="p-1 rounded text-primary hover:bg-primary/10 disabled:opacity-40"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      <div className="divide-y divide-border">
        {countersignItems.map(pr => (
          <Link key={pr.id} href="/proposals" className="px-4 py-2.5 flex items-center gap-3 bg-amber-500/5 hover:bg-amber-500/10">
            <PenTool className="w-4 h-4 shrink-0 text-amber-400" />
            <div className="min-w-0 flex-1">
              <p className="text-sm text-foreground truncate">Countersign: {pr.title}</p>
              <p className="text-[11px] text-amber-400/90">Client signed — awaiting your signature</p>
            </div>
            <ArrowRight className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
          </Link>
        ))}
        {open.length === 0 && countersignItems.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">
            <ListChecks className="w-5 h-5 mx-auto mb-1.5 opacity-60" />
            All caught up
          </div>
        ) : open.length === 0 ? null : (
          open.slice(0, SHOW_LIMIT).map(t => {
            const overdue = !!t.dueDate && t.dueDate < today;
            const assignee = isOwner ? crewName(t.assignedCrewMemberId) : null;
            return (
              <div key={t.id} className="px-4 py-2.5 flex items-center gap-3">
                <button
                  onClick={() => complete(t)}
                  aria-label={`Mark "${t.title}" done`}
                  className="w-4 h-4 shrink-0 rounded border border-border hover:border-primary hover:bg-primary/10"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-foreground truncate">{t.title}</p>
                  {assignee && <p className="text-[11px] text-muted-foreground truncate">{assignee}</p>}
                </div>
                {t.dueDate && (
                  <span className={cn(
                    "shrink-0 text-[11px] flex items-center gap-1",
                    overdue ? "text-red-400 font-semibold" : "text-muted-foreground",
                  )}>
                    {overdue && <AlertTriangle className="w-3 h-3" />}
                    {formatDue(t.dueDate)}
                  </span>
                )}
              </div>
            );
          })
        )}
        {open.length > SHOW_LIMIT && (
          <Link href="/todos" className="block px-4 py-2 text-center text-xs text-muted-foreground hover:text-foreground">
            {open.length - SHOW_LIMIT} more open
          </Link>
        )}
      </div>
    </div>
  );
}
