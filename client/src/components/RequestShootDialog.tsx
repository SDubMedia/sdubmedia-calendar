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
import { Check, MapPin, CalendarClock } from "lucide-react";
import { useScopedData as useApp } from "@/hooks/useScopedData";
import { supabase, getAuthToken } from "@/lib/supabase";
import { getOpenDays, shootDurationMinFor, type BusyBlock } from "@/lib/data";
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
function fmtDay(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
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
      const end = addMin(r.preferredTime, shootDurationMinFor(r.preferredCrewMemberId, data.shooterPrefs));
      if (r.preferredCrewMemberId) {
        out.push({ crewMemberId: r.preferredCrewMemberId, date: r.preferredDate, start: r.preferredTime, end });
      } else {
        for (const c of data.crewMembers) out.push({ crewMemberId: c.id, date: r.preferredDate, start: r.preferredTime, end });
      }
    }
    return out;
  }, [data.shootRequests, data.shooterPrefs, data.crewMembers, editRequest]);
  const allBusy = useMemo(() => [...busy, ...pendingBusy], [busy, pendingBusy]);

  const openDays = useMemo(
    () => getOpenDays(data.availability, { fromDate: todayIso(), days: 21, crewMemberId: shooterId || null, busy: allBusy, prefs: prefsMap }),
    [data.availability, shooterId, allBusy, prefsMap]
  );
  const timeOptions = useMemo(
    () => (openDays.find(d => d.date === pickedDate)?.slots ?? []).map(s => s.time),
    [openDays, pickedDate]
  );

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

  const reset = () => {
    setAddress(""); setPicked({}); setShooterId(""); setPickedDate(""); setPickedTime(""); setNotes("");
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
                  const sel: ProjectServiceSelection = { serviceId: svc.id, variantId: null, label: svc.name, price: svc.defaultPrice };
                  const on = picked[svc.id]?.variantId === null && !!picked[svc.id];
                  return (
                    <button key={svc.id} type="button" onClick={() => togglePiece(sel)}
                      className={`w-full flex items-center justify-between gap-2 rounded-md border px-3 py-2.5 text-sm transition-colors ${on ? "border-primary bg-primary/10" : "border-border hover:border-border/80"}`}>
                      <span className="flex items-center gap-2 min-w-0">
                        <span className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 ${on ? "bg-primary text-primary-foreground" : "border border-border"}`}>{on && <Check className="w-3 h-3" />}</span>
                        <span className="truncate text-foreground">{svc.name}</span>
                      </span>
                      <span className="text-muted-foreground flex-shrink-0">${svc.defaultPrice.toFixed(0)}</span>
                    </button>
                  );
                }
                return (
                  <div key={svc.id} className="rounded-md border border-border p-2.5">
                    <div className="text-sm text-foreground mb-1.5">{svc.name}</div>
                    <div className="flex flex-wrap gap-1.5">
                      {variants.map(v => {
                        const sel: ProjectServiceSelection = { serviceId: svc.id, variantId: v.id, label: `${svc.name} — ${v.label}`, price: v.price };
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
            {openDays.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">No open times posted right now. Add a note below and we'll reach out.</p>
            ) : (
              <>
                <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
                  {openDays.map(d => (
                    <button key={d.date} type="button" onClick={() => { setPickedDate(d.date); setPickedTime(""); }}
                      className={`flex-shrink-0 px-3 py-2 rounded-md border text-xs transition-colors ${pickedDate === d.date ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>
                      {fmtDay(d.date)}
                    </button>
                  ))}
                </div>
                {pickedDate && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {timeOptions.map(t => (
                      <button key={t} type="button" onClick={() => setPickedTime(t)}
                        className={`px-2.5 py-1.5 rounded-md border text-xs transition-colors ${pickedTime === t ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>
                        {fmtTime(t)}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Notes */}
          <div>
            <Label className="text-xs text-muted-foreground">Anything else? (optional)</Label>
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
