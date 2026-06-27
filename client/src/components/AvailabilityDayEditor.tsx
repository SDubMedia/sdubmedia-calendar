// ============================================================
// AvailabilityDayEditor — tap a person in the calendar's "Available this day"
// list to edit/delete their availability for that day without leaving the
// calendar. Shows the entries that apply to the date (recurring weekday +
// one-off); each can be retimed, set all-day, or removed. Recurring entries are
// labelled so it's clear a change hits every week.
// ============================================================

import { useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Trash2, Repeat, CalendarDays, Check } from "lucide-react";
import { useScopedData as useApp } from "@/hooks/useScopedData";
import { useConfirm } from "@/components/ConfirmProvider";
import { weekdayOf } from "@/lib/data";
import { toast } from "sonner";

function formatTime(t: string): string {
  const [hStr, m] = (t || "").split(":");
  const h = Number(hStr);
  if (Number.isNaN(h)) return t || "";
  return `${h % 12 === 0 ? 12 : h % 12}:${m ?? "00"} ${h >= 12 ? "PM" : "AM"}`;
}
const TIME_OPTIONS = Array.from({ length: (24 * 60) / 15 }, (_, i) => {
  const mins = i * 15;
  const value = `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
  return { value, label: formatTime(value) };
});
function fmtDate(iso: string): string {
  if (!iso) return "";
  const [y, mo, d] = iso.split("-").map(Number);
  return new Date(y, (mo || 1) - 1, d || 1).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
}

interface Props {
  open: boolean;
  onClose: () => void;
  crewMemberId: string;
  crewMemberName: string;
  date: string;
}

export default function AvailabilityDayEditor({ open, onClose, crewMemberId, crewMemberName, date }: Props) {
  const { data, updateAvailability, deleteAvailability } = useApp();
  const confirm = useConfirm();

  const entries = useMemo(() => {
    if (!date || !crewMemberId) return [];
    const wd = weekdayOf(date);
    return data.availability
      .filter(a => a.crewMemberId === crewMemberId && (a.recurring ? a.weekday === wd : a.specificDate === date))
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
  }, [data.availability, crewMemberId, date]);

  const patch = async (id: string, p: Parameters<typeof updateAvailability>[1]) => {
    try { await updateAvailability(id, p); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't update"); }
  };
  const remove = async (id: string) => {
    if (!(await confirm({ title: "Remove this availability?", destructive: true, confirmLabel: "Remove" }))) return;
    try { await deleteAvailability(id); toast.success("Removed"); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't remove"); }
  };

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="bg-card border-border text-foreground max-w-md">
        <DialogHeader>
          <DialogTitle style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{crewMemberName}</DialogTitle>
          <p className="text-xs text-muted-foreground">{fmtDate(date)}</p>
        </DialogHeader>

        <div className="space-y-3">
          {entries.length === 0 && <p className="text-sm text-muted-foreground">No availability set for this day.</p>}
          {entries.map(a => (
            <div key={a.id} className="rounded-lg border border-border p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                  {a.recurring ? <><Repeat className="w-3 h-3" /> Repeats weekly</> : <><CalendarDays className="w-3 h-3" /> One-time</>}
                </span>
                <button onClick={() => remove(a.id)} className="text-destructive hover:text-destructive/80"><Trash2 className="w-4 h-4" /></button>
              </div>

              <button
                type="button"
                onClick={() => patch(a.id, { allDay: !a.allDay })}
                className={`w-full flex items-center justify-between h-9 rounded-md border px-3 text-sm transition-colors ${a.allDay ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}
              >
                <span>Available all day</span>
                <span className={`w-4 h-4 rounded flex items-center justify-center ${a.allDay ? "bg-primary text-primary-foreground" : "border border-border"}`}>{a.allDay && <Check className="w-3 h-3" />}</span>
              </button>

              {!a.allDay && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="min-w-0">
                    <Label className="text-xs text-muted-foreground">From</Label>
                    <select value={a.startTime} onChange={e => patch(a.id, { startTime: e.target.value })} className="mt-1 w-full h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground">
                      {TIME_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>
                  <div className="min-w-0">
                    <Label className="text-xs text-muted-foreground">To</Label>
                    <select value={a.endTime} onChange={e => patch(a.id, { endTime: e.target.value })} className="mt-1 w-full h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground">
                      {TIME_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>
                </div>
              )}
            </div>
          ))}
          {entries.some(a => a.recurring) && (
            <p className="text-[11px] text-muted-foreground">Recurring changes affect every week. Add new openings from the Availability page.</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
