// ============================================================
// MySchedulePage — Staff-only view of their schedule & pay
// Toggle between simplified schedule list and filtered calendar
// ============================================================

import { useState, useMemo, useCallback } from "react";
import { ChevronLeft, ChevronRight, CalendarDays, List, Clock, MapPin, DollarSign } from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import { useAuth } from "@/contexts/AuthContext";
import type { Project } from "@/lib/types";
import { cn } from "@/lib/utils";
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

export default function MySchedulePage() {
  const { data } = useApp();
  const { effectiveProfile } = useAuth();
  const crewMemberId = effectiveProfile?.crewMemberId || "";
  const today = useMemo(() => new Date(), []);
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [view, setView] = useState<"schedule" | "calendar">("schedule");
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);

  // Filter projects to only those this staff member is involved in
  const myProjects = useMemo(() => {
    if (!crewMemberId) return [];
    return data.projects.filter(p =>
      p.crew.some(c => c.crewMemberId === crewMemberId) ||
      p.postProduction.some(c => c.crewMemberId === crewMemberId)
    );
  }, [data.projects, crewMemberId]);

  // Monthly filtered projects
  const monthProjects = useMemo(() => {
    return myProjects.filter(p => {
      const d = new Date(p.date + "T00:00:00");
      return d.getFullYear() === year && d.getMonth() === month;
    });
  }, [myProjects, year, month]);

  // Upcoming projects (from today forward) for schedule view
  const upcomingProjects = useMemo(() => {
    const todayStr = today.toISOString().split("T")[0];
    return [...myProjects]
      .filter(p => p.date >= todayStr)
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [myProjects, today]);

  // Past projects for schedule view
  const pastProjects = useMemo(() => {
    const todayStr = today.toISOString().split("T")[0];
    return [...myProjects]
      .filter(p => p.date < todayStr)
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [myProjects, today]);

  const getClient = (id: string) => data.clients.find(c => c.id === id);
  const getLocation = (id: string) => data.locations.find(l => l.id === id);
  const getProjectType = (id: string) => data.projectTypes.find(pt => pt.id === id);

  // Calculate pay for this crew member on a project
  const getMyPay = useCallback((project: Project) => {
    let totalHours = 0;
    let totalPay = 0;
    const entries: { role: string; hours: number; rate: number; pay: number; type: string; unit: string }[] = [];

    project.crew.forEach(c => {
      if (c.crewMemberId === crewMemberId) {
        // If this project has editorBilling and this person is the photo editor,
        // skip hourly — their pay comes from editorBilling in postProduction
        const isAlsoPhotoEditor = project.editorBilling && project.postProduction.some(
          pp => pp.crewMemberId === crewMemberId && pp.role === "Photo Editor"
        );
        if (isAlsoPhotoEditor) return; // pay handled in postProduction loop

        const hours = Number(c.hoursWorked ?? 0);
        const rate = Number(c.payRatePerHour ?? 0);
        totalHours += hours;
        totalPay += hours * rate;
        entries.push({ role: c.role, hours, rate, pay: hours * rate, type: "Shoot", unit: "hrs" });
      }
    });

    project.postProduction.forEach(c => {
      if (c.crewMemberId === crewMemberId) {
        if (c.role === "Photo Editor" || (project.editorBilling && c.crewMemberId === crewMemberId)) {
          const rate = project.editorBilling?.perImageRate ?? 6;
          const imgs = project.editorBilling?.imageCount ?? 0;
          // Finalized if explicitly set OR project is completed
          const isFinalized = project.editorBilling?.finalized === true || project.status === "completed";
          const pay = imgs * rate;
          if (imgs > 0) {
            totalPay += pay;
          }
          entries.push({
            role: c.role, hours: imgs, rate, pay,
            type: isFinalized && imgs > 0 ? "Post" : "Projected",
            unit: "images",
          });
        } else {
          const hours = Number(c.hoursWorked ?? 0);
          const rate = Number(c.payRatePerHour ?? 0);
          totalHours += hours;
          totalPay += hours * rate;
          entries.push({ role: c.role, hours, rate, pay: hours * rate, type: "Post", unit: "hrs" });
        }
      }
    });

    return { totalHours, totalPay, entries };
  }, [crewMemberId]);

  // Monthly totals
  const monthlyTotals = useMemo(() => {
    let hours = 0, pay = 0;
    monthProjects.forEach(p => {
      const myPay = getMyPay(p);
      hours += myPay.totalHours;
      pay += myPay.totalPay;
    });
    return { hours, pay };
  }, [monthProjects, getMyPay]);

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
    return monthProjects.filter(p => p.date === dateStr);
  };

  // Calendar grid
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const totalCells = Math.ceil((firstDay + daysInMonth) / 7) * 7;

  const crewMember = data.crewMembers.find(cm => cm.id === crewMemberId);

  const renderProjectCard = (project: Project) => {
    const client = getClient(project.clientId);
    const location = getLocation(project.locationId);
    const pType = getProjectType(project.projectTypeId);
    const { totalHours, totalPay, entries } = getMyPay(project);

    return (
      <div
        key={project.id}
        onClick={() => setSelectedProject(project)}
        className="bg-card border border-border rounded-lg p-4 hover:border-primary/30 cursor-pointer transition-colors"
      >
        <div className="flex items-start justify-between mb-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-semibold text-foreground">
                {new Date(project.date + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
              </span>
              <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded border",
                project.status === "upcoming" && "border-blue-500/40 text-blue-300 bg-blue-500/10",
                project.status === "filming_done" && "border-purple-500/40 text-purple-300 bg-purple-500/10",
                project.status === "in_editing" && "border-amber-500/40 text-amber-300 bg-amber-500/10",
                project.status === "completed" && "border-green-500/40 text-green-300 bg-green-500/10",
              )}>
                {STATUS_LABELS[project.status]}
              </span>
            </div>
            <div className="text-sm text-foreground">{pType?.name ?? "Project"}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{client?.company ?? "Unknown Client"}</div>
          </div>
          <div className="text-right">
            <div className="text-lg font-bold text-green-400" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              ${totalPay.toFixed(0)}
            </div>
            <div className="text-[10px] text-muted-foreground">{totalHours.toFixed(1)} hrs</div>
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs text-muted-foreground mb-3">
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {project.startTime} – {project.endTime}
          </span>
          {location && (
            <span className="flex items-center gap-1 truncate">
              <MapPin className="w-3 h-3 flex-shrink-0" />
              {location.name}
            </span>
          )}
        </div>

        {/* Pay breakdown */}
        <div className="space-y-1">
          {entries.map((entry, i) => (
            <div key={i} className="flex items-center justify-between text-xs px-2 py-1 rounded bg-secondary/50">
              <span className="text-muted-foreground">
                <span className="text-foreground">{entry.role}</span>
                <span className="ml-1 opacity-60">({entry.type})</span>
              </span>
              <span className="text-foreground tabular-nums">
                {entry.type === "Projected" && entry.unit === "images" ? (
                  entry.hours > 0 ? (
                    <><span className="text-blue-400">~{entry.hours} imgs × ${entry.rate}/img = ~${entry.pay.toFixed(0)}</span> <span className="text-[10px] text-blue-400/60">Projected</span></>
                  ) : (
                    <span className="text-blue-400">${entry.rate}/img · Pending</span>
                  )
                ) : (
                  <>{entry.hours} {entry.unit === "images" ? "imgs" : "h"} × ${entry.rate}/{entry.unit === "images" ? "img" : "hr"} = <span className="text-green-400">${entry.pay.toFixed(0)}</span></>
                )}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-border bg-card/50">
        <div>
          <h1 className="text-xl font-semibold text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            My Schedule
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {crewMember?.name ?? "Staff"} · {monthProjects.length} jobs in {MONTH_NAMES[month]} · ${monthlyTotals.pay.toFixed(0)} earned
          </p>
        </div>
        <div className="flex items-center gap-1 bg-secondary rounded-lg p-1">
          <button
            onClick={() => setView("schedule")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
              view === "schedule" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <List className="w-3.5 h-3.5" />
            Schedule
          </button>
          <button
            onClick={() => setView("calendar")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
              view === "calendar" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <CalendarDays className="w-3.5 h-3.5" />
            Calendar
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-3 sm:p-6 space-y-4 sm:space-y-6">
        {view === "schedule" ? (
          /* ---- Schedule List View ---- */
          <div className="space-y-6">
            {/* Monthly earnings summary */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-card border border-border rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-green-400" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                  ${monthlyTotals.pay.toFixed(0)}
                </div>
                <div className="text-xs text-muted-foreground mt-1">Earnings ({MONTH_NAMES[month].slice(0, 3)})</div>
              </div>
              <div className="bg-card border border-border rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                  {monthlyTotals.hours.toFixed(1)}
                </div>
                <div className="text-xs text-muted-foreground mt-1">Hours ({MONTH_NAMES[month].slice(0, 3)})</div>
              </div>
              <div className="bg-card border border-border rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                  {monthProjects.length}
                </div>
                <div className="text-xs text-muted-foreground mt-1">Jobs ({MONTH_NAMES[month].slice(0, 3)})</div>
              </div>
            </div>

            {/* Month navigation for earnings */}
            <div className="flex items-center justify-center gap-4">
              <button onClick={prevMonth} className="p-1.5 rounded hover:bg-white/8 text-muted-foreground hover:text-foreground transition-colors">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm font-medium text-foreground">{MONTH_NAMES[month]} {year}</span>
              <button onClick={nextMonth} className="p-1.5 rounded hover:bg-white/8 text-muted-foreground hover:text-foreground transition-colors">
                <ChevronRight className="w-4 h-4" />
              </button>
              <button
                onClick={() => { setYear(today.getFullYear()); setMonth(today.getMonth()); }}
                className="text-xs text-primary hover:text-primary/80 transition-colors"
              >
                Today
              </button>
            </div>

            {/* Upcoming jobs */}
            {upcomingProjects.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                  <CalendarDays className="w-4 h-4 text-primary" />
                  Upcoming Jobs
                </h2>
                <div className="space-y-3">
                  {upcomingProjects.map(renderProjectCard)}
                </div>
              </div>
            )}

            {/* Past jobs */}
            {pastProjects.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                  <Clock className="w-4 h-4" />
                  Past Jobs
                </h2>
                <div className="space-y-3">
                  {pastProjects.map(renderProjectCard)}
                </div>
              </div>
            )}

            {myProjects.length === 0 && (
              <div className="bg-card border border-border rounded-lg p-8 text-center">
                <CalendarDays className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground">No scheduled jobs yet</p>
              </div>
            )}
          </div>
        ) : (
          /* ---- Calendar View ---- */
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
              {DAY_NAMES.map(d => (
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

                return (
                  <div
                    key={i}
                    className={cn(
                      "min-h-[60px] sm:min-h-[100px] p-1 sm:p-1.5 border-b border-r border-border relative",
                      !isCurrentMonth && "opacity-30",
                      isToday && "bg-primary/5",
                    )}
                  >
                    <div className="flex items-start justify-between mb-1">
                      <span className={cn(
                        "text-xs font-medium w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center rounded-full",
                        isToday ? "bg-primary text-primary-foreground" : "text-foreground"
                      )}>
                        {isCurrentMonth ? day : ""}
                      </span>
                      {dayProjects.length > 0 && (
                        <span className="hidden sm:block text-[9px] font-medium tabular-nums px-1 py-0.5 rounded text-green-400 bg-green-500/10">
                          ${dayProjects.reduce((s, p) => s + getMyPay(p).totalPay, 0).toFixed(0)}
                        </span>
                      )}
                    </div>

                    {/* Mobile dot indicator */}
                    {dayProjects.length > 0 && (
                      <div className="flex gap-0.5 flex-wrap sm:hidden mb-0.5">
                        {dayProjects.slice(0, 3).map(p => (
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

                    {/* Project chips */}
                    <div className="space-y-0.5 hidden sm:block">
                      {dayProjects.slice(0, 3).map(p => {
                        const { totalPay } = getMyPay(p);
                        return (
                          <div
                            key={p.id}
                            onClick={() => setSelectedProject(p)}
                            className={cn(
                              "text-[10px] px-1.5 py-0.5 rounded truncate cursor-pointer hover:opacity-80 transition-opacity",
                              p.status === "upcoming" && "bg-blue-500/25 text-blue-300",
                              p.status === "filming_done" && "bg-purple-500/25 text-purple-300",
                              p.status === "in_editing" && "bg-amber-500/25 text-amber-300",
                              p.status === "completed" && "bg-green-500/25 text-green-300",
                            )}
                          >
                            {p.startTime} {getProjectType(p.projectTypeId)?.name ?? "Project"} · {getClient(p.clientId)?.company ?? ""}
                          </div>
                        );
                      })}
                      {dayProjects.length > 3 && (
                        <div className="text-[10px] text-muted-foreground px-1">+{dayProjects.length - 3} more</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Monthly summary bar */}
            <div className="flex items-center justify-between px-5 py-3 border-t border-border bg-secondary/30">
              <span className="text-xs text-muted-foreground">{monthProjects.length} jobs this month</span>
              <div className="flex items-center gap-4 text-xs">
                <span className="text-muted-foreground">{monthlyTotals.hours.toFixed(1)} hrs</span>
                <span className="text-green-400 font-semibold flex items-center gap-1">
                  <DollarSign className="w-3 h-3" />
                  {monthlyTotals.pay.toFixed(0)}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

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
