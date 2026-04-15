// ============================================================
// PersonalEventDialog — Create / Edit personal calendar events
// ============================================================

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useApp } from "@/contexts/AppContext";
import type { PersonalEvent } from "@/lib/types";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { AlertTriangle, Trash2 } from "lucide-react";

const EVENT_COLORS = [
  { value: "", label: "Default", bg: "bg-rose-500/25", text: "text-rose-700 dark:text-rose-300", dot: "bg-rose-400" },
  { value: "blue", label: "Blue", bg: "bg-sky-500/25", text: "text-sky-700 dark:text-sky-300", dot: "bg-sky-400" },
  { value: "green", label: "Green", bg: "bg-emerald-500/25", text: "text-emerald-700 dark:text-emerald-300", dot: "bg-emerald-400" },
  { value: "purple", label: "Purple", bg: "bg-violet-500/25", text: "text-violet-700 dark:text-violet-300", dot: "bg-violet-400" },
  { value: "amber", label: "Amber", bg: "bg-amber-500/25", text: "text-amber-700 dark:text-amber-300", dot: "bg-amber-400" },
  { value: "pink", label: "Pink", bg: "bg-pink-500/25", text: "text-pink-700 dark:text-pink-300", dot: "bg-pink-400" },
  { value: "cyan", label: "Cyan", bg: "bg-cyan-500/25", text: "text-cyan-700 dark:text-cyan-300", dot: "bg-cyan-400" },
  { value: "orange", label: "Orange", bg: "bg-orange-500/25", text: "text-orange-700 dark:text-orange-300", dot: "bg-orange-400" },
];

const TEMPLATES = [
  { label: "Custom", title: "", category: "personal", color: "" },
  { label: "Dentist", title: "Dentist Appointment", category: "appointment", color: "blue" },
  { label: "Doctor", title: "Doctor Appointment", category: "appointment", color: "blue" },
  { label: "Date Night", title: "Date Night", category: "personal", color: "pink" },
  { label: "Family Event", title: "Family Event", category: "personal", color: "purple" },
  { label: "Kids Event", title: "Kids Event", category: "personal", color: "green" },
  { label: "Meeting", title: "Meeting", category: "appointment", color: "amber" },
  { label: "Reminder", title: "Reminder", category: "reminder", color: "orange" },
  { label: "Travel", title: "Travel", category: "personal", color: "cyan" },
  { label: "Birthday", title: "Birthday", category: "personal", color: "pink" },
];

export function getEventColor(color: string) {
  return EVENT_COLORS.find(c => c.value === color) || EVENT_COLORS[0];
}

interface Props {
  open: boolean;
  onClose: () => void;
  defaultDate?: string;
  editEvent?: PersonalEvent | null;
}

export default function PersonalEventDialog({ open, onClose, defaultDate, editEvent }: Props) {
  const { addPersonalEvent, updatePersonalEvent, deletePersonalEvent } = useApp();
  const isEdit = !!editEvent;

  const [form, setForm] = useState({
    title: "",
    date: defaultDate || "",
    startTime: "",
    endTime: "",
    allDay: true,
    location: "",
    notes: "",
    category: "personal",
    color: "",
    priority: false,
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editEvent) {
      setForm({
        title: editEvent.title,
        date: editEvent.date,
        startTime: editEvent.startTime,
        endTime: editEvent.endTime,
        allDay: editEvent.allDay,
        location: editEvent.location,
        notes: editEvent.notes,
        category: editEvent.category,
        color: editEvent.color,
        priority: editEvent.priority,
      });
    } else {
      setForm({
        title: "",
        date: defaultDate || "",
        startTime: "",
        endTime: "",
        allDay: true,
        location: "",
        notes: "",
        category: "personal",
        color: "",
        priority: false,
      });
    }
  }, [open, editEvent, defaultDate]);

  function applyTemplate(idx: number) {
    const t = TEMPLATES[idx];
    if (idx === 0) return; // Custom — don't overwrite
    setForm(f => ({ ...f, title: t.title, category: t.category, color: t.color }));
  }

  async function handleSubmit() {
    if (!form.title.trim()) {
      toast.error("Title is required");
      return;
    }
    if (!form.date) {
      toast.error("Date is required");
      return;
    }
    setSubmitting(true);
    try {
      if (isEdit && editEvent) {
        await updatePersonalEvent(editEvent.id, {
          title: form.title,
          date: form.date,
          startTime: form.allDay ? "" : form.startTime,
          endTime: form.allDay ? "" : form.endTime,
          allDay: form.allDay,
          location: form.location,
          notes: form.notes,
          category: form.category,
          color: form.color,
          priority: form.priority,
        });
        toast.success("Event updated");
      } else {
        await addPersonalEvent({
          title: form.title,
          date: form.date,
          startTime: form.allDay ? "" : form.startTime,
          endTime: form.allDay ? "" : form.endTime,
          allDay: form.allDay,
          location: form.location,
          notes: form.notes,
          category: form.category,
          color: form.color,
          priority: form.priority,
          orgId: "",
        });
        toast.success("Event created");
      }
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Failed to save event");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!editEvent) return;
    setSubmitting(true);
    try {
      await deletePersonalEvent(editEvent.id);
      toast.success("Event deleted");
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete event");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            {isEdit ? "Edit Event" : "New Personal Event"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Templates */}
          {!isEdit && (
            <div>
              <Label className="text-xs text-muted-foreground uppercase tracking-wider">Template</Label>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {TEMPLATES.map((t, i) => (
                  <button
                    key={t.label}
                    onClick={() => applyTemplate(i)}
                    className={cn(
                      "px-2.5 py-1 rounded text-xs font-medium transition-colors border",
                      i === 0
                        ? "border-border text-muted-foreground hover:text-foreground hover:bg-white/5"
                        : "border-border text-muted-foreground hover:text-foreground hover:bg-white/5"
                    )}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Title */}
          <div>
            <Label htmlFor="pe-title">Title</Label>
            <Input
              id="pe-title"
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="What's happening?"
              autoFocus
            />
          </div>

          {/* Date */}
          <div>
            <Label htmlFor="pe-date">Date</Label>
            <Input
              id="pe-date"
              type="date"
              value={form.date}
              onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
            />
          </div>

          {/* All Day toggle + times */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.allDay}
                onChange={e => setForm(f => ({ ...f, allDay: e.target.checked }))}
                className="rounded border-border"
              />
              <span className="text-sm text-foreground">All day</span>
            </label>
            {!form.allDay && (
              <div className="flex gap-3">
                <div className="flex-1">
                  <Label htmlFor="pe-start">Start</Label>
                  <Input
                    id="pe-start"
                    type="time"
                    value={form.startTime}
                    onChange={e => setForm(f => ({ ...f, startTime: e.target.value }))}
                  />
                </div>
                <div className="flex-1">
                  <Label htmlFor="pe-end">End</Label>
                  <Input
                    id="pe-end"
                    type="time"
                    value={form.endTime}
                    onChange={e => setForm(f => ({ ...f, endTime: e.target.value }))}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Location */}
          <div>
            <Label htmlFor="pe-location">Location</Label>
            <Input
              id="pe-location"
              value={form.location}
              onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
              placeholder="Optional"
            />
          </div>

          {/* Color */}
          <div>
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">Color</Label>
            <div className="flex gap-2 mt-1.5">
              {EVENT_COLORS.map(c => (
                <button
                  key={c.value}
                  onClick={() => setForm(f => ({ ...f, color: c.value }))}
                  className={cn(
                    "w-7 h-7 rounded-full flex items-center justify-center transition-all",
                    c.dot,
                    form.color === c.value ? "ring-2 ring-white ring-offset-2 ring-offset-background scale-110" : "opacity-60 hover:opacity-100"
                  )}
                  title={c.label}
                />
              ))}
            </div>
          </div>

          {/* Priority */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.priority}
              onChange={e => setForm(f => ({ ...f, priority: e.target.checked }))}
              className="rounded border-border"
            />
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            <span className="text-sm text-foreground">High Priority</span>
          </label>

          {/* Notes */}
          <div>
            <Label htmlFor="pe-notes">Notes</Label>
            <Textarea
              id="pe-notes"
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="Optional"
              rows={2}
            />
          </div>
        </div>

        <DialogFooter className="flex justify-between">
          {isEdit && (
            <Button variant="destructive" size="sm" onClick={handleDelete} disabled={submitting}>
              <Trash2 className="w-4 h-4 mr-1" />
              Delete
            </Button>
          )}
          <div className="flex gap-2 ml-auto">
            <Button variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {isEdit ? "Save Changes" : "Create Event"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
