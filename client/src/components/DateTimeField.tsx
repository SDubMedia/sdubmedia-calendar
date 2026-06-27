// Reusable form fields that replace native <input type="date"> / <input type="time">.
// Native date/time inputs ignore width on iOS WebKit and overflow their card
// (see CLAUDE.md — we've been burned by this repeatedly). DateField uses a
// compact popover month grid; TimeField is a styled <select> of 15-minute
// options. Both are width-safe on iOS. Values are plain strings:
// DateField → "YYYY-MM-DD", TimeField → "HH:MM" (24h).

import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";
import { buildMonthGrid, isoDate, addMonths, formatMonthYear } from "@/lib/dates";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

function parseLocal(value: string): Date | null {
  const [y, m, d] = (value || "").split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function shortLabel(value: string): string {
  const d = parseLocal(value);
  return d ? d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "";
}

interface DateFieldProps {
  value: string; // YYYY-MM-DD or ""
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
  id?: string;
  disabled?: boolean;
}

export function DateField({ value, onChange, className, placeholder = "Pick a date", id, disabled }: DateFieldProps) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<Date>(() => parseLocal(value) ?? new Date());
  const today = isoDate(new Date());
  const cells = buildMonthGrid(anchor);

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) setAnchor(parseLocal(value) ?? new Date()); }}>
      <PopoverTrigger asChild>
        <button
          type="button"
          id={id}
          disabled={disabled}
          className={cn(
            "flex h-9 w-full min-w-0 items-center gap-2 rounded-md border border-border bg-secondary px-3 text-left text-sm disabled:cursor-not-allowed disabled:opacity-50",
            !value && "text-muted-foreground",
            className
          )}
        >
          <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="truncate">{value ? shortLabel(value) : placeholder}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="pointer-events-auto w-auto p-3" align="start">
        <div className="mb-2 flex items-center justify-between">
          <button type="button" onClick={() => setAnchor(a => addMonths(a, -1))} className="rounded p-1 hover:bg-muted" aria-label="Previous month">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-medium">{formatMonthYear(anchor)}</span>
          <button type="button" onClick={() => setAnchor(a => addMonths(a, 1))} className="rounded p-1 hover:bg-muted" aria-label="Next month">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <div className="mb-1 grid grid-cols-7 gap-1 text-center">
          {WEEKDAYS.map((d, i) => (
            <div key={i} className="text-[10px] uppercase tracking-wide text-muted-foreground">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((cell, idx) => {
            const iso = isoDate(cell);
            const inMonth = cell.getMonth() === anchor.getMonth();
            const isToday = iso === today;
            const isSelected = iso === value;
            return (
              <button
                key={idx}
                type="button"
                onClick={() => { onChange(iso); setOpen(false); }}
                className={cn(
                  "h-8 w-8 rounded-md text-xs transition-colors",
                  inMonth ? "text-foreground hover:bg-muted" : "text-muted-foreground/50 hover:bg-muted",
                  isToday && !isSelected && "ring-1 ring-foreground/40",
                  isSelected && "bg-primary text-primary-foreground hover:bg-primary",
                )}
              >
                {cell.getDate()}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ---- TimeField ----

function fmtTime12(t: string): string {
  const [hStr, m] = (t || "").split(":");
  const h = Number(hStr);
  if (Number.isNaN(h)) return t || "";
  return `${h % 12 === 0 ? 12 : h % 12}:${m ?? "00"} ${h >= 12 ? "PM" : "AM"}`;
}
const TIME_OPTIONS = Array.from({ length: (24 * 60) / 15 }, (_, i) => {
  const mins = i * 15;
  const value = `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
  return { value, label: fmtTime12(value) };
});

interface TimeFieldProps {
  value: string; // HH:MM (24h) or ""
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
  id?: string;
  disabled?: boolean;
}

export function TimeField({ value, onChange, className, placeholder = "Time", id, disabled }: TimeFieldProps) {
  // Include an off-grid current value (e.g. 09:05) so it still shows.
  const options = !value || TIME_OPTIONS.some(o => o.value === value)
    ? TIME_OPTIONS
    : [{ value, label: fmtTime12(value) }, ...TIME_OPTIONS];
  return (
    <select
      id={id}
      value={value}
      disabled={disabled}
      onChange={e => onChange(e.target.value)}
      className={cn(
        "h-9 w-full min-w-0 rounded-md border border-border bg-secondary px-3 text-sm text-foreground disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
    >
      <option value="">{placeholder}</option>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}
