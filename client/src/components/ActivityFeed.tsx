// ============================================================
// ActivityFeed — "what happened today" widget for the dashboard.
//
// Aggregates recent timestamps across proposals, contracts, payment
// milestones, and inbound replies into a single chronological feed.
// Pure derivation from existing AppContext data — no new schema, no
// new fetches.
// ============================================================

import { useMemo } from "react";
import { useApp } from "@/contexts/AppContext";
import { useLocation } from "wouter";
import { FileText, CheckCircle2, DollarSign, MailOpen, Send, AlertCircle, Activity } from "lucide-react";
import { cn } from "@/lib/utils";

type ActivityType = "proposal_sent" | "proposal_viewed" | "proposal_accepted" | "contract_signed" | "milestone_paid" | "inbound_reply";

interface ActivityItem {
  id: string;
  type: ActivityType;
  at: string;
  clientName: string;
  amount?: number;
  detail?: string;
  href?: string;
}

const TYPE_META: Record<ActivityType, { icon: typeof FileText; color: string; label: string }> = {
  proposal_sent:     { icon: Send,         color: "text-blue-400",    label: "Proposal sent" },
  proposal_viewed:   { icon: MailOpen,     color: "text-amber-400",   label: "Proposal viewed" },
  proposal_accepted: { icon: CheckCircle2, color: "text-emerald-400", label: "Proposal accepted" },
  contract_signed:   { icon: FileText,     color: "text-emerald-400", label: "Contract signed" },
  milestone_paid:    { icon: DollarSign,   color: "text-emerald-400", label: "Payment received" },
  inbound_reply:     { icon: AlertCircle,  color: "text-blue-400",    label: "Reply from client" },
};

export default function ActivityFeed() {
  const { data } = useApp();
  const [, setLocation] = useLocation();

  const items = useMemo<ActivityItem[]>(() => {
    const out: ActivityItem[] = [];

    for (const p of data.proposals) {
      const client = data.clients.find(c => c.id === p.clientId);
      const clientName = client?.contactName || client?.company || p.clientEmail || "Unknown";
      if (p.sentAt) {
        out.push({
          id: `prop-sent-${p.id}`,
          type: "proposal_sent",
          at: p.sentAt,
          clientName,
          amount: p.total || undefined,
          href: `/proposals?view=${p.id}`,
        });
      }
      if (p.viewedAt) {
        out.push({
          id: `prop-viewed-${p.id}`,
          type: "proposal_viewed",
          at: p.viewedAt,
          clientName,
          href: `/proposals?view=${p.id}`,
        });
      }
      if (p.acceptedAt) {
        out.push({
          id: `prop-accepted-${p.id}`,
          type: "proposal_accepted",
          at: p.acceptedAt,
          clientName,
          amount: p.total || undefined,
          href: `/proposals?view=${p.id}`,
        });
      }
      // Inbound replies threaded onto this proposal
      for (const reply of p.inboundReplies || []) {
        out.push({
          id: `prop-reply-${p.id}-${reply.receivedAt}`,
          type: "inbound_reply",
          at: reply.receivedAt,
          clientName,
          detail: reply.subject,
          href: `/proposals?view=${p.id}`,
        });
      }
    }

    for (const c of data.contracts) {
      const client = data.clients.find(cl => cl.id === c.clientId);
      const clientName = client?.contactName || client?.company || c.clientEmail || "Unknown";
      if (c.clientSignedAt) {
        out.push({
          id: `ctr-signed-${c.id}`,
          type: "contract_signed",
          at: c.clientSignedAt,
          clientName,
          detail: c.title,
          href: `/contracts/${c.id}/review`,
        });
      }
      // Paid milestones
      for (let i = 0; i < (c.paymentMilestones || []).length; i++) {
        const m = c.paymentMilestones[i];
        if (m.paidAt) {
          // Compute amount best-effort.
          const total = (c.paymentMilestones || []).reduce((s, x) =>
            s + (x.type === "fixed" ? Number(x.fixedAmount ?? 0) : 0), 0);
          const amount = m.type === "percent"
            ? Math.round(total * (m.percent ?? 0) / 100 * 100) / 100
            : Number(m.fixedAmount ?? 0);
          out.push({
            id: `ctr-paid-${c.id}-${i}`,
            type: "milestone_paid",
            at: m.paidAt,
            clientName,
            amount,
            detail: m.label,
            href: `/contracts/${c.id}/review`,
          });
        }
      }
      for (const reply of c.inboundReplies || []) {
        out.push({
          id: `ctr-reply-${c.id}-${reply.receivedAt}`,
          type: "inbound_reply",
          at: reply.receivedAt,
          clientName,
          detail: reply.subject,
          href: `/contracts/${c.id}/review`,
        });
      }
    }

    // Sort newest-first, cap at 12 most recent.
    return out
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, 12);
  }, [data.proposals, data.contracts, data.clients]);

  if (items.length === 0) {
    return (
      <div className="bg-card border border-border rounded-xl p-6">
        <h3 className="text-sm font-semibold text-foreground mb-1 flex items-center gap-2">
          <Activity className="w-4 h-4 text-primary" /> Activity
        </h3>
        <p className="text-xs text-muted-foreground mt-3">
          Once you start sending proposals and contracts, recent client interactions will show up here.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-xl p-4 sm:p-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Activity className="w-4 h-4 text-primary" /> Activity
        </h3>
        <span className="text-[10px] text-muted-foreground tabular-nums">{items.length} recent</span>
      </div>
      <div className="space-y-2">
        {items.map(item => {
          const meta = TYPE_META[item.type];
          const Icon = meta.icon;
          return (
            <button
              key={item.id}
              onClick={() => item.href && setLocation(item.href)}
              className={cn(
                "w-full text-left flex items-start gap-3 p-2 -mx-2 rounded transition-colors",
                item.href ? "hover:bg-secondary cursor-pointer" : "cursor-default",
              )}
            >
              <Icon className={cn("w-4 h-4 mt-0.5 shrink-0", meta.color)} strokeWidth={1.75} />
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-sm font-medium text-foreground truncate">
                    {meta.label} — {item.clientName}
                  </p>
                  <span className="text-[10px] text-muted-foreground shrink-0 tabular-nums">
                    {timeAgo(item.at)}
                  </span>
                </div>
                {(item.amount != null || item.detail) && (
                  <p className="text-xs text-muted-foreground truncate">
                    {item.amount != null ? `$${item.amount.toFixed(2)}` : ""}
                    {item.amount != null && item.detail ? " · " : ""}
                    {item.detail}
                  </p>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return "just now";
  const m = Math.floor(ms / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  const w = Math.floor(d / 7);
  if (w < 5) return `${w}w ago`;
  const mo = Math.floor(d / 30);
  return `${mo}mo ago`;
}
