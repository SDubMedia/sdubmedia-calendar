// ============================================================
// CalendarPage — Monthly production calendar
// Design: Dark Cinematic Studio | Amber accent on charcoal
// ============================================================

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { ChevronLeft, ChevronRight, Plus, Clock, MapPin, User, DollarSign, Calendar, Heart, Layers, AlertTriangle, CheckCircle2, UserPlus, RefreshCw, Building2, CalendarClock, Inbox } from "lucide-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useScopedData as useApp } from "@/hooks/useScopedData";
import { useAuth } from "@/contexts/AuthContext";
import type { Project, PersonalEvent, PersonalEventTemplate, Meeting } from "@/lib/types";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { getProjectWorkedHours, getProjectBillableHours, getProjectInvoiceAmount, getProjectPayerId, conflictsForDate, availabilityForDate, getOpenDays } from "@/lib/data";
import ProjectDialog, { hasProjectDraft } from "@/components/ProjectDialog";
import ProjectDetailSheet from "@/components/ProjectDetailSheet";
import AvailabilityDayEditor from "@/components/AvailabilityDayEditor";
import PersonalEventDialog, { getEventColor } from "@/components/PersonalEventDialog";
import MeetingDialog, { getMeetingColor } from "@/components/MeetingDialog";
import PersonalTemplatesSheet from "@/components/PersonalTemplatesSheet";
import AddUserDialog from "@/components/AddUserDialog";
import { Settings } from "lucide-react";

const STATUS_LABELS: Record<string, string> = {
  tentative: "Tentative",
  upcoming: "Upcoming",
  filming_done: "Filmed",
  in_editing: "Editing",
  editing_done: "Editing Done",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Show the "Deposit Paid" pill for this many days after the at_signing
// milestone gets paid. After that, it just looks like a regular upcoming
// project — the highlight is for celebrating the moment, not for permanent
// state tracking.
const DEPOSIT_PAID_PILL_DAYS = 7;
function depositRecentlyPaid(iso: string | null | undefined): boolean {
  if (!iso) return false;
  const ageMs = Date.now() - new Date(iso).getTime();
  return ageMs >= 0 && ageMs <= DEPOSIT_PAID_PILL_DAYS * 24 * 60 * 60 * 1000;
}

function hm12(t: string): string {
  const [h, m] = (t || "").split(":").map(Number);
  if (Number.isNaN(h)) return t;
  const ap = h >= 12 ? "p" : "a";
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")}${ap}`;
}

const CONFLICT_LABEL: Record<string, string> = {
  double: "Double-booked",
  outside: "Outside their hours",
  buffer: "Too tight a turnaround",
  cap: "Over their daily limit",
};

export default function CalendarPage() {
  const { data, addPersonalEvent, refresh } = useApp();
  const [resyncing, setResyncing] = useState(false);
  const { effectiveProfile } = useAuth();
  const [, navigate] = useLocation();
  const [availEdit, setAvailEdit] = useState<{ crewMemberId: string; name: string } | null>(null);
  const role = effectiveProfile?.role;
  const isClient = role === "client";
  const isFamily = role === "family";
  const canSeePersonal = role === "owner" || role === "family";
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [clientFilter, setClientFilter] = useState<string>("all");
  const [viewScope, setViewScope] = useState<"month" | "all">("month");
  const [calendarMode, setCalendarMode] = useState<"production" | "personal" | "both">(isFamily ? "personal" : "production");
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [resumeProject, setResumeProject] = useState(false);
  // Booking into an open availability slot: the tapped slot's start time + shooter,
  // pre-filled into ProjectDialog.
  const [bookStartTime, setBookStartTime] = useState<string | null>(null);
  const [bookCrewMemberId, setBookCrewMemberId] = useState<string | null>(null);
  // Whether a half-entered project draft exists (drives the "Resume" button).
  const [hasDraft, setHasDraft] = useState(false);
  useEffect(() => { setHasDraft(hasProjectDraft()); }, []);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [personalEventOpen, setPersonalEventOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<PersonalEvent | null>(null);
  const [meetingOpen, setMeetingOpen] = useState(false);
  const [editingMeeting, setEditingMeeting] = useState<Meeting | null>(null);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [addUserOpen, setAddUserOpen] = useState(false);
  const [showAvail, setShowAvail] = useState(false);
  const isOwner = role === "owner";

  // Availability + conflicts overlay (owner + staff only).
  const canSeeAvail = role === "owner" || role === "staff";
  const prefsMap = useMemo(() => {
    const m: Record<string, { shootMinutes: number; bufferMinutes: number; maxPerDay: number }> = {};
    for (const p of data.shooterPrefs) m[p.crewMemberId] = { shootMinutes: p.shootMinutes, bufferMinutes: p.bufferMinutes, maxPerDay: p.maxPerDay };
    return m;
  }, [data.shooterPrefs]);
  // Days in view that have a hard double-booking (always flagged on the grid).
  const doubleBookedDates = useMemo(() => {
    if (!canSeeAvail) return new Set<string>();
    const dates = new Set<string>();
    for (const d of Array.from(new Set(data.projects.map(p => p.date)))) {
      if (conflictsForDate(data.projects, data.availability, prefsMap, d).some(c => c.type === "double")) dates.add(d);
    }
    return dates;
  }, [canSeeAvail, data.projects, data.availability, prefsMap]);
  const dayConflicts = useMemo(() => (canSeeAvail && selectedDate) ? conflictsForDate(data.projects, data.availability, prefsMap, selectedDate) : [], [canSeeAvail, selectedDate, data.projects, data.availability, prefsMap]);
  const dayAvailability = useMemo(() => (canSeeAvail && selectedDate) ? availabilityForDate(data.availability, selectedDate) : [], [canSeeAvail, selectedDate, data.availability]);

  // Owner-only: each available shooter's genuinely-open start times for the
  // selected day (their hours minus shoots already booked, padded by buffers),
  // so the owner can tap a time to book a shoot straight into that slot. Busy
  // blocks come from the loaded projects' crew (the owner has them all) — no
  // need for the async shooter_busy view the agent flow uses.
  const openSlotsByShooter = useMemo(() => {
    const out: Record<string, string[]> = {};
    if (!isOwner || !selectedDate) return out;
    const busy = data.projects
      .filter(p => p.date === selectedDate && p.status !== "cancelled")
      .flatMap(p => {
        const ids = Array.from(new Set((p.crew ?? []).map(c => c.crewMemberId).filter(Boolean)));
        return ids.map(cm => ({ crewMemberId: cm, date: p.date, start: p.startTime, end: p.endTime || p.startTime }));
      });
    const day = getOpenDays(data.availability, { fromDate: selectedDate, days: 1, busy, prefs: prefsMap })[0];
    if (day) {
      for (const slot of day.slots) {
        for (const cm of slot.crewMemberIds) (out[cm] ??= []).push(slot.time);
      }
    }
    return out;
  }, [isOwner, selectedDate, data.projects, data.availability, prefsMap]);

  // Pending shoot requests on the calendar (owner): a "Request" marker on the
  // day, tap-through to approve in the queue.
  const pendingRequests = useMemo(
    () => isOwner ? data.shootRequests.filter(r => r.status === "pending" && r.preferredDate) : [],
    [isOwner, data.shootRequests]
  );
  const requestDates = useMemo(() => new Set(pendingRequests.map(r => r.preferredDate as string)), [pendingRequests]);
  const dayRequests = useMemo(() => selectedDate ? pendingRequests.filter(r => r.preferredDate === selectedDate) : [], [pendingRequests, selectedDate]);

  // Bulk-apply template to multiple dates
  const [bulkTemplate, setBulkTemplate] = useState<PersonalEventTemplate | null>(null);
  const [bulkDates, setBulkDates] = useState<Set<string>>(new Set());
  // Anchor for shift-click range select. Stores the last cell the
  // user clicked while selecting, so a subsequent shift-click fills
  // every date between the two.
  const [shiftAnchor, setShiftAnchor] = useState<string | null>(null);
  const [bulkSaving, setBulkSaving] = useState(false);
  const myTemplates = effectiveProfile?.personalEventTemplates || [];

  const toggleBulkDate = (dateStr: string) => {
    setBulkDates(prev => {
      const next = new Set(prev);
      if (next.has(dateStr)) next.delete(dateStr);
      else next.add(dateStr);
      return next;
    });
  };

  const exitBulkMode = () => {
    setBulkTemplate(null);
    setBulkDates(new Set());
    setShiftAnchor(null);
  };

  // Shift-click range fill: from anchor to target, both inclusive.
  // Adds every day in between to the bulk selection. If no anchor
  // exists yet, just adds this single date and stamps the anchor.
  const handleShiftSelect = (dateStr: string) => {
    if (!shiftAnchor) {
      setBulkDates(prev => new Set(prev).add(dateStr));
      setShiftAnchor(dateStr);
      return;
    }
    const start = shiftAnchor < dateStr ? shiftAnchor : dateStr;
    const end = shiftAnchor < dateStr ? dateStr : shiftAnchor;
    const next = new Set(bulkDates);
    const cursor = new Date(start + "T00:00:00");
    const stop = new Date(end + "T00:00:00");
    while (cursor <= stop) {
      next.add(cursor.toISOString().slice(0, 10));
      cursor.setDate(cursor.getDate() + 1);
    }
    setBulkDates(next);
    setShiftAnchor(dateStr);
  };

  // Cmd/Ctrl-click toggle: add or remove a single date from the
  // bulk selection without disturbing other selected days.
  const handleToggleSelect = (dateStr: string) => {
    setBulkDates(prev => {
      const next = new Set(prev);
      if (next.has(dateStr)) next.delete(dateStr);
      else next.add(dateStr);
      return next;
    });
    setShiftAnchor(dateStr);
  };

  // Quick-apply: takes whatever is in bulkDates and writes a
  // personal event for each day using the picked template. Same
  // logic as the original bulk apply, but reusable for the new
  // chip-based UI when dates were selected before a template.
  const applyTemplateToBulk = async (tpl: PersonalEventTemplate) => {
    if (bulkDates.size === 0) return;
    setBulkSaving(true);
    const dates = Array.from(bulkDates).sort();
    try {
      for (const d of dates) {
        await addPersonalEvent({
          title: tpl.title,
          date: d,
          startTime: "",
          endTime: "",
          allDay: true,
          location: "",
          notes: "",
          category: tpl.category,
          color: tpl.color,
          priority: false,
          orgId: "",
        });
      }
      toast.success(`Added ${dates.length} ${tpl.label} event${dates.length === 1 ? "" : "s"}`);
      exitBulkMode();
    } catch (err: any) {
      toast.error(err.message || "Failed to add events");
    } finally {
      setBulkSaving(false);
    }
  };

  const applyBulk = async () => {
    if (!bulkTemplate || bulkDates.size === 0) return;
    setBulkSaving(true);
    const dates = Array.from(bulkDates).sort();
    try {
      for (const d of dates) {
        await addPersonalEvent({
          title: bulkTemplate.title,
          date: d,
          startTime: "",
          endTime: "",
          allDay: true,
          location: "",
          notes: "",
          category: bulkTemplate.category,
          color: bulkTemplate.color,
          priority: false,
          orgId: "",
        });
      }
      toast.success(`Added ${dates.length} event${dates.length === 1 ? "" : "s"}`);
      exitBulkMode();
    } catch (err: any) {
      toast.error(err.message || "Failed to add events");
    } finally {
      setBulkSaving(false);
    }
  };

  // Long-press on a day → quick-create
  const longPressTimerRef = useRef<number | null>(null);
  const longPressTriggeredRef = useRef(false);

  // Swipe detection on the calendar grid → change month
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null);
  const swipeFiredRef = useRef(false);

  const todayStr = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);

  const openAddForDate = useCallback((dateStr: string | null) => {
    const targetDate = dateStr ?? selectedDate ?? todayStr;
    setSelectedDate(targetDate);
    if (isFamily || calendarMode === "personal") {
      setEditingEvent(null);
      setPersonalEventOpen(true);
    } else {
      setNewProjectOpen(true);
    }
  }, [selectedDate, todayStr, isFamily, calendarMode]);

  const handleDayPointerDown = (dateStr: string | null) => {
    if (!dateStr || isClient || bulkTemplate) return;
    longPressTriggeredRef.current = false;
    longPressTimerRef.current = window.setTimeout(() => {
      longPressTriggeredRef.current = true;
      openAddForDate(dateStr);
    }, 500);
  };

  const cancelLongPress = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const onGridPointerDown = (e: React.PointerEvent) => {
    swipeStartRef.current = { x: e.clientX, y: e.clientY };
    swipeFiredRef.current = false;
  };
  const onGridPointerMove = (e: React.PointerEvent) => {
    const start = swipeStartRef.current;
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    // Any meaningful movement cancels the long-press timer.
    if (Math.abs(dx) > 10 || Math.abs(dy) > 10) cancelLongPress();
  };
  const onGridPointerUp = (e: React.PointerEvent) => {
    const start = swipeStartRef.current;
    swipeStartRef.current = null;
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    const SWIPE_THRESHOLD = 60;
    // Horizontal, and clearly more horizontal than vertical (avoid scroll).
    if (Math.abs(dx) > SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy) * 1.5) {
      swipeFiredRef.current = true;
      if (dx > 0) prevMonth(); else nextMonth();
    }
  };

  // Total hours per day for calendar overlay (worked + billed)
  const dailyHours = useMemo(() => {
    const map: Record<string, { worked: number; billed: number }> = {};
    const prefix = `${year}-${String(month + 1).padStart(2, "0")}`;
    data.projects.forEach(p => {
      if (p.date.startsWith(prefix)) {
        const client = data.clients.find(c => c.id === p.clientId);
        const worked = getProjectWorkedHours(p).totalHours;
        const billed = client ? getProjectBillableHours(p, client).totalBillable : worked;
        if (!map[p.date]) map[p.date] = { worked: 0, billed: 0 };
        map[p.date].worked += worked;
        map[p.date].billed += billed;
      }
    });
    return map;
  }, [data.projects, data.clients, year, month]);

  // Calendar grid
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const totalCells = Math.ceil((firstDay + daysInMonth) / 7) * 7;

  // A shoot matches the picked client if it's billed directly to them OR its
  // "who pays" resolves to them — so selecting a brokerage (Realty One) shows
  // its own shoots AND every agent shoot that bills up to it, matching how the
  // reports group agents under their broker. Selecting an individual agent
  // still shows just that agent's shoots (direct clientId match).
  const clientsById = useMemo(
    () => Object.fromEntries(data.clients.map((c) => [c.id, c])),
    [data.clients],
  );
  const matchesClientFilter = useCallback(
    (p: typeof data.projects[number]) =>
      clientFilter === "all" ||
      p.clientId === clientFilter ||
      getProjectPayerId(p, clientsById) === clientFilter,
    [clientFilter, clientsById],
  );

  // Projects for this month — already pre-filtered by clientFilter so every
  // downstream consumer (grid cells, status counts, hours totals, list view)
  // reflects the picked client without each one having to re-filter.
  const monthProjects = useMemo(() => {
    const prefix = `${year}-${String(month + 1).padStart(2, "0")}`;
    return data.projects.filter((p) =>
      p.date.startsWith(prefix) && matchesClientFilter(p)
    );
  }, [data.projects, year, month, matchesClientFilter]);

  // Personal events for this month
  const monthPersonalEvents = useMemo(() => {
    const prefix = `${year}-${String(month + 1).padStart(2, "0")}`;
    return data.personalEvents.filter((e) => e.date.startsWith(prefix));
  }, [data.personalEvents, year, month]);

  const getPersonalEventsForDay = (day: number) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return monthPersonalEvents
      .filter((e) => e.date === dateStr)
      .sort((a, b) => (a.priority === b.priority ? 0 : a.priority ? -1 : 1));
  };

  // External calendar events (subscribed iCal feeds, e.g. Apple Cal).
  // Pre-index per visible-month-day for efficient lookup. Only enabled
  // calendars are shown. Events use the parent calendar's color so
  // it's visually clear which feed each event came from.
  const monthExternalEvents = useMemo(() => {
    const prefix = `${year}-${String(month + 1).padStart(2, "0")}`;
    const enabledIds = new Set(data.externalCalendars.filter(c => c.enabled).map(c => c.id));
    const calColor = new Map(data.externalCalendars.map(c => [c.id, c.color] as const));
    return data.externalEvents
      .filter(e => enabledIds.has(e.externalCalendarId) && e.startAt.startsWith(prefix))
      .map(e => ({ ...e, color: calColor.get(e.externalCalendarId) || "#94a3b8" }));
  }, [data.externalEvents, data.externalCalendars, year, month]);

  const getExternalEventsForDay = (day: number) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return monthExternalEvents.filter(e => e.startAt.startsWith(dateStr));
  };

  const monthMeetings = useMemo(() => {
    const prefix = `${year}-${String(month + 1).padStart(2, "0")}`;
    return data.meetings.filter((m) =>
      m.date.startsWith(prefix) &&
      // When a client is filtered, show meetings for that client OR meetings
      // with no client (general meetings stay visible across filter views).
      (clientFilter === "all" || m.clientId === clientFilter || !m.clientId)
    );
  }, [data.meetings, year, month, clientFilter]);

  const getMeetingsForDay = (day: number) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return monthMeetings.filter((m) => m.date === dateStr);
  };

  // Projects filtered by selected date, or scope (month/all) and status
  const filteredProjects = useMemo(() => {
    let projects;
    if (selectedDate) {
      projects = data.projects.filter(p => p.date === selectedDate);
    } else {
      projects = viewScope === "month" ? monthProjects : data.projects;
    }
    // Apply clientFilter when viewing "all" or a selected day — monthProjects
    // is already filtered. Payer-aware so a brokerage picks up its agents.
    if (clientFilter !== "all" && (viewScope === "all" || selectedDate)) {
      projects = projects.filter(matchesClientFilter);
    }
    const sorted = [...projects].sort((a, b) => a.date.localeCompare(b.date));
    if (filterStatus === "all") return sorted;
    return sorted.filter((p) => p.status === filterStatus);
  }, [data.projects, monthProjects, filterStatus, viewScope, selectedDate, clientFilter, matchesClientFilter]);

  const filteredPersonalEvents = useMemo(() => {
    if (selectedDate) {
      return data.personalEvents.filter(e => e.date === selectedDate);
    }
    return monthPersonalEvents;
  }, [data.personalEvents, monthPersonalEvents, selectedDate]);

  const prevMonth = () => {
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else setMonth(m => m + 1);
  };

  const getProjectsForDay = (day: number) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return monthProjects.filter((p) => p.date === dateStr);
  };

  const getClient = (id: string) => data.clients.find((c) => c.id === id);
  const getLocation = (id: string) => data.locations.find((l) => l.id === id);
  const getProjectType = (id: string) => data.projectTypes.find((pt) => pt.id === id);
  const _getCrewMember = (id: string) => data.crewMembers.find((c) => c.id === id);

  const monthlyHoursTotals = useMemo(() => {
    let worked = 0, billed = 0;
    monthProjects.forEach(p => {
      const client = data.clients.find(c => c.id === p.clientId);
      const w = getProjectWorkedHours(p).totalHours;
      const b = client ? getProjectBillableHours(p, client).totalBillable : w;
      worked += w;
      billed += b;
    });
    return { worked, billed };
  }, [monthProjects, data.clients]);

  const statusCounts = useMemo(() => {
    const projects = viewScope === "month" ? monthProjects : data.projects;
    const counts: Record<string, number> = { all: projects.length, tentative: 0, upcoming: 0, filming_done: 0, in_editing: 0, editing_done: 0, delivered: 0 };
    projects.forEach((p) => { counts[p.status] = (counts[p.status] || 0) + 1; });
    return counts;
  }, [data.projects, monthProjects, viewScope]);

  return (
    <div className="h-full overflow-auto">
      {/* Page header — lives inside the scroll area so it scrolls with
          the calendar (matches the iOS layout). When the user is at the
          top, the add buttons + mode toggle + filter row are visible;
          scrolling down reveals more grid; scrolling back up brings the
          header back. */}
      <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-border bg-card/50 space-y-2">
        {/* Top row: title + action buttons. min-w-0 lets the title shrink
            so the buttons can stay on-row at narrow widths instead of forcing
            page-level horizontal scroll. flex-wrap kicks in only if even the
            icon-only buttons + a tight title can't fit. */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl font-semibold text-foreground truncate" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              {calendarMode === "production" ? "Production Calendar" : calendarMode === "personal" ? "My Life" : "All Calendars"}
            </h1>
            {!(isFamily && calendarMode !== "personal") && (
              <p className="text-sm text-muted-foreground mt-0.5">
                {calendarMode === "production"
                  ? `${clientFilter !== "all" ? `${data.clients.find(c => c.id === clientFilter)?.company || ""} · ` : ""}${monthProjects.length} projects · ${monthlyHoursTotals.worked.toFixed(1)} worked · ${monthlyHoursTotals.billed.toFixed(1)} billed`
                  : calendarMode === "personal"
                  ? `${monthPersonalEvents.length} events this month`
                  : `${monthProjects.length} projects · ${monthPersonalEvents.length} personal events`}
              </p>
            )}
          </div>
          <div className="flex gap-2">
            {canSeePersonal && (calendarMode === "personal" || calendarMode === "both") && (
              <Button
                variant="outline"
                size="icon"
                onClick={() => setTemplatesOpen(true)}
                title="Manage event templates"
              >
                <Settings className="w-4 h-4" />
              </Button>
            )}
            {!isClient && (calendarMode === "personal" || calendarMode === "both") && myTemplates.length > 0 && !bulkTemplate && (
              <select
                value=""
                onChange={(e) => {
                  const t = myTemplates.find(x => x.id === e.target.value);
                  if (t) { setBulkTemplate(t); setBulkDates(new Set()); setSelectedDate(null); }
                }}
                className="bg-secondary border border-border text-foreground text-sm rounded-md px-3 py-2 cursor-pointer hover:bg-white/5 transition-colors"
              >
                <option value="" disabled>Quick apply…</option>
                {myTemplates.map(t => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </select>
            )}
            {isOwner && (
              <Button
                variant="outline"
                onClick={() => setAddUserOpen(true)}
                className="gap-2 border-blue-500/40 text-blue-300 hover:bg-blue-500/10 px-3 sm:px-4"
                title="Add a new user — owner only"
              >
                <UserPlus className="w-4 h-4" />
                <span className="hidden sm:inline">User</span>
              </Button>
            )}
            <Button
              variant="outline"
              onClick={async () => {
                setResyncing(true);
                try { await refresh(); toast.success("Synced"); }
                catch { toast.error("Sync failed"); }
                finally { setResyncing(false); }
              }}
              disabled={resyncing}
              className="gap-2 px-3 sm:px-4"
              title="Re-pull everything from the server"
            >
              <RefreshCw className={cn("w-4 h-4", resyncing && "animate-spin")} />
              <span className="hidden sm:inline">{resyncing ? "Syncing…" : "Sync"}</span>
            </Button>
            {!isClient && (
              <Button
                variant="outline"
                onClick={() => { setEditingMeeting(null); setMeetingOpen(true); }}
                className="gap-2 border-slate-500/40 text-slate-700 dark:text-slate-300 hover:bg-slate-500/10 px-3 sm:px-4"
                title="Schedule a meeting (unpaid)"
              >
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">Meeting</span>
              </Button>
            )}
            {!isClient && hasDraft && (
              <Button
                variant="outline"
                onClick={() => { setResumeProject(true); setNewProjectOpen(true); }}
                className="gap-2 border-amber-500/40 text-amber-600 dark:text-amber-300 hover:bg-amber-500/10 px-3 sm:px-4"
                title="Resume the project you were entering"
              >
                <RefreshCw className="w-4 h-4" />
                <span className="hidden sm:inline">Resume</span>
              </Button>
            )}
            {!isClient && (
              <Button
                onClick={() => { setResumeProject(false); openAddForDate(null); }}
                className="bg-primary text-primary-foreground hover:bg-primary/90 gap-2 px-3 sm:px-4"
                title="Add a new project"
              >
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">Project</span>
              </Button>
            )}
          </div>
        </div>
        {/* Second row: calendar mode toggle */}
        {(canSeePersonal || isFamily) && <div className="flex gap-1 bg-background/50 rounded-lg p-1 border border-border w-fit">
          <button
            onClick={() => setCalendarMode("production")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors",
              calendarMode === "production"
                ? "bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30"
                : "text-muted-foreground hover:text-foreground hover:bg-white/5"
            )}
          >
            <Calendar className="w-3.5 h-3.5" />
            Production
          </button>
          <button
            onClick={() => setCalendarMode("personal")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors",
              calendarMode === "personal"
                ? "bg-rose-500/20 text-rose-700 dark:text-rose-300 border border-rose-500/30"
                : "text-muted-foreground hover:text-foreground hover:bg-white/5"
            )}
          >
            <Heart className="w-3.5 h-3.5" />
            My Life
          </button>
          <button
            onClick={() => setCalendarMode("both")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors",
              calendarMode === "both"
                ? "bg-violet-500/20 text-violet-700 dark:text-violet-300 border border-violet-500/30"
                : "text-muted-foreground hover:text-foreground hover:bg-white/5"
            )}
          >
            <Layers className="w-3.5 h-3.5" />
            Both
          </button>
        </div>}

        {/* Availability overlay toggle (owner + staff) */}
        {canSeeAvail && (
          <button
            onClick={() => setShowAvail(v => !v)}
            className={cn(
              "mt-2 flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors w-fit",
              showAvail
                ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-500/30"
                : "text-muted-foreground hover:text-foreground border-border bg-background/50"
            )}
          >
            <CalendarClock className="w-3.5 h-3.5" />
            {showAvail ? "Availability: on" : "Show availability"}
          </button>
        )}

        {/* Filters box — applies to both projects and meetings on the grid */}
        {!isClient && !isFamily && (
          <div className="mt-3 inline-flex items-center gap-2 rounded-lg border border-border bg-secondary/40 px-3 py-2">
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Filter</span>
            <span className="text-xs text-muted-foreground">Client</span>
            <select
              value={clientFilter}
              onChange={(e) => setClientFilter(e.target.value)}
              className="bg-background border border-border rounded px-2 py-1 text-xs font-medium text-foreground outline-none focus:border-primary max-w-[180px]"
            >
              <option value="all">All clients</option>
              {data.clients.map((c) => (
                <option key={c.id} value={c.id}>{c.company}</option>
              ))}
            </select>
            {clientFilter !== "all" && (
              <button
                onClick={() => setClientFilter("all")}
                className="text-[11px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
              >
                Clear
              </button>
            )}
          </div>
        )}
      </div>

      <div className="px-0 py-3 sm:p-6 space-y-4 sm:space-y-6">
        {/* Bulk-mode bar — shown when either:
              - user picked a template via the "Bulk Apply" dropdown (legacy flow)
              - user shift- or cmd-clicked dates and is now picking a template (new flow)
            In the second case, the bar surfaces template chips so the
            owner can quick-apply without a separate dropdown click. */}
        {(bulkTemplate || bulkDates.size > 0) && (
          <div className="sticky top-0 z-20 mx-3 sm:mx-0 rounded-lg border border-primary/40 bg-primary/15 backdrop-blur px-3 sm:px-4 py-2.5 shadow-lg space-y-2">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-foreground truncate">
                  {bulkTemplate ? bulkTemplate.label : "Quick Apply"}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {bulkDates.size === 0
                    ? "Tap dates to select. Hold Shift to fill a range."
                    : bulkTemplate
                      ? `${bulkDates.size} selected`
                      : `${bulkDates.size} day${bulkDates.size === 1 ? "" : "s"} selected — pick a template below`}
                </div>
              </div>
              <Button size="sm" variant="ghost" onClick={exitBulkMode} disabled={bulkSaving} className="shrink-0">Cancel</Button>
              {bulkTemplate && (
                <Button size="sm" onClick={applyBulk} disabled={bulkDates.size === 0 || bulkSaving} className="bg-primary text-primary-foreground shrink-0">
                  {bulkSaving ? "Adding…" : `Add${bulkDates.size > 0 ? ` (${bulkDates.size})` : ""}`}
                </Button>
              )}
            </div>

            {/* Template chips — shown when dates are selected but no
                template has been picked yet. One tap = apply that
                template to all selected dates. */}
            {!bulkTemplate && bulkDates.size > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {myTemplates.length === 0 && (
                  <span className="text-xs text-muted-foreground italic">
                    No templates yet — add some in Settings → Personal templates.
                  </span>
                )}
                {myTemplates.map(t => (
                  <button
                    key={t.id}
                    type="button"
                    disabled={bulkSaving}
                    onClick={() => applyTemplateToBulk(t)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-border bg-background text-xs text-foreground hover:bg-secondary hover:border-primary/40 transition-colors disabled:opacity-50"
                  >
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: t.color || "#94a3b8" }} />
                    {t.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {/* Calendar */}
        <div className="bg-card sm:rounded-lg border-t border-b-0 sm:border border-border overflow-hidden">
          {/* Month nav */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-border">
            <button onClick={prevMonth} className="p-1.5 rounded hover:bg-white/8 text-muted-foreground hover:text-foreground transition-colors">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-3">
              <h2 className="text-base font-semibold text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                {MONTH_NAMES[month]} {year}
              </h2>
              <button
                onClick={() => { setYear(today.getFullYear()); setMonth(today.getMonth()); }}
                className="text-xs text-primary hover:text-primary/80 transition-colors"
              >
                Today
              </button>
            </div>
            <button onClick={nextMonth} className="p-1.5 rounded hover:bg-white/8 text-muted-foreground hover:text-foreground transition-colors">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Day headers */}
          <div className="grid grid-cols-7 border-b border-border">
            {DAY_NAMES.map((d) => (
              <div key={d} className="py-2 text-center text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {d}
              </div>
            ))}
          </div>

          {/* Calendar grid */}
          <div
            className="grid grid-cols-7 touch-pan-y"
            onPointerDown={onGridPointerDown}
            onPointerMove={onGridPointerMove}
            onPointerUp={onGridPointerUp}
            onPointerCancel={() => { swipeStartRef.current = null; }}
          >
            {Array.from({ length: totalCells }).map((_, i) => {
              const day = i - firstDay + 1;
              const isCurrentMonth = day >= 1 && day <= daysInMonth;
              const isToday = isCurrentMonth && day === today.getDate() && month === today.getMonth() && year === today.getFullYear();
              const dayProjects = isCurrentMonth ? getProjectsForDay(day) : [];
              const dayEvents = isCurrentMonth ? getPersonalEventsForDay(day) : [];
              const dayExternalEvents = isCurrentMonth ? getExternalEventsForDay(day) : [];
              const dayMeetings = isCurrentMonth ? getMeetingsForDay(day) : [];

              // For non-current-month cells, compute the actual date in
              // the previous or next month. Lets us show the real day
              // number (28, 29, 30 for the leading week; 1, 2, 3 for the
              // trailing week) instead of blank cells.
              let displayDay: number;
              let displayMonth: number;
              let displayYear: number;
              if (day < 1) {
                const prevMonthIdx = month === 0 ? 11 : month - 1;
                const prevYear = month === 0 ? year - 1 : year;
                const daysInPrevMonth = new Date(prevYear, prevMonthIdx + 1, 0).getDate();
                displayDay = daysInPrevMonth + day;
                displayMonth = prevMonthIdx;
                displayYear = prevYear;
              } else if (day > daysInMonth) {
                displayDay = day - daysInMonth;
                displayMonth = month === 11 ? 0 : month + 1;
                displayYear = month === 11 ? year + 1 : year;
              } else {
                displayDay = day;
                displayMonth = month;
                displayYear = year;
              }
              const dateStr = isCurrentMonth
                ? `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
                : null;
              const dayHours = dateStr ? (dailyHours[dateStr] ?? null) : null;

              const isSelected = dateStr !== null && dateStr === selectedDate;
              const isBulkSelected = dateStr !== null && bulkDates.has(dateStr);
              return (
                <div
                  key={i}
                  className={cn(
                    "min-h-[90px] sm:min-h-[100px] p-1 sm:p-1.5 border-b border-r border-border relative select-none [&:nth-child(7n)]:border-r-0 sm:[&:nth-child(7n)]:border-r",
                    !isCurrentMonth && "bg-muted/10 cursor-pointer hover:bg-muted/20 transition-colors",
                    isToday && !isSelected && !isBulkSelected && "bg-primary/5",
                    isSelected && "bg-primary/15 ring-2 ring-primary/60 ring-inset",
                    isBulkSelected && "bg-emerald-500/20 ring-2 ring-emerald-500/60 ring-inset",
                    isCurrentMonth && "hover:bg-white/3 cursor-pointer transition-colors"
                  )}
                  onClick={(e) => {
                    if (longPressTriggeredRef.current) {
                      longPressTriggeredRef.current = false;
                      return;
                    }
                    if (swipeFiredRef.current) {
                      swipeFiredRef.current = false;
                      return;
                    }
                    // Out-of-month cell: jump to that month so the user
                    // can interact with the date there. Avoids any confused
                    // selection / bulk state across months.
                    if (!isCurrentMonth) {
                      setYear(displayYear);
                      setMonth(displayMonth);
                      return;
                    }
                    if (!dateStr || isClient) return;
                    // Shift = range select, Cmd/Ctrl = toggle individual.
                    // Both work whether or not a bulk template is active —
                    // owner can pre-select dates and pick a template after.
                    // Personal/Both modes only (range-fill makes no sense
                    // when scoped to production projects).
                    if ((e.shiftKey || e.metaKey || e.ctrlKey) && (calendarMode === "personal" || calendarMode === "both")) {
                      if (e.shiftKey) handleShiftSelect(dateStr);
                      else handleToggleSelect(dateStr);
                      return;
                    }
                    if (bulkTemplate) {
                      toggleBulkDate(dateStr);
                      return;
                    }
                    setSelectedDate(prev => prev === dateStr ? null : dateStr);
                  }}
                  onPointerDown={() => handleDayPointerDown(isCurrentMonth ? dateStr : null)}
                  onPointerUp={cancelLongPress}
                  onPointerLeave={cancelLongPress}
                  onPointerCancel={cancelLongPress}
                >
                  {/* Double-booking warning (always shown for owner/staff) */}
                  {dateStr && doubleBookedDates.has(dateStr) && (
                    <span title="Double-booked" className="absolute bottom-1 right-1 z-10 inline-flex"><AlertTriangle className="w-3 h-3 text-red-500" /></span>
                  )}
                  {/* Availability dot — someone's open this day (toggle on) */}
                  {showAvail && dateStr && availabilityForDate(data.availability, dateStr).length > 0 && (
                    <span title="Someone's available" className="absolute bottom-1 left-1 z-10 w-2 h-2 rounded-full bg-emerald-500" />
                  )}
                  {/* Pending shoot request on this day (owner) */}
                  {dateStr && requestDates.has(dateStr) && (
                    <span title="Shoot request" className="absolute top-1 right-1 z-10 inline-flex"><Inbox className="w-3 h-3 text-amber-500" /></span>
                  )}
                  {/* Day number + hours overlay */}
                  <div className="flex items-start justify-between mb-1">
                    <span className={cn(
                      "text-xs font-medium w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center rounded-full",
                      isToday ? "bg-primary text-primary-foreground" : isCurrentMonth ? "text-foreground" : "text-muted-foreground/50",
                    )}>
                      {displayDay}
                    </span>
                    {!isFamily && calendarMode !== "personal" && dayHours !== null && dayHours.billed > 0 && (
                      <div className="hidden sm:flex flex-col items-end gap-0.5">
                        <span className="text-[9px] font-medium tabular-nums px-1 py-0.5 rounded text-amber-600 dark:text-amber-400 bg-amber-500/10">
                          {dayHours.billed.toFixed(1)}h billed
                        </span>
                        {dayHours.worked !== dayHours.billed && (
                          <span className="text-[8px] tabular-nums text-muted-foreground">
                            {dayHours.worked.toFixed(1)}h worked
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Production chips (mobile + desktop) */}
                  {(calendarMode === "production" || calendarMode === "both") && (
                    <div className="space-y-0.5">
                      {dayProjects.slice(0, calendarMode === "both" ? 2 : 3).map((p) => (
                        <div
                          key={p.id}
                          onClick={(e) => { e.stopPropagation(); setSelectedProject(p); }}
                          onPointerDown={(e) => e.stopPropagation()}
                          className={cn(
                            "text-[10px] sm:text-[11px] px-1 sm:px-1.5 py-0.5 rounded truncate cursor-pointer hover:opacity-80 transition-opacity",
                            // Tentative = agreement sent but not yet paid.
                            // Dashed border + softer fill so it visually
                            // reads "not locked in yet" vs the solid blue
                            // of an upcoming/confirmed booking.
                            p.status === "tentative" && "bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-dashed border-amber-500/50",
                            p.status === "upcoming" && "bg-blue-500/25 text-blue-700 dark:text-blue-300",
                            p.status === "filming_done" && "bg-purple-500/25 text-purple-700 dark:text-purple-300",
                            p.status === "in_editing" && "bg-amber-500/25 text-amber-700 dark:text-amber-300",
                            p.status === "editing_done" && "bg-teal-500/25 text-teal-700 dark:text-teal-300",
                            p.status === "delivered" && "bg-green-500/25 text-green-700 dark:text-green-300",
                            p.status === "cancelled" && "bg-red-500/25 text-red-700 dark:text-red-300 line-through opacity-70",
                          )}
                        >
                          {p.paidDate && <DollarSign className="w-2.5 h-2.5 text-green-400 inline-block flex-shrink-0" />}
                          {depositRecentlyPaid(p.depositPaidAt) && <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400 inline-block flex-shrink-0 mr-0.5" aria-label="Deposit paid" />}
                          <span className="hidden sm:inline">{p.startTime} {getProjectType(p.projectTypeId)?.name ?? "Project"} · {getClient(p.clientId)?.company ?? ""}</span>
                          <span className="sm:hidden">{getProjectType(p.projectTypeId)?.name ?? "Project"}</span>
                        </div>
                      ))}
                      {dayProjects.length > (calendarMode === "both" ? 2 : 3) && (
                        <div className="text-[9px] sm:text-[10px] text-muted-foreground px-1">+{dayProjects.length - (calendarMode === "both" ? 2 : 3)}</div>
                      )}
                    </div>
                  )}

                  {/* Meeting chips — only show in production / both modes. */}
                  {(calendarMode === "production" || calendarMode === "both") && dayMeetings.length > 0 && (
                    <div className="space-y-0.5">
                      {dayMeetings.slice(0, 2).map((m) => {
                        const client = m.clientId ? data.clients.find(c => c.id === m.clientId) : null;
                        const mc = getMeetingColor(m.color);
                        return (
                          <div
                            key={m.id}
                            onClick={(ev) => { ev.stopPropagation(); setEditingMeeting(m); setMeetingOpen(true); }}
                            onPointerDown={(ev) => ev.stopPropagation()}
                            className={cn(
                              "text-[10px] sm:text-[11px] px-1 sm:px-1.5 py-0.5 rounded truncate cursor-pointer hover:opacity-80 transition-opacity border",
                              mc.bg, mc.text, mc.border
                            )}
                            title={m.title}
                          >
                            <span className="hidden sm:inline">{m.startTime ? `${m.startTime} ` : ""}{m.title}{client ? ` · ${client.company}` : ""}</span>
                            <span className="sm:hidden">{m.title}</span>
                          </div>
                        );
                      })}
                      {dayMeetings.length > 2 && (
                        <div className="text-[9px] sm:text-[10px] text-muted-foreground px-1">+{dayMeetings.length - 2} mtg</div>
                      )}
                    </div>
                  )}

                  {/* Personal event chips (mobile + desktop) */}
                  {(calendarMode === "personal" || calendarMode === "both") && (
                    <div className="space-y-0.5">
                      {dayEvents.slice(0, calendarMode === "both" ? 2 : 3).map((e) => {
                        const ec = getEventColor(e.color);
                        return (
                          <div
                            key={e.id}
                            onClick={(ev) => { ev.stopPropagation(); setEditingEvent(e); setPersonalEventOpen(true); }}
                            onPointerDown={(ev) => ev.stopPropagation()}
                            className={cn(
                              "text-[10px] sm:text-[11px] px-1 sm:px-1.5 py-0.5 rounded truncate cursor-pointer hover:opacity-80 transition-opacity",
                              ec.bg, ec.text,
                            )}
                          >
                            {e.priority && <AlertTriangle className="w-2.5 h-2.5 text-amber-400 inline-block flex-shrink-0 mr-0.5" />}
                            <span className="hidden sm:inline">{e.startTime ? `${e.startTime} ` : ""}{e.title}</span>
                            <span className="sm:hidden">{e.title}</span>
                          </div>
                        );
                      })}
                      {dayEvents.length > (calendarMode === "both" ? 2 : 3) && (
                        <div className="text-[9px] sm:text-[10px] text-muted-foreground px-1">+{dayEvents.length - (calendarMode === "both" ? 2 : 3)}</div>
                      )}

                      {/* External calendar events (e.g. Apple Cal). Rendered
                          beneath personal events with the parent calendar's
                          color and a small dotted border to signal "imported".
                          Read-only — click does nothing for now. */}
                      {dayExternalEvents.slice(0, 2).map((e) => (
                        <div
                          key={e.id}
                          onClick={(ev) => ev.stopPropagation()}
                          onPointerDown={(ev) => ev.stopPropagation()}
                          className="text-[10px] sm:text-[11px] px-1 sm:px-1.5 py-0.5 rounded truncate border border-dashed text-foreground/80"
                          style={{ borderColor: e.color, backgroundColor: e.color + "20" }}
                          title={e.title + (e.location ? ` · ${e.location}` : "")}
                        >
                          <span className="hidden sm:inline">
                            {e.allDay ? "" : new Date(e.startAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) + " "}
                            {e.title}
                          </span>
                          <span className="sm:hidden">{e.title}</span>
                        </div>
                      ))}
                      {dayExternalEvents.length > 2 && (
                        <div className="text-[9px] sm:text-[10px] text-muted-foreground px-1">+{dayExternalEvents.length - 2} ext</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {calendarMode !== "personal" ? (
          <>
            {/* Filter tabs + project list */}
            <div className="bg-card sm:rounded-lg border-y sm:border border-border overflow-hidden">
              {selectedDate && (
                <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground">
                    {new Date(selectedDate + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
                  </span>
                  <button onClick={() => setSelectedDate(null)} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                    Show all ×
                  </button>
                </div>
              )}
              {!selectedDate && <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-1 px-4 py-3 border-b border-border">
                {/* Scope toggle */}
                <div className="flex gap-1 sm:mr-3 sm:pr-3 sm:border-r sm:border-border">
                  <button
                    onClick={() => setViewScope("month")}
                    className={cn(
                      "px-3 py-1.5 rounded text-xs font-medium whitespace-nowrap transition-colors",
                      viewScope === "month"
                        ? "bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30"
                        : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                    )}
                  >
                    This Month
                  </button>
                  <button
                    onClick={() => setViewScope("all")}
                    className={cn(
                      "px-3 py-1.5 rounded text-xs font-medium whitespace-nowrap transition-colors",
                      viewScope === "all"
                        ? "bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30"
                        : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                    )}
                  >
                    All Projects
                  </button>
                </div>
                {/* Client filter */}
                <div className="sm:mr-3 sm:pr-3 sm:border-r sm:border-border">
                  <select
                    value={clientFilter}
                    onChange={(e) => setClientFilter(e.target.value)}
                    className="bg-secondary border border-border rounded px-2 py-1.5 text-xs font-medium text-foreground outline-none focus:border-primary max-w-[200px]"
                  >
                    <option value="all">All clients</option>
                    {data.clients.map((c) => (
                      <option key={c.id} value={c.id}>{c.company}</option>
                    ))}
                  </select>
                </div>
                {/* Status filters */}
                <div className="flex gap-1 overflow-x-auto">
                {[
                  { key: "all", label: "All" },
                  { key: "tentative", label: "Tentative" },
                  { key: "upcoming", label: "Upcoming" },
                  { key: "filming_done", label: "Filmed" },
                  { key: "in_editing", label: "In Editing" },
                  { key: "editing_done", label: "Editing Done" },
                  { key: "delivered", label: "Delivered" },
                ].map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setFilterStatus(tab.key)}
                    className={cn(
                      "px-3 py-1.5 rounded text-xs font-medium whitespace-nowrap transition-colors",
                      filterStatus === tab.key
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                    )}
                  >
                    {tab.label}
                    <span className="ml-1.5 opacity-70">{statusCounts[tab.key] ?? 0}</span>
                  </button>
                ))}
                </div>
              </div>}

              {/* Pending shoot requests this day (owner) — tap to approve */}
              {dayRequests.length > 0 && (
                <button onClick={() => navigate("/shoot-requests")} className="w-full mb-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-left hover:bg-amber-500/10 transition-colors">
                  <div className="text-[11px] uppercase tracking-wider text-amber-600 dark:text-amber-400 font-medium mb-1.5 flex items-center gap-1.5"><Inbox className="w-3 h-3" /> {dayRequests.length} shoot request{dayRequests.length > 1 ? "s" : ""} — tap to review</div>
                  <div className="space-y-1">
                    {dayRequests.map(r => (
                      <div key={r.id} className="text-xs flex items-center gap-2 min-w-0">
                        <span className="font-medium text-foreground truncate">{r.propertyAddress}</span>
                        {r.preferredTime && <span className="text-muted-foreground flex-shrink-0">{hm12(r.preferredTime)}</span>}
                      </div>
                    ))}
                  </div>
                </button>
              )}

              {/* Who's available this day (availability toggle on) */}
              {showAvail && selectedDate && dayAvailability.length > 0 && (
                <div className="mb-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
                  <div className="text-[11px] uppercase tracking-wider text-emerald-700 dark:text-emerald-300 font-medium mb-1.5 flex items-center gap-1.5"><CalendarClock className="w-3 h-3" /> Available this day</div>
                  <div className="space-y-2">
                    {dayAvailability.map(a => {
                      const openTimes = isOwner ? (openSlotsByShooter[a.crewMemberId] ?? []) : [];
                      return (
                        <div key={a.crewMemberId} className="space-y-1 min-w-0">
                          <button onClick={() => setAvailEdit({ crewMemberId: a.crewMemberId, name: _getCrewMember(a.crewMemberId)?.name ?? "—" })} className="w-full text-left text-xs flex items-center gap-2 hover:opacity-80">
                            <span className="font-medium text-foreground underline decoration-dotted underline-offset-2">{_getCrewMember(a.crewMemberId)?.name ?? "—"}</span>
                            <span className="text-muted-foreground">{a.windows.map(w => `${hm12(w.start)}–${hm12(w.end)}`).join(", ")}</span>
                          </button>
                          {openTimes.length > 0 && (
                            <div className="flex flex-wrap gap-1 min-w-0">
                              {openTimes.map(t => (
                                <button
                                  key={t}
                                  onClick={() => { setBookCrewMemberId(a.crewMemberId); setBookStartTime(t); setNewProjectOpen(true); }}
                                  className="px-2 py-0.5 rounded-md border border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-[11px] font-medium hover:bg-emerald-500/20 transition-colors"
                                >
                                  {hm12(t)}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-[10px] text-muted-foreground/70 mt-1.5">{isOwner ? "Tap a time to book a shoot into that slot, or a name to edit availability." : "Tap a name to edit or remove their availability."}</p>
                </div>
              )}

              {/* Project list */}
              <div className="divide-y divide-border">
                {filteredProjects.length === 0 ? (
                  <div className="py-12 text-center text-muted-foreground text-sm">
                    No projects found
                  </div>
                ) : (
                  filteredProjects.map((project) => {
                    const client = getClient(project.clientId);
                    // For an agent, surface which brokerage they're with.
                    const broker = client?.clientType === "agent" && client.brokerId ? getClient(client.brokerId) : null;
                    const conflict = dayConflicts.find(c => c.projectId === project.id);
                    const location = getLocation(project.locationId);
                    const pType = getProjectType(project.projectTypeId);
                    const totalWorked = getProjectWorkedHours(project).totalHours;
                    const totalBilled = client
                      ? getProjectBillableHours(project, client).totalBillable
                      : totalWorked;
                    const effectiveModel = project.billingModel ?? client?.billingModel;
                    const isFlatRate = effectiveModel === "per_project";
                    const flatRateAmount = isFlatRate && client
                      ? getProjectInvoiceAmount(project, client)
                      : 0;

                    return (
                      <div
                        key={project.id}
                        onClick={() => setSelectedProject(project)}
                        className="flex items-center gap-4 px-4 py-3 hover:bg-white/3 cursor-pointer transition-colors"
                      >
                        {/* Date */}
                        <div className="w-14 flex-shrink-0 text-center">
                          <div className="text-xs text-muted-foreground">
                            {new Date(project.date + "T00:00:00").toLocaleDateString("en-US", { month: "short" })}
                          </div>
                          <div className="text-lg font-bold text-foreground leading-tight" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                            {new Date(project.date + "T00:00:00").getDate()}
                          </div>
                        </div>

                        {/* Status bar */}
                        <div className={cn("w-1 self-stretch rounded-full flex-shrink-0",
                          project.status === "tentative" && "bg-amber-400",
                          project.status === "upcoming" && "bg-blue-500",
                          project.status === "filming_done" && "bg-purple-500",
                          project.status === "in_editing" && "bg-amber-500",
                          project.status === "editing_done" && "bg-teal-500",
                          project.status === "delivered" && "bg-green-500",
                          project.status === "cancelled" && "bg-red-500",
                        )} />

                        {/* Main info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-sm font-medium text-foreground truncate">
                              {pType?.name ?? "Unknown Project"}
                            </span>
                            <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 border",
                              project.status === "tentative" && "border-amber-500/40 border-dashed text-amber-600 dark:text-amber-300",
                              project.status === "upcoming" && "border-blue-500/40 text-blue-600 dark:text-blue-300",
                              project.status === "filming_done" && "border-purple-500/40 text-purple-600 dark:text-purple-300",
                              project.status === "in_editing" && "border-amber-500/40 text-amber-600 dark:text-amber-300",
                              project.status === "editing_done" && "border-teal-500/40 text-teal-600 dark:text-teal-300",
                              project.status === "delivered" && "border-green-500/40 text-green-600 dark:text-green-300",
                              project.status === "cancelled" && "border-red-500/40 text-red-600 dark:text-red-300",
                            )}>
                              {STATUS_LABELS[project.status]}
                            </Badge>
                            {depositRecentlyPaid(project.depositPaidAt) && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 border border-emerald-500/40 text-emerald-600 dark:text-emerald-300 inline-flex items-center gap-1">
                                <CheckCircle2 className="w-2.5 h-2.5" />
                                Deposit Paid
                              </Badge>
                            )}
                          </div>
                          {broker && (
                            <div className="flex items-center gap-1 text-xs text-primary mb-0.5">
                              <Building2 className="w-3 h-3 flex-shrink-0" />
                              {broker.company}
                            </div>
                          )}
                          {conflict && (
                            <div className={cn("flex items-center gap-1 text-xs mb-0.5", conflict.type === "double" ? "text-red-500" : "text-amber-600 dark:text-amber-400")}>
                              <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                              {CONFLICT_LABEL[conflict.type]}
                              {_getCrewMember(conflict.crewMemberId)?.name ? ` · ${_getCrewMember(conflict.crewMemberId)!.name}` : ""}
                              {conflict.type === "buffer" && conflict.gapMin != null ? ` (${conflict.gapMin} min gap)` : ""}
                            </div>
                          )}
                          <div className="flex items-center gap-3 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <User className="w-3 h-3" />
                              {client?.company ?? "Unknown Client"}
                            </span>
                            {location && (
                              <span className="flex items-center gap-1 truncate">
                                <MapPin className="w-3 h-3 flex-shrink-0" />
                                {location.name}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Time + hours */}
                        <div className="text-right flex-shrink-0">
                          <div className="text-xs text-foreground">{project.startTime} – {project.endTime}</div>
                          {!isFamily && (
                            <>
                              <div className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1 justify-end mt-0.5">
                                <Clock className="w-3 h-3" />
                                {totalBilled.toFixed(1)} billed
                                {project.paidDate && (
                                  <span title={`Paid ${project.paidDate}`} className="ml-1 inline-flex items-center justify-center w-4 h-4 rounded-full bg-green-500/20 border border-green-500/40">
                                    <DollarSign className="w-2.5 h-2.5 text-green-400" />
                                  </span>
                                )}
                              </div>
                              {isFlatRate && flatRateAmount > 0 && (
                                <div className="text-[11px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1 justify-end mt-0.5 font-medium">
                                  <DollarSign className="w-3 h-3" />
                                  {flatRateAmount.toFixed(0)} flat
                                </div>
                              )}
                              {totalWorked !== totalBilled && (
                                <div className="text-[10px] text-muted-foreground text-right">
                                  {totalWorked.toFixed(1)} worked
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </>
        ) : (
          /* Personal events list */
          <div className="bg-card sm:rounded-lg border-y sm:border border-border overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <span className="text-sm font-medium text-foreground">
                {selectedDate
                  ? new Date(selectedDate + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })
                  : "Upcoming Events"}
              </span>
              {selectedDate && (
                <button onClick={() => setSelectedDate(null)} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                  Show all ×
                </button>
              )}
            </div>
            <div className="divide-y divide-border">
              {filteredPersonalEvents.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground text-sm">
                  {selectedDate ? "No events on this day." : "No personal events this month. Long-press a date to add one!"}
                </div>
              ) : (
                [...filteredPersonalEvents].sort((a, b) => a.priority === b.priority ? a.date.localeCompare(b.date) : a.priority ? -1 : 1).map((evt) => {
                  const ec = getEventColor(evt.color);
                  return (
                    <div
                      key={evt.id}
                      onClick={() => { setEditingEvent(evt); setPersonalEventOpen(true); }}
                      className="flex items-center gap-4 px-4 py-3 hover:bg-white/3 cursor-pointer transition-colors"
                    >
                      {/* Date */}
                      <div className="w-14 flex-shrink-0 text-center">
                        <div className="text-xs text-muted-foreground">
                          {new Date(evt.date + "T00:00:00").toLocaleDateString("en-US", { month: "short" })}
                        </div>
                        <div className="text-lg font-bold text-foreground leading-tight" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                          {new Date(evt.date + "T00:00:00").getDate()}
                        </div>
                      </div>

                      {/* Color bar */}
                      <div className={cn("w-1 self-stretch rounded-full flex-shrink-0", ec.dot)} />

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 text-sm font-medium text-foreground truncate">
                          {evt.priority && <AlertTriangle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />}
                          {evt.title}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          {evt.location && (
                            <span className="flex items-center gap-1 truncate">
                              <MapPin className="w-3 h-3 flex-shrink-0" />
                              {evt.location}
                            </span>
                          )}
                          {evt.category !== "personal" && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-border">
                              {evt.category}
                            </Badge>
                          )}
                        </div>
                      </div>

                      {/* Time */}
                      <div className="text-right flex-shrink-0">
                        {evt.allDay ? (
                          <div className="text-xs text-muted-foreground">All day</div>
                        ) : (
                          <div className="text-xs text-foreground">
                            {evt.startTime}{evt.endTime ? ` – ${evt.endTime}` : ""}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>

      {/* Quick-add user (owner-only) */}
      <AddUserDialog open={addUserOpen} onOpenChange={setAddUserOpen} />

      {/* Edit/delete a person's availability straight from the calendar */}
      {availEdit && selectedDate && (
        <AvailabilityDayEditor open={!!availEdit} onClose={() => setAvailEdit(null)} crewMemberId={availEdit.crewMemberId} crewMemberName={availEdit.name} date={selectedDate} />
      )}

      {/* New Project Dialog */}
      <ProjectDialog
        open={newProjectOpen}
        resume={resumeProject}
        onClose={() => { setNewProjectOpen(false); setResumeProject(false); setSelectedDate(null); setBookStartTime(null); setBookCrewMemberId(null); setHasDraft(hasProjectDraft()); }}
        defaultDate={selectedDate ?? undefined}
        defaultStartTime={bookStartTime ?? undefined}
        defaultCrewMemberId={bookCrewMemberId ?? undefined}
      />

      {/* Meeting Dialog */}
      <MeetingDialog
        open={meetingOpen}
        onClose={() => { setMeetingOpen(false); setEditingMeeting(null); }}
        initialDate={selectedDate}
        editing={editingMeeting}
      />

      {/* Project Detail Sheet */}
      {selectedProject && (
        <ProjectDetailSheet
          project={selectedProject}
          onClose={() => setSelectedProject(null)}
        />
      )}

      {/* Personal Event Dialog */}
      <PersonalEventDialog
        open={personalEventOpen}
        onClose={() => { setPersonalEventOpen(false); setEditingEvent(null); setSelectedDate(null); }}
        defaultDate={selectedDate ?? undefined}
        editEvent={editingEvent}
      />

      {/* Personal Templates Manager */}
      <PersonalTemplatesSheet
        open={templatesOpen}
        onClose={() => setTemplatesOpen(false)}
      />
    </div>
  );
}
