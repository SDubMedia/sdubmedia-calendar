// ============================================================
// MiniSessionsPage — the owner's home for mini sessions: create an event,
// grab its QR for a flyer, and work the roster on shoot day.
// ============================================================

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useApp } from "@/contexts/AppContext";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Calendar, Users, Copy, QrCode, Download, ExternalLink, Globe } from "lucide-react";
import { cn } from "@/lib/utils";
import { generateSlots } from "@/lib/miniSlots";
import { publicUrl, qrImageUrl } from "@/lib/publicUrl";
import type { MiniSession } from "@/lib/types";
import MiniSessionForm from "@/components/MiniSessionForm";
import MiniSessionRoster from "@/components/MiniSessionRoster";

const money = (cents: number) => `$${(Math.round(cents) / 100).toFixed(2).replace(/\.00$/, "")}`;

export default function MiniSessionsPage() {
  const { data } = useApp();
  const { effectiveProfile } = useAuth();
  const isOwner = effectiveProfile?.role === "owner";

  // Arriving from the booking chooser with ?new=1 opens the creator straight
  // away, so the tap that said "mini sessions" actually starts one.
  const [creating, setCreating] = useState(() => new URLSearchParams(window.location.search).get("new") === "1");
  const [openEventId, setOpenEventId] = useState<string | null>(null);
  const [showScheduleQr, setShowScheduleQr] = useState(false);

  // The permanent public schedule — every published event, one link that never
  // needs reprinting. Per-event links still exist; this is the one for a
  // website, a business card or a sign in the studio.
  const orgSlug = data.organization?.slug || "";
  const schedulePath = `/book/${orgSlug}`;
  const scheduleUrl = publicUrl(schedulePath);

  const copy = (text: string, what: string) => {
    navigator.clipboard?.writeText(text)
      .then(() => toast.success(`${what} copied`))
      .catch(() => toast.error("Couldn't copy"));
  };

  const events = useMemo(
    () => [...data.miniSessions].sort((a, b) => b.date.localeCompare(a.date)),
    [data.miniSessions],
  );

  // Booked only — counting unconfirmed checkouts here made this card disagree
  // with the roster, the calendar chip and the dashboard.
  const bookingsFor = (id: string) =>
    data.miniSessionBookings.filter(b => b.miniSessionId === id && b.status === "booked");

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

      {/* One permanent link + QR for the whole season. Shown to owners only:
          staff can work a roster but don't publish marketing. */}
      {isOwner && orgSlug && (
        <div className="bg-card border border-border rounded-lg p-4 overflow-hidden">
          <div className="flex items-start gap-3">
            <div className="shrink-0 w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <Globe className="w-4 h-4 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground">Your booking page</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Every published session, always current. Put this link on your website or a printed QR — it never changes, even when the dates do.
              </p>
              <p className="text-xs text-muted-foreground mt-2 break-all font-mono">{scheduleUrl}</p>
              <div className="flex flex-wrap gap-2 mt-3">
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => copy(scheduleUrl, "Booking page link")}>
                  <Copy className="w-3.5 h-3.5" /> Copy link
                </Button>
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setShowScheduleQr(true)}>
                  <QrCode className="w-3.5 h-3.5" /> QR code
                </Button>
                <Button size="sm" variant="outline" className="gap-1.5" asChild>
                  <a href={schedulePath} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="w-3.5 h-3.5" /> Preview
                  </a>
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

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

      {/* Mounted only while open: the form's state is mount-initialised (the
          realtime rule), so a permanently-mounted one would still be filled
          with the previous event the second time you opened it. */}
      {creating && <MiniSessionForm open onClose={() => setCreating(false)} />}

      {/* ---------- Roster ---------- */}
      {openEvent && (
        <MiniSessionRoster event={openEvent} open={!!openEvent} onClose={() => setOpenEventId(null)} />
      )}

      <Dialog open={showScheduleQr} onOpenChange={setShowScheduleQr}>
        <DialogContent className="bg-card border-border text-foreground max-w-xs">
          <DialogHeader><DialogTitle className="text-base">Booking page code</DialogTitle></DialogHeader>
          <div className="text-center pb-2">
            <img src={qrImageUrl(schedulePath, 600)} alt="Booking page QR" className="w-60 h-60 mx-auto rounded-lg bg-white p-2" />
            <p className="text-xs text-muted-foreground mt-2 break-all">{scheduleUrl}</p>
            <a href={qrImageUrl(schedulePath, 1200)} download="booking-page-qr.png"
              className="mt-3 inline-flex items-center gap-1.5 text-sm text-primary hover:text-primary/80">
              <Download className="w-3.5 h-3.5" /> Download for print
            </a>
            <p className="text-[11px] text-muted-foreground mt-3">
              Safe to print once — it always shows whatever you have published.
            </p>
          </div>
        </DialogContent>
      </Dialog>
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
