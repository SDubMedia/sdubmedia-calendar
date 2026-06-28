// ============================================================
// RequestShootDialog — an agent requests a real-estate shoot for one of
// their listings. Agent-safe: shows piece PRICES only (never cost/margin).
// Time is required (picked from a shooter's open availability); shooter is
// optional. Submits a pending request the owner approves later.
// ============================================================

import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Check, MapPin, CalendarClock, ChevronLeft, ChevronRight } from "lucide-react";
import { useScopedData as useApp } from "@/hooks/useScopedData";
import { supabase, getAuthToken } from "@/lib/supabase";
import { getOpenDays, onsiteMinutesForSelections, shootOnsiteMinFor, fakeBusyBlocksFor, addDaysIso, type BusyBlock } from "@/lib/data";
import type { ProjectServiceSelection, ShootRequest } from "@/lib/types";
import { toast } from "sonner";

function todayIso(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}
function fmtTime(t: string): string {
  const [hs, m] = (t || "").split(":");
  const h = Number(hs); if (Number.isNaN(h)) return t;
  const ampm = h >= 12 ? "PM" : "AM"; const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m} ${ampm}`;
}
function fmtDur(min: number): string {
  const h = Math.floor(min / 60), m = min % 60;
  return [h ? `${h} hr` : "", m ? `${m} min` : ""].filter(Boolean).join(" ") || "0 min";
}

interface Props {
  open: boolean;
  onClose: () => void;
  clientId: string;   // the agent's own client record
  editRequest?: ShootRequest | null; // when set, edit this pending request instead of creating
}

export default function RequestShootDialog({ open, onClose, clientId, editRequest }: Props) {
  const { data, addShootRequest, updateShootRequest } = useApp();

  const [address, setAddress] = useState("");
  // selected pieces keyed by serviceId -> chosen ProjectServiceSelection
  const [picked, setPicked] = useState<Record<string, ProjectServiceSelection>>({});
  const [shooterId, setShooterId] = useState("");        // "" = any
  const [pickedDate, setPickedDate] = useState("");
  const [pickedTime, setPickedTime] = useState("");
  const [monthOffset, setMonthOffset] = useState(0); // booking calendar navigation
  const [agentWillMeet, setAgentWillMeet] = useState(false);
  const [isVacant, setIsVacant] = useState(false);
  const touchX = useRef<number | null>(null);
  // Swipe left = next month, swipe right = previous (not below the current month).
  const onTouchStart = (e: React.TouchEvent) => { touchX.current = e.touches[0].clientX; };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchX.current;
    touchX.current = null;
    if (dx <= -40) setMonthOffset(o => o + 1);
    else if (dx >= 40) setMonthOffset(o => Math.max(0, o - 1));
  };
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  // Prefill when opening in edit mode (only re-runs on open / target change).
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current) {
      wasOpen.current = true;
      if (editRequest) {
        setAddress(editRequest.propertyAddress || "");
        setPicked(Object.fromEntries((editRequest.requestedServices || []).map(s => [s.serviceId, s])));
        setShooterId(editRequest.preferredCrewMemberId || "");
        setPickedDate(editRequest.preferredDate || "");
        setPickedTime(editRequest.preferredTime || "");
        setAgentWillMeet(!!editRequest.agentWillMeet);
        setIsVacant(!!editRequest.isVacant);
        setNotes(editRequest.notes || "");
      }
    } else if (!open) {
      wasOpen.current = false;
    }
  }, [open, editRequest]);

  // Default to the Real Estate category; agents book real-estate shoots.
  const category = useMemo(() => {
    const re = data.serviceCategories.find(c => /real\s*estate/i.test(c.name));
    return re ?? data.serviceCategories[0] ?? null;
  }, [data.serviceCategories]);

  const services = useMemo(
    () => (category ? data.services.filter(s => s.categoryId === category.id).sort((a, b) => a.position - b.position) : []),
    [data.services, category]
  );

  // Existing bookings (free/busy — times only, no client/address) so open slots
  // skip times you're already shooting. Fetched fresh when the dialog opens.
  const [busy, setBusy] = useState<BusyBlock[]>([]);
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const { data: rows } = await supabase.from("shooter_busy").select("crew_member_id, date, start_time, end_time").gte("date", todayIso());
      if (cancelled || !rows) return;
      setBusy(rows.map((r: { crew_member_id: string; date: string; start_time: string; end_time: string }) => ({
        crewMemberId: r.crew_member_id, date: r.date, start: r.start_time, end: r.end_time,
      })));
    })();
    return () => { cancelled = true; };
  }, [open]);

  const prefsMap = useMemo(() => {
    const m: Record<string, { shootMinutes: number; bufferMinutes: number; maxPerDay: number }> = {};
    for (const p of data.shooterPrefs) m[p.crewMemberId] = { shootMinutes: p.shootMinutes, bufferMinutes: p.bufferMinutes, maxPerDay: p.maxPerDay };
    return m;
  }, [data.shooterPrefs]);

  // Other PENDING requests also occupy slots — so two agents can't be offered
  // the same time. A request with a preferred shooter blocks that shooter; an
  // "any photographer" request blocks the slot for everyone while it's pending.
  const pendingBusy = useMemo(() => {
    const addMin = (t: string, mins: number) => {
      const [h, m] = (t || "0:0").split(":").map(Number);
      const total = Math.min(h * 60 + m + mins, 23 * 60 + 59);
      return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
    };
    const out: BusyBlock[] = [];
    for (const r of data.shootRequests) {
      if (r.status !== "pending" || !r.preferredDate || !r.preferredTime) continue;
      if (editRequest && r.id === editRequest.id) continue; // don't block the request being edited
      const end = addMin(r.preferredTime, onsiteMinutesForSelections(r.requestedServices, shootOnsiteMinFor(r.preferredCrewMemberId, data.shooterPrefs)));
      if (r.preferredCrewMemberId) {
        out.push({ crewMemberId: r.preferredCrewMemberId, date: r.preferredDate, start: r.preferredTime, end });
      } else {
        for (const c of data.crewMembers) out.push({ crewMemberId: c.id, date: r.preferredDate, start: r.preferredTime, end });
      }
    }
    return out;
  }, [data.shootRequests, data.shooterPrefs, data.crewMembers, editRequest]);
  // "Fake it till you make it" — synthetic holds that make shooters look busier
  // to agents (per-staff fakeBusyMinutes). Agent-view only; never the real calendar.
  const fakeBusy = useMemo(() => {
    const out: BusyBlock[] = [];
    const withFake = data.shooterPrefs.filter(p => (p.fakeBusyMinutes ?? 0) > 0);
    if (withFake.length === 0) return out;
    for (let i = 0; i < 60; i++) {
      const d = addDaysIso(todayIso(), i);
      for (const p of withFake) out.push(...fakeBusyBlocksFor(p.crewMemberId, d, data.availability, p.fakeBusyMinutes));
    }
    return out;
  }, [data.shooterPrefs, data.availability]);
  const allBusy = useMemo(() => [...busy, ...pendingBusy, ...fakeBusy], [busy, pendingBusy, fakeBusy]);

  // On-site length of the shoot being booked = sum of the picked pieces'
  // durations (falls back to the shooter's flat shoot length until durations
  // are set). Sizes the open slots so a longer booking needs a longer window.
  const onsiteMin = useMemo(
    () => onsiteMinutesForSelections(Object.values(picked), shootOnsiteMinFor(shooterId || null, data.shooterPrefs)),
    [picked, shooterId, data.shooterPrefs]
  );
  const openDays = useMemo(
    () => getOpenDays(data.availability, { fromDate: todayIso(), days: 60, crewMemberId: shooterId || null, busy: allBusy, prefs: prefsMap, shootMinutesOverride: onsiteMin }),
    [data.availability, shooterId, allBusy, prefsMap, onsiteMin]
  );
  const timeOptions = useMemo(
    () => (openDays.find(d => d.date === pickedDate)?.slots ?? []).map(s => s.time),
    [openDays, pickedDate]
  );

  // Booking calendar: which days have an open slot (green/bookable).
  const bookableDates = useMemo(() => new Set(openDays.map(d => d.date)), [openDays]);
  // The month being shown (today + monthOffset), as a full Sun–Sat grid.
  const monthGrid = useMemo(() => {
    const base = new Date();
    base.setDate(1);
    base.setMonth(base.getMonth() + monthOffset);
    const year = base.getFullYear(), month = base.getMonth();
    const label = base.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    const lead = new Date(year, month, 1).getDay();
    const days = new Date(year, month + 1, 0).getDate();
    const cells: (string | null)[] = Array.from({ length: lead }, () => null);
    for (let d = 1; d <= days; d++) cells.push(`${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
    while (cells.length % 7 !== 0) cells.push(null);
    return { label, cells };
  }, [monthOffset]);

  const togglePiece = (sel: ProjectServiceSelection) => {
    setPicked(prev => {
      const next = { ...prev };
      const cur = next[sel.serviceId];
      // same variant toggles off; different variant replaces
      if (cur && cur.variantId === sel.variantId) delete next[sel.serviceId];
      else next[sel.serviceId] = sel;
      return next;
    });
  };

  const selections = Object.values(picked);
  const total = selections.reduce((s, x) => s + Number(x.price || 0), 0);
  // If this agent is covered by a broker, reassure them at booking time that
  // the brokerage is billed — not them.
  const agentClient = data.clients.find(c => c.id === clientId);
  const payingBroker = agentClient?.clientType === "agent" && agentClient.brokerId
    ? data.clients.find(c => c.id === agentClient.brokerId) : null;

  const reset = () => {
    setAddress(""); setPicked({}); setShooterId(""); setPickedDate(""); setPickedTime(""); setAgentWillMeet(false); setIsVacant(false); setNotes("");
  };

  const handleSubmit = async () => {
    if (!address.trim()) { toast.error("Enter the property address"); return; }
    if (selections.length === 0) { toast.error("Pick at least one piece"); return; }
    if (!pickedDate || !pickedTime) { toast.error("Pick a date and time"); return; }
    setSaving(true);
    try {
      if (editRequest) {
        // Edit an existing pending request — no re-notify (owner already knows).
        await updateShootRequest(editRequest.id, {
          propertyAddress: address.trim(),
          preferredDate: pickedDate,
          preferredTime: pickedTime,
          preferredCrewMemberId: shooterId || null,
          agentWillMeet,
          isVacant,
          notes: notes.trim(),
          requestedServices: selections,
        });
        toast.success("Request updated");
        reset();
        onClose();
        return;
      }
      const created = await addShootRequest({
        clientId,
        propertyAddress: address.trim(),
        preferredDate: pickedDate,
        preferredTime: pickedTime,
        preferredCrewMemberId: shooterId || null,
        agentWillMeet,
        isVacant,
        notes: notes.trim(),
        requestedServices: selections,
      });
      // Notify the owner(s): bell + email + push. Best-effort — the request is
      // already saved, so don't fail the submit if the notify call hiccups.
      try {
        const token = await getAuthToken();
        await fetch("/api/notify-shoot-request", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
          body: JSON.stringify({ requestId: created.id }),
        });
      } catch (notifyErr) {
        console.warn("notify-shoot-request failed (request still saved):", notifyErr);
      }
      toast.success("Shoot requested — you'll get confirmation once it's scheduled");
      reset();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't send your request");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="bg-card border-border text-foreground max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{editRequest ? "Edit request" : "Request a shoot"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Address */}
          <div>
            <Label className="text-xs text-muted-foreground flex items-center gap-1"><MapPin className="w-3 h-3" /> Property address</Label>
            <Input value={address} onChange={e => setAddress(e.target.value)} placeholder="123 Maple St, Murfreesboro" className="mt-1" />
          </div>

          {/* Pieces */}
          <div>
            <Label className="text-xs text-muted-foreground">What do you need?</Label>
            <div className="mt-2 space-y-2">
              {services.length === 0 && <p className="text-sm text-muted-foreground">No shoot options are set up yet.</p>}
              {services.map(svc => {
                const variants = data.serviceVariants.filter(v => v.serviceId === svc.id).sort((a, b) => a.position - b.position);
                if (variants.length === 0) {
                  const sel: ProjectServiceSelection = { serviceId: svc.id, variantId: null, label: svc.name, price: svc.defaultPrice, durationMinutes: svc.durationMinutes ?? 0 };
                  const on = picked[svc.id]?.variantId === null && !!picked[svc.id];
                  return (
                    <button key={svc.id} type="button" onClick={() => togglePiece(sel)}
                      className={`w-full flex items-start justify-between gap-2 rounded-md border px-3 py-2.5 text-sm text-left transition-colors ${on ? "border-primary bg-primary/10" : "border-border hover:border-border/80"}`}>
                      <span className="flex items-start gap-2 min-w-0">
                        <span className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 mt-0.5 ${on ? "bg-primary text-primary-foreground" : "border border-border"}`}>{on && <Check className="w-3 h-3" />}</span>
                        <span className="min-w-0">
                          <span className="block truncate text-foreground">{svc.name}</span>
                          {svc.description && <span className="block text-xs text-muted-foreground mt-0.5 whitespace-normal">{svc.description}</span>}
                        </span>
                      </span>
                      <span className="text-muted-foreground flex-shrink-0">${svc.defaultPrice.toFixed(0)}</span>
                    </button>
                  );
                }
                return (
                  <div key={svc.id} className="rounded-md border border-border p-2.5">
                    <div className="text-sm text-foreground">{svc.name}</div>
                    {svc.description && <div className="text-xs text-muted-foreground mt-0.5 mb-1.5">{svc.description}</div>}
                    {!svc.description && <div className="mb-1.5" />}
                    <div className="flex flex-wrap gap-1.5">
                      {variants.map(v => {
                        const sel: ProjectServiceSelection = { serviceId: svc.id, variantId: v.id, label: `${svc.name} — ${v.label}`, price: v.price, durationMinutes: (v.durationMinutes || svc.durationMinutes) ?? 0 };
                        const on = picked[svc.id]?.variantId === v.id;
                        return (
                          <button key={v.id} type="button" onClick={() => togglePiece(sel)}
                            className={`px-2.5 py-1.5 rounded-md border text-xs transition-colors ${on ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>
                            {v.label} · ${v.price.toFixed(0)}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
            {selections.length > 0 && <div className="mt-2 text-right text-sm text-foreground">Total: <span className="font-semibold">${total.toFixed(0)}</span></div>}
            {selections.length > 0 && <p className="mt-0.5 text-right text-[11px] text-muted-foreground">About {fmtDur(onsiteMin)} on-site</p>}
            {payingBroker && <p className="mt-1 text-right text-xs text-emerald-400">{payingBroker.company} is billed for this — you won't be charged.</p>}
          </div>

          {/* Time */}
          <div>
            <Label className="text-xs text-muted-foreground flex items-center gap-1"><CalendarClock className="w-3 h-3" /> Preferred time</Label>
            {data.crewMembers.length > 0 && (
              <select value={shooterId} onChange={e => { setShooterId(e.target.value); setPickedDate(""); setPickedTime(""); }}
                className="mt-1 w-full h-10 rounded-md border border-border bg-background px-3 text-sm text-foreground">
                <option value="">Any photographer</option>
                {data.crewMembers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}
            {/* Month calendar: green = a day you can book, red = unavailable.
                Swipe left/right (or use the arrows) to page month to month. */}
            <div className="mt-2 rounded-lg border border-border p-2 select-none" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
              <div className="flex items-center justify-between mb-1.5">
                <button type="button" onClick={() => setMonthOffset(o => Math.max(0, o - 1))} disabled={monthOffset === 0} className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"><ChevronLeft className="w-4 h-4" /></button>
                <span className="text-xs font-medium text-foreground">{monthGrid.label}</span>
                <button type="button" onClick={() => setMonthOffset(o => o + 1)} className="p-1 text-muted-foreground hover:text-foreground"><ChevronRight className="w-4 h-4" /></button>
              </div>
              <div className="grid grid-cols-7 gap-1 text-center">
                {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => <div key={i} className="text-[10px] text-muted-foreground/60 py-0.5">{d}</div>)}
                {monthGrid.cells.map((dateStr, i) => {
                  if (!dateStr) return <div key={i} />;
                  const isPast = dateStr < todayIso();
                  const bookable = !isPast && bookableDates.has(dateStr);
                  const sel = pickedDate === dateStr;
                  const dayNum = Number(dateStr.slice(8));
                  return (
                    <button key={i} type="button" disabled={!bookable} onClick={() => { setPickedDate(dateStr); setPickedTime(""); }}
                      className={`h-8 rounded-md text-xs transition-colors ${
                        sel ? "bg-primary text-primary-foreground font-semibold"
                        : bookable ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 hover:bg-emerald-500/25"
                        : isPast ? "text-muted-foreground/30"
                        : "bg-red-500/10 text-red-400/70"}`}
                      title={bookable ? "Available" : isPast ? "" : "Unavailable"}>
                      {dayNum}
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center gap-3 mt-1.5 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-emerald-500/30" /> Open</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-red-500/20" /> Unavailable</span>
              </div>
            </div>
            {pickedDate && (
              timeOptions.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {timeOptions.map(t => (
                    <button key={t} type="button" onClick={() => setPickedTime(t)}
                      className={`px-2.5 py-1.5 rounded-md border text-xs transition-colors ${pickedTime === t ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>
                      {fmtTime(t)}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-xs text-muted-foreground">No open times that day — pick another, or add a note below.</p>
              )
            )}
          </div>

          {/* Occupancy: vacant or occupied — so the photographer knows what to expect */}
          <div>
            <Label className="text-xs text-muted-foreground">Is the property occupied?</Label>
            <div className="mt-1 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setIsVacant(false)}
                className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors ${!isVacant ? "border-primary bg-primary/15 text-foreground" : "border-border text-muted-foreground hover:bg-white/5"}`}
              >
                Occupied
              </button>
              <button
                type="button"
                onClick={() => setIsVacant(true)}
                className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors ${isVacant ? "border-primary bg-primary/15 text-foreground" : "border-border text-muted-foreground hover:bg-white/5"}`}
              >
                Vacant
              </button>
            </div>
          </div>

          {/* Access: will the agent meet on-site? */}
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={agentWillMeet}
              onChange={e => setAgentWillMeet(e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-primary flex-shrink-0"
            />
            <span className="text-sm text-foreground">I'll meet the photographer at the property</span>
          </label>

          {/* Notes */}
          <div>
            <Label className="text-xs text-muted-foreground">Gate code / lockbox / anything else? (optional)</Label>
            <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Gate code, lockbox, special requests…" className="mt-1" />
          </div>
        </div>

        <DialogFooter className="mt-2">
          <Button variant="ghost" onClick={onClose} className="text-muted-foreground">Cancel</Button>
          <Button onClick={handleSubmit} disabled={saving} className="bg-primary text-primary-foreground hover:bg-primary/90">
            {saving ? "Saving…" : editRequest ? "Save changes" : "Send request"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
