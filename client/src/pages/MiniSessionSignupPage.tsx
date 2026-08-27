// ============================================================
// MiniSessionSignupPage — the PUBLIC page a flyer's QR code opens.
// No auth, no account: pick a time, sign the agreement, pay. The slot isn't
// actually held until Stripe confirms (the server owns that decision).
// ============================================================

import { useEffect, useState } from "react";
import { useParams, useSearch } from "wouter";
import { CheckCircle, Clock, MapPin, Calendar, AlertCircle } from "lucide-react";
import { formatSlot } from "@/lib/miniSlots";
import { formatPhoneInput } from "@/lib/utils";

interface EventPayload {
  title: string; date: string; locationText: string; slotMinutes: number;
  priceCents: number; paymentMode: "full" | "deposit"; depositPercent: number;
  dueNowCents: number; agreementText: string; includedPhotos: number;
  perExtraPhotoCents: number; status: string; openSlots: string[]; totalSlots: number;
  orgName: string; orgLogo: string; stripeConnected: boolean;
  orgBusinessInfo: { phone?: string; email?: string; website?: string } | null;
  // Pre-sale: buying a place, not a time. The date is a placeholder inside the
  // right month and must never be shown as if it were the real day.
  dateTbd: boolean;
  reservationCap: number;
  placesLeft: number | null;   // null = uncapped
  unclaimedBlurb: string;
  // While true the times belong to people who already paid a deposit.
  holdersOnly: boolean;
  holdersUntil: string | null;
}

const money = (cents: number) => `$${(Math.round(cents) / 100).toFixed(2).replace(/\.00$/, "")}`;

function humanDate(iso: string): string {
  const d = new Date(String(iso || "") + "T00:00:00");
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

export default function MiniSessionSignupPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const search = useSearch();
  const src = new URLSearchParams(search).get("src") || "";

  const [loading, setLoading] = useState(true);
  const [ev, setEv] = useState<EventPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [slot, setSlot] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [signature, setSignature] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  const load = () => {
    fetch(`/api/mini-public?action=get&token=${encodeURIComponent(token || "")}`)
      .then(r => r.json().then(b => ({ ok: r.ok, b })))
      .then(({ ok, b }) => {
        if (!ok) setError(b.error || "Couldn't load this event");
        else setEv(b);
        setLoading(false);
      })
      .catch(() => { setError("Couldn't load this event"); setLoading(false); });
  };
  useEffect(load, [token]);

  async function submit() {
    setFormError("");
    if (!ev?.dateTbd && !slot) { setFormError("Pick a time first"); return; }
    if (!name.trim()) { setFormError("Enter your name"); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setFormError("Enter a valid email"); return; }
    if (!agreed || !signature.trim()) { setFormError("Please read and sign the agreement"); return; }
    setSubmitting(true);
    try {
      const res = await fetch("/api/mini-public?action=book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, slotTime: slot, name, email, phone, source: src, signatureName: signature }),
      });
      const body = await res.json();
      if (!res.ok) {
        setFormError(body.error || "Couldn't book that slot");
        // Somebody beat them to it — refresh what's actually left.
        if (body.slotTaken) { setSlot(""); load(); }
        setSubmitting(false);
        return;
      }
      if (body.checkoutUrl) window.location.assign(body.checkoutUrl);
      else { setFormError("Couldn't start checkout"); setSubmitting(false); }
    } catch {
      setFormError("Couldn't book that slot — try again");
      setSubmitting(false);
    }
  }

  if (loading) return <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-500">Loading…</div>;
  if (error || !ev) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-xl shadow-sm border p-8 max-w-md text-center">
          <AlertCircle className="w-8 h-8 text-gray-400 mx-auto mb-3" />
          <p className="text-gray-900 font-semibold mb-1">This event isn't available</p>
          <p className="text-sm text-gray-500">{error}</p>
        </div>
      </div>
    );
  }

  // A pre-sale sells out on places, not slots.
  const soldOut = ev.dateTbd ? (ev.placesLeft !== null && ev.placesLeft <= 0) : ev.openSlots.length === 0;
  const balance = ev.priceCents - ev.dueNowCents;

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-xl mx-auto space-y-4">
        <div className="bg-white rounded-xl shadow-sm border p-6 text-center">
          {ev.orgLogo
            ? <img src={ev.orgLogo} alt={ev.orgName} className="h-10 mx-auto mb-3 object-contain" />
            : <p className="text-sm font-semibold text-gray-500 mb-2">{ev.orgName}</p>}
          <h1 className="text-2xl font-bold text-gray-900">{ev.title}</h1>
          <div className="mt-3 space-y-1 text-sm text-gray-600">
            <p className="flex items-center justify-center gap-1.5">
              <Calendar className="w-4 h-4" />
              {ev.dateTbd
                ? `${new Date(ev.date + "T00:00:00").toLocaleDateString("en-US", { month: "long", year: "numeric" })} — exact date to be confirmed`
                : humanDate(ev.date)}
            </p>
            {ev.locationText && <p className="flex items-center justify-center gap-1.5"><MapPin className="w-4 h-4" /> {ev.locationText}</p>}
            <p className="flex items-center justify-center gap-1.5"><Clock className="w-4 h-4" /> {ev.slotMinutes}-minute sessions</p>
          </div>
          <div className="mt-4 pt-4 border-t">
            <p className="text-3xl font-bold text-gray-900">{money(ev.priceCents)}</p>
            {ev.paymentMode === "deposit" && (
              <p className="text-sm text-gray-500 mt-1">
                {money(ev.dueNowCents)} today, {money(balance)} charged the day before
              </p>
            )}
            {ev.includedPhotos > 0 && (
              <p className="text-xs text-gray-500 mt-2">
                {ev.includedPhotos} edited image{ev.includedPhotos === 1 ? "" : "s"} included
                {ev.perExtraPhotoCents > 0 ? ` · extras ${money(ev.perExtraPhotoCents)} each` : ""}
              </p>
            )}
          </div>
        </div>

        {ev.holdersOnly ? (
          <div className="bg-white rounded-xl shadow-sm border p-6 text-center">
            <p className="font-semibold text-gray-900 mb-1">Times are being claimed</p>
            <p className="text-sm text-gray-600">
              People who paid a deposit are choosing their times first
              {ev.holdersUntil ? ` until ${new Date(ev.holdersUntil).toLocaleString()}` : ""}.
              Anything left goes on general sale after that, so check back.
            </p>
          </div>
        ) : soldOut ? (
          <div className="bg-white rounded-xl shadow-sm border p-6 text-center">
            <p className="font-semibold text-gray-900 mb-1">{ev.dateTbd ? "All places have gone" : "All booked up"}</p>
            <p className="text-sm text-gray-500">
              {ev.dateTbd
                ? `All ${ev.reservationCap} places are taken. Reach out to ${ev.orgName} about the next one.`
                : `Every slot for this date is taken. Reach out to ${ev.orgName} about the next one.`}
            </p>
          </div>
        ) : (
          <>
            {ev.dateTbd ? (
              <div className="bg-white rounded-xl shadow-sm border p-6">
                <div className="flex items-baseline justify-between gap-2 flex-wrap mb-2">
                  <h2 className="font-bold text-gray-900">Hold your place</h2>
                  {ev.placesLeft !== null && (
                    <span className={`text-xs font-semibold ${ev.placesLeft <= 3 ? "text-amber-600" : "text-gray-500"}`}>
                      {ev.placesLeft} of {ev.reservationCap} left
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-600">
                  The exact date isn't set yet. Pay {money(ev.dueNowCents)} now to hold one of{" "}
                  {ev.reservationCap > 0 ? `only ${ev.reservationCap}` : "a limited number of"} places.
                  When the date is announced you'll be emailed to choose your time and pay the rest.
                </p>
                {/* The two facts that decide whether this is a fair deal, stated
                    before they pay rather than buried in the terms below. */}
                <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 space-y-1.5">
                  <p className="text-sm font-semibold text-amber-900">Before you pay</p>
                  <p className="text-sm text-amber-900">
                    This holds a place, not a time. Everyone is emailed together and chooses on a first-come basis.
                  </p>
                  <p className="text-sm text-amber-900">{ev.unclaimedBlurb}</p>
                </div>
              </div>
            ) : (
            <div className="bg-white rounded-xl shadow-sm border p-6">
              <div className="flex items-baseline justify-between mb-3">
                <h2 className="font-bold text-gray-900">Pick your time</h2>
                {ev.openSlots.length <= 3 && (
                  <span className="text-xs font-semibold text-amber-600">
                    Only {ev.openSlots.length} left
                  </span>
                )}
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {ev.openSlots.map(t => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setSlot(t)}
                    className={`rounded-lg border px-2 py-2.5 text-sm font-medium transition-colors ${
                      slot === t ? "border-blue-600 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-700 hover:border-gray-300"
                    }`}
                  >{formatSlot(t)}</button>
                ))}
              </div>
            </div>
            )}

            {(ev.dateTbd || slot) && (
              <>
                <div className="bg-white rounded-xl shadow-sm border p-6 space-y-3">
                  <h2 className="font-bold text-gray-900">Your details</h2>
                  <input value={name} onChange={e => setName(e.target.value)} placeholder="Your name"
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400" />
                  <input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="Email"
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400" />
                  <input value={phone} onChange={e => setPhone(formatPhoneInput(e.target.value))} type="tel" inputMode="tel" placeholder="Phone"
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400" />
                  <p className="text-xs text-gray-500">Your photos and check-in code are sent to this email.</p>
                </div>

                {ev.agreementText && (
                  <div className="bg-white rounded-xl shadow-sm border p-6">
                    <h2 className="font-bold text-gray-900 mb-2">Agreement</h2>
                    <div className="max-h-56 overflow-y-auto rounded border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700 whitespace-pre-wrap">
                      {ev.agreementText}
                    </div>
                    <label className="flex items-start gap-2 mt-3 text-sm text-gray-700 cursor-pointer">
                      <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} className="mt-0.5" />
                      <span>I've read and agree to the terms above.</span>
                    </label>
                    <div className="mt-3">
                      <label className="block text-[11px] uppercase tracking-wider text-gray-500 mb-1">Type your full name to sign</label>
                      <input value={signature} onChange={e => setSignature(e.target.value)} placeholder="Full name"
                        className="w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400" />
                      {signature.trim() && (
                        <p className="mt-2 text-2xl italic text-gray-900" style={{ fontFamily: "cursive" }}>{signature}</p>
                      )}
                    </div>
                  </div>
                )}

                <div className="bg-white rounded-xl shadow-sm border p-6">
                  {formError && <p className="text-sm text-red-600 mb-3">{formError}</p>}
                  {!ev.stripeConnected && <p className="text-sm text-red-600 mb-3">Payment isn't set up yet — contact {ev.orgName}.</p>}
                  <button
                    onClick={submit}
                    disabled={submitting || !ev.stripeConnected}
                    className="w-full py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {submitting ? "Starting checkout…"
                      : ev.dateTbd
                      ? <><CheckCircle className="w-4 h-4" /> Hold my place · {money(ev.dueNowCents)}</>
                      : <><CheckCircle className="w-4 h-4" /> Book {formatSlot(slot)} · {money(ev.dueNowCents)}</>}
                  </button>
                  <p className="text-xs text-gray-400 text-center mt-3">
                    {ev.dateTbd
                      ? `Your place is held once payment goes through. The remaining ${money(balance)} is due when you claim your time.`
                      : `Your spot is held once payment goes through.${ev.paymentMode === "deposit" ? ` The remaining ${money(balance)} is charged to the same card the day before.` : ""}`}
                  </p>
                </div>
              </>
            )}
          </>
        )}

        <p className="text-center text-xs text-gray-400 pb-6">
          {ev.orgName}
          {ev.orgBusinessInfo?.phone ? ` · ${ev.orgBusinessInfo.phone}` : ""}
          {ev.orgBusinessInfo?.email ? ` · ${ev.orgBusinessInfo.email}` : ""}
        </p>
      </div>
    </div>
  );
}
