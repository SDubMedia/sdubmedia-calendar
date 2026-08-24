// ============================================================
// Server mirror of client/src/lib/miniSlots.ts — deliberately duplicated the
// same way api/delivery-multipart.ts mirrors client/src/lib/multipart.ts
// (api/ can't import from client/src). Keep the two in sync; the slot maths
// is the contract between what the sign-up page shows and what the server
// will actually sell.
// ============================================================

/** A pending booking older than this is treated as an abandoned checkout: its
 *  slot goes back on sale and the cron sweeps the row. Long enough to finish
 *  Stripe on a slow phone, short enough that a bailed checkout doesn't hold a
 *  Saturday slot hostage. */
export const PENDING_HOLD_MINUTES = 20;

export function toMinutes(hhmm: string): number {
  const [h, m] = String(hhmm || "").split(":");
  const hh = Number(h), mm = Number(m);
  return Number.isFinite(hh) && Number.isFinite(mm) ? hh * 60 + mm : NaN;
}

export function fromMinutes(mins: number): string {
  const m = ((Math.round(mins) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** 12-hour label for display ("14:30" → "2:30 PM"). */
export function formatSlot(hhmm: string): string {
  const mins = toMinutes(hhmm);
  if (!Number.isFinite(mins)) return hhmm || "";
  const h24 = Math.floor(mins / 60), m = mins % 60;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${h24 < 12 ? "AM" : "PM"}`;
}

export interface SlotSpec {
  startTime: string;    // HH:MM window start
  endTime: string;      // HH:MM window end
  slotMinutes: number;  // length of each session
  breakMinutes?: number;// gap between sessions
}

/**
 * Every slot start time in the window. A slot is only produced when it fits
 * entirely inside the window (a 15-min slot can't start at 3:55 in a window
 * that ends at 4:00), so the last session never runs past the advertised end.
 */
export function generateSlots(spec: SlotSpec): string[] {
  const start = toMinutes(spec.startTime);
  const end = toMinutes(spec.endTime);
  const len = Number(spec.slotMinutes);
  const gap = Math.max(0, Number(spec.breakMinutes) || 0);
  if (!Number.isFinite(start) || !Number.isFinite(end) || !Number.isFinite(len) || len <= 0) return [];
  if (end <= start) return [];

  const out: string[] = [];
  // Hard ceiling: a window can't produce more slots than it has minutes, so a
  // pathological spec can't spin forever.
  const maxSlots = Math.ceil((end - start) / Math.max(1, len)) + 1;
  for (let t = start; t + len <= end && out.length < maxSlots; t += len + gap) {
    out.push(fromMinutes(t));
  }
  return out;
}

export interface SlotAvailability {
  time: string;
  taken: boolean;
  blocked: boolean;
  open: boolean;
}

/**
 * Slot-by-slot availability. `takenSlots` are the times held by live bookings
 * (booked, or pending and still inside the hold window — the caller decides
 * which pendings still count); `blockedSlots` are times the owner pulled from
 * sale (lunch, sun angle).
 */
export function slotAvailability(
  spec: SlotSpec,
  takenSlots: string[] = [],
  blockedSlots: string[] = [],
): SlotAvailability[] {
  const taken = new Set(takenSlots.filter(Boolean));
  const blocked = new Set(blockedSlots.filter(Boolean));
  return generateSlots(spec).map(time => {
    const isTaken = taken.has(time);
    const isBlocked = blocked.has(time);
    return { time, taken: isTaken, blocked: isBlocked, open: !isTaken && !isBlocked };
  });
}

export function openSlots(spec: SlotSpec, takenSlots: string[] = [], blockedSlots: string[] = []): string[] {
  return slotAvailability(spec, takenSlots, blockedSlots).filter(s => s.open).map(s => s.time);
}

/** Has this pending booking outlived its hold? (abandoned checkout) */
export function pendingExpired(createdAtIso: string, nowMs = Date.now()): boolean {
  const t = new Date(createdAtIso).getTime();
  if (!Number.isFinite(t)) return true;
  return nowMs - t > PENDING_HOLD_MINUTES * 60_000;
}

/** The slot whose window contains this capture time — the fallback used when a
 *  party's QR frame is missing or unreadable. Returns null outside every slot. */
export function slotForTime(spec: SlotSpec, hhmm: string, slots?: string[]): string | null {
  const at = toMinutes(hhmm);
  if (!Number.isFinite(at)) return null;
  const len = Number(spec.slotMinutes) || 0;
  const gap = Math.max(0, Number(spec.breakMinutes) || 0);
  for (const s of (slots ?? generateSlots(spec))) {
    const start = toMinutes(s);
    // Photos taken during the break after a session still belong to it.
    if (at >= start && at < start + len + gap) return s;
  }
  return null;
}
