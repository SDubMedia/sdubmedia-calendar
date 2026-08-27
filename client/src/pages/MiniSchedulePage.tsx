// ============================================================
// MiniSchedulePage — the PUBLIC season page at /book/:slug.
//
// One photographer, every upcoming mini session, one permanent link. This is
// what goes on a website, a business card or a printed QR: unlike a per-event
// link it never has to be reissued, because it always reflects whatever is
// published right now.
//
// No auth, no account — picking a date hands off to the existing /minis/:token
// sign-up flow, which owns slots, agreements and payment.
// ============================================================

import { useEffect, useState } from "react";
import { useParams } from "wouter";
import { Calendar, Clock, MapPin, AlertCircle, ArrowRight } from "lucide-react";
import { formatSlot } from "@/lib/miniSlots";

interface ScheduleEvent {
  token: string; title: string; date: string;
  startTime: string; endTime: string; locationText: string;
  slotMinutes: number; priceCents: number;
  paymentMode: "full" | "deposit"; dueNowCents: number;
  includedPhotos: number; status: string;
  openCount: number; nextOpenSlot: string | null; totalSlots: number;
  bookUrl: string;
  // Pre-sale: the date is a placeholder in the right month and there are no
  // times yet — it sells places.
  dateTbd?: boolean;
  placesLeft?: number | null;
  reservationCap?: number;
}

interface SchedulePayload {
  orgName: string; orgLogo: string;
  orgBusinessInfo: { phone?: string; email?: string; website?: string } | null;
  scheduleUrl: string;
  events: ScheduleEvent[];
}

const money = (cents: number) => `$${(Math.round(cents) / 100).toFixed(2).replace(/\.00$/, "")}`;

/** Today in the VIEWER's timezone — the server can only offer a UTC-ish floor. */
function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dayParts(iso: string): { month: string; day: string; weekday: string } {
  const d = new Date(String(iso || "") + "T00:00:00");
  if (isNaN(d.getTime())) return { month: "", day: iso, weekday: "" };
  return {
    month: d.toLocaleDateString("en-US", { month: "short" }).toUpperCase(),
    day: String(d.getDate()),
    weekday: d.toLocaleDateString("en-US", { weekday: "long" }),
  };
}

function EventCard({ ev }: { ev: ScheduleEvent }) {
  const { month, day, weekday } = dayParts(ev.date);
  const presale = !!ev.dateTbd;
  const soldOutPresale = presale && ev.placesLeft !== null && ev.placesLeft !== undefined && ev.placesLeft <= 0;
  const bookable = presale
    ? !soldOutPresale && ev.status === "published"
    : ev.status === "published" && ev.openCount > 0;
  const balance = ev.priceCents - ev.dueNowCents;

  return (
    <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
      <div className="p-5 flex gap-4">
        <div className="shrink-0 w-14 rounded-lg bg-gray-900 text-white text-center py-2">
          <div className="text-[10px] font-semibold tracking-wider opacity-70">{month}</div>
          {presale
            ? <div className="text-[10px] font-semibold leading-tight mt-0.5">date<br />TBC</div>
            : <div className="text-2xl font-bold leading-none">{day}</div>}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-bold text-gray-900 break-words">{ev.title}</h2>
          <div className="mt-1.5 space-y-1 text-sm text-gray-600">
            <p className="flex items-start gap-1.5">
              <Calendar className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span className="min-w-0">
                {presale
                  ? `${new Date(ev.date + "T00:00:00").toLocaleDateString("en-US", { month: "long", year: "numeric" })} — date to be confirmed`
                  : weekday}
              </span>
            </p>
            {!presale && (
              <p className="flex items-start gap-1.5">
                <Clock className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span className="min-w-0">
                  {formatSlot(ev.startTime)}–{formatSlot(ev.endTime)} · {ev.slotMinutes}-min sessions
                </span>
              </p>
            )}
            {ev.locationText && (
              <p className="flex items-start gap-1.5">
                <MapPin className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span className="min-w-0 break-words">{ev.locationText}</span>
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="px-5 pb-5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 mb-3">
          <span className="text-xl font-bold text-gray-900">{money(ev.priceCents)}</span>
          {ev.paymentMode === "deposit" && (
            <span className="text-xs text-gray-500">
              {presale
                ? `${money(ev.dueNowCents)} to hold a place, ${money(balance)} when you pick your time`
                : `${money(ev.dueNowCents)} to book, ${money(balance)} the day before`}
            </span>
          )}
          {ev.includedPhotos > 0 && (
            <span className="text-xs text-gray-500">
              {ev.includedPhotos} edited image{ev.includedPhotos === 1 ? "" : "s"} included
            </span>
          )}
        </div>

        {bookable ? (
          <>
            <a
              href={`/minis/${ev.token}`}
              className="w-full py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 flex items-center justify-center gap-2"
            >
              {presale ? "Hold a place" : "Book a time"} <ArrowRight className="w-4 h-4" />
            </a>
            <p className="text-xs text-center mt-2 text-gray-500">
              {presale ? (
                ev.placesLeft !== null && ev.placesLeft !== undefined
                  ? <span className={ev.placesLeft <= 3 ? "font-semibold text-amber-600" : ""}>
                      {ev.placesLeft} of {ev.reservationCap} places left
                    </span>
                  : "Limited places"
              ) : ev.openCount <= 3 ? (
                <span className="font-semibold text-amber-600">Only {ev.openCount} time{ev.openCount === 1 ? "" : "s"} left</span>
              ) : `${ev.openCount} of ${ev.totalSlots} times still open`}
              {!presale && ev.nextOpenSlot ? ` · next at ${formatSlot(ev.nextOpenSlot)}` : ""}
            </p>
          </>
        ) : (
          <div className="w-full py-3 rounded-xl bg-gray-100 text-gray-500 font-semibold text-center text-sm">
            {ev.status === "closed" ? "Booking closed" : presale ? "All places gone" : "Fully booked"}
          </div>
        )}
      </div>
    </div>
  );
}

export default function MiniSchedulePage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<SchedulePayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/mini-public?action=schedule&slug=${encodeURIComponent(slug || "")}`)
      .then(r => r.json().then(b => ({ ok: r.ok, b })))
      .then(({ ok, b }) => {
        if (!ok) setError(b.error || "Couldn't load this schedule");
        else setData(b);
        setLoading(false);
      })
      .catch(() => { setError("Couldn't load this schedule"); setLoading(false); });
  }, [slug]);

  if (loading) return <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-500">Loading…</div>;
  if (error || !data) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-xl shadow-sm border p-8 max-w-md text-center">
          <AlertCircle className="w-8 h-8 text-gray-400 mx-auto mb-3" />
          <p className="text-gray-900 font-semibold mb-1">Schedule unavailable</p>
          <p className="text-sm text-gray-500">{error}</p>
        </div>
      </div>
    );
  }

  // The server gives a day of slack for timezone safety; trim it here, where we
  // actually know what day it is for the person reading.
  const today = localToday();
  const upcoming = data.events.filter(e => e.date >= today);

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-xl mx-auto space-y-4">
        <div className="bg-white rounded-xl shadow-sm border p-6 text-center">
          {data.orgLogo
            ? <img src={data.orgLogo} alt={data.orgName} className="h-10 mx-auto mb-3 object-contain max-w-full" />
            : <p className="text-sm font-semibold text-gray-500 mb-2">{data.orgName}</p>}
          <h1 className="text-2xl font-bold text-gray-900">Mini Sessions</h1>
          <p className="mt-2 text-sm text-gray-600">
            {upcoming.length > 0
              ? "Pick a date, choose your time, and you're booked."
              : "No dates on the calendar right now."}
          </p>
        </div>

        {upcoming.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm border p-6 text-center">
            <p className="font-semibold text-gray-900 mb-1">Nothing scheduled yet</p>
            <p className="text-sm text-gray-500">
              Check back soon{data.orgBusinessInfo?.email ? ", or get in touch to be told when dates go up" : ""}.
            </p>
            {data.orgBusinessInfo?.email && (
              <a href={`mailto:${data.orgBusinessInfo.email}`} className="inline-block mt-3 text-sm font-semibold text-blue-600 hover:underline">
                {data.orgBusinessInfo.email}
              </a>
            )}
          </div>
        ) : (
          upcoming.map(ev => <EventCard key={ev.token} ev={ev} />)
        )}

        <p className="text-center text-xs text-gray-400 pb-6">
          {data.orgName}
          {data.orgBusinessInfo?.phone ? ` · ${data.orgBusinessInfo.phone}` : ""}
          {data.orgBusinessInfo?.email ? ` · ${data.orgBusinessInfo.email}` : ""}
        </p>
      </div>
    </div>
  );
}
