// ============================================================
// MiniSessionsPage — the owner's home for mini sessions: create an event,
// grab its QR for a flyer, and work the roster on shoot day.
// ============================================================

import { useMemo, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Plus, Calendar, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { generateSlots } from "@/lib/miniSlots";
import type { MiniSession } from "@/lib/types";
import MiniSessionForm from "@/components/MiniSessionForm";
import MiniSessionRoster from "@/components/MiniSessionRoster";

const money = (cents: number) => `$${(Math.round(cents) / 100).toFixed(2).replace(/\.00$/, "")}`;

export default function MiniSessionsPage() {
  const { data } = useApp();
  const { effectiveProfile } = useAuth();
  const isOwner = effectiveProfile?.role === "owner";

  const [creating, setCreating] = useState(false);
  const [openEventId, setOpenEventId] = useState<string | null>(null);

  const events = useMemo(
    () => [...data.miniSessions].sort((a, b) => b.date.localeCompare(a.date)),
    [data.miniSessions],
  );

  const bookingsFor = (id: string) =>
    data.miniSessionBookings.filter(b => b.miniSessionId === id && (b.status === "booked" || b.status === "pending"));

  const openEvent = events.find(e => e.id === openEventId) || null;

  return (
    <div className="p-3 sm:p-6 space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Mini Sessions</h1>
          <p className="text-sm text-muted-foreground">Bookable slot events people sign up for from a QR code.</p>
        </div>
        {isOwner && (
          <Button onClick={() => setCreating(true)} className="gap-2"><Plus className="w-4 h-4" /> New Mini Session</Button>
        )}
      </div>

      {events.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Calendar className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No mini sessions yet. Create one, then share its QR code.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {events.map(ev => {
            const booked = bookingsFor(ev.id).length;
            const total = generateSlots(ev).length;
            return (
              <button
                key={ev.id}
                onClick={() => setOpenEventId(ev.id)}
                className="w-full text-left bg-card border border-border rounded-lg p-4 hover:border-primary/40 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-foreground text-sm">{ev.title}</span>
                      <StatusChip status={ev.status} />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {new Date(ev.date + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                      {ev.locationText ? ` · ${ev.locationText}` : ""} · {money(ev.priceCents)}
                      {ev.paymentMode === "deposit" ? ` (${ev.depositPercent}% deposit)` : ""}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold text-foreground flex items-center gap-1 justify-end">
                      <Users className="w-3.5 h-3.5" /> {booked}/{total}
                    </p>
                    <p className="text-[11px] text-muted-foreground">booked</p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      <MiniSessionForm open={creating} onClose={() => setCreating(false)} />

      {/* ---------- Roster ---------- */}
      {openEvent && (
        <MiniSessionRoster event={openEvent} open={!!openEvent} onClose={() => setOpenEventId(null)} />
      )}
    </div>
  );
}

function StatusChip({ status }: { status: MiniSession["status"] }) {
  const map: Record<string, string> = {
    draft: "border-slate-500/40 text-slate-300 bg-slate-500/10",
    published: "border-emerald-500/40 text-emerald-300 bg-emerald-500/10",
    closed: "border-amber-500/40 text-amber-300 bg-amber-500/10",
    done: "border-blue-500/40 text-blue-300 bg-blue-500/10",
  };
  const label: Record<string, string> = { draft: "Draft", published: "Live", closed: "Closed", done: "Done" };
  return <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded border", map[status])}>{label[status]}</span>;
}
