// ============================================================
// Slate — Data Layer & Billing Math
// ============================================================

import { nanoid } from "nanoid";
import type { AppData, Client, Project, ProjectCrewEntry, ProjectPostEntry, MarketingExpense, CrewPayment, Availability, ShooterPref, PartnerSplit } from "./types";

/**
 * A client's partner split, but only if it's active for the given project date.
 * A split with an endedAt (partnership dissolved) does NOT apply to projects
 * dated after it — those bill entirely to the owner and show no partner. Used
 * everywhere partner splits are computed or displayed so an ended partnership
 * drops off consistently across the app while pre-end history stays intact.
 */
export function activePartnerSplit(client: Client | undefined | null, projectDate: string): PartnerSplit | null {
  const s = client?.partnerSplit;
  if (!s) return null;
  if (s.endedAt && projectDate > s.endedAt) return null;
  return s;
}

// ---- Availability → bookable slots -----------------------------------------
// Turns each shooter's availability + operating rules + existing bookings into
// the concrete start times an agent can request. Per shooter: their available
// hours (or all-day), minus shoots already on the calendar (padded by their
// travel buffer), only where a full shoot fits, capped at their max-per-day.

const SLOT_STEP_MIN = 30;          // grid of candidate start times
const ALLDAY_START = "07:00";      // an "all day" block spans this window
const ALLDAY_END = "19:00";

export interface BusyBlock { crewMemberId: string; date: string; start: string; end: string; }

export interface OpenSlot {
  time: string;             // "09:00" — shoot start
  crewMemberIds: string[];  // which shooters are free for this start
}
export interface OpenDay {
  date: string;             // ISO YYYY-MM-DD
  weekday: number;          // 0=Sun..6=Sat
  slots: OpenSlot[];
}

const DEFAULT_PREF = { shootMinutes: 60, bufferMinutes: 30, maxPerDay: 0 };

const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
const toHHMM = (mins: number) => `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;

/** Add `n` days to an ISO date string (timezone-safe, no Date.now). */
export function addDaysIso(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

/** Weekday (0=Sun..6=Sat) for an ISO date, timezone-safe. */
export function weekdayOf(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** A shooter's [startMin,endMin] availability windows for one date. */
function windowsFor(availability: Availability[], crewMemberId: string, date: string): [number, number][] {
  const wd = weekdayOf(date);
  return availability
    .filter(a => a.crewMemberId === crewMemberId && (a.recurring ? a.weekday === wd : a.specificDate === date))
    .map(a => a.allDay ? [toMin(ALLDAY_START), toMin(ALLDAY_END)] : [toMin(a.startTime), toMin(a.endTime)] as [number, number]);
}

/** Candidate shoot starts for one shooter on one date, honoring their rules.
 *  `shootOverride` (minutes) sizes the prospective shoot from the products the
 *  agent picked, instead of the shooter's flat default; buffer is unchanged. */
function openStartsFor(
  availability: Availability[], crewMemberId: string, date: string,
  busy: BusyBlock[], pref: { shootMinutes: number; bufferMinutes: number; maxPerDay: number },
  shootOverride?: number
): string[] {
  const windows = windowsFor(availability, crewMemberId, date);
  if (windows.length === 0) return [];
  const dayBusy = busy.filter(b => b.crewMemberId === crewMemberId && b.date === date);
  // Daily cap — already at the max number of shoots for the day.
  if (pref.maxPerDay > 0 && dayBusy.length >= pref.maxPerDay) return [];
  const busyRanges = dayBusy.map(b => [toMin(b.start), toMin(b.end)] as [number, number]);
  const shoot = (shootOverride && shootOverride > 0) ? shootOverride : pref.shootMinutes, buf = pref.bufferMinutes;
  const out: string[] = [];
  for (const [ws, we] of windows) {
    for (let t = ws; t + shoot <= we; t += SLOT_STEP_MIN) {
      // The shoot [t, t+shoot] needs `buf` minutes clear of every booking.
      const conflict = busyRanges.some(([bs, be]) => t < be + buf && bs < t + shoot + buf);
      if (!conflict) out.push(toHHMM(t));
    }
  }
  return out;
}

export function getOpenDays(
  availability: Availability[],
  opts: {
    fromDate: string; days: number;
    crewMemberId?: string | null;
    busy?: BusyBlock[];
    prefs?: Record<string, { shootMinutes: number; bufferMinutes: number; maxPerDay: number }>;
    /** On-site minutes of the shoot being booked (sum of picked products). */
    shootMinutesOverride?: number;
  }
): OpenDay[] {
  const busy = opts.busy ?? [];
  const prefs = opts.prefs ?? {};
  const allCrew = Array.from(new Set(availability.map(a => a.crewMemberId)));
  const shooters = opts.crewMemberId ? [opts.crewMemberId] : allCrew;
  const result: OpenDay[] = [];
  for (let i = 0; i < opts.days; i++) {
    const date = addDaysIso(opts.fromDate, i);
    // time -> set of shooters free then
    const byTime = new Map<string, Set<string>>();
    for (const cm of shooters) {
      const pref = prefs[cm] ?? DEFAULT_PREF;
      for (const t of openStartsFor(availability, cm, date, busy, pref, opts.shootMinutesOverride)) {
        if (!byTime.has(t)) byTime.set(t, new Set());
        byTime.get(t)!.add(cm);
      }
    }
    if (byTime.size === 0) continue;
    const slots: OpenSlot[] = Array.from(byTime.entries())
      .map(([time, set]) => ({ time, crewMemberIds: Array.from(set) }))
      .sort((a, b) => a.time.localeCompare(b.time));
    result.push({ date, weekday: weekdayOf(date), slots });
  }
  return result;
}

// ---- Calendar overlay: who's available + schedule conflicts ----------------

export interface DayAvailability { crewMemberId: string; windows: { start: string; end: string }[]; }

/** Each crew member's open windows on a given date (for the calendar overlay). */
export function availabilityForDate(availability: Availability[], date: string): DayAvailability[] {
  const crew = Array.from(new Set(availability.map(a => a.crewMemberId)));
  const out: DayAvailability[] = [];
  for (const cm of crew) {
    const w = windowsFor(availability, cm, date);
    if (w.length) out.push({ crewMemberId: cm, windows: w.map(([s, e]) => ({ start: toHHMM(s), end: toHHMM(e) })) });
  }
  return out;
}

export type ConflictType = "double" | "outside" | "buffer" | "cap";
export interface ShootConflict { projectId: string; crewMemberId: string; type: ConflictType; gapMin?: number; }

/** Schedule conflicts among a day's shoots, per assigned person: double-booked
 *  (overlap), outside their availability, too tight a turnaround (< buffer), or
 *  over their daily cap. */
export function conflictsForDate(
  projects: Project[],
  availability: Availability[],
  prefs: Record<string, { shootMinutes: number; bufferMinutes: number; maxPerDay: number }>,
  date: string,
): ShootConflict[] {
  const shoots = projects.filter(p => p.date === date && p.status !== "cancelled");
  const byCrew = new Map<string, { id: string; start: number; end: number }[]>();
  for (const p of shoots) {
    const members = new Set([...(p.crew || []), ...(p.postProduction || [])].map(c => c.crewMemberId).filter(Boolean));
    const start = toMin(p.startTime || "00:00");
    const end = Math.max(toMin(p.endTime || p.startTime || "00:00"), start);
    for (const m of Array.from(members)) {
      if (!byCrew.has(m)) byCrew.set(m, []);
      byCrew.get(m)!.push({ id: p.id, start, end });
    }
  }
  const out: ShootConflict[] = [];
  for (const [m, listRaw] of Array.from(byCrew.entries())) {
    const list = listRaw.sort((a, b) => a.start - b.start);
    const pref = prefs[m] ?? DEFAULT_PREF;
    if (pref.maxPerDay > 0 && list.length > pref.maxPerDay) {
      out.push({ projectId: list[list.length - 1].id, crewMemberId: m, type: "cap" });
    }
    const windows = windowsFor(availability, m, date);
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (windows.length > 0 && !windows.some(([ws, we]) => a.start >= ws && a.end <= we)) {
        out.push({ projectId: a.id, crewMemberId: m, type: "outside" });
      }
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        if (a.end > b.start) out.push({ projectId: b.id, crewMemberId: m, type: "double" });
        else if (pref.bufferMinutes > 0 && b.start - a.end < pref.bufferMinutes) out.push({ projectId: b.id, crewMemberId: m, type: "buffer", gapMin: b.start - a.end });
      }
    }
  }
  return out;
}

/** The calendar block length (minutes) for a shooter: their shoot length +
 *  travel buffer, or 90 (1.5 hrs) if they have no preferences set. */
export function shootDurationMinFor(crewMemberId: string | null | undefined, prefs: ShooterPref[]): number {
  const p = prefs.find(x => x.crewMemberId === crewMemberId);
  return p ? p.shootMinutes + p.bufferMinutes : 90;
}

/** On-site shoot length (minutes) from the products picked — the sum of each
 *  piece's durationMinutes. This is the agent-facing appointment length; travel
 *  buffer is reserved separately by the slot engine, not added here. Falls back
 *  to the shooter's flat shoot length when no piece carries a duration yet. */
export function onsiteMinutesForSelections(
  selections: { durationMinutes?: number }[],
  fallbackMinutes: number
): number {
  const sum = selections.reduce((s, x) => s + (Number(x.durationMinutes) || 0), 0);
  return sum > 0 ? sum : fallbackMinutes;
}

/** A shooter's on-site shoot length only (no buffer), for the fallback above. */
export function shootOnsiteMinFor(crewMemberId: string | null | undefined, prefs: ShooterPref[]): number {
  const p = prefs.find(x => x.crewMemberId === crewMemberId);
  return p ? p.shootMinutes : 60;
}

export type CrewShootStatus = "available" | "busy" | "off";

/** Is a crew member free for a shoot at [date, start–end]? "off" = no availability
 *  window covers it; "busy" = already booked (within their buffer) on that date;
 *  "available" = open. Excludes the project being edited. */
export function getCrewShootStatus(
  crewMemberId: string, date: string, start: string, end: string,
  projects: Project[], availability: Availability[],
  prefs: Record<string, { bufferMinutes: number }>,
  excludeProjectId?: string,
): CrewShootStatus {
  const s = toMin(start), e = Math.max(toMin(end || start), toMin(start));
  const windows = windowsFor(availability, crewMemberId, date);
  if (windows.length === 0 || !windows.some(([ws, we]) => s >= ws && e <= we)) return "off";
  const buf = prefs[crewMemberId]?.bufferMinutes ?? 0;
  for (const p of projects) {
    if (p.id === excludeProjectId || p.date !== date || p.status === "cancelled") continue;
    const assigned = [...(p.crew || []), ...(p.postProduction || [])].some(c => c.crewMemberId === crewMemberId);
    if (!assigned) continue;
    const ps = toMin(p.startTime || "00:00"), pe = Math.max(toMin(p.endTime || p.startTime || "00:00"), ps);
    if (s < pe + buf && ps < e + buf) return "busy";
  }
  return "available";
}

/** "Fake it till you make it" — a synthetic busy block per available day that
 *  holds back `fakeBusyMinutes` of a shooter's time in the AGENT booking view,
 *  so they look more in demand. The start is pseudo-random but stable per
 *  (crew, date) so it doesn't flicker. Returns [] when off or the window's too
 *  short. Never touches the real calendar — only fed into the open-slot engine. */
export function fakeBusyBlocksFor(crewMemberId: string, date: string, availability: Availability[], fakeBusyMinutes: number): BusyBlock[] {
  if (!fakeBusyMinutes || fakeBusyMinutes <= 0) return [];
  const windows = windowsFor(availability, crewMemberId, date);
  // Stable hash of crew+date → deterministic "random" slot.
  let h = 2166136261;
  const s = `${crewMemberId}|${date}`;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  const seed = Math.abs(h);
  for (const [ws, we] of windows) {
    if (we - ws < fakeBusyMinutes) continue; // window can't hold the block
    const slots = Math.floor((we - ws - fakeBusyMinutes) / 30) + 1; // 30-min grid starts
    const start = ws + (seed % slots) * 30;
    return [{ crewMemberId, date, start: toHHMM(start), end: toHHMM(start + fakeBusyMinutes) }];
  }
  return [];
}

// ---- Seed Data (pre-populated from Base44 app) ----
// NOTE: This is only used for localStorage fallback; Supabase is the primary data source.

export const seedData: AppData = {
  clients: [
    {
      id: "client_cbsr",
      company: "Coldwell Banker Southern Realty",
      contactName: "Sam Sizemore",
      phone: "864-494-6909",
      email: "sam.cbsouthernrealty@gmail.com",
      address: "", city: "", state: "", zip: "",
      billingModel: "hourly",
      billingRatePerHour: 200,
      perProjectRate: 0,
      projectTypeRates: [],
      allowedProjectTypeIds: [],
      defaultProjectTypeId: "",
      roleBillingMultipliers: [],
      createdAt: new Date().toISOString(),
    },
  ],
  crewMembers: [
    { id: "crew_zach", name: "Zach Harrison", roleRates: [{ role: "Main Photographer", payRatePerHour: 0 }], phone: "6617337513", email: "", defaultPayRatePerHour: 0 },
    { id: "crew_ken", name: "Ken Robinson", roleRates: [{ role: "Main Photographer", payRatePerHour: 0 }], phone: "615-849-2477", email: "", defaultPayRatePerHour: 0 },
    { id: "crew_melissa", name: "Melissa Mann", roleRates: [{ role: "Main Photographer", payRatePerHour: 0 }, { role: "Photo Editor", payRatePerHour: 0 }], phone: "661-917-8526", email: "", defaultPayRatePerHour: 0 },
    { id: "crew_antonio", name: "Antonio Brum", roleRates: [{ role: "Videographer", payRatePerHour: 0 }, { role: "Video Editor", payRatePerHour: 0 }], phone: "629-401-7226", email: "", defaultPayRatePerHour: 0 },
    { id: "crew_geoff", name: "Geoff Southworth", roleRates: [{ role: "Main Videographer", payRatePerHour: 0 }, { role: "Video Editor", payRatePerHour: 0 }, { role: "Main Photographer", payRatePerHour: 0 }, { role: "Photo Editor", payRatePerHour: 0 }], phone: "661-916-9468", email: "Geoff@SDubMedia.com", defaultPayRatePerHour: 0 },
  ],
  locations: [
    { id: "loc_cbsr_mboro", name: "Coldwell Banker Southern Realty", address: "1980 Old Fort Pkwy", city: "Murfreesboro", state: "TN", zip: "37129", oneTimeUse: false },
    { id: "loc_cbsr_brentwood", name: "CBSR Brentwood", address: "1600 Westgate Cir", city: "Brentwood", state: "TN", zip: "37027", oneTimeUse: false },
    { id: "loc_cbsr_murfreesboro", name: "CBSR Murfreesboro", address: "1980 Old Fort Pkwy", city: "Murfreesboro", state: "TN", zip: "37129", oneTimeUse: false },
    { id: "loc_cbsr_lawrenceburg", name: "CBSR Lawrenceburg", address: "102 Weakley Creek Rd", city: "Lawrenceburg", state: "TN", zip: "38464", oneTimeUse: false },
    { id: "loc_cbsr_shelbyville", name: "CBSR Shelbyville", address: "1708 N Main St", city: "Shelbyville", state: "TN", zip: "37160", oneTimeUse: false },
    { id: "loc_cbsr_columbia", name: "CBSR Columbia", address: "2563 Nashville Hwy Ste. 6", city: "Columbia", state: "TN", zip: "38401", oneTimeUse: false },
    { id: "loc_cbsr_mtjuliet", name: "CBSR Mt. Juliet", address: "2600 N Mt Juliet Rd", city: "Mt. Juliet", state: "TN", zip: "37122", oneTimeUse: false },
    { id: "loc_cbsr_nashville", name: "CBSR Nashville", address: "915 Rep. John Lewis Way S Suite 102", city: "Nashville", state: "TN", zip: "37203", oneTimeUse: false },
  ],
  editTypes: [],
  projectTypes: [
    { id: "pt_awards", name: "Awards Ceremony", lightweight: false },
    { id: "pt_jason_recruit", name: "Jason Nagy - Recruitment Videos", lightweight: false },
    { id: "pt_jason_nagy", name: "Jason Nagy", lightweight: false },
    { id: "pt_jason", name: "Jason", lightweight: false },
    { id: "pt_rich_minute", name: "Rich Weekly Minute", lightweight: false },
    { id: "pt_rich_tips", name: "Rich Weekly Tips", lightweight: false },
    { id: "pt_podcast", name: "Podcast", lightweight: false },
    { id: "pt_office_merger", name: "Office Merger", lightweight: false },
    { id: "pt_full_day", name: "Full day event", lightweight: false },
    { id: "pt_agent_camera", name: "Agent on Camera", lightweight: false },
    { id: "pt_mboro_grand", name: "Murfreesboro Grand Opening", lightweight: false },
    { id: "pt_chuck", name: "Chuck Whitehead", lightweight: false },
    { id: "pt_sales", name: "Sales Meeting", lightweight: false },
    { id: "pt_headshot", name: "Headshot Photography", lightweight: false },
  ],
  projects: [
    {
      id: "proj_001",
      clientId: "client_cbsr",
      projectTypeId: "pt_rich_minute",
      locationId: "loc_cbsr_mboro",
      date: "2026-03-09",
      startTime: "12:00",
      endTime: "14:00",
      status: "upcoming",
      crew: [{ crewMemberId: "crew_geoff", role: "Main Videographer", hoursWorked: 2, payRatePerHour: 0 }],
      postProduction: [{ crewMemberId: "crew_geoff", role: "Video Editor", hoursWorked: 1, payRatePerHour: 0 }],
      editTypes: ["Social Vertical", "Social Horizontal"],
      notes: "",
      deliverableUrl: "",
      cancellationReason: "",
      cancelledAt: null,
      createdAt: new Date().toISOString(),
    },
    {
      id: "proj_002",
      clientId: "client_cbsr",
      projectTypeId: "pt_podcast",
      locationId: "loc_cbsr_nashville",
      date: "2026-03-12",
      startTime: "10:00",
      endTime: "13:00",
      status: "upcoming",
      crew: [
        { crewMemberId: "crew_geoff", role: "Main Videographer", hoursWorked: 3, payRatePerHour: 0 },
        { crewMemberId: "crew_antonio", role: "Crew", hoursWorked: 3, payRatePerHour: 0 },
      ],
      postProduction: [{ crewMemberId: "crew_antonio", role: "Video Editor", hoursWorked: 2, payRatePerHour: 0 }],
      editTypes: ["Podcast Edit"],
      notes: "",
      deliverableUrl: "",
      cancellationReason: "",
      cancelledAt: null,
      createdAt: new Date().toISOString(),
    },
    {
      id: "proj_003",
      clientId: "client_cbsr",
      projectTypeId: "pt_headshot",
      locationId: "loc_cbsr_brentwood",
      date: "2026-03-15",
      startTime: "09:00",
      endTime: "12:00",
      status: "upcoming",
      crew: [{ crewMemberId: "crew_zach", role: "Photographer", hoursWorked: 3, payRatePerHour: 0 }],
      postProduction: [{ crewMemberId: "crew_melissa", role: "Photo Editor", hoursWorked: 2, payRatePerHour: 0 }],
      editTypes: [],
      notes: "",
      deliverableUrl: "",
      cancellationReason: "",
      cancelledAt: null,
      createdAt: new Date().toISOString(),
    },
    {
      id: "proj_004",
      clientId: "client_cbsr",
      projectTypeId: "pt_agent_camera",
      locationId: "loc_cbsr_murfreesboro",
      date: "2026-02-20",
      startTime: "14:00",
      endTime: "16:00",
      status: "editing_done",
      crew: [{ crewMemberId: "crew_geoff", role: "Main Videographer", hoursWorked: 2, payRatePerHour: 0 }],
      postProduction: [{ crewMemberId: "crew_geoff", role: "Video Editor", hoursWorked: 1.5, payRatePerHour: 0 }],
      editTypes: ["Social Vertical"],
      notes: "",
      deliverableUrl: "",
      cancellationReason: "",
      cancelledAt: null,
      createdAt: new Date().toISOString(),
    },
    {
      id: "proj_005",
      clientId: "client_cbsr",
      projectTypeId: "pt_rich_tips",
      locationId: "loc_cbsr_mboro",
      date: "2026-02-27",
      startTime: "12:00",
      endTime: "14:00",
      status: "in_editing",
      crew: [{ crewMemberId: "crew_geoff", role: "Main Videographer", hoursWorked: 2, payRatePerHour: 0 }],
      postProduction: [{ crewMemberId: "crew_antonio", role: "Video Editor", hoursWorked: 1, payRatePerHour: 0 }],
      editTypes: ["Social Vertical", "Social Horizontal"],
      notes: "",
      deliverableUrl: "",
      cancellationReason: "",
      cancelledAt: null,
      createdAt: new Date().toISOString(),
    },
  ],
  marketingExpenses: [],
  invoices: [],
  contractorInvoices: [],
  crewPayments: [],
  products: [],
  shootRequests: [],
  availability: [],
  shooterPrefs: [],
  crewLocationDistances: [],
  manualTrips: [],
  businessExpenses: [],
  categoryRules: [],
  timeEntries: [],
  contractTemplates: [],
  contracts: [],
  staffAgreements: [],
  shootConfirmations: [],
  proposalTemplates: [],
  proposals: [],
  pipelineLeads: [],
  series: [],
  personalEvents: [],
  externalCalendars: [],
  externalEvents: [],
  meetings: [],
  packages: [],
  proposalImages: [],
  deliveries: [],
  deliveryFiles: [],
  deliverySelections: [],
  deliveryCollections: [],
  serviceCategories: [],
  services: [],
  serviceVariants: [],
  organization: null,
};

// ---- Billing math helpers ----

/**
 * Get total worked hours for a project, using editorBilling.finalHours for photo editors.
 */
export function getProjectWorkedHours(project: Project): { crewHours: number; postHours: number; totalHours: number } {
  const crewHours = (project.crew || []).reduce((s, c) => s + Number(c.hoursWorked ?? 0), 0);
  const postHours = (project.postProduction || []).reduce((s, c) => {
    if (c.role === "Photo Editor" && project.editorBilling?.finalHours != null) {
      return s + project.editorBilling.finalHours;
    }
    return s + Number(c.hoursWorked ?? 0);
  }, 0);
  return { crewHours, postHours, totalHours: crewHours + postHours };
}

// Pay for a single crew/post entry. Honor per-entry flat pay: when
// payType === "flat", use flatAmount instead of hoursWorked × payRatePerHour.
// Lets crew be hourly on one project and flat on another without changing
// their global rate.
function crewEntryCost(e: ProjectCrewEntry | ProjectPostEntry): number {
  if (e.payType === "flat") return Number(e.flatAmount ?? 0);
  return Number(e.hoursWorked ?? 0) * Number(e.payRatePerHour ?? 0);
}

/**
 * Get total crew cost for a project, using editorBilling for photo editors.
 */
export function getProjectCrewCost(project: Project): number {
  const crewCost = (project.crew || []).filter(e => e.role !== "Travel").reduce(
    (s, e) => s + crewEntryCost(e), 0
  );
  const postCost = (project.postProduction || []).filter(e => e.role !== "Travel").reduce((s, e) => {
    if (e.role === "Photo Editor" && project.editorBilling) {
      return s + project.editorBilling.imageCount * (project.editorBilling.perImageRate ?? 6);
    }
    return s + crewEntryCost(e);
  }, 0);
  return crewCost + postCost;
}

/**
 * Pay owed to ONE crew member for ONE project — sums their crew[] and
 * postProduction[] entries with the same flat/hourly/photo-editor logic as
 * getProjectCrewCost. Returns 0 for cancelled projects (Slate's "cancelled
 * bills $0" convention) and 0 if the member isn't on the project. Used to
 * prefill the "amount owed" when the owner logs a direct payment.
 */
export function getCrewMemberProjectPay(project: Project, crewMemberId: string): number {
  if (project.status === "cancelled") return 0;
  const crew = (project.crew || [])
    .filter(e => e.crewMemberId === crewMemberId && e.role !== "Travel")
    .reduce((s, e) => s + crewEntryCost(e), 0);
  const post = (project.postProduction || [])
    .filter(e => e.crewMemberId === crewMemberId && e.role !== "Travel")
    .reduce((s, e) => {
      if (e.role === "Photo Editor" && project.editorBilling) {
        return s + project.editorBilling.imageCount * (project.editorBilling.perImageRate ?? 6);
      }
      return s + crewEntryCost(e);
    }, 0);
  return crew + post;
}

/** Total already logged-paid to a crew member for a specific project. */
export function getCrewProjectPaid(crewPayments: CrewPayment[], crewMemberId: string, projectId: string): number {
  return crewPayments
    .filter(p => p.crewMemberId === crewMemberId && p.projectId === projectId)
    .reduce((s, p) => s + Number(p.amount ?? 0), 0);
}

/**
 * Remaining balance owed to a crew member on a project: what they're owed
 * minus what's already been logged as paid. Never negative. A project is
 * "fully paid" when this is ~0 (we use a 1-cent epsilon for rounding).
 */
export function getCrewProjectRemaining(
  project: Project, crewMemberId: string, crewPayments: CrewPayment[],
): number {
  const owed = getCrewMemberProjectPay(project, crewMemberId);
  const paid = getCrewProjectPaid(crewPayments, crewMemberId, project.id);
  const remaining = owed - paid;
  return remaining < 0.005 ? 0 : remaining;
}

/** Get total travel cost for a project (Travel role entries only). */
export function getProjectTravelCost(project: Project): number {
  const crewTravel = (project.crew || []).filter(e => e.role === "Travel")
    .reduce((s, e) => s + Number(e.hoursWorked ?? 0) * Number(e.payRatePerHour ?? 0), 0);
  const postTravel = (project.postProduction || []).filter(e => e.role === "Travel")
    .reduce((s, e) => s + Number(e.hoursWorked ?? 0) * Number(e.payRatePerHour ?? 0), 0);
  return crewTravel + postTravel;
}

/**
 * Get the billing multiplier for a role on a specific client.
 * Default is 1.0 (1 hour worked = 1 hour billed).
 * e.g. "2nd Videographer" on CBSR might be 0.5 (6hrs worked = 3hrs billed)
 */
export function getRoleBillingMultiplier(client: Client, role: string): number {
  const m = client.roleBillingMultipliers?.find(r => r.role === role);
  return m?.multiplier ?? 1.0;
}

/**
 * Get billable hours for a single crew/post entry, applying the client's role multiplier.
 * hoursWorked = what crew gets paid for
 * billableHours = what client gets billed for
 */
export function getBillableHours(entry: ProjectCrewEntry | ProjectPostEntry, client: Client): number {
  const multiplier = getRoleBillingMultiplier(client, entry.role);
  return Number(entry.hoursWorked ?? 0) * multiplier;
}

/**
 * Get total billable hours for a project (applying client role multipliers).
 * When editorBilling.finalHours is set, uses that instead of photo editor post-production hours.
 */
export function getProjectBillableHours(project: Project, client: Client): {
  crewBillable: number;
  postBillable: number;
  totalBillable: number;
} {
  // Cancelled projects don't bill — zero hours surface everywhere.
  if (project.status === "cancelled") {
    return { crewBillable: 0, postBillable: 0, totalBillable: 0 };
  }
  // Travel role is internal-only — it's tracked as a separate cost via
  // getProjectTravelCost and is never billed to the client. Mirrors the same
  // exclusion in getProjectCrewCost above so client invoices and internal
  // billing stay consistent.
  const crewBillable = (project.crew || []).filter(e => e.role !== "Travel")
    .reduce((s, e) => s + getBillableHours(e, client), 0);

  if (project.editorBilling?.finalHours != null) {
    // Photo editor hours come from the calculator; exclude photo editor entries from normal calculation
    const nonPhotoEditorPost = (project.postProduction || []).filter(e => e.role !== "Photo Editor" && e.role !== "Travel");
    const postBillable = nonPhotoEditorPost.reduce((s, e) => s + getBillableHours(e, client), 0);
    const editorBillable = project.editorBilling.finalHours;
    return { crewBillable, postBillable: postBillable + editorBillable, totalBillable: crewBillable + postBillable + editorBillable };
  }

  const postBillable = (project.postProduction || []).filter(e => e.role !== "Travel")
    .reduce((s, e) => s + getBillableHours(e, client), 0);
  return { crewBillable, postBillable, totalBillable: crewBillable + postBillable };
}

/**
 * Get the invoice amount for a single project based on the client's billing model.
 * Hourly: billable hours × rate.
 * Per-project: project-level override → type-specific rate → client default rate.
 */
// Computes the pre-discount billable amount. Used internally and as
// the "subtotal" displayed in the Edit Project dialog.
export function getProjectSubtotal(project: Project, client: Client): number {
  if (project.status === "cancelled") return 0;
  const services = project.services || [];
  const serviceTotal = services.reduce((s, x) => s + Number(x.price ?? 0), 0);
  const effectiveModel = project.billingModel ?? client.billingModel;

  if (effectiveModel === "per_project") {
    // Real-estate / flat bundles: the selected services ARE the price and the
    // photographer's hours are internal cost only. Leave this untouched.
    if (services.length > 0) return serviceTotal;
    if (project.billingRate != null && project.billingRate > 0) return project.billingRate;
    if (project.projectRate != null && project.projectRate > 0) return project.projectRate;
    const typeRate = client.projectTypeRates?.find(r => r.projectTypeId === project.projectTypeId);
    return Number(typeRate?.rate ?? client.perProjectRate ?? 0);
  }

  // Hourly billing: bill hours × rate PLUS any services as add-ons.
  // The billed hours are set at the PROJECT level when provided (independent of
  // the crew roster); otherwise fall back to summing the crew's worked hours.
  const effectiveHourly = project.billingRate ?? client.billingRatePerHour ?? 0;
  const billableHours = project.billedHours != null
    ? Number(project.billedHours)
    : getProjectBillableHours(project, client).totalBillable;
  return billableHours * Number(effectiveHourly) + serviceTotal;
}

// Computes the discount value (always positive — caller subtracts).
export function getProjectDiscountValue(project: Project, subtotal: number): number {
  if (!project.discountType || !project.discountAmount) return 0;
  if (project.discountType === "percent") {
    return Math.max(0, subtotal * (Number(project.discountAmount) / 100));
  }
  return Math.max(0, Math.min(subtotal, Number(project.discountAmount)));
}

export function getProjectInvoiceAmount(project: Project, client: Client): number {
  const subtotal = getProjectSubtotal(project, client);
  const discount = getProjectDiscountValue(project, subtotal);
  return Math.max(0, subtotal - discount);
}

/**
 * Who actually gets billed for this project (broker billing). Priority:
 *   1. explicit project.billToId (per-shoot override)
 *   2. if the project's client is an agent → that agent's broker
 *   3. otherwise the project's own client
 * Single source of truth for invoice grouping.
 */
export function getProjectPayerId(project: Project, clientsById: Record<string, Client>): string {
  if (project.billToId) return project.billToId;
  const client = clientsById[project.clientId];
  if (client?.clientType === "agent" && client.brokerId) return client.brokerId;
  return project.clientId;
}

/** Total per-house product/software cost on a project (e.g. Fotello). */
export function getProjectProductCost(project: Project): number {
  return (project.products || []).reduce((s, p) => s + Number(p.cost ?? 0), 0);
}

/**
 * Labor cost baked into the selected service pieces (the photographer/editor
 * payout snapshotted on each ProjectServiceSelection). 0 when no pieces carry
 * a cost. For real-estate shoots this replaces manual crew entries.
 */
export function getProjectServiceCost(project: Project): number {
  return (project.services || []).reduce((s, x) => s + Number(x.cost ?? 0), 0);
}

/**
 * Flat per-piece crew payouts grouped by role (real-estate flat rates). "shoot"
 * pieces pay the assigned shooter(s); "edit" pieces pay the assigned editor(s).
 * Pieces with no crewRole are excluded (e.g. photo editing rides in the Fotello
 * product cost, not crew pay).
 */
export function getProjectServicePayByRole(project: Project): { shoot: number; edit: number } {
  let shoot = 0, edit = 0;
  for (const s of project.services || []) {
    if (s.crewRole === "shoot") shoot += Number(s.cost ?? 0);
    else if (s.crewRole === "edit") edit += Number(s.cost ?? 0);
  }
  return { shoot, edit };
}

/** Whether a project carries any flat per-piece crew payouts (RE flat-rate). */
export function hasServiceCrewPay(project: Project): boolean {
  return (project.services || []).some(s => s.crewRole === "shoot" || s.crewRole === "edit");
}

/**
 * A crew member's flat service-piece pay on a project: shooters (distinct people
 * in project.crew) split the "shoot" payout evenly; editors (distinct people in
 * project.postProduction) split the "edit" payout evenly; summed if the member is
 * both. Travel-only entries don't count as being on the shoot.
 */
export function getCrewMemberServicePay(project: Project, crewMemberId: string): number {
  const { shoot, edit } = getProjectServicePayByRole(project);
  const shooters = new Set((project.crew || []).filter(e => e.role !== "Travel" && e.crewMemberId).map(e => e.crewMemberId));
  const editors = new Set((project.postProduction || []).filter(e => e.role !== "Travel" && e.crewMemberId).map(e => e.crewMemberId));
  let pay = 0;
  if (shooters.has(crewMemberId) && shooters.size > 0) pay += shoot / shooters.size;
  if (editors.has(crewMemberId) && editors.size > 0) pay += edit / editors.size;
  return pay;
}

/**
 * Per-house profit: revenue − labor − product cost. Labor comes from the
 * service pieces' costs when any are set (real-estate flat-rate model);
 * otherwise it falls back to assigned-crew pay. Avoids double-counting.
 * (v1: travel and overhead are intentionally excluded.) Cancelled = $0.
 */
export function getProjectProfit(project: Project, client: Client): number {
  // Labor = what you actually pay assigned crew. Real-estate flat rates are
  // auto-filled into the crew rows from Services, so they flow through here too.
  return getProjectInvoiceAmount(project, client)
    - getProjectCrewCost(project)
    - getProjectProductCost(project);
}

/**
 * Calculates total hours worked for a client in a given month.
 */
export function calcHoursWorked(
  projects: Project[],
  clientId: string,
  year: number,
  month: number
): number {
  return projects
    .filter((p) => {
      if (p.clientId !== clientId) return false;
      const d = new Date(p.date + "T00:00:00");
      return d.getFullYear() === year && d.getMonth() === month;
    })
    .reduce((sum, p) => sum + getProjectWorkedHours(p).totalHours, 0);
}

// ---- Monthly Earnings Breakdown (shared by P&L and Reports) ----

export interface MonthlyEarnings {
  year: number;
  month: number;
  projectCount: number;
  revenue: number;
  crewCost: number;
  ownerCrewPay: number;
  travelCost: number;
  marketingExpenses: number;
  // Legacy contract bucket: 10% of partner-client profit set aside for
  // marketing/spending. 0 outside legacy months. Distinct from the
  // marketingExpenses ledger field which tracks actual spend.
  spendingBudget: number;
  partnerPayout: number;
  adminSplit: number;
  nonPartnerProfit: number;
  grossProfit: number;
  netProfit: number;
}

export function getMonthlyEarningsBreakdown(
  projects: Project[],
  clients: Client[],
  marketingExpenses: MarketingExpense[],
  ownerCrewMemberId: string,
  year: number,
  month: number,
): MonthlyEarnings {
  const monthStr = `${year}-${String(month).padStart(2, "0")}`;
  const monthProjects = projects.filter(p => p.date.startsWith(monthStr));

  let revenue = 0;
  let totalCrewCost = 0;
  let ownerCrewPay = 0;
  let travelCost = 0;
  let partnerPayout = 0;
  let adminSplit = 0;
  let nonPartnerProfit = 0;
  // Legacy contract allocates 10% of project profit (revenue minus crew
  // and travel) as a spending budget bucket; the remaining 90% is split
  // 50/50 between admin (owner) and partner. Tracked monthly so the
  // monthly row reads: crew + geoff + spendingBudget + partner + admin = revenue.
  let spendingBudget = 0;

  // Use new split logic for March 2026+
  const useNewSplitLogic = year > 2026 || (year === 2026 && month >= 3);

  monthProjects.forEach(p => {
    const client = clients.find(c => c.id === p.clientId);
    if (!client) return;

    const projRevenue = getProjectInvoiceAmount(p, client);
    const projCrewCost = getProjectCrewCost(p);
    const projTravelCost = getProjectTravelCost(p);

    revenue += projRevenue;
    totalCrewCost += projCrewCost;
    travelCost += projTravelCost;

    // Owner's crew pay (separate from other crew)
    [...(p.crew || []), ...(p.postProduction || [])].forEach(e => {
      if (e.crewMemberId !== ownerCrewMemberId) return;
      if (e.role === "Travel") return;
      if (e.role === "Photo Editor" && p.editorBilling) {
        ownerCrewPay += p.editorBilling.imageCount * (p.editorBilling.perImageRate ?? 6);
      } else {
        ownerCrewPay += Number(e.hoursWorked ?? 0) * Number(e.payRatePerHour ?? 0);
      }
    });

    const clientSplit = client.partnerSplit;

    if (!clientSplit) {
      // Non-partner client: profit goes to owner
      nonPartnerProfit += projRevenue - projCrewCost - projTravelCost;
      return;
    }

    // Partnership ended? Projects on/before clientSplit.endedAt keep
    // their partner split for historical P&L. Projects after that
    // date flow through as non-partner — owner keeps everything
    // after costs. Lets a partnership end without rewriting history.
    if (clientSplit.endedAt && p.date > clientSplit.endedAt) {
      nonPartnerProfit += projRevenue - projCrewCost - projTravelCost;
      return;
    }

    if (!useNewSplitLogic) {
      // Legacy split (Jan/Feb 2026): contract allocates project PROFIT
      // (after crew + travel) as 10% spending budget + 90% split 50/50
      // between admin and partner. So: revenue = crew + travel +
      // spendingBudget + partner + admin. If profit is negative
      // (over-budget on crew), zero everything out — nothing to split.
      //
      // Spending budget honors both the per-client toggle AND a
      // per-client end date — projects after spendingBudgetEndedAt
      // skip the 10% allocation and the full 100% gets split 50/50.
      const projProfit = projRevenue - projCrewCost - projTravelCost;
      if (projProfit > 0) {
        const budgetActive = clientSplit.spendingBudgetEnabled !== false
          && (!clientSplit.spendingBudgetEndedAt || p.date <= clientSplit.spendingBudgetEndedAt);
        const projSpending = budgetActive ? projProfit * 0.10 : 0;
        const projSplittable = projProfit - projSpending;
        spendingBudget += projSpending;
        partnerPayout += projSplittable * 0.50;
        adminSplit += projSplittable * 0.50;
      }
      return;
    }

    if (client.billingModel === "per_project") {
      // Per-project with partner
      const projProfit = projRevenue - projCrewCost;
      if (projProfit > 0) {
        partnerPayout += projProfit * (clientSplit.partnerPercent ?? 0);
        adminSplit += projProfit * (clientSplit.adminPercent ?? 0.45);
      }
      return;
    }

    // Hourly billing with partner — detailed crew/editor split
    const rate = Number(client.billingRatePerHour ?? 0);
    if (rate === 0) return;

    const { crewBillable, postBillable } = getProjectBillableHours(p, client);
    const hasPhotoEditor = p.editorBilling?.finalHours != null;
    const editorBillableHours = hasPhotoEditor ? p.editorBilling!.finalHours : 0;
    const nonEditorPostBillable = postBillable - editorBillableHours;

    const crewBillingAmt = (crewBillable + nonEditorPostBillable) * rate;
    const editorBillingAmt = editorBillableHours * rate;

    // Crew costs (excluding photo editor and travel)
    const crewPayCost = (p.crew || []).filter(e => e.role !== "Travel").reduce((s, e) =>
      s + Number(e.hoursWorked ?? 0) * Number(e.payRatePerHour ?? 0), 0);
    const nonEditorPostCost = (p.postProduction || [])
      .filter(e => e.role !== "Photo Editor" && e.role !== "Travel")
      .reduce((s, e) => s + Number(e.hoursWorked ?? 0) * Number(e.payRatePerHour ?? 0), 0);
    const crewCost = crewPayCost + nonEditorPostCost;

    // Crew split
    const useSimpleSplit = year > 2026 || (year === 2026 && month >= 4); // April 2026+
    if (crewBillingAmt > 0) {
      if (useSimpleSplit) {
        // April 2026+: profit × 10/45/45 (budget/admin/partner)
        const crewProfit = crewBillingAmt - crewCost;
        if (crewProfit > 0) {
          partnerPayout += crewProfit * 0.45;
          adminSplit += crewProfit * 0.45;
        }
      } else {
        // March 2026 and earlier: threshold-based split
        const threshold = clientSplit.crewSplitThreshold ?? 0.5;
        const crewMktgPct = clientSplit.crewMarketingPercent ?? 0.10;
        const remainderSplit = clientSplit.crewRemainderSplit ?? 0.5;
        if (crewCost <= crewBillingAmt * threshold) {
          const mktg = crewBillingAmt * crewMktgPct;
          const remainder = crewBillingAmt - crewCost - mktg;
          partnerPayout += remainder * remainderSplit;
          adminSplit += remainder * (1 - remainderSplit);
        } else {
          const remainder = crewBillingAmt - crewCost;
          partnerPayout += remainder * remainderSplit;
          adminSplit += remainder * (1 - remainderSplit);
        }
      }
    }

    // Editor split
    if (editorBillingAmt > 0 && hasPhotoEditor) {
      const editorCost = p.editorBilling!.imageCount * (p.editorBilling!.perImageRate ?? 6);
      const editorProfit = editorBillingAmt - editorCost;
      const ePtnr = clientSplit.editorPartnerPercent ?? 0.45;
      const eAdmin = clientSplit.editorAdminPercent ?? 0.45;
      partnerPayout += editorProfit * ePtnr;
      adminSplit += editorProfit * eAdmin;
    }
  });

  const mktgExp = marketingExpenses
    .filter(e => e.date.startsWith(monthStr))
    .reduce((s, e) => s + e.amount, 0);

  const grossProfit = revenue - totalCrewCost;
  // Net profit = what the company actually keeps as profit. In legacy
  // contracts that's revenue minus crew, travel, partner payout, and
  // the spending-budget bucket (which is allocated away from the
  // company). In non-legacy months we fall back to actual marketing
  // expenses since there's no contractual budget allocation.
  const allocatedSpend = spendingBudget > 0 ? spendingBudget : mktgExp;
  const netProfit = revenue - totalCrewCost - travelCost - allocatedSpend - partnerPayout;

  return {
    year, month,
    projectCount: monthProjects.length,
    revenue,
    crewCost: totalCrewCost,
    ownerCrewPay,
    travelCost,
    marketingExpenses: mktgExp,
    spendingBudget,
    partnerPayout,
    adminSplit,
    nonPartnerProfit,
    grossProfit,
    netProfit,
  };
}

// ---- CRUD helpers ----

export function generateId(): string {
  return nanoid(10);
}
