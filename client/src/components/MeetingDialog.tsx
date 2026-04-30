// ============================================================
// MeetingDialog — Create / edit a lightweight unpaid meeting.
// Optionally tied to a client; per-meeting toggle controls whether
// the assigned client sees it on their calendar.
// ============================================================

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useApp } from "@/contexts/AppContext";
import type { Meeting } from "@/lib/types";
import { Trash2, Eye } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// Color palette for meeting chips on the calendar. Empty string = default
// slate. Same swatch shape as PersonalEventDialog so it feels consistent.
export const MEETING_COLORS = [
  { value: "", label: "Slate", bg: "bg-slate-500/25", text: "text-slate-700 dark:text-slate-300", border: "border-slate-500/30", dot: "bg-slate-400" },
  { value: "blue", label: "Blue", bg: "bg-sky-500/25", text: "text-sky-700 dark:text-sky-300", border: "border-sky-500/30", dot: "bg-sky-400" },
  { value: "green", label: "Green", bg: "bg-emerald-500/25", text: "text-emerald-700 dark:text-emerald-300", border: "border-emerald-500/30", dot: "bg-emerald-400" },
  { value: "purple", label: "Purple", bg: "bg-violet-500/25", text: "text-violet-700 dark:text-violet-300", border: "border-violet-500/30", dot: "bg-violet-400" },
  { value: "amber", label: "Amber", bg: "bg-amber-500/25", text: "text-amber-700 dark:text-amber-300", border: "border-amber-500/30", dot: "bg-amber-400" },
  { value: "pink", label: "Pink", bg: "bg-pink-500/25", text: "text-pink-700 dark:text-pink-300", border: "border-pink-500/30", dot: "bg-pink-400" },
  { value: "rose", label: "Rose", bg: "bg-rose-500/25", text: "text-rose-700 dark:text-rose-300", border: "border-rose-500/30", dot: "bg-rose-400" },
  { value: "cyan", label: "Cyan", bg: "bg-cyan-500/25", text: "text-cyan-700 dark:text-cyan-300", border: "border-cyan-500/30", dot: "bg-cyan-400" },
];

export function getMeetingColor(value: string) {
  return MEETING_COLORS.find(c => c.value === value) || MEETING_COLORS[0];
}

interface Props {
  open: boolean;
  onClose: () => void;
  initialDate?: string | null;
  editing?: Meeting | null;
}

export default function MeetingDialog({ open, onClose, initialDate, editing }: Props) {
  const { data, addMeeting, updateMeeting, deleteMeeting } = useApp();

  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [clientId, setClientId] = useState<string>("none");
  const [locationText, setLocationText] = useState("");
  const [notes, setNotes] = useState("");
  const [visibleToClient, setVisibleToClient] = useState(false);
  const [color, setColor] = useState("");
  const [saving, setSaving] = useState(false);

  // Reset form on open transition only — never on prop changes mid-edit
  // (Realtime updates would otherwise stomp the user's typing).
  useEffect(() => {
    if (!open) return;
    if (editing) {
      setTitle(editing.title);
      setDate(editing.date);
      setStartTime(editing.startTime || "");
      setEndTime(editing.endTime || "");
      setClientId(editing.clientId || "none");
      setLocationText(editing.locationText || "");
      setNotes(editing.notes || "");
      setVisibleToClient(editing.visibleToClient);
      setColor(editing.color || "");
    } else {
      setTitle("");
      setDate(initialDate || new Date().toISOString().slice(0, 10));
      setStartTime("");
      setEndTime("");
      setClientId("none");
      setLocationText("");
      setNotes("");
      setVisibleToClient(false);
      setColor("");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleSave = async () => {
    if (!title.trim()) { toast.error("Title required"); return; }
    if (!date) { toast.error("Date required"); return; }
    setSaving(true);
    try {
      const payload = {
        title: title.trim(),
        date,
        startTime,
        endTime,
        clientId: clientId === "none" ? null : clientId,
        locationText: locationText.trim(),
        notes: notes.trim(),
        visibleToClient: clientId !== "none" && visibleToClient,
        color,
      };
      if (editing) {
        await updateMeeting(editing.id, payload);
        toast.success("Meeting updated");
      } else {
        await addMeeting(payload);
        toast.success("Meeting created");
      }
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Failed to save meeting");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!editing) return;
    if (!confirm(`Delete meeting "${editing.title}"?`)) return;
    setSaving(true);
    try {
      await deleteMeeting(editing.id);
      toast.success("Meeting deleted");
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete");
    } finally {
      setSaving(false);
    }
  };

  const hasClient = clientId !== "none";

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="bg-card border-border text-foreground max-w-lg max-h-[95dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            {editing ? "Edit Meeting" : "New Meeting"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Title</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Discovery call — Acme Co" className="bg-secondary border-border" />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1.5 col-span-3 sm:col-span-1">
              <Label className="text-xs text-muted-foreground">Date</Label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="bg-secondary border-border" />
            </div>
            <div className="space-y-1.5 col-span-3 sm:col-span-1">
              <Label className="text-xs text-muted-foreground">Start</Label>
              <Input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className="bg-secondary border-border" />
            </div>
            <div className="space-y-1.5 col-span-3 sm:col-span-1">
              <Label className="text-xs text-muted-foreground">End</Label>
              <Input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className="bg-secondary border-border" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Client (optional)</Label>
            <Select value={clientId} onValueChange={(v) => { setClientId(v); if (v === "none") setVisibleToClient(false); }}>
              <SelectTrigger className="bg-secondary border-border">
                <SelectValue placeholder="No client" />
              </SelectTrigger>
              <SelectContent className="bg-popover border-border">
                <SelectItem value="none">No client (internal)</SelectItem>
                {data.clients.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.company}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {hasClient && (
            <div className="flex items-start justify-between gap-3 rounded-lg border border-border bg-secondary/40 px-3 py-2.5">
              <div className="flex items-start gap-2">
                <Eye className="w-4 h-4 text-muted-foreground mt-0.5" />
                <div className="space-y-0.5">
                  <p className="text-sm font-medium text-foreground">Show on client's calendar</p>
                  <p className="text-xs text-muted-foreground">When on, the assigned client sees this meeting on their calendar. Off keeps it internal.</p>
                </div>
              </div>
              <Switch checked={visibleToClient} onCheckedChange={setVisibleToClient} />
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Location (optional)</Label>
            <Input value={locationText} onChange={e => setLocationText(e.target.value)} placeholder="Zoom, office, address, etc." className="bg-secondary border-border" />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Notes (optional)</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Agenda, attendees, anything to remember" rows={3} className="bg-secondary border-border" />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Calendar color</Label>
            <div className="flex flex-wrap gap-2">
              {MEETING_COLORS.map(c => (
                <button
                  key={c.value || "default"}
                  type="button"
                  onClick={() => setColor(c.value)}
                  className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-xs transition-colors",
                    color === c.value ? "ring-2 ring-primary border-primary" : "border-border hover:bg-secondary"
                  )}
                  title={c.label}
                >
                  <span className={cn("w-3 h-3 rounded-full", c.dot)} />
                  <span>{c.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter className="flex-row justify-between sm:justify-between">
          <div>
            {editing && (
              <Button type="button" variant="ghost" onClick={handleDelete} disabled={saving} className="text-destructive hover:text-destructive">
                <Trash2 className="w-4 h-4 mr-1.5" /> Delete
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "Saving…" : editing ? "Save" : "Create"}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
