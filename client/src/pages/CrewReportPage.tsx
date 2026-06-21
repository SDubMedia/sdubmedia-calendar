// ============================================================
// CrewReportPage — owner report across ALL crew: what each person earned, what
// they've been paid, and what's still outstanding — this month and this year.
// Reuses the Staff Payments math (getCrewMemberProjectPay / getCrewProjectPaid).
// ============================================================

import { useMemo } from "react";
import { Users2, DollarSign } from "lucide-react";
import { useScopedData as useApp } from "@/hooks/useScopedData";
import { getCrewMemberProjectPay, getCrewProjectPaid } from "@/lib/data";
import type { Project } from "@/lib/types";

const money = (n: number) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface Tally { earned: number; paid: number; }

export default function CrewReportPage() {
  const { data } = useApp();
  const now = new Date();
  const yr = String(now.getFullYear());
  const ym = `${yr}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const involves = (p: Project, mid: string) =>
    p.crew.some(c => c.crewMemberId === mid) || p.postProduction.some(c => c.crewMemberId === mid);

  const rows = useMemo(() => {
    const tally = (mid: string, inPeriod: (d: string) => boolean): Tally => {
      const ps = data.projects.filter(p => p.status !== "cancelled" && inPeriod(p.date) && involves(p, mid));
      return {
        earned: ps.reduce((s, p) => s + getCrewMemberProjectPay(p, mid), 0),
        paid: ps.reduce((s, p) => s + getCrewProjectPaid(data.crewPayments, mid, p.id), 0),
      };
    };
    return data.crewMembers
      .map(m => ({
        member: m,
        month: tally(m.id, d => d.startsWith(ym)),
        year: tally(m.id, d => d.startsWith(yr)),
      }))
      .filter(r => r.year.earned > 0 || r.year.paid > 0)
      .sort((a, b) => (b.year.earned - b.year.paid) - (a.year.earned - a.year.paid));
  }, [data.projects, data.crewMembers, data.crewPayments, ym, yr]);

  const totals = rows.reduce(
    (s, r) => ({
      monthOut: s.monthOut + (r.month.earned - r.month.paid),
      yearOut: s.yearOut + (r.year.earned - r.year.paid),
    }),
    { monthOut: 0, yearOut: 0 }
  );

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card/50">
        <div>
          <h1 className="text-xl font-semibold text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Crew Report</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Paid vs. outstanding for every crew member.</p>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 sm:p-6 max-w-3xl w-full mx-auto space-y-6">
        {/* Totals */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-card border border-border rounded-lg p-4">
            <div className="text-xs text-muted-foreground uppercase tracking-wide">Outstanding this month</div>
            <div className="text-2xl font-semibold text-amber-600 dark:text-amber-300 mt-1" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{money(totals.monthOut)}</div>
          </div>
          <div className="bg-card border border-border rounded-lg p-4">
            <div className="text-xs text-muted-foreground uppercase tracking-wide">Outstanding this year</div>
            <div className="text-2xl font-semibold text-amber-600 dark:text-amber-300 mt-1" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{money(totals.yearOut)}</div>
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Users2 className="w-10 h-10 mb-3 opacity-30" />
            <p className="text-sm">No crew earnings yet this year.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {rows.map(({ member, month, year }) => {
              const monthOut = month.earned - month.paid;
              const yearOut = year.earned - year.paid;
              return (
                <div key={member.id} className="bg-card border border-border rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-9 h-9 rounded-lg bg-primary/15 flex items-center justify-center flex-shrink-0">
                      <DollarSign className="w-4 h-4 text-primary" />
                    </div>
                    <div className="text-sm font-medium text-foreground">{member.name}</div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    {([["This month", month, monthOut], ["This year", year, yearOut]] as const).map(([label, t, out]) => (
                      <div key={label}>
                        <div className="text-[11px] text-muted-foreground uppercase tracking-wide mb-1">{label}</div>
                        <div className="flex justify-between text-xs"><span className="text-muted-foreground">Earned</span><span className="text-foreground tabular-nums">{money(t.earned)}</span></div>
                        <div className="flex justify-between text-xs"><span className="text-muted-foreground">Paid</span><span className="text-green-600 dark:text-green-400 tabular-nums">{money(t.paid)}</span></div>
                        <div className="flex justify-between text-xs font-medium border-t border-border mt-1 pt-1"><span className="text-foreground">Outstanding</span><span className={`tabular-nums ${out > 0 ? "text-amber-600 dark:text-amber-300" : "text-muted-foreground"}`}>{money(out)}</span></div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
