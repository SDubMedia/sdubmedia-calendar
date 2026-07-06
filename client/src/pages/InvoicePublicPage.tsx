// ============================================================
// InvoicePublicPage — public, no-login client-facing invoice view.
// Mounted outside AuthProvider in App.tsx so anyone with the
// view_token can see it. Token comes from the URL path: /invoice/:token
//
// Renders only the payment buttons the owner picked when sending:
//   - "stripe" → opens Stripe Checkout (auto-confirms via webhook)
//   - "venmo"  → external link to venmo.com/<user>?txn=pay&amount=…
//                (owner manually marks paid — Venmo personal accounts
//                 don't notify Slate)
// ============================================================

import { useEffect, useState, useCallback } from "react";
import { useParams } from "wouter";
import { Loader2, CheckCircle2, AlertCircle, Printer } from "lucide-react";

interface PublicLineItem {
  description?: string;
  amount?: number;
  quantity?: number;
  unitPrice?: number;
  date?: string;
}
interface PublicInvoice {
  id: string;
  invoiceNumber: string;
  total: number;
  subtotal: number;
  taxAmount: number;
  status: string;
  issueDate: string;
  dueDate: string;
  paidDate: string | null;
  lineItems: PublicLineItem[];
  clientInfo: { company?: string; contactName?: string };
  notes: string;
  paymentMethods: ("stripe" | "venmo")[];
}
interface PublicOrg {
  id: string;
  name: string;
  logoUrl: string;
  venmoUsername: string;
  stripeConnected: boolean;
  contactEmail: string;
  contactPhone: string;
  website: string;
}
interface PublicView {
  invoice: PublicInvoice;
  org: PublicOrg;
}

function formatMoney(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

export default function InvoicePublicPage() {
  const params = useParams<{ token: string }>();
  const token = params.token || "";
  const [data, setData] = useState<PublicView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);

  // ?paid=1 in the URL after a Stripe success_url redirect. The webhook
  // is authoritative — we just show a confirmation banner here.
  const [showPaidBanner, setShowPaidBanner] = useState(() => {
    if (typeof window === "undefined") return false;
    return new URLSearchParams(window.location.search).get("paid") === "1";
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/invoice-public", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Couldn't load invoice");
      setData(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load invoice");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  // After Stripe redirects back with ?paid=1, the webhook stamps paid_date
  // asynchronously. Poll for up to ~20s so the client doesn't see "still
  // unpaid" copy on a fresh load. Stops the moment status flips to "paid".
  useEffect(() => {
    if (!showPaidBanner) return;
    if (data?.invoice.status === "paid" || data?.invoice.paidDate) return;
    let cancelled = false;
    let attempts = 0;
    const tick = async () => {
      if (cancelled) return;
      attempts++;
      try {
        const res = await fetch("/api/invoice-public", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const body = await res.json();
        if (!cancelled && res.ok) setData(body);
        if (body?.invoice?.status === "paid" || body?.invoice?.paidDate) return; // stop polling
      } catch {
        // ignore — try again
      }
      if (attempts < 10 && !cancelled) setTimeout(tick, 2000);
    };
    const id = setTimeout(tick, 1500);
    return () => { cancelled = true; clearTimeout(id); };
  }, [showPaidBanner, data?.invoice.status, data?.invoice.paidDate, token]);

  const handlePayWithStripe = async () => {
    if (!data) return;
    setPaying(true);
    try {
      const res = await fetch("/api/stripe-payment?action=checkout-by-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          successUrl: `${window.location.origin}/invoice/${token}?paid=1`,
          cancelUrl: `${window.location.origin}/invoice/${token}`,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Couldn't start checkout");
      window.location.assign(body.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't start checkout");
      setPaying(false);
    }
  };

  const buildVenmoUrl = (username: string, amount: number, invoiceNumber: string): string => {
    const note = `Invoice ${invoiceNumber}`;
    return `https://venmo.com/${encodeURIComponent(username)}?txn=pay&amount=${amount.toFixed(2)}&note=${encodeURIComponent(note)}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-600">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="max-w-md w-full bg-white rounded-xl shadow-sm border border-slate-200 p-8 text-center">
          <AlertCircle className="w-10 h-10 text-amber-500 mx-auto mb-3" />
          <h1 className="text-lg font-semibold text-slate-900 mb-1">Invoice unavailable</h1>
          <p className="text-sm text-slate-600">{error || "This invoice link isn't valid or has been removed."}</p>
        </div>
      </div>
    );
  }

  const { invoice, org } = data;
  const isPaid = invoice.status === "paid" || invoice.paidDate;
  const showStripe = invoice.paymentMethods.includes("stripe") && org.stripeConnected;
  const showVenmo = invoice.paymentMethods.includes("venmo") && !!org.venmoUsername;
  const noPaymentMethods = !showStripe && !showVenmo;

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Print / Save as PDF — for the recipient to keep, print, or forward
            to their office (e.g. payroll). Hidden from the printout itself. */}
        <div className="flex justify-end mb-4 print:hidden">
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900 border border-slate-300 hover:border-slate-400 rounded-lg px-3 py-1.5 bg-white transition-colors"
          >
            <Printer className="w-4 h-4" /> Print / Save as PDF
          </button>
        </div>

        {/* Header */}
        <div className="text-center mb-8 pb-6 border-b border-slate-200">
          {org.logoUrl ? (
            <img
              src={org.logoUrl}
              alt={org.name}
              className="mx-auto mb-3 max-h-16 w-auto object-contain"
            />
          ) : null}
          <h1 className="text-2xl font-semibold text-slate-900" style={{ fontFamily: "'Georgia', serif" }}>
            {org.name || "Invoice"}
          </h1>
          {invoice.clientInfo.contactName && (
            <p className="text-sm text-slate-600 mt-2">For {invoice.clientInfo.contactName}{invoice.clientInfo.company ? ` · ${invoice.clientInfo.company}` : ""}</p>
          )}
        </div>

        {/* Paid banner — shown after Stripe success_url redirect or if invoice is already paid */}
        {(showPaidBanner || isPaid) && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 mb-6 flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-emerald-900">
                {isPaid ? "Payment received" : "Thanks for your payment!"}
              </p>
              <p className="text-xs text-emerald-700 mt-0.5">
                {isPaid
                  ? `Marked paid on ${invoice.paidDate ? formatDate(invoice.paidDate) : "file"}.`
                  : "Your payment is processing — we'll send a confirmation shortly."}
              </p>
            </div>
            {showPaidBanner && !isPaid && (
              <button
                onClick={() => { setShowPaidBanner(false); load(); }}
                className="ml-auto text-xs text-emerald-700 hover:text-emerald-900 underline"
              >
                Refresh
              </button>
            )}
          </div>
        )}

        {/* Invoice card */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wider text-slate-500">Invoice</p>
              <p className="text-lg font-semibold text-slate-900 font-mono">{invoice.invoiceNumber}</p>
            </div>
            <div className="text-right">
              <p className="text-xs uppercase tracking-wider text-slate-500">Amount Due</p>
              <p className="text-2xl font-bold text-slate-900">{formatMoney(invoice.total)}</p>
            </div>
          </div>

          {/* Dates */}
          <div className="px-6 py-3 bg-slate-50/50 border-b border-slate-100 grid grid-cols-2 gap-4 text-xs">
            <div>
              <p className="uppercase tracking-wider text-slate-500 mb-0.5">Issued</p>
              <p className="text-slate-700">{formatDate(invoice.issueDate)}</p>
            </div>
            <div>
              <p className="uppercase tracking-wider text-slate-500 mb-0.5">Due</p>
              <p className="text-slate-700">{formatDate(invoice.dueDate) || "Due on receipt"}</p>
            </div>
          </div>

          {/* Line items */}
          <div className="px-6 py-4 space-y-3">
            {invoice.lineItems.map((li, i) => {
              const qty = Number(li.quantity ?? 0);
              const unit = Number(li.unitPrice ?? 0);
              // Show qty × unit only when meaningful: hourly billing has
              // qty 2.5 × $100. Per-project flat rate is "qty 1" and the
              // detail line just clutters — skip.
              const showRate = qty > 0 && unit !== 0 && Math.abs(qty - 1) > 0.0001;
              return (
                <div key={i} className="flex justify-between gap-4 text-sm">
                  <div className="min-w-0">
                    <p className="text-slate-700">{li.description || "Service"}</p>
                    {(showRate || li.date) && (
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {li.date ? formatDate(li.date) : ""}
                        {li.date && showRate ? " · " : ""}
                        {showRate ? `${qty.toLocaleString()} × ${formatMoney(unit)}` : ""}
                      </p>
                    )}
                  </div>
                  <span className="text-slate-900 font-mono whitespace-nowrap shrink-0">{formatMoney(Number(li.amount ?? 0))}</span>
                </div>
              );
            })}
          </div>

          {/* Totals */}
          <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/30 space-y-1.5 text-sm">
            <div className="flex justify-between text-slate-600">
              <span>Subtotal</span>
              <span className="font-mono">{formatMoney(invoice.subtotal)}</span>
            </div>
            {invoice.taxAmount > 0 && (
              <div className="flex justify-between text-slate-600">
                <span>Tax</span>
                <span className="font-mono">{formatMoney(invoice.taxAmount)}</span>
              </div>
            )}
            <div className="flex justify-between text-base font-semibold text-slate-900 pt-1.5 border-t border-slate-200">
              <span>Total</span>
              <span className="font-mono">{formatMoney(invoice.total)}</span>
            </div>
          </div>

          {invoice.notes && (
            <div className="px-6 py-4 border-t border-slate-100 text-sm text-slate-600">
              <p className="text-xs uppercase tracking-wider text-slate-500 mb-1">Notes</p>
              <p className="whitespace-pre-wrap">{invoice.notes}</p>
            </div>
          )}
        </div>

        {/* Payment buttons */}
        {!isPaid && (
          <div className="mt-6 space-y-3 print:hidden">
            {showStripe && (
              <div>
                <button
                  onClick={handlePayWithStripe}
                  disabled={paying}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold py-3 px-4 rounded-lg transition-colors"
                >
                  {paying ? "Opening Stripe…" : `Pay ${formatMoney(invoice.total)}`}
                </button>
                <p className="mt-1.5 text-center text-xs text-muted-foreground">Card, Apple Pay &amp; Google Pay accepted</p>
              </div>
            )}
            {showVenmo && (
              <a
                href={buildVenmoUrl(org.venmoUsername, invoice.total, invoice.invoiceNumber)}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full text-center bg-[#3D95CE] hover:bg-[#2C7AB0] text-white font-semibold py-3 px-4 rounded-lg transition-colors"
              >
                Pay {formatMoney(invoice.total)} with Venmo
              </a>
            )}
            {showVenmo && (
              <p className="text-[11px] text-slate-500 text-center">
                Venmo payments are confirmed manually — once your payment lands, we'll mark this invoice paid on our end.
              </p>
            )}
            {noPaymentMethods && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
                Online payment isn't set up for this invoice. Please contact{" "}
                {org.contactEmail ? (
                  <a href={`mailto:${org.contactEmail}`} className="underline">{org.contactEmail}</a>
                ) : org.name ? org.name : "the sender"}{" "}
                to arrange payment.
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="mt-8 text-center text-xs text-slate-500 space-y-1">
          {(org.contactEmail || org.contactPhone) && (
            <p>
              Questions?
              {org.contactEmail && <> Email <a href={`mailto:${org.contactEmail}`} className="underline">{org.contactEmail}</a></>}
              {org.contactPhone && <> · Call <a href={`tel:${org.contactPhone.replace(/[^0-9]/g, "")}`} className="underline">{org.contactPhone}</a></>}
            </p>
          )}
          <p>{org.website || ""}</p>
        </div>
      </div>
    </div>
  );
}
