// ============================================================
// PipelineAnalyticsPage — sales-funnel metrics derived from existing
// proposal + contract data. Owner / partner only. No new schema.
//
// Surfaces:
//   - Conversion funnel (sent → viewed → accepted → signed → paid)
//   - Average deal size (proposals accepted)
//   - Average time-to-sign (sent → accepted)
//   - Win rate (accepted / sent)
//   - Lead-source breakdown
//   - Trailing 30 / 90 / 365 day filters
// ============================================================

import { useMemo, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { TrendingUp, Send, MailOpen, CheckCircle2, FileText, DollarSign } from "lucide-react";
import { cn } from "@/lib/utils";

type Window = "30d" | "90d" | "365d" | "all";

const WINDOW_LABEL: Record<Window, string> = {
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  "365d": "Last year",
  "all": "All time",
};

export default function PipelineAnalyticsPage() {
  const { data } = useApp();
  const [window, setWindow] = useState<Window>("90d");

  const stats = useMemo(() => {
    const cutoff = windowCutoff(window);
    const inWindow = (iso: string | null | undefined) =>
      !!iso && (cutoff === null || new Date(iso).getTime() >= cutoff);

    const proposals = data.proposals.filter(p => inWindow(p.sentAt) || (cutoff === null && p.sentAt));

    const sent = proposals.length;
    const viewed = proposals.filter(p => p.viewedAt).length;
    const accepted = proposals.filter(p => p.acceptedAt).length;
    const paid = proposals.filter(p => p.paidAt).length;

    // Contracts signed in-window (cross-reference proposals).
    const signedContracts = data.contracts.filter(c =>
      c.proposalId && inWindow(c.clientSignedAt),
    ).length;

    // Average deal size (sum of accepted proposals' total / count).
    const acceptedProposals = proposals.filter(p => p.acceptedAt);
    const totalRevenue = acceptedProposals.reduce((s, p) => s + (p.total || 0), 0);
    const avgDealSize = acceptedProposals.length > 0 ? totalRevenue / acceptedProposals.length : 0;

    // Average time-to-sign (proposal sentAt → acceptedAt) in days.
    const closeTimes = acceptedProposals
      .filter(p => p.sentAt && p.acceptedAt)
      .map(p => (new Date(p.acceptedAt!).getTime() - new Date(p.sentAt!).getTime()) / 86_400_000);
    const avgTimeToSign = closeTimes.length > 0
      ? closeTimes.reduce((s, t) => s + t, 0) / closeTimes.length
      : 0;

    // Lead source breakdown (sent → accepted by source).
    const sourceMap = new Map<string, { sent: number; accepted: number; revenue: number }>();
    for (const p of proposals) {
      const src = p.leadSource || "Unspecified";
      const cur = sourceMap.get(src) || { sent: 0, accepted: 0, revenue: 0 };
      cur.sent += 1;
      if (p.acceptedAt) {
        cur.accepted += 1;
        cur.revenue += p.total || 0;
      }
      sourceMap.set(src, cur);
    }
    const leadSources = Array.from(sourceMap.entries())
      .map(([source, s]) => ({ source, ...s }))
      .sort((a, b) => b.revenue - a.revenue || b.sent - a.sent);

    return { sent, viewed, accepted, paid, signedContracts, totalRevenue, avgDealSize, avgTimeToSign, leadSources };
  }, [data.proposals, data.contracts, window]);

  const winRate = stats.sent > 0 ? (stats.accepted / stats.sent) * 100 : 0;
  const viewRate = stats.sent > 0 ? (stats.viewed / stats.sent) * 100 : 0;

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-border bg-card/50">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-semibold text-foreground flex items-center gap-2" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              <TrendingUp className="w-5 h-5 text-primary" />
              Pipeline Analytics
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">{WINDOW_LABEL[window]}</p>
          </div>
          <div className="flex items-center gap-1 bg-secondary rounded-md p-0.5">
            {(["30d", "90d", "365d", "all"] as const).map(w => (
              <button
                key={w}
                onClick={() => setWindow(w)}
                className={cn(
                  "px-3 py-1.5 rounded text-xs font-medium",
                  window === w ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {w}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 sm:p-6 space-y-5">
        {stats.sent === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <TrendingUp className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No proposals sent in this window.</p>
            <p className="text-xs mt-1">Pipeline metrics will appear once you send your first proposal.</p>
          </div>
        ) : (
          <>
            {/* Conversion funnel */}
            <div className="bg-card border border-border rounded-xl p-5">
              <h2 className="text-xs uppercase tracking-wider font-semibold text-muted-foreground mb-4">Funnel</h2>
              <FunnelStep icon={Send}         color="text-blue-400"    label="Sent"     count={stats.sent}              percentOfTop={100} />
              <FunnelStep icon={MailOpen}     color="text-amber-400"   label="Viewed"   count={stats.viewed}            percentOfTop={viewRate} />
              <FunnelStep icon={CheckCircle2} color="text-emerald-400" label="Accepted" count={stats.accepted}          percentOfTop={winRate} />
              <FunnelStep icon={FileText}     color="text-emerald-400" label="Signed"   count={stats.signedContracts}   percentOfTop={stats.sent > 0 ? (stats.signedContracts / stats.sent) * 100 : 0} />
              <FunnelStep icon={DollarSign}   color="text-emerald-400" label="Paid"     count={stats.paid}              percentOfTop={stats.sent > 0 ? (stats.paid / stats.sent) * 100 : 0} last />
            </div>

            {/* KPI cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <KpiCard label="Win rate"            value={`${winRate.toFixed(1)}%`}  hint="Accepted / sent" />
              <KpiCard label="Avg. deal size"      value={`$${stats.avgDealSize.toFixed(0)}`} hint={`Across ${stats.accepted} accepted`} />
              <KpiCard label="Avg. time to sign"   value={stats.avgTimeToSign > 0 ? `${stats.avgTimeToSign.toFixed(1)} days` : "—"} hint="Sent → accepted" />
            </div>

            {/* Lead-source breakdown */}
            {stats.leadSources.length > 0 && (
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="px-5 py-3 border-b border-border">
                  <h2 className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">Lead sources</h2>
                </div>
                <table className="w-full text-sm">
                  <thead className="bg-secondary/40">
                    <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                      <th className="px-5 py-2 font-medium">Source</th>
                      <th className="px-5 py-2 font-medium text-right">Sent</th>
                      <th className="px-5 py-2 font-medium text-right">Accepted</th>
                      <th className="px-5 py-2 font-medium text-right">Win rate</th>
                      <th className="px-5 py-2 font-medium text-right">Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.leadSources.map(s => (
                      <tr key={s.source} className="border-t border-border/50">
                        <td className="px-5 py-2.5 text-foreground">{s.source}</td>
                        <td className="px-5 py-2.5 text-right tabular-nums text-muted-foreground">{s.sent}</td>
                        <td className="px-5 py-2.5 text-right tabular-nums text-muted-foreground">{s.accepted}</td>
                        <td className="px-5 py-2.5 text-right tabular-nums text-muted-foreground">
                          {s.sent > 0 ? `${((s.accepted / s.sent) * 100).toFixed(0)}%` : "—"}
                        </td>
                        <td className="px-5 py-2.5 text-right tabular-nums font-mono text-foreground">${s.revenue.toFixed(0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function FunnelStep({
  icon: Icon, color, label, count, percentOfTop, last = false,
}: {
  icon: typeof Send;
  color: string;
  label: string;
  count: number;
  percentOfTop: number;
  last?: boolean;
}) {
  return (
    <div className={cn("relative", !last && "pb-3")}>
      <div className="flex items-center gap-3">
        <Icon className={cn("w-4 h-4 shrink-0", color)} strokeWidth={1.75} />
        <span className="text-sm font-medium text-foreground w-24">{label}</span>
        <div className="flex-1 h-2 bg-secondary rounded overflow-hidden">
          <div className={cn("h-full bg-primary transition-all")} style={{ width: `${Math.max(2, percentOfTop)}%` }} />
        </div>
        <span className="text-sm font-mono tabular-nums text-foreground w-16 text-right">{count}</span>
        <span className="text-xs text-muted-foreground tabular-nums w-12 text-right">{percentOfTop.toFixed(0)}%</span>
      </div>
    </div>
  );
}

function KpiCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <p className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold text-foreground mt-1.5 tabular-nums" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{value}</p>
      <p className="text-[11px] text-muted-foreground mt-1">{hint}</p>
    </div>
  );
}

function windowCutoff(w: Window): number | null {
  if (w === "all") return null;
  const days = w === "30d" ? 30 : w === "90d" ? 90 : 365;
  return Date.now() - days * 86_400_000;
}
