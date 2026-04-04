// ============================================================
// MileageReportPage — Printable mileage log for CPA / tax records
// Each user sees only their own mileage
// ============================================================

import { useState, useMemo, useRef } from "react";
import { useApp } from "@/contexts/AppContext";
import { useAuth } from "@/contexts/AuthContext";
import { ChevronLeft, ChevronRight, Printer, Car, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
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
}

export default function MileageReportPage() {
  const { data, upsertDistance } = useApp();
  const { profile } = useAuth();
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
    if (!crewMemberId || !crewMember?.homeAddress?.address) {
      toast.error("Set your home address in Staff settings first");
      return;
    }
    setRecalculating(true);
    const homeAddr = crewMember.homeAddress;
    const origin = `${homeAddr.address}, ${homeAddr.city}, ${homeAddr.state} ${homeAddr.zip}`;
    let count = 0;

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
          await upsertDistance(crewMemberId, loc.id, distanceMiles);
          count++;
        }
      } catch { /* skip */ }
    }
    setRecalculating(false);
    if (count > 0) toast.success(`Updated distances for ${count} location${count !== 1 ? "s" : ""}`);
    else toast.error("No distances calculated — check your Google Maps API key");
  }

  // Build distance lookup from cached distances
  const distanceMap = useMemo(() => {
    const map = new Map<string, number>();
    data.crewLocationDistances
      .filter(d => d.crewMemberId === crewMemberId)
      .forEach(d => map.set(d.locationId, d.distanceMiles));
    return map;
  }, [data.crewLocationDistances, crewMemberId]);

  // Build trips for the year
  const trips = useMemo((): MileageTrip[] => {
    if (!crewMemberId) return [];

    return data.projects
      .filter(p => {
        const d = new Date(p.date + "T00:00:00");
        if (d.getFullYear() !== year) return false;
        // Check if this crew member is on this project
        return [...(p.crew || []), ...(p.postProduction || [])]
          .some(e => e.crewMemberId === crewMemberId);
      })
      .map(p => {
        const client = data.clients.find(c => c.id === p.clientId);
        const pType = data.projectTypes.find(t => t.id === p.projectTypeId);
        const loc = data.locations.find(l => l.id === p.locationId);

        // Use snapshot from crew entry or fall back to cached distance
        const crewEntry = (p.crew || []).find(e => e.crewMemberId === crewMemberId);
        const oneWay = crewEntry?.roundTripMiles
          ? crewEntry.roundTripMiles / 2
          : (p.locationId ? distanceMap.get(p.locationId) || 0 : 0);

        return {
          date: p.date,
          purpose: `${pType?.name || "Project"} — ${client?.company || ""}`,
          destination: loc ? `${loc.name}, ${loc.address} ${loc.city}, ${loc.state} ${loc.zip}` : "Unknown",
          roundTripMiles: Math.round(oneWay * 2 * 10) / 10,
        };
      })
      .filter(t => t.roundTripMiles > 0)
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [data.projects, data.clients, data.projectTypes, data.locations, crewMemberId, distanceMap, year]);

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
              type="number"
              step="0.01"
              min="0"
              value={ratePerMile}
              onChange={e => setRatePerMile(parseFloat(e.target.value) || 0)}
              className="w-16 h-8 bg-secondary border border-border rounded-md px-2 text-sm text-foreground"
            />
          </div>
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

        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-card border border-border rounded-lg p-4 text-center print:border-gray-300">
            <p className="text-2xl font-bold text-foreground">{yearTotalMiles.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground mt-1">Total Miles ({year})</p>
          </div>
          <div className="bg-card border border-border rounded-lg p-4 text-center print:border-gray-300">
            <p className="text-2xl font-bold text-foreground">{trips.length}</p>
            <p className="text-xs text-muted-foreground mt-1">Total Trips</p>
          </div>
          <div className="bg-card border border-border rounded-lg p-4 text-center print:border-gray-300">
            <p className="text-2xl font-bold text-primary">{formatCurrency(yearTotalDeduction)}</p>
            <p className="text-xs text-muted-foreground mt-1">Est. Deduction @ ${ratePerMile}/mi</p>
          </div>
        </div>

        {/* Monthly breakdown */}
        {monthlyGroups.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Car className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No mileage data for {year}. Set your home address in Staff settings and distances will be calculated.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {monthlyGroups.map(group => (
              <div key={group.monthIndex} className="bg-card border border-border rounded-lg print:border-gray-300 print:break-inside-avoid">
                <div className="flex items-center justify-between px-4 py-3 border-b border-border print:border-gray-300">
                  <h3 className="text-sm font-semibold text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                    {group.month}
                  </h3>
                  <span className="text-sm font-bold text-primary">{group.totalMiles} mi</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-muted-foreground border-b border-border print:border-gray-300">
                        <th className="text-left px-4 py-2">Date</th>
                        <th className="text-left px-4 py-2">Business Purpose</th>
                        <th className="text-left px-4 py-2">Destination</th>
                        <th className="text-right px-4 py-2">Round Trip</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.trips.map((trip, i) => (
                        <tr key={i} className="border-b border-border/50 print:border-gray-200 last:border-0">
                          <td className="px-4 py-2 whitespace-nowrap">
                            {new Date(trip.date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                          </td>
                          <td className="px-4 py-2">{trip.purpose}</td>
                          <td className="px-4 py-2 text-muted-foreground">{trip.destination}</td>
                          <td className="px-4 py-2 text-right font-medium">{trip.roundTripMiles} mi</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="font-semibold">
                        <td colSpan={3} className="px-4 py-2 text-right text-muted-foreground">Month Total:</td>
                        <td className="px-4 py-2 text-right text-primary">{group.totalMiles} mi</td>
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
    </div>
  );
}
