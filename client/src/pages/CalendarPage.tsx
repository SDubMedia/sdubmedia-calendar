// ============================================================
// CalendarPage — Monthly production calendar
// Design: Dark Cinematic Studio | Amber accent on charcoal
// ============================================================

import { useState, useMemo, useCallback, useRef } from "react";
import { ChevronLeft, ChevronRight, Plus, Clock, MapPin, User, DollarSign, Calendar, Heart, Layers, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useScopedData as useApp } from "@/hooks/useScopedData";
import { useAuth } from "@/contexts/AuthContext";
import type { Project, PersonalEvent } from "@/lib/types";
import { cn } from "@/lib/utils";
import { getBillableHours, getProjectWorkedHours, getProjectBillableHours, getProjectInvoiceAmount } from "@/lib/data";
import ProjectDialog from "@/components/ProjectDialog";
import ProjectDetailSheet from "@/components/ProjectDetailSheet";
import PersonalEventDialog, { getEventColor } from "@/components/PersonalEventDialog";
import PersonalTemplatesSheet from "@/components/PersonalTemplatesSheet";
import { Settings } from "lucide-react";

const STATUS_LABELS: Record<string, string> = {
  upcoming: "Upcoming",
  filming_done: "Filmed",
  in_editing: "Editing",
  completed: "Completed",
  cancelled: "Cancelled",
};

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function CalendarPage() {
  const { data } = useApp();
  const { effectiveProfile } = useAuth();
  const role = effectiveProfile?.role;
  const isClient = role === "client";
  const isFamily = role === "family";
  const canSeePersonal = role === "owner" || role === "family";
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [viewScope, setViewScope] = useState<"month" | "all">("month");
  const [calendarMode, setCalendarMode] = useState<"production" | "personal" | "both">(isFamily ? "personal" : "production");
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [personalEventOpen, setPersonalEventOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<PersonalEvent | null>(null);
  const [templatesOpen, setTemplatesOpen] = useState(false);

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
    if (!dateStr || isClient) return;
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

  // Projects for this month
  const monthProjects = useMemo(() => {
    const prefix = `${year}-${String(month + 1).padStart(2, "0")}`;
    return data.projects.filter((p) => p.date.startsWith(prefix));
  }, [data.projects, year, month]);

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

  // Projects filtered by selected date, or scope (month/all) and status
  const filteredProjects = useMemo(() => {
    let projects;
    if (selectedDate) {
      projects = data.projects.filter(p => p.date === selectedDate);
    } else {
      projects = viewScope === "month" ? monthProjects : data.projects;
    }
    const sorted = [...projects].sort((a, b) => a.date.localeCompare(b.date));
    if (filterStatus === "all") return sorted;
    return sorted.filter((p) => p.status === filterStatus);
  }, [data.projects, monthProjects, filterStatus, viewScope, selectedDate]);

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
    const counts: Record<string, number> = { all: projects.length, upcoming: 0, filming_done: 0, in_editing: 0, completed: 0 };
    projects.forEach((p) => { counts[p.status] = (counts[p.status] || 0) + 1; });
    return counts;
  }, [data.projects, monthProjects, viewScope]);

  return (
    <div className="flex flex-col h-full">
      {/* Page header */}
      <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-border bg-card/50 space-y-2">
        {/* Top row: title + action buttons */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              {calendarMode === "production" ? "Production Calendar" : calendarMode === "personal" ? "My Life" : "All Calendars"}
            </h1>
            {!(isFamily && calendarMode !== "personal") && (
              <p className="text-sm text-muted-foreground mt-0.5">
                {calendarMode === "production"
                  ? `${monthProjects.length} projects · ${monthlyHoursTotals.worked.toFixed(1)} worked · ${monthlyHoursTotals.billed.toFixed(1)} billed`
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
            {!isClient && (
              <Button
                onClick={() => openAddForDate(null)}
                className="bg-primary text-primary-foreground hover:bg-primary/90 gap-2"
              >
                <Plus className="w-4 h-4" />
                <span>New</span>
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
      </div>

      <div className="flex-1 overflow-auto px-0 py-3 sm:p-6 space-y-4 sm:space-y-6">
        {/* Calendar */}
        <div className="bg-card sm:rounded-lg border-y sm:border border-border overflow-hidden">
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
              const dateStr = isCurrentMonth
                ? `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
                : null;
              const dayHours = dateStr ? (dailyHours[dateStr] ?? null) : null;

              const isSelected = dateStr !== null && dateStr === selectedDate;
              return (
                <div
                  key={i}
                  className={cn(
                    "min-h-[90px] sm:min-h-[100px] p-1 sm:p-1.5 border-b border-r border-border relative select-none",
                    !isCurrentMonth && "opacity-30",
                    isToday && !isSelected && "bg-primary/5",
                    isSelected && "bg-primary/15 ring-2 ring-primary/60 ring-inset",
                    isCurrentMonth && "hover:bg-white/3 cursor-pointer transition-colors"
                  )}
                  onClick={() => {
                    if (longPressTriggeredRef.current) {
                      longPressTriggeredRef.current = false;
                      return;
                    }
                    if (swipeFiredRef.current) {
                      swipeFiredRef.current = false;
                      return;
                    }
                    if (isCurrentMonth && dateStr && !isClient) {
                      setSelectedDate(prev => prev === dateStr ? null : dateStr);
                    }
                  }}
                  onPointerDown={() => handleDayPointerDown(isCurrentMonth ? dateStr : null)}
                  onPointerUp={cancelLongPress}
                  onPointerLeave={cancelLongPress}
                  onPointerCancel={cancelLongPress}
                >
                  {/* Day number + hours overlay */}
                  <div className="flex items-start justify-between mb-1">
                    <span className={cn(
                      "text-xs font-medium w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center rounded-full",
                      isToday ? "bg-primary text-primary-foreground" : "text-foreground"
                    )}>
                      {isCurrentMonth ? day : ""}
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
                            "text-[9px] sm:text-[10px] px-1 sm:px-1.5 py-0.5 rounded truncate cursor-pointer hover:opacity-80 transition-opacity",
                            p.status === "upcoming" && "bg-blue-500/25 text-blue-700 dark:text-blue-300",
                            p.status === "filming_done" && "bg-purple-500/25 text-purple-700 dark:text-purple-300",
                            p.status === "in_editing" && "bg-amber-500/25 text-amber-700 dark:text-amber-300",
                            p.status === "completed" && "bg-green-500/25 text-green-700 dark:text-green-300",
                          )}
                        >
                          {p.paidDate && <DollarSign className="w-2.5 h-2.5 text-green-400 inline-block flex-shrink-0" />}
                          <span className="hidden sm:inline">{p.startTime} {getProjectType(p.projectTypeId)?.name ?? "Project"} · {getClient(p.clientId)?.company ?? ""}</span>
                          <span className="sm:hidden">{getProjectType(p.projectTypeId)?.name ?? "Project"}</span>
                        </div>
                      ))}
                      {dayProjects.length > (calendarMode === "both" ? 2 : 3) && (
                        <div className="text-[9px] sm:text-[10px] text-muted-foreground px-1">+{dayProjects.length - (calendarMode === "both" ? 2 : 3)}</div>
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
                              "text-[9px] sm:text-[10px] px-1 sm:px-1.5 py-0.5 rounded truncate cursor-pointer hover:opacity-80 transition-opacity",
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
                {/* Status filters */}
                <div className="flex gap-1 overflow-x-auto">
                {[
                  { key: "all", label: "All" },
                  { key: "upcoming", label: "Upcoming" },
                  { key: "filming_done", label: "Filmed" },
                  { key: "in_editing", label: "In Editing" },
                  { key: "completed", label: "Completed" },
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

              {/* Project list */}
              <div className="divide-y divide-border">
                {filteredProjects.length === 0 ? (
                  <div className="py-12 text-center text-muted-foreground text-sm">
                    No projects found
                  </div>
                ) : (
                  filteredProjects.map((project) => {
                    const client = getClient(project.clientId);
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
                          project.status === "upcoming" && "bg-blue-500",
                          project.status === "filming_done" && "bg-purple-500",
                          project.status === "in_editing" && "bg-amber-500",
                          project.status === "completed" && "bg-green-500",
                          project.status === "cancelled" && "bg-red-500",
                        )} />

                        {/* Main info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-sm font-medium text-foreground truncate">
                              {pType?.name ?? "Unknown Project"}
                            </span>
                            <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 border",
                              project.status === "upcoming" && "border-blue-500/40 text-blue-600 dark:text-blue-300",
                              project.status === "filming_done" && "border-purple-500/40 text-purple-600 dark:text-purple-300",
                              project.status === "in_editing" && "border-amber-500/40 text-amber-600 dark:text-amber-300",
                              project.status === "completed" && "border-green-500/40 text-green-600 dark:text-green-300",
                              project.status === "cancelled" && "border-red-500/40 text-red-600 dark:text-red-300",
                            )}>
                              {STATUS_LABELS[project.status]}
                            </Badge>
                          </div>
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

      {/* New Project Dialog */}
      <ProjectDialog
        open={newProjectOpen}
        onClose={() => { setNewProjectOpen(false); setSelectedDate(null); }}
        defaultDate={selectedDate ?? undefined}
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
