// ============================================================
// MiniSessionForm — creates AND edits a mini-session event. One form for both
// so the two can't drift (the create-only version already shipped without an
// edit path, which is how an event went live with no address on it).
// ============================================================

import { useMemo, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DateField } from "@/components/DateTimeField";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { cn, parsePastedAddress } from "@/lib/utils";
import { generateSlots, formatSlot } from "@/lib/miniSlots";
import type { MiniSession, MiniUnclaimedPolicy } from "@/lib/types";

const TIMES = Array.from({ length: 4 * 24 }, (_, i) => {
  const v = `${String(Math.floor(i / 4)).padStart(2, "0")}:${String((i % 4) * 15).padStart(2, "0")}`;
  return { value: v, label: formatSlot(v) };
});

export const DEFAULT_AGREEMENT = `Session terms

• Your session is the reserved length shown above. Please arrive five minutes early — late arrivals are shot in the time remaining.
• Deposits are non-refundable. If you can't make it, let us know as soon as possible and we'll credit your deposit toward a future session where we can.
• Weather: outdoor sessions may be moved to a rain date. You'll be emailed the new time and your booking moves with it.
• Your edited images are delivered to an online gallery within two weeks. Additional images beyond those included may be purchased from the gallery.
• We retain copyright to all images; you receive personal-use rights (printing, sharing, social media).`;

export const UNCLAIMED_BLURB: Record<MiniUnclaimedPolicy, string> = {
  forfeit: "The deposit is not refunded if they don't claim a time.",
  half_refund: "Half the deposit is refunded if they don't claim a time; you keep the other half.",
  credit: "The deposit is held as credit toward a future session if they don't claim a time.",
};

const moneyStr = (cents: number) => `$${(Math.round(cents) / 100).toFixed(2).replace(/\.00$/, "")}`;

export default function MiniSessionForm({ open, onClose, event }: {
  open: boolean;
  onClose: () => void;
  /** Omit to create; pass an event to edit it. */
  event?: MiniSession;
}) {
  const { data, addMiniSession, updateMiniSession } = useApp();
  const editing = !!event;

  // Mount-initialised only — a realtime refresh must not wipe an in-progress
  // edit (the rule this codebase has been bitten by repeatedly).
  const [title, setTitle] = useState(event?.title ?? "");
  const [date, setDate] = useState(event?.date ?? "");
  const [locationName, setLocationName] = useState(event?.locationName ?? "");
  const [address, setAddress] = useState(event?.address ?? "");
  const [city, setCity] = useState(event?.city ?? "");
  const [stateAbbr, setStateAbbr] = useState(event?.state ?? "");
  const [zip, setZip] = useState(event?.zip ?? "");
  const [startTime, setStartTime] = useState(event?.startTime ?? "13:00");
  const [endTime, setEndTime] = useState(event?.endTime ?? "16:00");
  const [slotMinutes, setSlotMinutes] = useState(String(event?.slotMinutes ?? 15));
  const [breakMinutes, setBreakMinutes] = useState(String(event?.breakMinutes ?? 5));
  const [price, setPrice] = useState(event ? String(event.priceCents / 100) : "");
  const [paymentMode, setPaymentMode] = useState<"full" | "deposit">(event?.paymentMode ?? "deposit");
  const [includedPhotos, setIncludedPhotos] = useState(String(event?.includedPhotos ?? 5));
  const [perExtra, setPerExtra] = useState(event ? String(event.perExtraPhotoCents / 100) : "25");
  const [agreementText, setAgreementText] = useState(event?.agreementText ?? DEFAULT_AGREEMENT);
  // Pre-sale: sell a capped number of places before the date is announced.
  const [dateTbd, setDateTbd] = useState(event?.dateTbd ?? false);
  const [reservationCap, setReservationCap] = useState(String(event?.reservationCap || ""));
  const [unclaimedPolicy, setUnclaimedPolicy] = useState<MiniUnclaimedPolicy>(event?.unclaimedPolicy ?? "forfeit");
  const [depositFlat, setDepositFlat] = useState(
    event?.depositFlatCents ? (event.depositFlatCents / 100).toFixed(2) : "");
  const [saving, setSaving] = useState(false);
  // Live price for the deposit hint — the save handler has its own copy.
  const priceNow = Math.round(Number(price) * 100) || 0;
  // People who have already paid to hold a place on this event.
  const paidHolders = event
    ? data.miniSessionBookings.filter(b =>
        b.miniSessionId === event.id && b.status === "waitlist"
        && (b.paymentStatus === "paid" || b.paymentStatus === "deposit_paid")).length
    : 0;

  // One-line version stored alongside the parts — everything downstream (the
  // sign-up page, confirmation + reminder emails, the calendar feed) reads a
  // single field, so compose it here rather than teaching each one the shape.
  const composedLocation = [
    locationName.trim(),
    address.trim(),
    [city.trim(), stateAbbr.trim()].filter(Boolean).join(", "),
    zip.trim(),
  ].filter(Boolean).join(" · ");

  const previewSlots = useMemo(
    () => generateSlots({ startTime, endTime, slotMinutes: Number(slotMinutes) || 0, breakMinutes: Number(breakMinutes) || 0 }),
    [startTime, endTime, slotMinutes, breakMinutes],
  );

  // Live bookings whose time would no longer exist under the new schedule.
  // Editing the window after people have booked is legitimate (a rain delay,
  // a longer day) but it must not silently strand somebody's 2:15.
  const liveBookings = useMemo(
    () => event ? data.miniSessionBookings.filter(b => b.miniSessionId === event.id && (b.status === "booked" || b.status === "no_show")) : [],
    [data.miniSessionBookings, event],
  );
  const strandedBookings = useMemo(() => {
    if (!editing) return [];
    const times = new Set(previewSlots);
    return liveBookings.filter(b => !times.has(b.slotTime));
  }, [editing, liveBookings, previewSlots]);

  async function save() {
    if (!title.trim()) { toast.error("Give the event a name"); return; }
    if (!date) { toast.error("Pick a date"); return; }
    if (previewSlots.length === 0) { toast.error("That window doesn't fit any sessions"); return; }
    const priceCents = Math.round(Number(price) * 100);
    if (!Number.isFinite(priceCents) || priceCents <= 0) { toast.error("Set a price"); return; }

    const payload = {
      title: title.trim(), date,
      locationText: composedLocation,
      locationName: locationName.trim(),
      address: address.trim(),
      city: city.trim(),
      state: stateAbbr.trim(),
      zip: zip.trim(),
      startTime, endTime,
      slotMinutes: Number(slotMinutes) || 15,
      breakMinutes: Number(breakMinutes) || 0,
      priceCents, paymentMode,
      includedPhotos: Number(includedPhotos) || 0,
      perExtraPhotoCents: Math.round(Number(perExtra) * 100) || 0,
      agreementText,
      dateTbd,
      reservationCap: dateTbd ? (Number(reservationCap) || 0) : 0,
      depositFlatCents: paymentMode === "deposit" ? Math.round(Number(depositFlat) * 100) || 0 : 0,
      unclaimedPolicy,
    };

    setSaving(true);
    try {
      if (event) {
        await updateMiniSession(event.id, payload);
        toast.success(strandedBookings.length > 0
          ? `Saved — ${strandedBookings.length} booking${strandedBookings.length === 1 ? "" : "s"} now sit outside the schedule. Check the roster.`
          : "Saved");
      } else {
        await addMiniSession({
          ...payload,
          locationId: null, depositPercent: 50,
          status: "draft", blockedSlots: [], assignedCrew: [], notes: "",
          bookingDeadline: null, bookingOpenedAt: null,
        });
        toast.success("Mini session created");
      }
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="bg-card border-border text-foreground sm:max-w-lg max-h-[90vh] overflow-y-auto grid-cols-[minmax(0,1fr)]">
        <DialogHeader>
          <DialogTitle style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            {editing ? "Edit Mini Session" : "New Mini Session"}
          </DialogTitle>
        </DialogHeader>
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
              <Label className="text-xs text-muted-foreground">Place name</Label>
              <Input value={locationName} onChange={e => setLocationName(e.target.value)} placeholder="Harlinsdale Farm" className="bg-secondary border-border" />
            </div>
          </div>

          {/* Street / city / state / zip in tab order, so one pass down the
              keyboard fills the whole address. Pasting a full address into the
              street box splits it across the fields. */}
          <div className="space-y-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Street address</Label>
              <Input
                value={address}
                onChange={e => setAddress(e.target.value)}
                onPaste={e => {
                  const text = e.clipboardData.getData("text");
                  if (!text.includes(",")) return;
                  const parsed = parsePastedAddress(text);
                  if (parsed.city || parsed.state || parsed.zip) {
                    e.preventDefault();
                    setAddress(parsed.address);
                    if (parsed.city) setCity(parsed.city);
                    if (parsed.state) setStateAbbr(parsed.state);
                    if (parsed.zip) setZip(parsed.zip);
                  }
                }}
                placeholder="239 Franklin Rd"
                className="bg-secondary border-border"
              />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="space-y-1.5 min-w-0 sm:col-span-2">
                <Label className="text-xs text-muted-foreground">City</Label>
                <Input value={city} onChange={e => setCity(e.target.value)} placeholder="Franklin" className="bg-secondary border-border" />
              </div>
              <div className="space-y-1.5 min-w-0">
                <Label className="text-xs text-muted-foreground">State</Label>
                <Input value={stateAbbr} onChange={e => setStateAbbr(e.target.value.toUpperCase().slice(0, 2))} placeholder="TN" maxLength={2} className="bg-secondary border-border" />
              </div>
              <div className="space-y-1.5 min-w-0">
                <Label className="text-xs text-muted-foreground">ZIP</Label>
                <Input value={zip} onChange={e => setZip(e.target.value)} inputMode="numeric" placeholder="37064" className="bg-secondary border-border" />
              </div>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground -mt-1">
            {composedLocation
              ? <>Shows as <span className="text-foreground">{composedLocation}</span> on the sign-up page and in their emails.</>
              : "The location shows on the sign-up page, the confirmation email and the day-before reminder."}
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <TimeSelect label="Start" value={startTime} onChange={setStartTime} />
            <TimeSelect label="End" value={endTime} onChange={setEndTime} />
            <div className="space-y-1.5 min-w-0">
              <Label className="text-xs text-muted-foreground">Each (min)</Label>
              <Input value={slotMinutes} onChange={e => setSlotMinutes(e.target.value)} inputMode="numeric" className="bg-secondary border-border" />
            </div>
            <div className="space-y-1.5 min-w-0">
              <Label className="text-xs text-muted-foreground">Break (min)</Label>
              <Input value={breakMinutes} onChange={e => setBreakMinutes(e.target.value)} inputMode="numeric" className="bg-secondary border-border" />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {previewSlots.length > 0
              ? <>Creates <span className="text-foreground font-medium">{previewSlots.length} slots</span> — {formatSlot(previewSlots[0])} to {formatSlot(previewSlots[previewSlots.length - 1])}</>
              : "That window doesn't fit any sessions yet."}
          </p>

          {strandedBookings.length > 0 && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3">
              <p className="text-sm font-medium text-amber-300 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4" /> {strandedBookings.length} booking{strandedBookings.length === 1 ? "" : "s"} outside this schedule
              </p>
              <p className="text-[11px] text-muted-foreground mt-1">
                {strandedBookings.map(b => `${b.name} (${formatSlot(b.slotTime)})`).join(", ")} — they keep their time and still show on the roster, but it's no longer a bookable slot. Email them if the plan really changed.
              </p>
            </div>
          )}

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
            <div className="-mt-1 space-y-1.5">
              <Label className="text-xs text-muted-foreground">Deposit taken up front ($) — leave blank for half</Label>
              <Input
                value={depositFlat}
                onChange={e => setDepositFlat(e.target.value)}
                inputMode="decimal" placeholder={(Math.round(priceNow / 2) / 100).toFixed(2)}
                className="bg-secondary border-border"
              />
              <p className="text-xs text-muted-foreground">
                {Number(depositFlat) > 0
                  ? `${moneyStr(Math.round(Number(depositFlat) * 100))} now, ${moneyStr(Math.max(0, priceNow - Math.round(Number(depositFlat) * 100)))} to come.`
                  : "Half now, half later."}
                {" "}The rest is charged to the same card automatically.
              </p>
            </div>
          )}
          {editing && liveBookings.length > 0 && (
            <p className="text-[11px] text-amber-400">
              Price and payment changes only affect NEW bookings — the {liveBookings.length} already booked keep what they agreed to.
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
            {/* Pre-sale block. Sits directly above the agreement on purpose:
                the cap is the thing that has to be disclosed, and putting it
                next to the words people sign makes that hard to forget. */}
            <div className="rounded-lg border border-border bg-secondary/30 p-3 space-y-2.5 mb-4">
              <label className={cn("flex items-start gap-2", paidHolders > 0 && dateTbd ? "cursor-not-allowed opacity-70" : "cursor-pointer")}>
                <input
                  type="checkbox"
                  checked={dateTbd}
                  // Unticking this would skip the announcement entirely: nobody
                  // gets emailed, no priority window opens, and the public link
                  // starts selling times while the people who paid sit waiting
                  // for a message that never comes. Announcing is the only way
                  // out of pre-sale once places are sold.
                  disabled={paidHolders > 0 && dateTbd}
                  onChange={e => setDateTbd(e.target.checked)}
                  className="mt-0.5"
                />
                <span className="min-w-0">
                  <span className="block text-sm text-foreground">Date not announced yet</span>
                  <span className="block text-[11px] text-muted-foreground">
                    Sells a limited number of places instead of time slots. People pay the deposit now and pick a time when you set the date.
                  </span>
                </span>
              </label>
              {paidHolders > 0 && dateTbd && (
                <p className="text-[11px] text-amber-400">
                  {paidHolders} {paidHolders === 1 ? "person has" : "people have"} paid to hold a place, so this can't be switched off here —
                  use “Set date &amp; open booking” on the roster, which emails them all at once.
                </p>
              )}
              {dateTbd && (
                <>
                  <div>
                    <Label className="text-xs text-muted-foreground">How many places can you sell?</Label>
                    <Input
                      value={reservationCap}
                      onChange={e => setReservationCap(e.target.value.replace(/[^0-9]/g, ""))}
                      type="text" inputMode="numeric" placeholder="12"
                      className="bg-secondary border-border mt-1"
                    />
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Sell more places than you have times and somebody pays and never gets photographed. An afternoon of {slotMinutes || 20}-minute sessions is usually about 12.
                    </p>
                  </div>
                  {!reservationCap && (
                    <p className="text-[11px] text-amber-400">
                      No limit set — this will sell places until you close it.
                    </p>
                  )}
                  <div>
                    <Label className="text-xs text-muted-foreground">If they never pick a time</Label>
                    <div className="grid grid-cols-3 gap-1.5 mt-1">
                      {([
                        ["forfeit", "Keep it"],
                        ["half_refund", "Half back"],
                        ["credit", "Credit"],
                      ] as [MiniUnclaimedPolicy, string][]).map(([value, label]) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setUnclaimedPolicy(value)}
                          className={cn("rounded-md border px-2 py-2 text-xs font-medium transition-colors",
                            unclaimedPolicy === value
                              ? "border-primary bg-primary/15 text-foreground"
                              : "border-border text-muted-foreground hover:bg-white/5")}
                        >{label}</button>
                      ))}
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1.5">{UNCLAIMED_BLURB[unclaimedPolicy]}</p>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    The page shows the month only, plus how many places are left. This choice is printed on the sign-up page word for word, so they agree to it before paying.
                  </p>
                </>
              )}
            </div>
            <Label className="text-xs text-muted-foreground">Agreement each person signs</Label>
            <Textarea value={agreementText} onChange={e => setAgreementText(e.target.value)} rows={8} className="bg-secondary border-border text-sm" />
            {editing && liveBookings.length > 0 && (
              <p className="text-[11px] text-muted-foreground">
                Anyone who already signed keeps a record of the wording they agreed to — edits apply going forward.
              </p>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving ? "Saving…" : editing ? "Save changes" : "Create"}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
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
