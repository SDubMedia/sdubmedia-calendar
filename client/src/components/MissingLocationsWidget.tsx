// ============================================================
// "Add a location to track miles" — projects with no saved location.
//
// Mileage is measured from each crew member's home base to the project's
// location, so a project with no location can't show miles for anyone.
// Rather than a silent blank on the project sheet, those projects surface
// here (Geoff, 2026-09-13). Derived from the projects themselves, never
// stored: fixing the project clears the item on its own. Owner only, since
// only the owner edits projects.
//
// Shown on the dashboard as a widget AND at the top of To-Dos; both read
// the same on/off switch (Manage → Settings → Dashboard widgets →
// "Missing locations"), so one toggle governs both places.
//
// Window: from 48 hours before the project date (Geoff, 2026-09-13: an
// address booked far out isn't missing yet) back to 90 days ago (still
// worth logging for the mileage report). Types marked "no location
// needed" (edit-only work) are never listed.
// ============================================================

import { useMemo } from "react";
import { Link } from "wouter";
import { MapPin } from "lucide-react";
import { useScopedData as useApp } from "@/hooks/useScopedData";
import { useAuth } from "@/contexts/AuthContext";
import { mergeDashboardWidgets } from "@/lib/types";

export function useMissingLocationReminders() {
  const { data } = useApp();
  const { effectiveProfile } = useAuth();
  const isOwner = effectiveProfile?.role === "owner";
  const enabled = mergeDashboardWidgets(data.organization?.dashboardWidgets).find(w => w.id === "missingLocations")?.enabled ?? true;
  const items = useMemo(() => {
    if (!isOwner) return [];
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 90);
    const since = cutoff.toISOString().slice(0, 10);
    const soon = new Date(); soon.setDate(soon.getDate() + 2);
    const until = soon.toISOString().slice(0, 10);
    const noLocationTypes = new Set(data.projectTypes.filter(t => t.needsLocation === false).map(t => t.id));
    return data.projects
      .filter(p => p.status !== "cancelled" && !p.locationId && p.date >= since && p.date <= until && !noLocationTypes.has(p.projectTypeId))
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(p => {
        const c = data.clients.find(x => x.id === p.clientId);
        const t = data.projectTypes.find(x => x.id === p.projectTypeId);
        const d = new Date(p.date + "T00:00:00");
        return {
          id: p.id,
          label: `${t?.name || "Project"}${c ? ` · ${c.company}` : ""}`,
          when: isNaN(d.getTime()) ? p.date : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
        };
      });
  }, [isOwner, data.projects, data.clients, data.projectTypes]);
  return { items, enabled, isOwner };
}

/** Renders nothing when switched off, not an owner, or nothing is missing. */
export default function MissingLocationsWidget() {
  const { items, enabled, isOwner } = useMissingLocationReminders();
  if (!enabled || !isOwner || items.length === 0) return null;
  return (
    <div className="bg-card border border-amber-500/30 rounded-lg overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border text-xs font-semibold text-amber-500 uppercase tracking-wider flex items-center gap-1.5">
        <MapPin className="w-3.5 h-3.5" /> Add a location to track miles ({items.length})
      </div>
      {items.map(p => (
        <Link key={p.id} href={`/calendar?project=${p.id}`}>
          <div className="px-4 py-3 border-b border-border last:border-b-0 hover:bg-white/5 cursor-pointer">
            <div className="text-sm text-foreground">{p.label}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{p.when} · no location saved, so mileage can't be calculated. Open the project and add one.</div>
          </div>
        </Link>
      ))}
    </div>
  );
}
