// ============================================================
// AvailabilityPage — when each shooter is open to be booked.
// Owner sets/edits availability for anyone; staff manage only their own.
// Each block is either recurring (weekday, repeats weekly) or a one-off
// (specific date). Feeds the agent "request a shoot" open-slot picker.
// Design: Dark Cinematic Studio
// ============================================================

import { useMemo, useState } from "react";
import { CalendarClock, Plus, Trash2, Repeat, CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useScopedData as useApp } from "@/hooks/useScopedData";
import { useAuth } from "@/contexts/AuthContext";
import type { Availability } from "@/lib/types";
import { toast } from "sonner";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function formatTime(t: string): string {
  // "09:00" -> "9:00 AM"
  const [hStr, m] = (t || "").split(":");
  const h = Number(hStr);
  if (Number.isNaN(h)) return t || "";
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m ?? "00"} ${ampm}`;
}

function formatDate(iso: string): string {
  if (!iso) return "";
  const [y, mo, d] = iso.split("-").map(Number);
  const dt = new Date(y, (mo || 1) - 1, d || 1);
  return dt.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

export default function AvailabilityPage() {
  const { data, addAvailability, deleteAvailability } = useApp();
  const { effectiveProfile } = useAuth();
  const isOwner = effectiveProfile?.role === "owner";
  const myCrewId = effectiveProfile?.crewMemberId || "";

  // Who we're editing. Owner can pick anyone; staff are locked to themselves.
  const crewMembers = data.crewMembers;
  const defaultPerson = isOwner ? (myCrewId || crewMembers[0]?.id || "") : myCrewId;
  const [personId, setPersonId] = useState(defaultPerson);

  // Add-block form
  const [recurring, setRecurring] = useState(true);
  const [weekday, setWeekday] = useState(1); // Monday
  const [specificDate, setSpecificDate] = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("17:00");
  const [saving, setSaving] = useState(false);

  const personBlocks = useMemo(
    () => data.availability.filter(a => a.crewMemberId === personId),
    [data.availability, personId]
  );
  const recurringBlocks = useMemo(
    () => personBlocks.filter(a => a.recurring).sort((a, b) => (a.weekday ?? 0) - (b.weekday ?? 0) || a.startTime.localeCompare(b.startTime)),
    [personBlocks]
  );
  const oneOffBlocks = useMemo(
    () => personBlocks.filter(a => !a.recurring).sort((a, b) => (a.specificDate ?? "").localeCompare(b.specificDate ?? "")),
    [personBlocks]
  );

  const personName = crewMembers.find(c => c.id === personId)?.name ?? "this person";

  const handleAdd = async () => {
    if (!personId) { toast.error("Pick a person first"); return; }
    if (!recurring && !specificDate) { toast.error("Pick a date for a one-time opening"); return; }
    if (endTime <= startTime) { toast.error("End time must be after start time"); return; }
    setSaving(true);
    try {
      await addAvailability({
        crewMemberId: personId,
        recurring,
        weekday: recurring ? weekday : null,
        specificDate: recurring ? null : specificDate,
        startTime,
        endTime,
      });
      toast.success("Availability added");
      setSpecificDate("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save availability");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (a: Availability) => {
    try {
      await deleteAvailability(a.id);
      toast.success("Removed");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't remove");
    }
  };

  // Staff with no linked crew member can't manage availability.
  if (!isOwner && !myCrewId) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-6 text-center">
        <CalendarClock className="w-12 h-12 mb-3 opacity-30" />
        <p className="text-sm max-w-xs">Your account isn't linked to a crew profile yet, so there's no availability to set. Ask the owner to link you.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card/50 flex-wrap gap-2">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Availability</h1>
          <p className="text-sm text-muted-foreground mt-0.5">When you're open to be booked.</p>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 sm:p-6 max-w-2xl w-full mx-auto">
        {/* Person picker — owner only */}
        {isOwner && crewMembers.length > 0 && (
          <div className="mb-5">
            <Label className="text-xs text-muted-foreground">Whose availability</Label>
            <select
              value={personId}
              onChange={e => setPersonId(e.target.value)}
              className="mt-1 w-full h-10 rounded-md border border-border bg-background px-3 text-sm text-foreground"
            >
              {crewMembers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        )}

        {/* Add a block */}
        <div className="bg-card border border-border rounded-lg p-4 mb-6">
          <div className="text-sm font-medium text-foreground mb-3">Add an opening</div>

          {/* Repeat vs one-time */}
          <div className="flex gap-2 mb-3">
            <button
              type="button"
              onClick={() => setRecurring(true)}
              className={`flex-1 flex items-center justify-center gap-1.5 h-10 rounded-md border text-sm transition-colors ${recurring ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}
            >
              <Repeat className="w-3.5 h-3.5" /> Repeat weekly
            </button>
            <button
              type="button"
              onClick={() => setRecurring(false)}
              className={`flex-1 flex items-center justify-center gap-1.5 h-10 rounded-md border text-sm transition-colors ${!recurring ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}
            >
              <CalendarDays className="w-3.5 h-3.5" /> One time
            </button>
          </div>

          {/* Day or date */}
          {recurring ? (
            <div className="mb-3">
              <Label className="text-xs text-muted-foreground">Day of week</Label>
              <select
                value={weekday}
                onChange={e => setWeekday(Number(e.target.value))}
                className="mt-1 w-full h-10 rounded-md border border-border bg-background px-3 text-sm text-foreground"
              >
                {WEEKDAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
              </select>
            </div>
          ) : (
            <div className="mb-3">
              <Label className="text-xs text-muted-foreground">Date</Label>
              <Input type="date" value={specificDate} onChange={e => setSpecificDate(e.target.value)} className="mt-1" />
            </div>
          )}

          {/* Times */}
          <div className="flex gap-3 mb-4">
            <div className="flex-1 min-w-0">
              <Label className="text-xs text-muted-foreground">From</Label>
              <Input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className="mt-1" />
            </div>
            <div className="flex-1 min-w-0">
              <Label className="text-xs text-muted-foreground">To</Label>
              <Input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className="mt-1" />
            </div>
          </div>

          <Button onClick={handleAdd} disabled={saving || !personId} className="w-full gap-2 bg-primary text-primary-foreground hover:bg-primary/90">
            <Plus className="w-4 h-4" /> Add opening
          </Button>
        </div>

        {/* Existing blocks */}
        {personBlocks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <CalendarClock className="w-10 h-10 mb-3 opacity-30" />
            <p className="text-sm">No availability set for {personName} yet.</p>
          </div>
        ) : (
          <div className="space-y-5">
            {recurringBlocks.length > 0 && (
              <div>
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5"><Repeat className="w-3 h-3" /> Weekly</div>
                <div className="space-y-2">
                  {recurringBlocks.map(a => (
                    <div key={a.id} className="bg-card border border-border rounded-lg p-3 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-foreground">{WEEKDAYS[a.weekday ?? 0]}</div>
                        <div className="text-xs text-muted-foreground">{formatTime(a.startTime)} – {formatTime(a.endTime)}</div>
                      </div>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive flex-shrink-0" onClick={() => handleDelete(a)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {oneOffBlocks.length > 0 && (
              <div>
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5"><CalendarDays className="w-3 h-3" /> One-time</div>
                <div className="space-y-2">
                  {oneOffBlocks.map(a => (
                    <div key={a.id} className="bg-card border border-border rounded-lg p-3 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-foreground">{formatDate(a.specificDate ?? "")}</div>
                        <div className="text-xs text-muted-foreground">{formatTime(a.startTime)} – {formatTime(a.endTime)}</div>
                      </div>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive flex-shrink-0" onClick={() => handleDelete(a)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
