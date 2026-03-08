// ============================================================
// CalendarPage — Monthly production calendar
// Design: Dark Cinematic Studio | Amber accent on charcoal
// ============================================================

import { useState, useMemo } from "react";
import { ChevronLeft, ChevronRight, Plus, Clock, MapPin, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useApp } from "@/contexts/AppContext";
import type { Project } from "@/lib/types";
import { cn } from "@/lib/utils";
import ProjectDialog from "@/components/ProjectDialog";
import ProjectDetailSheet from "@/components/ProjectDetailSheet";

const STATUS_LABELS: Record<string, string> = {
  upcoming: "Upcoming",
  filming_done: "Filmed",
  in_editing: "Editing",
  completed: "Completed",
};

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function CalendarPage() {
  const { data } = useApp();
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // Total hours per day for calendar overlay
  const dailyHours = useMemo(() => {
    const map: Record<string, number> = {};
    data.projects.forEach(p => {
      const d = new Date(p.date + "T00:00:00");
      if (d.getFullYear() === year && d.getMonth() === month) {
        const hrs = [...p.crew, ...p.postProduction].reduce((s, e) => s + Number(e.hoursWorked ?? 0), 0);
        map[p.date] = (map[p.date] ?? 0) + hrs;
      }
    });
    return map;
  }, [data.projects, year, month]);

  // Calendar grid
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const totalCells = Math.ceil((firstDay + daysInMonth) / 7) * 7;

  // Projects for this month
  const monthProjects = useMemo(() => {
    return data.projects.filter((p) => {
      const d = new Date(p.date);
      return d.getFullYear() === year && d.getMonth() === month;
    });
  }, [data.projects, year, month]);

  // All projects filtered by status for the list below
  const filteredProjects = useMemo(() => {
    const sorted = [...data.projects].sort((a, b) => a.date.localeCompare(b.date));
    if (filterStatus === "all") return sorted;
    return sorted.filter((p) => p.status === filterStatus);
  }, [data.projects, filterStatus]);

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
  const getCrewMember = (id: string) => data.crewMembers.find((c) => c.id === id);

  const totalHoursThisMonth = useMemo(() => {
    return monthProjects.reduce((sum, p) => {
      const crew = p.crew.reduce((s, c) => s + (Number(c.hoursWorked) || 0), 0);
      const post = p.postProduction.reduce((s, c) => s + (Number(c.hoursWorked) || 0), 0);
      return sum + crew + post;
    }, 0);
  }, [monthProjects]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: data.projects.length, upcoming: 0, filming_done: 0, in_editing: 0, completed: 0 };
    data.projects.forEach((p) => { counts[p.status] = (counts[p.status] || 0) + 1; });
    return counts;
  }, [data.projects]);

  return (
    <div className="flex flex-col h-full">
      {/* Page header */}
      <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-border bg-card/50">
        <div>
          <h1 className="text-xl font-semibold text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            Production Calendar
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {monthProjects.length} projects · {Number(totalHoursThisMonth ?? 0).toFixed(1)} retainer hrs this month
          </p>
        </div>
        <Button
          onClick={() => { setSelectedDate(null); setNewProjectOpen(true); }}
          className="bg-primary text-primary-foreground hover:bg-primary/90 gap-2"
        >
          <Plus className="w-4 h-4" />
          New Project
        </Button>
      </div>

      <div className="flex-1 overflow-auto p-3 sm:p-6 space-y-4 sm:space-y-6">
        {/* Calendar */}
        <div className="bg-card rounded-lg border border-border overflow-hidden">
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
          <div className="grid grid-cols-7">
            {Array.from({ length: totalCells }).map((_, i) => {
              const day = i - firstDay + 1;
              const isCurrentMonth = day >= 1 && day <= daysInMonth;
              const isToday = isCurrentMonth && day === today.getDate() && month === today.getMonth() && year === today.getFullYear();
              const dayProjects = isCurrentMonth ? getProjectsForDay(day) : [];
              const dateStr = isCurrentMonth
                ? `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
                : null;
              const dayHours = dateStr ? (dailyHours[dateStr] ?? null) : null;

              return (
                <div
                  key={i}
                  className={cn(
                    "min-h-[60px] sm:min-h-[100px] p-1 sm:p-1.5 border-b border-r border-border relative",
                    !isCurrentMonth && "opacity-30",
                    isToday && "bg-primary/5",
                    isCurrentMonth && "hover:bg-white/3 cursor-pointer transition-colors"
                  )}
                  onClick={() => {
                    if (isCurrentMonth && dateStr) {
                      setSelectedDate(dateStr);
                      setNewProjectOpen(true);
                    }
                  }}
                >
                  {/* Day number + hours overlay */}
                  <div className="flex items-start justify-between mb-1">
                    <span className={cn(
                      "text-xs font-medium w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center rounded-full",
                      isToday ? "bg-primary text-primary-foreground" : "text-foreground"
                    )}>
                      {isCurrentMonth ? day : ""}
                    </span>
                    {dayHours !== null && dayHours > 0 && (
                      <span className="text-[9px] sm:text-[10px] font-medium tabular-nums px-0.5 sm:px-1 py-0.5 rounded hidden xs:inline-block sm:inline-block text-amber-400 bg-amber-500/10">
                        {Number(dayHours).toFixed(1)}h
                      </span>
                    )}
                  </div>

                  {/* Mobile dot indicator for days with projects */}
                  {dayProjects.length > 0 && (
                    <div className="flex gap-0.5 flex-wrap sm:hidden mb-0.5">
                      {dayProjects.slice(0, 3).map((p) => (
                        <div key={p.id} className={cn(
                          "w-1.5 h-1.5 rounded-full",
                          p.status === "upcoming" && "bg-blue-400",
                          p.status === "filming_done" && "bg-purple-400",
                          p.status === "in_editing" && "bg-amber-400",
                          p.status === "completed" && "bg-green-400",
                        )} />
                      ))}
                    </div>
                  )}

                  {/* Project chips — hidden on very small screens */}
                  <div className="space-y-0.5 hidden sm:block">
                    {dayProjects.slice(0, 3).map((p) => (
                      <div
                        key={p.id}
                        onClick={(e) => { e.stopPropagation(); setSelectedProject(p); }}
                        className={cn(
                          "text-[10px] px-1.5 py-0.5 rounded truncate cursor-pointer hover:opacity-80 transition-opacity",
                          p.status === "upcoming" && "bg-blue-500/25 text-blue-300",
                          p.status === "filming_done" && "bg-purple-500/25 text-purple-300",
                          p.status === "in_editing" && "bg-amber-500/25 text-amber-300",
                          p.status === "completed" && "bg-green-500/25 text-green-300",
                        )}
                      >
                        {p.startTime} {getProjectType(p.projectTypeId)?.name ?? "Project"}
                      </div>
                    ))}
                    {dayProjects.length > 3 && (
                      <div className="text-[10px] text-muted-foreground px-1">+{dayProjects.length - 3} more</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Filter tabs + project list */}
        <div className="bg-card rounded-lg border border-border overflow-hidden">
          <div className="flex items-center gap-1 px-4 py-3 border-b border-border overflow-x-auto">
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
                const totalHrs = [
                  ...project.crew.map((c) => Number(c.hoursWorked ?? 0)),
                  ...project.postProduction.map((c) => Number(c.hoursWorked ?? 0)),
                ].reduce((s, h) => s + h, 0);

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
                    )} />

                    {/* Main info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-sm font-medium text-foreground truncate">
                          {pType?.name ?? "Unknown Project"}
                        </span>
                        <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 border",
                          project.status === "upcoming" && "border-blue-500/40 text-blue-300",
                          project.status === "filming_done" && "border-purple-500/40 text-purple-300",
                          project.status === "in_editing" && "border-amber-500/40 text-amber-300",
                          project.status === "completed" && "border-green-500/40 text-green-300",
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
                      <div className="text-xs text-muted-foreground flex items-center gap-1 justify-end mt-0.5">
                        <Clock className="w-3 h-3" />
                        {Number(totalHrs ?? 0).toFixed(1)} hrs
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
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
    </div>
  );
}
