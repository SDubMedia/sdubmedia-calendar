// ============================================================
// MileageReportPage — Printable mileage log for CPA / tax records
// Each user sees only their own mileage
// ============================================================

import { useState, useMemo, useRef, useEffect } from "react";
import { useApp } from "@/contexts/AppContext";
import { useAuth } from "@/contexts/AuthContext";
import { ChevronLeft, ChevronRight, Printer, Car, RefreshCw, Plus, Trash2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { getAuthToken } from "@/lib/supabase";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function formatCurrency(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(n);
}

interface MileageTrip {
  date: string;
  purpose: string;  // project type + client
  destination: string;  // location name + address
  roundTripMiles: number;
  manualTripId?: string; // set for manually logged trips
}

export default function MileageReportPage() {
  const { data, upsertDistance, addManualTrip, updateManualTrip, deleteManualTrip } = useApp();
  const { effectiveProfile: profile } = useAuth();
  const printRef = useRef<HTMLDivElement>(null);
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [ratePerMile, setRatePerMile] = useState(0.70); // 2026 IRS standard rate placeholder

  // Find the current user's crew member ID
  const crewMemberId = useMemo(() => {
    if (profile?.crewMemberId) return profile.crewMemberId;
    // Owner: match by email
    return data.crewMembers.find(c => c.email === profile?.email)?.id || "";
  }, [profile, data.crewMembers]);

  const crewMember = data.crewMembers.find(c => c.id === crewMemberId);
  const [recalculating, setRecalculating] = useState(false);

  async function recalculateDistances() {
    // Manual recalc always uses the primary travel base. If the user
    // wants distances from a non-primary base they get them via the
    // auto-recalc effect above when they assign that base on a
    // project's crew entry.
    const primaryBase = (crewMember?.homeBases || []).find(b => b.isPrimary);
    const baseAddress = (primaryBase?.address ? primaryBase : null) || crewMember?.homeAddress;
    if (!crewMemberId || !baseAddress?.address) {
      toast.error("Set your home address in Staff settings first");
      return;
    }
    setRecalculating(true);
    const origin = `${baseAddress.address}, ${baseAddress.city}, ${baseAddress.state} ${baseAddress.zip}`;
    const baseId = primaryBase?.id || "primary";
    let count = 0;
    let failReason = "";

    for (const loc of data.locations.filter(l => l.address && l.city)) {
      const destination = `${loc.address}, ${loc.city}, ${loc.state} ${loc.zip}`;
      try {
        const token = await getAuthToken();
        const res = await fetch("/api/calculate-distance", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ origin, destination }),
        });
        if (res.ok) {
          const { distanceMiles } = await res.json();
          await upsertDistance(crewMemberId, loc.id, distanceMiles, baseId);
          count++;
        } else {
          const err = await res.json().catch(() => ({ error: res.statusText }));
          console.error(`API error for ${loc.name}:`, err.error);
          failReason = err.error || `HTTP ${res.status}`;
        }
      } catch (err: any) {
          console.error(`Distance calc failed for ${loc.name}:`, err.message || err);
          failReason = err.message || "Unknown error";
        }
    }
    setRecalculating(false);
    if (count > 0) {
      toast.success(`Updated distances for ${count} location${count !== 1 ? "s" : ""}`);
    } else if (data.locations.filter(l => l.address && l.city).length === 0) {
      toast.error("No locations have addresses — add addresses in Manage → Locations");
    } else {
      toast.error(failReason ? `Distance calc failed: ${failReason}` : "No distances calculated — check your Google Maps API key");
    }
  }

  // Log/edit trip dialog. `editingTripId` is null when adding a fresh
  // trip, set to the manual_trip.id when editing an existing one.
  const [tripDialogOpen, setTripDialogOpen] = useState(false);
  const [editingTripId, setEditingTripId] = useState<string | null>(null);
  const [tripForm, setTripForm] = useState({ date: new Date().toISOString().slice(0, 10), locationId: "", destination: "", purpose: "", miles: 0 });

  function openTripDialog() {
    setEditingTripId(null);
    setTripForm({ date: new Date().toISOString().slice(0, 10), locationId: "", destination: "", purpose: "", miles: 0 });
    setTripDialogOpen(true);
  }

  function openEditManualTrip(manualTripId: string) {
    const mt = data.manualTrips.find(t => t.id === manualTripId);
    if (!mt) { toast.error("Trip not found"); return; }
    setEditingTripId(mt.id);
    setTripForm({
      date: mt.date,
      locationId: mt.locationId || "",
      destination: mt.destination,
      purpose: mt.purpose,
      miles: mt.roundTripMiles,
    });
    setTripDialogOpen(true);
  }

  async function handleLogTrip() {
    if (!crewMemberId) { toast.error("No crew profile linked"); return; }
    if (!tripForm.date) { toast.error("Date is required"); return; }

    let destination = tripForm.destination;
    let miles = tripForm.miles;
    const locationId = tripForm.locationId || null;

    // If location selected, use cached distance and location name
    if (locationId) {
      const loc = data.locations.find(l => l.id === locationId);
      if (loc) {
        destination = `${loc.name}, ${loc.address} ${loc.city}, ${loc.state} ${loc.zip}`;
        const cached = distanceMap.get(locationId);
        if (cached && miles === 0) miles = Math.round(cached * 2 * 10) / 10;
      }
    }

    if (!destination) { toast.error("Enter a destination"); return; }
    if (miles <= 0) { toast.error("Enter round-trip miles"); return; }

    try {
      if (editingTripId) {
        await updateManualTrip(editingTripId, {
          date: tripForm.date,
          destination,
          locationId,
          purpose: tripForm.purpose || "Office / Gear Pickup",
          roundTripMiles: miles,
        });
        toast.success("Trip updated");
      } else {
        await addManualTrip({
          crewMemberId,
          date: tripForm.date,
          destination,
          locationId,
          purpose: tripForm.purpose || "Office / Gear Pickup",
          roundTripMiles: miles,
        });
        toast.success("Trip logged");
      }
      setTripDialogOpen(false);
      setEditingTripId(null);
      setTripForm({ date: new Date().toISOString().slice(0, 10), locationId: "", destination: "", purpose: "", miles: 0 });
    } catch (e: any) {
      toast.error(e.message || "Failed to save trip");
    }
  }

  // Build distance lookup from cached distances. Cache key is
  // `${homeBaseId}|${locationId}` since distance varies by which
  // travel base you started from.
  const distanceMap = useMemo(() => {
    const map = new Map<string, number>();
    data.crewLocationDistances
      .filter(d => d.crewMemberId === crewMemberId)
      .forEach(d => map.set(`${d.homeBaseId}|${d.locationId}`, d.distanceMiles));
    return map;
  }, [data.crewLocationDistances, crewMemberId]);

  // Resolve a home base for an arbitrary crew entry. Returns the
  // explicit homeBaseId if set; otherwise the crew member's primary
  // base; otherwise "primary" (the synthetic id for legacy data).
  function resolveHomeBaseId(homeBaseIdFromEntry?: string): string {
    if (homeBaseIdFromEntry) return homeBaseIdFromEntry;
    const primary = (crewMember?.homeBases || []).find(b => b.isPrimary);
    return primary?.id || "primary";
  }
  function resolveHomeBaseAddress(homeBaseId: string): { address: string; city: string; state: string; zip: string } | null {
    const bases = crewMember?.homeBases || [];
    const match = bases.find(b => b.id === homeBaseId);
    if (match?.address) return { address: match.address, city: match.city, state: match.state, zip: match.zip };
    // Fallback to legacy homeAddress for the synthetic "primary" id
    if (homeBaseId === "primary" && crewMember?.homeAddress?.address) return crewMember.homeAddress;
    return null;
  }

  // Auto-recalc distances for any (homeBase, location) combos that
  // are referenced by an actual project crew entry but missing from
  // the cache. Without this, a project using a brand-new location —
  // or starting from a non-primary base — shows 0 miles and gets
  // filtered out of the report. Silently runs once per session per
  // missing combo. Skips if the relevant home base address isn't
  // populated (the API call would fail anyway).
  //
  // For projects WITHOUT an explicit homeBaseId (auto-pick mode),
  // we need distances from every base the user has, so we can
  // compare and pick the closest at trip-computation time.
  const autoRanRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!crewMemberId) return;

    const allBaseIds: string[] = (crewMember?.homeBases || []).map(b => b.id);
    // Legacy users with only homeAddress: synthesize "primary"
    if (allBaseIds.length === 0 && crewMember?.homeAddress?.address) allBaseIds.push("primary");

    // Collect every (homeBase, location) combo this crew member
    // actually uses across their projects in the visible year.
    const wanted = new Set<string>();
    data.projects.forEach(p => {
      if (new Date(p.date + "T00:00:00").getFullYear() !== year) return;
      const entry = (p.crew || []).find(e => e.crewMemberId === crewMemberId);
      if (!entry || !p.locationId) return;
      // Skip if the entry has a manual roundTripMiles override —
      // those don't need a cached distance.
      if (entry.roundTripMiles && entry.roundTripMiles > 0) return;
      if (entry.homeBaseId) {
        // Explicit pick — only this one combo needed.
        wanted.add(`${entry.homeBaseId}|${p.locationId}`);
      } else {
        // Auto-pick — need distance from EVERY base so we can
        // compare and choose the closest.
        allBaseIds.forEach(baseId => wanted.add(`${baseId}|${p.locationId}`));
      }
    });

    const missing: { baseId: string; loc: typeof data.locations[number] }[] = [];
    wanted.forEach(key => {
      if (distanceMap.has(key)) return;
      if (autoRanRef.current.has(key)) return;
      const [baseId, locationId] = key.split("|");
      const loc = data.locations.find(l => l.id === locationId);
      if (!loc?.address || !loc?.city) return;
      missing.push({ baseId, loc });
    });
    if (missing.length === 0) return;

    (async () => {
      for (const { baseId, loc } of missing) {
        const baseAddr = resolveHomeBaseAddress(baseId);
        if (!baseAddr?.address || !baseAddr?.city) continue;
        const key = `${baseId}|${loc.id}`;
        autoRanRef.current.add(key);
        try {
          const token = await getAuthToken();
          const res = await fetch("/api/calculate-distance", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({
              origin: `${baseAddr.address}, ${baseAddr.city}, ${baseAddr.state} ${baseAddr.zip}`,
              destination: `${loc.address}, ${loc.city}, ${loc.state} ${loc.zip}`,
            }),
          });
          if (res.ok) {
            const { distanceMiles } = await res.json();
            await upsertDistance(crewMemberId, loc.id, distanceMiles, baseId);
          }
        } catch (err) {
          console.warn(`[MileageReport] auto-distance failed for ${loc.name} from ${baseId}:`, err);
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.locations, data.projects, distanceMap, crewMemberId, year, crewMember?.homeBases, crewMember?.homeAddress?.address]);

  // Build trips for the year (projects + manual trips)
  const trips = useMemo((): MileageTrip[] => {
    if (!crewMemberId) return [];

    // Project-based trips
    const projectTrips = data.projects
      .filter(p => {
        const d = new Date(p.date + "T00:00:00");
        if (d.getFullYear() !== year) return false;
        // Only count mileage for on-site crew, not remote post-production editors
        return (p.crew || []).some(e => e.crewMemberId === crewMemberId);
      })
      .map(p => {
        const client = data.clients.find(c => c.id === p.clientId);
        const pType = data.projectTypes.find(t => t.id === p.projectTypeId);
        const loc = data.locations.find(l => l.id === p.locationId);

        const crewEntry = (p.crew || []).find(e => e.crewMemberId === crewMemberId);

        // Pick the right base for this project:
        //  1. If crew entry has explicit homeBaseId, use it.
        //  2. Otherwise auto-pick — find the cached base with the
        //     SHORTEST distance to this location across all of the
        //     crew member's bases. This is why auto-recalc above
        //     fetches distances from every base to every location.
        let oneWay = 0;
        if (crewEntry?.roundTripMiles && crewEntry.roundTripMiles > 0) {
          oneWay = crewEntry.roundTripMiles / 2;
        } else if (p.locationId) {
          if (crewEntry?.homeBaseId) {
            oneWay = distanceMap.get(`${crewEntry.homeBaseId}|${p.locationId}`) || 0;
          } else {
            const allBaseIds = (crewMember?.homeBases || []).map(b => b.id);
            if (allBaseIds.length === 0) allBaseIds.push("primary");
            let closest = Infinity;
            allBaseIds.forEach(baseId => {
              const d = distanceMap.get(`${baseId}|${p.locationId}`);
              if (typeof d === "number" && d < closest) closest = d;
            });
            oneWay = closest === Infinity ? 0 : closest;
          }
        }

        return {
          date: p.date,
          purpose: `${pType?.name || "Project"} — ${client?.company || ""}`,
          destination: loc ? `${loc.name}, ${loc.address} ${loc.city}, ${loc.state} ${loc.zip}` : "Unknown",
          roundTripMiles: Math.round(oneWay * 2 * 10) / 10,
        };
      })
      .filter(t => t.roundTripMiles > 0);

    // Manual trips
    const manual = data.manualTrips
      .filter(t => t.crewMemberId === crewMemberId && t.date.startsWith(String(year)))
      .map(t => ({
        date: t.date,
        purpose: t.purpose,
        destination: t.destination,
        roundTripMiles: t.roundTripMiles,
        manualTripId: t.id,
      }));

    // Meeting trips — meetings with a saved address + computed oneWayMiles.
    // Distance is computed at save time against the saver's home base, so
    // a different assigned viewer here may see slightly off mileage; the
    // owner is the typical mileage tracker and saves their own meetings.
    const meetingTrips = data.meetings
      .filter(m =>
        m.date.startsWith(String(year))
        && typeof m.oneWayMiles === "number"
        && m.oneWayMiles > 0
        && (
          // Owner sees all their own meetings; assigned users see meetings
          // tied to them.
          m.ownerUserId === profile?.id
          || (Array.isArray(m.assignedUserIds) && !!profile?.id && m.assignedUserIds.includes(profile.id))
        )
      )
      .map(m => {
        const client = m.clientId ? data.clients.find(c => c.id === m.clientId) : null;
        return {
          date: m.date,
          purpose: `Meeting — ${m.title}${client ? ` · ${client.company}` : ""}`,
          destination: m.meetingAddress || "Address",
          roundTripMiles: Math.round(m.oneWayMiles! * 2 * 10) / 10,
        };
      });

    return [...projectTrips, ...manual, ...meetingTrips].sort((a, b) => a.date.localeCompare(b.date));
  }, [data.projects, data.clients, data.projectTypes, data.locations, data.manualTrips, data.meetings, crewMemberId, profile?.id, distanceMap, year]);

  // Group by month
  const monthlyGroups = useMemo(() => {
    const groups: { month: string; monthIndex: number; trips: MileageTrip[]; totalMiles: number }[] = [];
    for (let m = 0; m < 12; m++) {
      const monthTrips = trips.filter(t => {
        const d = new Date(t.date + "T00:00:00");
        return d.getMonth() === m;
      });
      if (monthTrips.length > 0) {
        const totalMiles = monthTrips.reduce((s, t) => s + t.roundTripMiles, 0);
        groups.push({ month: MONTH_NAMES[m], monthIndex: m, trips: monthTrips, totalMiles: Math.round(totalMiles * 10) / 10 });
      }
    }
    return groups;
  }, [trips]);

  const yearTotalMiles = Math.round(trips.reduce((s, t) => s + t.roundTripMiles, 0) * 10) / 10;
  const yearTotalDeduction = yearTotalMiles * ratePerMile;

  const handlePrint = () => {
    window.print();
  };

  if (!crewMemberId) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <p className="text-sm">No crew member profile linked to your account.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-border bg-card/50 print:hidden space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              Mileage Log
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">Business mileage for tax records</p>
          </div>
          <Button size="sm" onClick={handlePrint} className="gap-2">
            <Printer className="w-4 h-4" /> Print
          </Button>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground">Rate/mi:</span>
            <span className="text-muted-foreground text-sm">$</span>
            <input
              type="text" inputMode="decimal"
              min="0"
              value={ratePerMile}
              onChange={e => setRatePerMile(parseFloat(e.target.value) || 0)}
              className="w-16 h-8 bg-secondary border border-border rounded-md px-2 text-sm text-foreground"
            />
          </div>
          <Button size="sm" variant="outline" onClick={openTripDialog} className="gap-2">
            <Plus className="w-4 h-4" /> Log Trip
          </Button>
          <Button size="sm" variant="outline" onClick={recalculateDistances} disabled={recalculating} className="gap-2">
            <RefreshCw className={`w-4 h-4 ${recalculating ? "animate-spin" : ""}`} />
            {recalculating ? "Calculating..." : "Recalculate"}
          </Button>
        </div>
      </div>

      {/* Year navigator (hidden in print) */}
      <div className="flex items-center justify-center gap-4 py-3 print:hidden">
        <button onClick={() => setYear(y => y - 1)} className="p-2 text-muted-foreground hover:text-foreground">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h2 className="text-lg font-semibold text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
          {year}
        </h2>
        <button onClick={() => setYear(y => y + 1)} className="p-2 text-muted-foreground hover:text-foreground">
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-auto p-3 sm:p-6" ref={printRef}>
        {/* Print header (only visible when printing) */}
        <div className="hidden print:block mb-6">
          <h1 className="text-2xl font-bold">Business Mileage Log — {year}</h1>
          <p className="text-sm text-gray-600 mt-1">{crewMember?.name || ""} | Generated {new Date().toLocaleDateString()}</p>
        </div>

        {/* Summary cards — always 3-up. Mobile gets smaller padding +
            type so they fit on a 375px screen without wrapping. */}
        <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-6 print:mb-4">
          <div className="bg-card border border-border rounded-lg p-2.5 sm:p-4 print:p-2 text-center print:border-gray-300">
            <p className="text-lg sm:text-2xl font-bold text-foreground print:text-black">{yearTotalMiles.toLocaleString()}</p>
            <p className="text-[10px] sm:text-xs text-muted-foreground mt-1 print:text-black">Total Miles</p>
          </div>
          <div className="bg-card border border-border rounded-lg p-2.5 sm:p-4 print:p-2 text-center print:border-gray-300">
            <p className="text-lg sm:text-2xl font-bold text-foreground print:text-black">{trips.length}</p>
            <p className="text-[10px] sm:text-xs text-muted-foreground mt-1 print:text-black">Total Trips</p>
          </div>
          <div className="bg-card border border-border rounded-lg p-2.5 sm:p-4 print:p-2 text-center print:border-gray-300">
            <p className="text-lg sm:text-2xl font-bold text-primary print:text-black">{formatCurrency(yearTotalDeduction)}</p>
            <p className="text-[10px] sm:text-xs text-muted-foreground mt-1 print:text-black">
              Est. Deduction <span className="hidden sm:inline">@ ${ratePerMile}/mi</span>
            </p>
          </div>
        </div>

        {/* Monthly summary table — at-a-glance per-month totals.
            Sits above the detail tables so a CPA / tax filing reader
            sees the year shape on the first page. */}
        {monthlyGroups.length > 0 && (
          <div className="bg-card border border-border rounded-lg mb-6 print:mb-4 print:border-gray-300 print:break-inside-avoid">
            <div className="px-4 py-3 print:py-1.5 border-b border-border print:border-gray-300">
              <h3 className="text-sm font-semibold text-foreground print:text-black" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                Monthly Summary — {year}
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm print:text-xs">
                <thead>
                  <tr className="text-xs text-muted-foreground border-b border-border print:border-gray-300 print:text-black">
                    <th className="text-left px-4 py-2 print:px-2 print:py-1">Month</th>
                    <th className="text-right px-3 py-2 print:px-2 print:py-1">Trips</th>
                    <th className="text-right px-3 py-2 print:px-2 print:py-1">Total Miles</th>
                    <th className="text-right px-4 py-2 print:px-2 print:py-1">Est. Deduction</th>
                  </tr>
                </thead>
                <tbody>
                  {monthlyGroups.map(group => {
                    const monthDeduction = group.totalMiles * ratePerMile;
                    return (
                      <tr key={group.monthIndex} className="border-b border-border/50 print:border-gray-200">
                        <td className="px-4 py-2 print:px-2 print:py-1 font-medium text-foreground print:text-black">{group.month}</td>
                        <td className="text-right px-3 py-2 print:px-2 print:py-1 text-muted-foreground print:text-black">{group.trips.length}</td>
                        <td className="text-right px-3 py-2 print:px-2 print:py-1 text-foreground print:text-black">{group.totalMiles.toLocaleString()}</td>
                        <td className="text-right px-4 py-2 print:px-2 print:py-1 text-primary print:text-black">{formatCurrency(monthDeduction)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="font-bold border-t-2 border-border print:border-gray-400 print:text-black">
                    <td className="px-4 py-3 print:px-2 print:py-1">TOTAL</td>
                    <td className="text-right px-3 py-3 print:px-2 print:py-1">{trips.length}</td>
                    <td className="text-right px-3 py-3 print:px-2 print:py-1">{yearTotalMiles.toLocaleString()}</td>
                    <td className="text-right px-4 py-3 print:px-2 print:py-1 text-primary print:text-black">{formatCurrency(yearTotalDeduction)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {/* Monthly breakdown */}
        {monthlyGroups.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Car className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No mileage data for {year}. Set your home address in Staff settings and distances will be calculated.</p>
          </div>
        ) : (
          <div className="space-y-6 print:space-y-3">
            {monthlyGroups.map(group => (
              <div key={group.monthIndex} className="bg-card border border-border rounded-lg print:border-gray-300">
                <div className="flex items-center justify-between px-4 py-3 print:py-1.5 border-b border-border print:border-gray-300">
                  <h3 className="text-sm font-semibold text-foreground print:text-black" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                    {group.month}
                  </h3>
                  <span className="text-sm font-bold text-primary print:text-black">{group.totalMiles} mi</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm print:text-xs">
                    <thead>
                      <tr className="text-xs text-muted-foreground border-b border-border print:border-gray-300 print:text-black">
                        <th className="text-left px-4 py-2 print:px-2 print:py-1">Date</th>
                        <th className="text-left px-4 py-2 print:px-2 print:py-1">Business Purpose</th>
                        <th className="text-left px-4 py-2 print:px-2 print:py-1">Destination</th>
                        <th className="text-right px-4 py-2 print:px-2 print:py-1">Round Trip</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.trips.map((trip, i) => (
                        <tr key={i} className="border-b border-border/50 print:border-gray-200 last:border-0">
                          <td className="px-4 py-2 print:px-2 print:py-1 whitespace-nowrap print:text-black">
                            {new Date(trip.date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                          </td>
                          <td className="px-4 py-2 print:px-2 print:py-1 print:text-black">
                            {trip.purpose}
                            {trip.manualTripId && <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded bg-primary/15 text-primary print:hidden">manual</span>}
                          </td>
                          <td className="px-4 py-2 print:px-2 print:py-1 text-muted-foreground print:text-black">{trip.destination}</td>
                          <td className="px-4 py-2 print:px-2 print:py-1 text-right font-medium whitespace-nowrap print:text-black">
                            {trip.roundTripMiles} mi
                            {trip.manualTripId && (
                              <span className="ml-2 inline-flex items-center gap-1 print:hidden">
                                <button
                                  onClick={() => openEditManualTrip(trip.manualTripId!)}
                                  className="text-muted-foreground hover:text-primary"
                                  title="Edit trip"
                                >
                                  <Pencil className="w-3 h-3" />
                                </button>
                                <button
                                  onClick={() => {
                                    if (confirm("Delete this trip?")) {
                                      deleteManualTrip(trip.manualTripId!);
                                      toast.success("Trip deleted");
                                    }
                                  }}
                                  className="text-muted-foreground hover:text-destructive"
                                  title="Delete trip"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="font-semibold">
                        <td colSpan={3} className="px-4 py-2 print:px-2 print:py-1 text-right text-muted-foreground print:text-black">Month Total:</td>
                        <td className="px-4 py-2 print:px-2 print:py-1 text-right text-primary print:text-black">{group.totalMiles} mi</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            ))}

            {/* Annual Total */}
            <div className="bg-card border-2 border-primary/50 rounded-lg p-4 print:border-gray-400">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-foreground">Annual Total — {year}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{trips.length} trips across {monthlyGroups.length} months</p>
                </div>
                <div className="text-right">
                  <p className="text-xl font-bold text-foreground">{yearTotalMiles.toLocaleString()} mi</p>
                  <p className="text-xs text-primary font-medium">Est. deduction: {formatCurrency(yearTotalDeduction)}</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Log/Edit Trip Dialog */}
      <Dialog open={tripDialogOpen} onOpenChange={(open) => { setTripDialogOpen(open); if (!open) setEditingTripId(null); }}>
        <DialogContent className="bg-card border-border text-foreground max-w-md">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              {editingTripId ? "Edit Trip" : "Log a Trip"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Date</Label>
              <Input type="date" value={tripForm.date} onChange={e => setTripForm(f => ({ ...f, date: e.target.value }))} className="bg-secondary border-border" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Location (optional — auto-fills distance)</Label>
              <Select value={tripForm.locationId} onValueChange={v => {
                const loc = data.locations.find(l => l.id === v);
                const cached = distanceMap.get(v);
                setTripForm(f => ({
                  ...f,
                  locationId: v,
                  destination: loc ? `${loc.name}, ${loc.address} ${loc.city}, ${loc.state} ${loc.zip}` : "",
                  miles: cached ? Math.round(cached * 2 * 10) / 10 : f.miles,
                }));
              }}>
                <SelectTrigger className="bg-secondary border-border">
                  <SelectValue placeholder="Select a location..." />
                </SelectTrigger>
                <SelectContent className="bg-popover border-border">
                  {data.locations.map(l => (
                    <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Destination (or custom address)</Label>
              <Input
                value={tripForm.destination}
                onChange={e => setTripForm(f => ({ ...f, destination: e.target.value, locationId: "" }))}
                className="bg-secondary border-border"
                placeholder="e.g. Office, Best Buy, client site"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Purpose</Label>
              <Input
                value={tripForm.purpose}
                onChange={e => setTripForm(f => ({ ...f, purpose: e.target.value }))}
                className="bg-secondary border-border"
                placeholder="e.g. Gear pickup, Client meeting"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Round-Trip Miles</Label>
              <Input
                type="text" inputMode="decimal"
                value={tripForm.miles || ""}
                onChange={e => setTripForm(f => ({ ...f, miles: parseFloat(e.target.value) || 0 }))}
                className="bg-secondary border-border"
                placeholder="0"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setTripDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleLogTrip}>{editingTripId ? "Save Changes" : "Log Trip"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
