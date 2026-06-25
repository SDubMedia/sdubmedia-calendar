// Canonical month calendar. Standardized across SDub apps:
//  • shows every date of the month in full Sun–Sat weeks
//  • swipe left/right (or arrows) to page month to month
//  • tap a day to list that day's items in a drawer below
//
// Pass `events` ({ id, date: "YYYY-MM-DD", title, color? }). Override the
// drawer row rendering with `renderEvent` for richer items. Do not hand-roll
// a calendar — use this so every app behaves identically.

import { useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  buildMonthGrid,
  isoDate,
  addMonths,
  formatMonthYear,
  formatDayLong,
} from "@/lib/dates";

export interface CalendarEvent {
  id: string;
  /** Local date, YYYY-MM-DD */
  date: string;
  title: string;
  /** Tailwind bg-* class for the dot, e.g. "bg-blue-500". Defaults to primary. */
  color?: string;
}

interface CalendarProps {
  events?: CalendarEvent[];
  /** Custom rendering for a single item in the day drawer. */
  renderEvent?: (event: CalendarEvent) => ReactNode;
  /** Fired when a day is selected (YYYY-MM-DD) or deselected (null). */
  onSelectDate?: (date: string | null) => void;
}

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
const WEEKDAYS_FULL = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DEFAULT_DOT = "bg-primary";

export function Calendar({
  events = [],
  renderEvent,
  onSelectDate,
}: CalendarProps) {
  const [anchor, setAnchor] = useState(() => new Date());
  const [selected, setSelected] = useState<string | null>(null);

  const cells = useMemo(() => buildMonthGrid(anchor), [anchor]);
  const byDate = useMemo(() => {
    const m = new Map<string, CalendarEvent[]>();
    for (const e of events) {
      const list = m.get(e.date) ?? [];
      list.push(e);
      m.set(e.date, list);
    }
    return m;
  }, [events]);

  const today = isoDate(new Date());

  function go(months: number) {
    setAnchor((a) => addMonths(a, months));
  }
  function select(date: string | null) {
    setSelected(date);
    onSelectDate?.(date);
  }

  // Pointer-based swipe with a tap guard: a horizontal drag > 50px pages the
  // month; `swiped` suppresses the day's click that fires after the drag.
  const swipeStart = useRef<{ x: number; y: number } | null>(null);
  const swiped = useRef(false);
  function onPointerDown(e: React.PointerEvent) {
    swipeStart.current = { x: e.clientX, y: e.clientY };
    swiped.current = false;
  }
  function onPointerUp(e: React.PointerEvent) {
    const s = swipeStart.current;
    swipeStart.current = null;
    if (!s) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (Math.abs(dx) < 50 || Math.abs(dy) > Math.abs(dx)) return;
    swiped.current = true;
    go(dx > 0 ? -1 : 1); // swipe right → previous, left → next
  }

  const selectedEvents = selected ? (byDate.get(selected) ?? []) : [];

  return (
    <div className="w-full min-w-0">
      <div className="mb-3 flex items-center justify-between">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => go(-1)}
          aria-label="Previous month"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="text-sm font-semibold">{formatMonthYear(anchor)}</div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => go(1)}
          aria-label="Next month"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="mb-1 grid grid-cols-7 gap-1 text-center">
        {WEEKDAYS.map((d, i) => (
          <div
            key={i}
            className="py-1 text-[10px] uppercase tracking-wide text-muted-foreground"
          >
            <span className="sm:hidden">{d}</span>
            <span className="hidden sm:inline">{WEEKDAYS_FULL[i]}</span>
          </div>
        ))}
      </div>

      {/* touch-pan-y keeps vertical page scroll working while we own horizontal swipes */}
      <div
        className="grid grid-cols-7 gap-1 touch-pan-y select-none"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          swipeStart.current = null;
        }}
      >
        {cells.map((cell, idx) => {
          const inMonth = cell.getMonth() === anchor.getMonth();
          const iso = isoDate(cell);
          const dayEvents = byDate.get(iso) ?? [];
          const isToday = iso === today;
          const isSelected = selected === iso;
          return (
            <button
              key={idx}
              onClick={() => {
                if (swiped.current) {
                  swiped.current = false;
                  return;
                }
                select(iso === selected ? null : iso);
              }}
              className={[
                "min-h-[64px] sm:min-h-[96px] min-w-0 rounded-md border p-1 text-left transition-colors",
                inMonth
                  ? "bg-background hover:bg-muted"
                  : "bg-muted/30 text-muted-foreground",
                isToday ? "ring-1 ring-foreground" : "",
                isSelected ? "border-2 border-foreground" : "",
              ].join(" ")}
            >
              <div className="text-xs font-medium">{cell.getDate()}</div>
              <div className="mt-1 space-y-0.5">
                {dayEvents.slice(0, 3).map((e) => (
                  <div
                    key={e.id}
                    className="flex items-center gap-1 truncate text-[10px]"
                  >
                    <span
                      className={[
                        "inline-block size-1.5 shrink-0 rounded-full",
                        e.color ?? DEFAULT_DOT,
                      ].join(" ")}
                    />
                    <span className="truncate">{e.title}</span>
                  </div>
                ))}
                {dayEvents.length > 3 && (
                  <div className="text-[10px] text-muted-foreground">
                    +{dayEvents.length - 3} more
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {selected && (
        <Card className="mt-4">
          <CardContent className="py-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="font-medium">{formatDayLong(selected)}</span>
              <button
                onClick={() => select(null)}
                className="text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                Close
              </button>
            </div>
            {selectedEvents.length === 0 ? (
              <p className="text-sm italic text-muted-foreground">
                Nothing on this day.
              </p>
            ) : (
              <ul className="space-y-2">
                {selectedEvents.map((e) => (
                  <li key={e.id}>
                    {renderEvent ? (
                      renderEvent(e)
                    ) : (
                      <div className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                        <span
                          className={[
                            "inline-block size-2 shrink-0 rounded-full",
                            e.color ?? DEFAULT_DOT,
                          ].join(" ")}
                        />
                        {e.title}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
