// ============================================================
// MiniSessionsPage — the owner's home for mini sessions: create an event,
// grab its QR for a flyer, and work the roster on shoot day.
// ============================================================

import { useMemo, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DateField } from "@/components/DateTimeField";
import { Plus, Calendar, Users } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { generateSlots, formatSlot } from "@/lib/miniSlots";
import type { MiniSession } from "@/lib/types";
import MiniSessionRoster from "@/components/MiniSessionRoster";

const TIMES = Array.from({ length: 4 * 24 }, (_, i) => {
  const v = `${String(Math.floor(i / 4)).padStart(2, "0")}:${String((i % 4) * 15).padStart(2, "0")}`;
  return { value: v, label: formatSlot(v) };
});

const DEFAULT_AGREEMENT = `Session terms

• Your session is the reserved length shown above. Please arrive five minutes early — late arrivals are shot in the time remaining.
• Deposits are non-refundable. If you can't make it, let us know as soon as possible and we'll credit your deposit toward a future session where we can.
• Weather: outdoor sessions may be moved to a rain date. You'll be emailed the new time and your booking moves with it.
• Your edited images are delivered to an online gallery within two weeks. Additional images beyond those included may be purchased from the gallery.
• We retain copyright to all images; you receive personal-use rights (printing, sharing, social media).`;

const money = (cents: number) => `$${(Math.round(cents) / 100).toFixed(2).replace(/\.00$/, "")}`;

export default function MiniSessionsPage() {
  const { data, addMiniSession } = useApp();
  const { effectiveProfile } = useAuth();
  const isOwner = effectiveProfile?.role === "owner";

  const [creating, setCreating] = useState(false);
  const [openEventId, setOpenEventId] = useState<string | null>(null);

  // Creator form
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [locationText, setLocationText] = useState("");
  const [startTime, setStartTime] = useState("13:00");
  const [endTime, setEndTime] = useState("16:00");
  const [slotMinutes, setSlotMinutes] = useState("15");
  const [breakMinutes, setBreakMinutes] = useState("5");
  const [price, setPrice] = useState("");
  const [paymentMode, setPaymentMode] = useState<"full" | "deposit">("deposit");
  const [includedPhotos, setIncludedPhotos] = useState("5");
  const [perExtra, setPerExtra] = useState("25");
  const [agreementText, setAgreementText] = useState(DEFAULT_AGREEMENT);
  const [saving, setSaving] = useState(false);

  const previewSlots = useMemo(
    () => generateSlots({ startTime, endTime, slotMinutes: Number(slotMinutes) || 0, breakMinutes: Number(breakMinutes) || 0 }),
    [startTime, endTime, slotMinutes, breakMinutes],
  );

  const events = useMemo(
    () => [...data.miniSessions].sort((a, b) => b.date.localeCompare(a.date)),
    [data.miniSessions],
  );

  const bookingsFor = (id: string) =>
    data.miniSessionBookings.filter(b => b.miniSessionId === id && (b.status === "booked" || b.status === "pending"));

  function resetForm() {
    setTitle(""); setDate(""); setLocationText("");
    setStartTime("13:00"); setEndTime("16:00");
    setSlotMinutes("15"); setBreakMinutes("5");
    setPrice(""); setPaymentMode("deposit");
    setIncludedPhotos("5"); setPerExtra("25");
    setAgreementText(DEFAULT_AGREEMENT);
  }

  async function save() {
    if (!title.trim()) { toast.error("Give the event a name"); return; }
    if (!date) { toast.error("Pick a date"); return; }
    if (previewSlots.length === 0) { toast.error("That window doesn't fit any sessions"); return; }
    const priceCents = Math.round(Number(price) * 100);
    if (!Number.isFinite(priceCents) || priceCents <= 0) { toast.error("Set a price"); return; }
    setSaving(true);
    try {
      await addMiniSession({
        title: title.trim(), date, locationText: locationText.trim(), locationId: null,
        startTime, endTime,
        slotMinutes: Number(slotMinutes) || 15,
        breakMinutes: Number(breakMinutes) || 0,
        priceCents,
        paymentMode,
        depositPercent: 50,
        agreementText,
        includedPhotos: Number(includedPhotos) || 0,
        perExtraPhotoCents: Math.round(Number(perExtra) * 100) || 0,
        // Draft until he's ready to hand out the link.
        status: "draft",
        blockedSlots: [], assignedCrew: [], notes: "",
      });
      toast.success("Mini session created");
      setCreating(false); resetForm();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't create it");
    } finally {
      setSaving(false);
    }
  }

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

      {/* ---------- Create ---------- */}
      <Dialog open={creating} onOpenChange={(o) => { if (!o) { setCreating(false); resetForm(); } }}>
        <DialogContent className="bg-card border-border text-foreground max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle style={{ fontFamily: "'Space Grotesk', sans-serif" }}>New Mini Session</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Event name</Label>
              <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Fall Mini Sessions" className="bg-secondary border-border" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5 min-w-0">
                <Label className="text-xs text-muted-foreground">Date</Label>
                <DateField value={date} onChange={setDate} className="bg-secondary border-border w-full min-w-0" />
              </div>
              <div className="space-y-1.5 min-w-0">
                <Label className="text-xs text-muted-foreground">Location</Label>
                <Input value={locationText} onChange={e => setLocationText(e.target.value)} placeholder="Harlinsdale Farm" className="bg-secondary border-border" />
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <TimeSelect label="Start" value={startTime} onChange={setStartTime} />
              <TimeSelect label="End" value={endTime} onChange={setEndTime} />
              <div className="space-y-1.5 min-w-0">
                <Label className="text-xs text-muted-foreground">Each</Label>
                <Input value={slotMinutes} onChange={e => setSlotMinutes(e.target.value)} inputMode="numeric" className="bg-secondary border-border" />
              </div>
              <div className="space-y-1.5 min-w-0">
                <Label className="text-xs text-muted-foreground">Break</Label>
                <Input value={breakMinutes} onChange={e => setBreakMinutes(e.target.value)} inputMode="numeric" className="bg-secondary border-border" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {previewSlots.length > 0
                ? <>Creates <span className="text-foreground font-medium">{previewSlots.length} slots</span> — {formatSlot(previewSlots[0])} to {formatSlot(previewSlots[previewSlots.length - 1])}</>
                : "That window doesn't fit any sessions yet."}
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5 min-w-0">
                <Label className="text-xs text-muted-foreground">Price per session ($)</Label>
                <Input value={price} onChange={e => setPrice(e.target.value)} inputMode="decimal" placeholder="175" className="bg-secondary border-border" />
              </div>
              <div className="space-y-1.5 min-w-0">
                <Label className="text-xs text-muted-foreground">Payment</Label>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => setPaymentMode("deposit")}
                    className={cn("rounded-md border px-2 py-2 text-sm font-medium transition-colors",
                      paymentMode === "deposit" ? "border-primary bg-primary/15 text-foreground" : "border-border text-muted-foreground hover:bg-white/5")}
                  >50% deposit</button>
                  <button type="button" onClick={() => setPaymentMode("full")}
                    className={cn("rounded-md border px-2 py-2 text-sm font-medium transition-colors",
                      paymentMode === "full" ? "border-primary bg-primary/15 text-foreground" : "border-border text-muted-foreground hover:bg-white/5")}
                  >Pay in full</button>
                </div>
              </div>
            </div>
            {paymentMode === "deposit" && (
              <p className="text-xs text-muted-foreground -mt-1">
                The other half is charged to the same card the day before, automatically.
              </p>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5 min-w-0">
                <Label className="text-xs text-muted-foreground">Edited images included</Label>
                <Input value={includedPhotos} onChange={e => setIncludedPhotos(e.target.value)} inputMode="numeric" className="bg-secondary border-border" />
              </div>
              <div className="space-y-1.5 min-w-0">
                <Label className="text-xs text-muted-foreground">Extra image price ($)</Label>
                <Input value={perExtra} onChange={e => setPerExtra(e.target.value)} inputMode="decimal" className="bg-secondary border-border" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Agreement each person signs</Label>
              <Textarea value={agreementText} onChange={e => setAgreementText(e.target.value)} rows={8} className="bg-secondary border-border text-sm" />
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" onClick={() => { setCreating(false); resetForm(); }}>Cancel</Button>
              <Button onClick={save} disabled={saving}>{saving ? "Creating…" : "Create"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

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

function TimeSelect({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5 min-w-0">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {/* Styled select, not <input type="time"> — native pickers overflow on iOS. */}
      <select value={value} onChange={e => onChange(e.target.value)}
        className="w-full h-9 rounded-md border border-border bg-secondary px-2 text-sm text-foreground">
        {TIMES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
      </select>
    </div>
  );
}
