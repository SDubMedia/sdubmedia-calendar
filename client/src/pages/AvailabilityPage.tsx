// ============================================================
// AvailabilityPage — when each shooter is open to be booked.
// Owner sets/edits availability for anyone; staff manage only their own.
// Each block is either recurring (weekday, repeats weekly) or a one-off
// (specific date). Feeds the agent "request a shoot" open-slot picker.
// Design: Dark Cinematic Studio
// ============================================================

import { useEffect, useMemo, useState } from "react";
import { CalendarClock, Plus, Trash2, Repeat, CalendarDays, Check, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { useScopedData as useApp } from "@/hooks/useScopedData";
import { useAuth } from "@/contexts/AuthContext";
import type { Availability } from "@/lib/types";
import { toast } from "sonner";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const WEEKDAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatTime(t: string): string {
  // "09:00" -> "9:00 AM"
  const [hStr, m] = (t || "").split(":");
  const h = Number(hStr);
  if (Number.isNaN(h)) return t || "";
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m ?? "00"} ${ampm}`;
}

// 15-minute time options as styled <select> values — a native <input type="time">
// overflows its box on iOS WebKit; a select fits full-width like every other
// field in this form.
const TIME_OPTIONS = Array.from({ length: (24 * 60) / 15 }, (_, i) => {
  const mins = i * 15;
  const value = `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
  return { value, label: formatTime(value) };
});

function formatDate(iso: string): string {
  if (!iso) return "";
  const [y, mo, d] = iso.split("-").map(Number);
  const dt = new Date(y, (mo || 1) - 1, d || 1);
  return dt.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

// Local yyyy-mm-dd (avoids the UTC shift that toISOString() introduces).
function toIsoLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function AvailabilityPage() {
  const { data, addAvailability, deleteAvailability, upsertShooterPref } = useApp();
  const { effectiveProfile } = useAuth();
  const isOwner = effectiveProfile?.role === "owner";
  const myCrewId = effectiveProfile?.crewMemberId || "";

  // Who we're editing. Owner can pick anyone; staff are locked to themselves.
  const crewMembers = data.crewMembers;
  const defaultPerson = isOwner ? (myCrewId || crewMembers[0]?.id || "") : myCrewId;
  const [personId, setPersonId] = useState(defaultPerson);

  // Add-block form
  const [recurring, setRecurring] = useState(true);
  const [weekdays, setWeekdays] = useState<number[]>([1]); // Monday; multiple allowed
  const toggleWeekday = (i: number) => setWeekdays(w => w.includes(i) ? w.filter(d => d !== i) : [...w, i].sort((a, b) => a - b));
  const [specificDates, setSpecificDates] = useState<Date[]>([]); // one-time: multiple dates, one time window
  const [allDay, setAllDay] = useState(false);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("17:00");
  const [saving, setSaving] = useState(false);

  // Per-person operating rules (shoot length / travel buffer / daily cap)
  const [shootMinutes, setShootMinutes] = useState(60);
  const [bufferMinutes, setBufferMinutes] = useState(30);
  const [maxPerDay, setMaxPerDay] = useState(0);
  const [fakeBusyMinutes, setFakeBusyMinutes] = useState(0);
  const [savingPref, setSavingPref] = useState(false);
  useEffect(() => {
    const p = data.shooterPrefs.find(x => x.crewMemberId === personId);
    setShootMinutes(p?.shootMinutes ?? 60);
    setBufferMinutes(p?.bufferMinutes ?? 30);
    setMaxPerDay(p?.maxPerDay ?? 0);
    setFakeBusyMinutes(p?.fakeBusyMinutes ?? 0);
  }, [personId, data.shooterPrefs]);

  const handleSavePrefs = async () => {
    if (!personId) return;
    setSavingPref(true);
    try {
      await upsertShooterPref({ crewMemberId: personId, shootMinutes, bufferMinutes, maxPerDay, fakeBusyMinutes });
      toast.success("Booking rules saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save rules");
    } finally {
      setSavingPref(false);
    }
  };

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
    if (recurring && weekdays.length === 0) { toast.error("Pick at least one day"); return; }
    if (!recurring && specificDates.length === 0) { toast.error("Pick at least one date"); return; }
    if (!allDay && endTime <= startTime) { toast.error("End time must be after start time"); return; }
    setSaving(true);
    try {
      if (recurring) {
        // One opening per selected day, same hours.
        for (const wd of weekdays) {
          await addAvailability({
            crewMemberId: personId,
            recurring: true,
            weekday: wd,
            specificDate: null,
            allDay,
            startTime,
            endTime,
          });
        }
        toast.success(weekdays.length > 1 ? `Added ${weekdays.length} days` : "Availability added");
      } else {
        // One opening per selected date, same hours.
        for (const d of specificDates) {
          await addAvailability({
            crewMemberId: personId,
            recurring: false,
            weekday: null,
            specificDate: toIsoLocal(d),
            allDay,
            startTime,
            endTime,
          });
        }
        toast.success(specificDates.length > 1 ? `Added ${specificDates.length} dates` : "Availability added");
        setSpecificDates([]);
      }
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

      <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 max-w-2xl w-full mx-auto">
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
        <div className="bg-card border border-border rounded-lg p-4 mb-6 overflow-hidden">
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
              <Label className="text-xs text-muted-foreground">Days of week</Label>
              <div className="mt-1 grid grid-cols-7 gap-1.5">
                {WEEKDAYS_SHORT.map((d, i) => {
                  const on = weekdays.includes(i);
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => toggleWeekday(i)}
                      className={`h-10 rounded-md border text-xs font-medium transition-colors ${on ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}
                    >
                      {d}
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] text-muted-foreground mt-1.5">Tap each day you're open — same hours apply to all of them.</p>
            </div>
          ) : (
            <div className="mb-3">
              <Label className="text-xs text-muted-foreground">Dates</Label>
              <div className="mt-1 rounded-md border border-border bg-background flex justify-center overflow-x-auto">
                <Calendar
                  mode="multiple"
                  selected={specificDates}
                  onSelect={(d) => setSpecificDates(d ?? [])}
                  disabled={{ before: new Date() }}
                />
              </div>
              <p className="text-[11px] text-muted-foreground mt-1.5">
                {specificDates.length > 0
                  ? `${specificDates.length} date${specificDates.length > 1 ? "s" : ""} selected — same hours apply to all.`
                  : "Tap each date you're open — same hours apply to all of them."}
              </p>
            </div>
          )}

          {/* All-day toggle */}
          <button
            type="button"
            onClick={() => setAllDay(v => !v)}
            className={`w-full flex items-center justify-between h-10 rounded-md border px-3 text-sm mb-3 transition-colors ${allDay ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}
          >
            <span>Available all day</span>
            <span className={`w-4 h-4 rounded flex items-center justify-center ${allDay ? "bg-primary text-primary-foreground" : "border border-border"}`}>{allDay && <Check className="w-3 h-3" />}</span>
          </button>

          {/* Times (hidden when all-day) — styled selects (a native time input
              overflows its box on iOS); same full-width fit as the other fields. */}
          {!allDay && (
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="min-w-0">
                <Label className="text-xs text-muted-foreground">From</Label>
                <select value={startTime} onChange={e => setStartTime(e.target.value)} className="mt-1 w-full h-10 rounded-md border border-border bg-background px-3 text-sm text-foreground">
                  {TIME_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div className="min-w-0">
                <Label className="text-xs text-muted-foreground">To</Label>
                <select value={endTime} onChange={e => setEndTime(e.target.value)} className="mt-1 w-full h-10 rounded-md border border-border bg-background px-3 text-sm text-foreground">
                  {TIME_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
            </div>
          )}

          <Button onClick={handleAdd} disabled={saving || !personId} className="w-full gap-2 bg-primary text-primary-foreground hover:bg-primary/90">
            <Plus className="w-4 h-4" /> Add opening
          </Button>
        </div>

        {/* How I operate — booking rules */}
        <div className="bg-card border border-border rounded-lg p-4 mb-6 overflow-hidden">
          <div className="text-sm font-medium text-foreground mb-1 flex items-center gap-1.5"><Settings2 className="w-3.5 h-3.5" /> How I operate</div>
          <p className="text-xs text-muted-foreground mb-3">Open times skip shoots already booked and respect these rules.</p>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div>
              <Label className="text-xs text-muted-foreground">Shoot length</Label>
              <div className="flex items-center gap-1 mt-1">
                <Input inputMode="decimal" value={String(shootMinutes)} onChange={e => setShootMinutes(Number(e.target.value.replace(/\D/g, "")) || 0)} className="text-center" />
                <span className="text-xs text-muted-foreground">min</span>
              </div>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Travel buffer</Label>
              <div className="flex items-center gap-1 mt-1">
                <Input inputMode="decimal" value={String(bufferMinutes)} onChange={e => setBufferMinutes(Number(e.target.value.replace(/\D/g, "")) || 0)} className="text-center" />
                <span className="text-xs text-muted-foreground">min</span>
              </div>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Max / day</Label>
              <Input inputMode="decimal" value={String(maxPerDay)} onChange={e => setMaxPerDay(Number(e.target.value.replace(/\D/g, "")) || 0)} className="text-center mt-1" />
            </div>
          </div>
          <div className="mb-3">
            <Label className="text-xs text-muted-foreground">Look busier to agents</Label>
            <select value={String(fakeBusyMinutes)} onChange={e => setFakeBusyMinutes(Number(e.target.value))} className="mt-1 w-full h-10 rounded-md border border-border bg-background px-3 text-sm text-foreground">
              <option value="0">Off — show all my open times</option>
              <option value="30">Block 30 minutes a day</option>
              <option value="60">Block 1 hour a day</option>
              <option value="90">Block 1.5 hours a day</option>
              <option value="120">Block 2 hours a day</option>
              <option value="180">Block 3 hours a day</option>
            </select>
            <p className="text-[11px] text-muted-foreground mt-1">Hides this much time each day in what agents see, so you look more in demand. Your real calendar isn't affected.</p>
          </div>
          <p className="text-[11px] text-muted-foreground mb-3">Travel buffer is held before and after each shoot. Max/day of 0 means no limit.</p>
          <Button variant="outline" onClick={handleSavePrefs} disabled={savingPref || !personId} className="w-full border-border">
            {savingPref ? "Saving…" : "Save rules"}
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
                        <div className="text-xs text-muted-foreground">{a.allDay ? "All day" : `${formatTime(a.startTime)} – ${formatTime(a.endTime)}`}</div>
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
                        <div className="text-xs text-muted-foreground">{a.allDay ? "All day" : `${formatTime(a.startTime)} – ${formatTime(a.endTime)}`}</div>
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
