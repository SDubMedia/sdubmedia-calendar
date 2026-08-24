// ============================================================
// MiniBookingPage — the party's own booking page (/msb/:token).
// This is what their personal QR code points at, and what the photographer
// scans on shoot day. No auth: the token is the gate.
// ============================================================

import { useEffect, useState } from "react";
import { useParams, useSearch } from "wouter";
import { Calendar, MapPin, CheckCircle, AlertCircle, Images } from "lucide-react";
import { formatSlot } from "@/lib/miniSlots";
import { qrImageUrl } from "@/lib/publicUrl";

interface BookingPayload {
  name: string; slotTime: string; status: string; paymentStatus: string;
  depositPaidCents: number; totalCents: number; balanceCents: number;
  bookingToken: string; galleryToken: string | null;
  event: { title: string; date: string; locationText: string; slotMinutes: number; includedPhotos: number; agreementText: string; paymentMode: string } | null;
  orgName: string;
  orgBusinessInfo: { phone?: string; email?: string } | null;
}

const money = (cents: number) => `$${(Math.round(cents) / 100).toFixed(2).replace(/\.00$/, "")}`;

function humanDate(iso: string): string {
  const d = new Date(String(iso || "") + "T00:00:00");
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

export default function MiniBookingPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const justPaid = new URLSearchParams(useSearch()).get("paid") === "1";

  const [b, setB] = useState<BookingPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAgreement, setShowAgreement] = useState(false);
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    let tries = 0;
    const fetchOnce = () => {
      fetch(`/api/mini-public?action=booking&token=${encodeURIComponent(token || "")}`)
        .then(r => r.json().then(body => ({ ok: r.ok, body })))
        .then(({ ok, body }) => {
          if (!ok) { setError(body.error || "Booking not found"); setLoading(false); return; }
          setB(body);
          setLoading(false);
          // Straight back from Stripe the webhook may not have landed yet —
          // poll briefly so the page doesn't sit on "pending" and worry them.
          if (justPaid && body.status === "pending" && tries < 5) { tries++; setTimeout(fetchOnce, 1500); }
        })
        .catch(() => { setError("Couldn't load this booking"); setLoading(false); });
    };
    fetchOnce();
  }, [token, justPaid]);

  async function payNow() {
    setPaying(true);
    try {
      const res = await fetch("/api/mini-public?action=pay", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const body = await res.json();
      if (res.ok && body.checkoutUrl) window.location.assign(body.checkoutUrl);
      else { setError(body.error || "Couldn't start checkout"); setPaying(false); }
    } catch {
      setError("Couldn't start checkout"); setPaying(false);
    }
  }

  if (loading) return <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-500">Loading…</div>;
  if (error || !b) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-xl shadow-sm border p-8 max-w-md text-center">
          <AlertCircle className="w-8 h-8 text-gray-400 mx-auto mb-3" />
          <p className="text-gray-900 font-semibold mb-1">Booking not found</p>
          <p className="text-sm text-gray-500">{error}</p>
        </div>
      </div>
    );
  }

  // Canonical origin so the code scans the same whether they opened this page
  // from the email, a preview build, or localhost.
  const qrSrc = qrImageUrl(`/msb/${b.bookingToken}`, 420);
  const confirmed = b.status === "booked";

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-md mx-auto space-y-4">
        <div className="bg-white rounded-xl shadow-sm border p-6 text-center">
          <p className="text-sm font-semibold text-gray-500 mb-2">{b.orgName}</p>
          {confirmed ? (
            <>
              <CheckCircle className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
              <h1 className="text-xl font-bold text-gray-900">You're booked</h1>
            </>
          ) : (
            <h1 className="text-xl font-bold text-gray-900">
              {b.status === "pending" ? "Finishing your booking…" : b.status === "cancelled" ? "This booking was cancelled" : "Your booking"}
            </h1>
          )}
          {b.event && (
            <div className="mt-3 space-y-1 text-sm text-gray-600">
              <p className="font-semibold text-gray-900">{b.event.title}</p>
              <p className="flex items-center justify-center gap-1.5"><Calendar className="w-4 h-4" /> {humanDate(b.event.date)} at {formatSlot(b.slotTime)}</p>
              {b.event.locationText && <p className="flex items-center justify-center gap-1.5"><MapPin className="w-4 h-4" /> {b.event.locationText}</p>}
            </div>
          )}
        </div>

        {confirmed && (
          <div className="bg-white rounded-xl shadow-sm border p-6 text-center">
            <p className="font-bold text-gray-900 mb-1">Show this when you arrive</p>
            <p className="text-xs text-gray-500 mb-4">
              Your photographer scans this before your session — it's how your photos find their way back to you.
            </p>
            <img src={qrSrc} alt="Your check-in code" className="w-56 h-56 mx-auto rounded-lg border border-gray-200" />
            <p className="text-[11px] text-gray-400 mt-3">Screenshot this in case you're somewhere without signal.</p>
          </div>
        )}

        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h2 className="font-bold text-gray-900 mb-3">Payment</h2>
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between"><span className="text-gray-500">Session</span><span className="text-gray-900">{money(b.totalCents)}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Paid</span><span className="text-gray-900">{money(b.depositPaidCents)}</span></div>
            {b.balanceCents > 0 && (
              <div className="flex justify-between font-semibold pt-1.5 border-t">
                <span className="text-gray-700">Balance</span><span className="text-gray-900">{money(b.balanceCents)}</span>
              </div>
            )}
          </div>
          {/* Only once the booking is settled as booked: while a payment is
              still landing the page shows "finishing…", and letting them start
              a second checkout there would overwrite the session id the
              first one still needs to be recognised. */}
          {b.balanceCents > 0 && confirmed ? (
            <>
              <p className="mt-3 text-sm text-gray-600">
                {b.paymentStatus === "balance_failed"
                  ? "We couldn't charge your card for the balance — your session is still on, you can settle it here."
                  : b.depositPaidCents > 0
                    ? "The balance is charged to the card you used, the day before your session — or pay it now."
                    : "Your spot is held. You can pay here whenever you're ready."}
              </p>
              <button
                onClick={payNow}
                disabled={paying}
                className="mt-3 w-full py-2.5 bg-emerald-600 text-white font-semibold rounded-lg hover:bg-emerald-700 disabled:opacity-50 text-sm"
              >
                {paying ? "Starting checkout…" : `Pay ${money(b.balanceCents)} now`}
              </button>
            </>
          ) : b.balanceCents > 0 ? (
            <p className="mt-3 text-xs text-gray-500">Finishing up your payment…</p>
          ) : (
            <p className="mt-3 text-xs text-emerald-600 font-medium">Paid in full ✓</p>
          )}
        </div>

        {b.galleryToken && (
          <a href={`/deliver/${b.galleryToken}`}
            className="block bg-white rounded-xl shadow-sm border p-6 text-center hover:border-blue-300 transition-colors">
            <Images className="w-6 h-6 text-blue-500 mx-auto mb-2" />
            <p className="font-bold text-gray-900">Your photos are ready</p>
            <p className="text-xs text-gray-500 mt-1">Tap to view your gallery</p>
          </a>
        )}

        {b.event?.agreementText && (
          <div className="bg-white rounded-xl shadow-sm border p-6">
            <button onClick={() => setShowAgreement(v => !v)} className="text-sm font-semibold text-gray-700 hover:text-gray-900">
              {showAgreement ? "Hide" : "View"} the agreement you signed
            </button>
            {showAgreement && (
              <div className="mt-3 max-h-72 overflow-y-auto rounded border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700 whitespace-pre-wrap">
                {b.event.agreementText}
              </div>
            )}
          </div>
        )}

        <p className="text-center text-xs text-gray-400 pb-6">
          {b.orgName}
          {b.orgBusinessInfo?.phone ? ` · ${b.orgBusinessInfo.phone}` : ""}
          {b.orgBusinessInfo?.email ? ` · ${b.orgBusinessInfo.email}` : ""}
        </p>
      </div>
    </div>
  );
}
