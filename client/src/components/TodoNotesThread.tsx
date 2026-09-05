// ============================================================
// A dated, growing note thread for a to-do — same shape and interaction as
// Project.clientNotes (ProjectDetailSheet.tsx), generalized to a plain
// onChange callback so it can sit under a to-do on either TodosPage or the
// project sheet's checklist without either one re-implementing add/edit/
// delete-by-id itself.
// ============================================================

import { useState } from "react";
import { Edit3, Trash2 } from "lucide-react";
import type { ClientNote } from "@/lib/types";

function formatNoteDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function TodoNotesThread({ notes, onChange }: {
  notes: ClientNote[];
  onChange: (next: ClientNote[]) => Promise<void> | void;
}) {
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");

  const addNote = async () => {
    const text = draft.trim();
    if (!text) return;
    const note: ClientNote = { id: `note_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, text, createdAt: new Date().toISOString() };
    await onChange([note, ...notes]);
    setDraft("");
  };
  const saveEdit = async (id: string) => {
    const text = editingText.trim();
    if (!text) return;
    await onChange(notes.map(n => n.id === id ? { ...n, text } : n));
    setEditingId(null);
    setEditingText("");
  };
  const removeNote = async (id: string) => {
    await onChange(notes.filter(n => n.id !== id));
  };

  return (
    <div className="space-y-1.5" onClick={(e) => e.stopPropagation()}>
      {notes.map(n => (
        <div key={n.id} className="bg-secondary/50 rounded-md px-3 py-2 text-xs">
          {editingId === n.id ? (
            <div className="space-y-2">
              <textarea
                value={editingText}
                onChange={e => setEditingText(e.target.value)}
                className="w-full bg-background border border-border rounded-md px-2.5 py-1.5 text-xs text-foreground resize-none"
                rows={2}
                autoFocus
              />
              <div className="flex gap-2 justify-end">
                <button type="button" onClick={() => { setEditingId(null); setEditingText(""); }} className="text-[11px] px-2 py-1 text-muted-foreground hover:text-foreground">Cancel</button>
                <button type="button" onClick={() => saveEdit(n.id)} disabled={!editingText.trim()} className="text-[11px] px-2.5 py-1 bg-primary text-primary-foreground rounded font-semibold disabled:opacity-50">Save</button>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-1">
              <div className="flex-1 min-w-0">
                <p className="text-foreground whitespace-pre-wrap">{n.text}</p>
                <p className="text-[10px] text-muted-foreground/70 mt-0.5">{formatNoteDate(n.createdAt)}</p>
              </div>
              <button type="button" onClick={() => { setEditingId(n.id); setEditingText(n.text); }} className="shrink-0 p-1.5 -m-0.5 rounded text-muted-foreground hover:text-primary hover:bg-muted" aria-label="Edit note"><Edit3 className="w-3.5 h-3.5" /></button>
              <button type="button" onClick={() => removeNote(n.id)} className="shrink-0 p-1.5 -m-0.5 rounded text-muted-foreground hover:text-destructive hover:bg-muted" aria-label="Delete note"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          )}
        </div>
      ))}
      <div className="flex gap-2">
        <textarea
          value={draft}
          onChange={e => setDraft(e.target.value)}
          placeholder="Add a note…"
          className="flex-1 min-w-0 bg-secondary/50 border border-border rounded-md px-3 py-2 text-xs text-foreground resize-none"
          rows={2}
        />
        <button type="button" onClick={addNote} disabled={!draft.trim()} className="shrink-0 self-start px-3 py-2 bg-primary text-primary-foreground rounded-md text-xs font-semibold disabled:opacity-50">Add</button>
      </div>
    </div>
  );
}
