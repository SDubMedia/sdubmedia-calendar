// ============================================================
// StaffDashboardPage — Crew member dashboard
// Shows their schedule, hours, and pay
// ============================================================

import { useMemo, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { useAuth } from "@/contexts/AuthContext";
import { Link } from "wouter";
import { CalendarDays, Clock, DollarSign, ArrowRight, MapPin, Briefcase, Home, Save } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { getAuthToken } from "@/lib/supabase";
import type { HomeAddress } from "@/lib/types";

const STATUS_COLORS: Record<string, string> = {
  upcoming: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  filming_done: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  in_editing: "bg-purple-500/20 text-purple-300 border-purple-500/30",
  completed: "bg-green-500/20 text-green-300 border-green-500/30",
};

const STATUS_LABELS: Record<string, string> = {
  upcoming: "Upcoming",
  filming_done: "Filmed",
  in_editing: "Editing",
  completed: "Completed",
};

function formatCurrency(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(n);
}

function formatDate(d: string): string {
  if (!d) return "";
  const date = new Date(d + "T00:00:00");
  return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export default function StaffDashboardPage() {
  const { data, updateCrewMember, upsertDistance } = useApp();
  const { effectiveProfile } = useAuth();
  const crewMemberId = effectiveProfile?.crewMemberId || "";
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth();

  // All my projects
  const myProjects = useMemo(() => {
    if (!crewMemberId) return [];
    return data.projects.filter(p =>
      p.crew.some(c => c.crewMemberId === crewMemberId) ||
      p.postProduction.some(c => c.crewMemberId === crewMemberId)
    );
  }, [data.projects, crewMemberId]);

  // Upcoming projects
  const upcomingProjects = useMemo(() => {
    return myProjects
      .filter(p => p.date >= todayStr)
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [myProjects, todayStr]);

  // Next shoot
  const _nextShoot = upcomingProjects[0];

  // This month's projects
  const thisMonthProjects = useMemo(() => {
    return myProjects.filter(p => {
      const d = new Date(p.date + "T00:00:00");
      return d.getFullYear() === currentYear && d.getMonth() === currentMonth;
    });
  }, [myProjects, currentYear, currentMonth]);

  // Hours and pay this month
  const { totalHours, totalPay, projectBreakdown } = useMemo(() => {
    let totalHours = 0;
    let totalPay = 0;
    const breakdown: { projectId: string; date: string; typeName: string; role: string; hours: number; unit: string; pay: number }[] = [];

    thisMonthProjects.forEach(p => {
      const pType = data.projectTypes.find(t => t.id === p.projectTypeId);
      const isAlsoPhotoEditor = p.editorBilling && p.postProduction.some(
        pp => pp.crewMemberId === crewMemberId && pp.role === "Photo Editor"
      );
      // Crew entries — skip hourly if this person is the photo editor on this project
      p.crew.filter(c => c.crewMemberId === crewMemberId).forEach(e => {
        if (isAlsoPhotoEditor) return; // pay comes from editorBilling
        const hours = Number(e.hoursWorked ?? 0);
        const pay = hours * Number(e.payRatePerHour ?? 0);
        totalHours += hours;
        totalPay += pay;
        breakdown.push({ projectId: p.id, date: p.date, typeName: pType?.name ?? "Project", role: e.role, hours, unit: "hrs", pay });
      });
      // Post-production entries — use editorBilling for photo editors
      p.postProduction.filter(c => c.crewMemberId === crewMemberId).forEach(e => {
        if (e.role === "Photo Editor" || (p.editorBilling && e.crewMemberId === crewMemberId)) {
          const rate = p.editorBilling?.perImageRate ?? 6;
          const imgs = p.editorBilling?.imageCount ?? 0;
          const isFinalized = p.editorBilling?.finalized === true || p.status === "completed";
          const pay = imgs * rate;
          if (imgs > 0) totalPay += pay;
          breakdown.push({ projectId: p.id, date: p.date, typeName: pType?.name ?? "Project", role: e.role, hours: imgs, unit: "images", pay: isFinalized ? pay : 0 });
        } else {
          const hours = Number(e.hoursWorked ?? 0);
          const pay = hours * Number(e.payRatePerHour ?? 0);
          totalHours += hours;
          totalPay += pay;
          breakdown.push({ projectId: p.id, date: p.date, typeName: pType?.name ?? "Project", role: e.role, hours, unit: "hrs", pay });
        }
      });
    });

    return { totalHours, totalPay, projectBreakdown: breakdown };
  }, [thisMonthProjects, data.projectTypes, crewMemberId]);

  const crewMember = data.crewMembers.find(cm => cm.id === crewMemberId);
  const [expandedSection, setExpandedSection] = useState<string | null>(null);

  // Home address editing
  const [addressForm, setAddressForm] = useState<HomeAddress>(
    crewMember?.homeAddress || { address: "", city: "", state: "", zip: "" }
  );
  const [savingAddress, setSavingAddress] = useState(false);

  async function saveHomeAddress() {
    if (!crewMemberId || !addressForm.address) {
      toast.error("Please enter your street address");
      return;
    }
    setSavingAddress(true);
    try {
      // Save home address + auto-fill business address if empty
      const updates: any = { homeAddress: addressForm };
      if (!crewMember?.businessAddress) {
        updates.businessAddress = addressForm.address;
        updates.businessCity = addressForm.city;
        updates.businessState = addressForm.state;
        updates.businessZip = addressForm.zip;
      }
      await updateCrewMember(crewMemberId, updates);
      const origin = `${addressForm.address}, ${addressForm.city}, ${addressForm.state} ${addressForm.zip}`;
      let count = 0;
      for (const loc of data.locations.filter(l => l.address && l.city)) {
        const dest = `${loc.address}, ${loc.city}, ${loc.state} ${loc.zip}`;
        try {
          const token = await getAuthToken();
          const res = await fetch("/api/calculate-distance", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ origin, destination: dest }),
          });
          if (res.ok) {
            const { distanceMiles } = await res.json();
            await upsertDistance(crewMemberId, loc.id, distanceMiles);
            count++;
          }
        } catch { /* skip */ }
      }
      toast.success(count > 0 ? `Address saved, ${count} distances calculated` : "Address saved");
    } catch (e: any) {
      toast.error(e.message || "Failed to save");
    } finally {
      setSavingAddress(false);
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-border bg-card/50">
        <h1 className="text-xl font-semibold text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
          Dashboard
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Welcome back{crewMember ? `, ${crewMember.name.split(" ")[0]}` : ""}
        </p>
      </div>

      <div className="flex-1 overflow-auto p-3 sm:p-6 space-y-5">
        {/* Metric Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <MetricCard icon={CalendarDays} iconColor="text-blue-400" iconBg="bg-blue-500/20"
            label="Upcoming"
            value={String(upcomingProjects.length)}
            sub="Scheduled shoots"
            onClick={() => setExpandedSection(expandedSection === "upcoming" ? null : "upcoming")}
            active={expandedSection === "upcoming"}
          />
          <MetricCard icon={Briefcase} iconColor="text-purple-400" iconBg="bg-purple-500/20"
            label="This Month"
            value={String(thisMonthProjects.length)}
            sub={`Shoots in ${MONTH_NAMES[currentMonth]}`}
            onClick={() => setExpandedSection(expandedSection === "month" ? null : "month")}
            active={expandedSection === "month"}
          />
          <MetricCard icon={Clock} iconColor="text-cyan-400" iconBg="bg-cyan-500/20"
            label="Hours"
            value={totalHours % 1 === 0 ? String(totalHours) : totalHours.toFixed(1)}
            sub="Worked this month"
            onClick={() => setExpandedSection(expandedSection === "hours" ? null : "hours")}
            active={expandedSection === "hours"}
          />
          <MetricCard icon={DollarSign} iconColor="text-green-400" iconBg="bg-green-500/20"
            label="Earnings"
            value={formatCurrency(totalPay)}
            sub="This month"
            onClick={() => setExpandedSection(expandedSection === "earnings" ? null : "earnings")}
            active={expandedSection === "earnings"}
          />
        </div>

        {/* Expanded Sections */}
        {expandedSection === "upcoming" && (
          <div className="bg-card border border-border rounded-lg">
            <div className="px-4 py-3 border-b border-border">
              <h3 className="text-sm font-semibold text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Upcoming Shoots</h3>
            </div>
            <div className="divide-y divide-border max-h-80 overflow-auto">
              {upcomingProjects.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">No upcoming shoots</div>
              ) : upcomingProjects.map(p => {
                const pType = data.projectTypes.find(t => t.id === p.projectTypeId);
                const loc = data.locations.find(l => l.id === p.locationId);
                const myRoles = [...p.crew.filter(c => c.crewMemberId === crewMemberId).map(c => c.role), ...p.postProduction.filter(c => c.crewMemberId === crewMemberId).map(c => c.role)];
                return (
                  <div key={p.id} className="px-4 py-3 flex items-start justify-between">
                    <div>
                      <span className="text-sm font-medium text-foreground">{pType?.name ?? "Project"}</span>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{p.startTime} — {p.endTime}</span>
                        {loc && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{loc.name}</span>}
                      </div>
                      {myRoles.length > 0 && <p className="text-xs text-primary/70 mt-1">{myRoles.join(", ")}</p>}
                    </div>
                    <span className="text-xs font-medium text-primary shrink-0">{formatDate(p.date)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {expandedSection === "month" && (
          <div className="bg-card border border-border rounded-lg">
            <div className="px-4 py-3 border-b border-border">
              <h3 className="text-sm font-semibold text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{MONTH_NAMES[currentMonth]} Shoots</h3>
            </div>
            <div className="divide-y divide-border max-h-80 overflow-auto">
              {thisMonthProjects.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">No shoots this month</div>
              ) : thisMonthProjects.map(p => {
                const pType = data.projectTypes.find(t => t.id === p.projectTypeId);
                const loc = data.locations.find(l => l.id === p.locationId);
                return (
                  <div key={p.id} className="px-4 py-3 flex items-start justify-between">
                    <div>
                      <span className="text-sm font-medium text-foreground">{pType?.name ?? "Project"}</span>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                        <span>{p.startTime} — {p.endTime}</span>
                        {loc && <span>{loc.name}</span>}
                      </div>
                    </div>
                    <span className="text-xs font-medium text-primary shrink-0">{formatDate(p.date)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {(expandedSection === "hours" || expandedSection === "earnings") && (
          <div className="bg-card border border-border rounded-lg">
            <div className="px-4 py-3 border-b border-border">
              <h3 className="text-sm font-semibold text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                {expandedSection === "hours" ? "Hours Breakdown" : "Earnings Breakdown"}
              </h3>
            </div>
            <div className="divide-y divide-border max-h-80 overflow-auto">
              {projectBreakdown.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">No work logged this month</div>
              ) : (
                <>
                  {projectBreakdown.map((entry, i) => (
                    <div key={i} className="px-4 py-3 flex items-center justify-between">
                      <div>
                        <span className="text-sm text-foreground">{entry.typeName}</span>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-muted-foreground">{formatDate(entry.date)}</span>
                          <span className="text-xs text-muted-foreground/60">{entry.role}</span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-semibold text-foreground">{expandedSection === "hours" ? `${entry.hours} ${entry.unit}` : formatCurrency(entry.pay)}</p>
                      </div>
                    </div>
                  ))}
                  <div className="px-4 py-3 flex items-center justify-between bg-secondary/30">
                    <span className="text-sm font-semibold text-foreground">Total</span>
                    <span className="text-sm font-semibold text-primary">
                      {expandedSection === "hours" ? `${totalHours % 1 === 0 ? totalHours : totalHours.toFixed(1)}h` : formatCurrency(totalPay)}
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Upcoming Schedule */}
          <div className="bg-card border border-border rounded-lg">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h3 className="text-sm font-semibold text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                Upcoming Schedule
              </h3>
              <Link href="/my-schedule" className="flex items-center gap-1 text-xs text-primary hover:text-primary/80">
                Full Schedule <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
            <div className="divide-y divide-border">
              {upcomingProjects.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">No upcoming shoots</div>
              ) : (
                upcomingProjects.slice(0, 5).map(p => {
                  const pType = data.projectTypes.find(t => t.id === p.projectTypeId);
                  const loc = data.locations.find(l => l.id === p.locationId);
                  const myRoles = [
                    ...p.crew.filter(c => c.crewMemberId === crewMemberId).map(c => c.role),
                    ...p.postProduction.filter(c => c.crewMemberId === crewMemberId).map(c => c.role),
                  ];
                  return (
                    <div key={p.id} className="px-4 py-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-foreground">{pType?.name ?? "Project"}</span>
                            <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded border", STATUS_COLORS[p.status])}>
                              {STATUS_LABELS[p.status]}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{p.startTime} — {p.endTime}</span>
                            {loc && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{loc.name}</span>}
                          </div>
                          {myRoles.length > 0 && (
                            <p className="text-xs text-primary/70 mt-1">{myRoles.join(", ")}</p>
                          )}
                        </div>
                        <span className="text-xs font-medium text-primary shrink-0">{formatDate(p.date)}</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* This Month's Pay Breakdown */}
          <div className="bg-card border border-border rounded-lg">
            <div className="px-4 py-3 border-b border-border">
              <h3 className="text-sm font-semibold text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                {MONTH_NAMES[currentMonth]} Earnings
              </h3>
            </div>
            <div className="divide-y divide-border">
              {projectBreakdown.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">No work logged this month</div>
              ) : (
                <>
                  {projectBreakdown.map((entry, i) => (
                    <div key={i} className="px-4 py-3 flex items-center justify-between">
                      <div>
                        <span className="text-sm text-foreground">{entry.typeName}</span>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-muted-foreground">{formatDate(entry.date)}</span>
                          <span className="text-xs text-muted-foreground/60">•</span>
                          <span className="text-xs text-muted-foreground">{entry.role}</span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-semibold text-foreground">{formatCurrency(entry.pay)}</p>
                        <p className="text-[10px] text-muted-foreground">{entry.hours} {entry.unit}</p>
                      </div>
                    </div>
                  ))}
                  <div className="px-4 py-3 flex items-center justify-between bg-secondary/30">
                    <span className="text-sm font-semibold text-foreground">Total</span>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-primary">{formatCurrency(totalPay)}</p>
                      <p className="text-[10px] text-muted-foreground">{totalHours % 1 === 0 ? totalHours : totalHours.toFixed(1)}h</p>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Home Address for Mileage */}
        <div className="bg-card border border-border rounded-lg">
          <div className="px-4 py-3 border-b border-border">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              <Home className="w-4 h-4 text-primary" />
              Home Address
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">Used to calculate mileage to project locations. Only you and the owner can see this.</p>
          </div>
          <div className="p-4 space-y-3">
            <Input
              placeholder="Street address"
              value={addressForm.address}
              onChange={e => setAddressForm(f => ({ ...f, address: e.target.value }))}
              className="bg-secondary border-border"
            />
            <div className="grid grid-cols-3 gap-2">
              <Input
                placeholder="City"
                value={addressForm.city}
                onChange={e => setAddressForm(f => ({ ...f, city: e.target.value }))}
                className="bg-secondary border-border"
              />
              <Input
                placeholder="State"
                value={addressForm.state}
                onChange={e => setAddressForm(f => ({ ...f, state: e.target.value }))}
                className="bg-secondary border-border"
              />
              <Input
                placeholder="ZIP"
                value={addressForm.zip}
                onChange={e => setAddressForm(f => ({ ...f, zip: e.target.value }))}
                className="bg-secondary border-border"
              />
            </div>
            <Button onClick={saveHomeAddress} disabled={savingAddress} className="gap-2">
              <Save className="w-4 h-4" />
              {savingAddress ? "Saving..." : "Save Address"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ icon: Icon, iconColor, iconBg, label, value, sub, onClick, active }: {
  icon: React.ComponentType<{ className?: string }>;
  iconColor: string;
  iconBg: string;
  label: string;
  value: string;
  sub: string;
  onClick?: () => void;
  active?: boolean;
}) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "bg-card border rounded-lg p-4 transition-colors",
        onClick && "cursor-pointer hover:border-primary/30",
        active ? "border-primary/50 bg-primary/5" : "border-border",
      )}
    >
      <div className="flex items-center gap-3">
        <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center shrink-0", iconBg)}>
          <Icon className={cn("w-5 h-5", iconColor)} />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-lg font-semibold text-foreground truncate">{value}</p>
          <p className="text-[10px] text-muted-foreground/60">{sub}</p>
        </div>
      </div>
    </div>
  );
}
