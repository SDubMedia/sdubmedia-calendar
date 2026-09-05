// ============================================================
// TodosPage — owner-managed tasks, assignable to staff.
// Owner sees all (with clear "self-added" vs "assigned" labels); staff see
// only their own (scoped in useScopedData). Overdue items (past due, not done)
// keep showing, flagged red, until checked off.
// ============================================================

import { useState, useMemo } from "react";
import { useScopedData as useApp } from "@/hooks/useScopedData";
import { useAuth } from "@/contexts/AuthContext";
import type { Todo } from "@/lib/types";
import { ListChecks, Plus, Trash2, Check, Calendar, User, Briefcase, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import TodoNotesThread from "@/components/TodoNotesThread";

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatDue(dateStr: string): string {
  if (!dateStr) return "";
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function TodosPage() {
  const { data, addTodo, updateTodo, deleteTodo } = useApp();
  const { effectiveProfile, allProfiles } = useAuth();
  const isOwner = effectiveProfile?.role === "owner";
  const myCrewId = effectiveProfile?.crewMemberId || null;

  // Add form
  const [title, setTitle] = useState("");
  const [assignee, setAssignee] = useState<string>(""); // crew member id, or "" = me/unassigned
  const [dueDate, setDueDate] = useState("");
  const [projectId, setProjectId] = useState("");
  const [saving, setSaving] = useState(false);
  const [showDone, setShowDone] = useState(false);

  // Click-to-edit. Expanded row shows the same fields as the add form
  // (pre-filled) plus the notes thread, instead of delete-and-recreate.
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editAssignee, setEditAssignee] = useState("");
  const [editDueDate, setEditDueDate] = useState("");
  const [editProjectId, setEditProjectId] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const startEdit = (t: Todo) => {
    setExpandedId(t.id);
    setEditTitle(t.title);
    setEditAssignee(t.assignedCrewMemberId || "");
    setEditDueDate(t.dueDate);
    setEditProjectId(t.projectId || "");
  };
  const saveEdit = async (t: Todo) => {
    if (!editTitle.trim()) { toast.error("Title can't be empty"); return; }
    setSavingEdit(true);
    try {
      await updateTodo(t.id, {
        title: editTitle.trim(),
        assignedCrewMemberId: isOwner ? (editAssignee || null) : t.assignedCrewMemberId,
        dueDate: editDueDate,
        projectId: editProjectId || null,
      });
      setExpandedId(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save");
    } finally {
      setSavingEdit(false);
    }
  };

  const crewName = (id: string | null) => data.crewMembers.find(c => c.id === id)?.name || null;
  const today = todayStr();

  // Was this to-do added by the staffer themselves (vs. assigned by the owner)?
  const isSelfAdded = (t: Todo) => {
    const creator = allProfiles.find(p => p.id === t.createdByUserId);
    return !!(creator && creator.role !== "owner" && creator.crewMemberId === t.assignedCrewMemberId);
  };

  const { open, done } = useMemo(() => {
    const sorted = [...data.todos].sort((a, b) => {
      // Overdue first, then by due date (dated before undated), then newest.
      const ao = a.dueDate && !a.done && a.dueDate < today ? 0 : 1;
      const bo = b.dueDate && !b.done && b.dueDate < today ? 0 : 1;
      if (ao !== bo) return ao - bo;
      if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
      if (a.dueDate) return -1;
      if (b.dueDate) return 1;
      return (b.createdAt || "").localeCompare(a.createdAt || "");
    });
    return { open: sorted.filter(t => !t.done), done: sorted.filter(t => t.done) };
  }, [data.todos, today]);

  const handleAdd = async () => {
    if (!title.trim()) { toast.error("Add a title"); return; }
    setSaving(true);
    try {
      await addTodo({
        title: title.trim(),
        // Starts with an empty notes thread — add one after, from the
        // expanded row, same as a new project starts with no client notes.
        notes: [],
        // Staff can only add for themselves; owner picks (blank = their own).
        assignedCrewMemberId: isOwner ? (assignee || null) : myCrewId,
        projectId: projectId || null,
        dueDate: dueDate || "",
      });
      setTitle(""); setAssignee(""); setDueDate(""); setProjectId("");
      toast.success("To-do added");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't add to-do");
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (t: Todo) => {
    try { await updateTodo(t.id, { done: !t.done }); }
    catch (err) { toast.error(err instanceof Error ? err.message : "Couldn't update"); }
  };

  const remove = async (t: Todo) => {
    try { await deleteTodo(t.id); }
    catch (err) { toast.error(err instanceof Error ? err.message : "Couldn't delete"); }
  };

  const projectLabel = (id: string | null) => {
    if (!id) return null;
    const p = data.projects.find(x => x.id === id);
    if (!p) return null;
    const client = data.clients.find(c => c.id === p.clientId);
    const type = data.projectTypes.find(t => t.id === p.projectTypeId);
    return `${type?.name || "Project"}${client ? ` · ${client.company}` : ""}`;
  };

  const renderTodo = (t: Todo) => {
    const overdue = !!t.dueDate && !t.done && t.dueDate < today;
    const assignedName = crewName(t.assignedCrewMemberId);
    const proj = projectLabel(t.projectId);
    const expanded = expandedId === t.id;
    return (
      <div key={t.id} className={cn("border-b border-border/50 last:border-0", t.done && "opacity-55")}>
        <div className="flex items-start gap-3 px-4 py-3">
          <button
            onClick={() => toggle(t)}
            className={cn(
              "mt-0.5 w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-colors",
              t.done ? "bg-primary border-primary text-primary-foreground" : "border-muted-foreground/40 hover:border-primary"
            )}
            aria-label={t.done ? "Mark not done" : "Mark done"}
          >
            {t.done && <Check className="w-3.5 h-3.5" />}
          </button>
          <div className="min-w-0 flex-1">
            <button
              type="button"
              onClick={() => expanded ? setExpandedId(null) : startEdit(t)}
              className={cn("block w-full text-left text-sm text-foreground hover:underline", t.done && "line-through")}
            >
              {t.title}
            </button>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-[11px]">
              {t.dueDate && (
                <span className={cn("inline-flex items-center gap-1", overdue ? "text-red-400 font-medium" : "text-muted-foreground")}>
                  {overdue ? <AlertTriangle className="w-3 h-3" /> : <Calendar className="w-3 h-3" />}
                  {overdue ? "Overdue · " : "Due "}{formatDue(t.dueDate)}
                </span>
              )}
              {/* Owner sees who it's for + whether the staffer added it themselves */}
              {isOwner && assignedName && (
                <span className="inline-flex items-center gap-1 text-muted-foreground">
                  <User className="w-3 h-3" /> {assignedName}
                </span>
              )}
              {isOwner && isSelfAdded(t) && (
                <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-medium">self-added</span>
              )}
              {proj && (
                <span className="inline-flex items-center gap-1 text-muted-foreground">
                  <Briefcase className="w-3 h-3" /> {proj}
                </span>
              )}
              {t.notes.length > 0 && (
                <span className="text-muted-foreground">{t.notes.length} note{t.notes.length === 1 ? "" : "s"}</span>
              )}
            </div>
          </div>
          <button onClick={() => remove(t)} className="text-muted-foreground hover:text-destructive shrink-0 mt-0.5" aria-label="Delete">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
        {expanded && (
          <div className="px-4 pb-4 space-y-3">
            <div className="space-y-2 bg-background border border-border rounded-lg p-3">
              <input
                value={editTitle}
                onChange={e => setEditTitle(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && editTitle.trim()) saveEdit(t); }}
                className="w-full bg-card border border-border rounded-md px-3 py-2 text-sm text-foreground"
              />
              <div className="flex flex-wrap gap-2">
                {isOwner && (
                  <select value={editAssignee} onChange={e => setEditAssignee(e.target.value)} className="bg-card border border-border rounded-md px-2 py-1.5 text-xs text-foreground">
                    <option value="">For me</option>
                    {data.crewMembers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                )}
                <input type="date" value={editDueDate} onChange={e => setEditDueDate(e.target.value)} className="bg-card border border-border rounded-md px-2 py-1.5 text-xs text-foreground" />
                <select value={editProjectId} onChange={e => setEditProjectId(e.target.value)} className="bg-card border border-border rounded-md px-2 py-1.5 text-xs text-foreground max-w-[12rem]">
                  <option value="">No project</option>
                  {data.projects.filter(p => p.status !== "cancelled").slice(0, 200).map(p => {
                    const c = data.clients.find(x => x.id === p.clientId);
                    const pt = data.projectTypes.find(x => x.id === p.projectTypeId);
                    return <option key={p.id} value={p.id}>{pt?.name || "Project"}{c ? ` · ${c.company}` : ""} ({p.date})</option>;
                  })}
                </select>
              </div>
              <div className="flex gap-2 justify-end">
                <button type="button" onClick={() => setExpandedId(null)} className="text-xs px-2.5 py-1.5 text-muted-foreground hover:text-foreground">Cancel</button>
                <button type="button" onClick={() => saveEdit(t)} disabled={savingEdit || !editTitle.trim()} className="text-xs px-3 py-1.5 bg-primary text-primary-foreground rounded-md font-semibold disabled:opacity-50">
                  {savingEdit ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
            <TodoNotesThread notes={t.notes} onChange={(next) => updateTodo(t.id, { notes: next })} />
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 sm:px-6 py-4 border-b border-border bg-card/50">
        <h1 className="text-xl font-semibold text-foreground flex items-center gap-2" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
          <ListChecks className="w-5 h-5 text-primary" /> To-Dos
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {isOwner ? "Your tasks and anything you've assigned to staff." : "Your tasks. Add your own or check off what's assigned to you."}
        </p>
      </div>

      <div className="flex-1 overflow-auto p-4 sm:p-6 space-y-5 max-w-2xl w-full mx-auto">
        {/* Add form */}
        <div className="bg-card border border-border rounded-lg p-3 space-y-2">
          <div className="flex gap-2">
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && title.trim()) handleAdd(); }}
              placeholder="Add a to-do…"
              className="flex-1 min-w-0 bg-background border border-border rounded-md px-3 py-2 text-sm text-foreground"
            />
            <button onClick={handleAdd} disabled={saving || !title.trim()} className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 bg-primary text-primary-foreground rounded-md text-sm font-semibold disabled:opacity-50">
              <Plus className="w-4 h-4" /> Add
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {isOwner && (
              <select value={assignee} onChange={e => setAssignee(e.target.value)} className="bg-background border border-border rounded-md px-2 py-1.5 text-xs text-foreground">
                <option value="">For me</option>
                {data.crewMembers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}
            <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className="bg-background border border-border rounded-md px-2 py-1.5 text-xs text-foreground" />
            <select value={projectId} onChange={e => setProjectId(e.target.value)} className="bg-background border border-border rounded-md px-2 py-1.5 text-xs text-foreground max-w-[12rem]">
              <option value="">No project</option>
              {data.projects.filter(p => p.status !== "cancelled").slice(0, 200).map(p => {
                const c = data.clients.find(x => x.id === p.clientId);
                const t = data.projectTypes.find(x => x.id === p.projectTypeId);
                return <option key={p.id} value={p.id}>{t?.name || "Project"}{c ? ` · ${c.company}` : ""} ({p.date})</option>;
              })}
            </select>
          </div>
        </div>

        {/* Open to-dos */}
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            To Do ({open.length})
          </div>
          {open.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">Nothing to do. Nice.</div>
          ) : open.map(renderTodo)}
        </div>

        {/* Done */}
        {done.length > 0 && (
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <button onClick={() => setShowDone(s => !s)} className="w-full px-4 py-2.5 border-b border-border text-xs font-semibold text-muted-foreground uppercase tracking-wider text-left hover:text-foreground">
              Done ({done.length}) · {showDone ? "hide" : "show"}
            </button>
            {showDone && done.map(renderTodo)}
          </div>
        )}
      </div>
    </div>
  );
}
