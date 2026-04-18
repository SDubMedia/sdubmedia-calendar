// ============================================================
// Refund Policy — Slate (public, no auth required)
// ============================================================

import { Link } from "wouter";
import { Film, ArrowLeft } from "lucide-react";

export default function RefundPage() {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <div className="border-b border-border bg-card/30">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center gap-3">
          <Link href="/">
            <div className="flex items-center gap-2.5 cursor-pointer hover:opacity-80">
              <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center">
                <Film className="w-4 h-4 text-primary-foreground" />
              </div>
              <span className="text-sm font-semibold" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Slate</span>
            </div>
          </Link>
          <Link href="/" className="ml-auto text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
            <ArrowLeft className="w-3 h-3" /> Back
          </Link>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-10 space-y-6 text-sm leading-relaxed">
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Refund Policy</h1>
          <p className="text-xs text-muted-foreground mt-1">Effective April 18, 2026</p>
        </div>

        <p>
          Slate is a subscription service billed monthly or annually. You can cancel at any time. This policy explains how cancellations and refunds work.
        </p>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Free Trial</h2>
          <p>Every paid subscription includes a 14-day free trial. No card is charged during the trial. If you cancel before the trial ends, you'll never be billed. If you don't cancel, your card is charged on day 15 and on each renewal thereafter.</p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Cancellations</h2>
          <p>To cancel, open the Subscription link in the sidebar → Manage Subscription → Cancel plan. Your access continues through the end of the billing period you already paid for, then the subscription ends. You will not be charged again.</p>
          <p>Cancelling does not delete your data. If you resubscribe later, your projects, clients, and history are exactly where you left them.</p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Refunds</h2>
          <p>Because you always keep access for the full period you paid for, we do not issue refunds for partial months or years. If you cancel mid-cycle, you keep using Slate until the cycle ends.</p>
          <p>We will issue a refund in these specific cases:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>A duplicate charge caused by a technical error on our end</li>
            <li>A charge made after your cancellation was confirmed</li>
            <li>A refund required by applicable consumer-protection law</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Free Tier</h2>
          <p>The free tier (up to 10 projects) is always available. Downgrading to free from a paid plan keeps all your existing data intact; new project creation is blocked once you reach the 10-project cap. Pro-only features (Profit & Loss, Partner Splits, Mileage, Budget, Client Health) are disabled on the free and Basic tiers.</p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Failed Payments</h2>
          <p>If a renewal payment fails, we keep your account active and Stripe retries the charge automatically for about three weeks. During that window, you'll see a banner in the app asking you to update your card. If the retry window ends without a successful payment, your subscription is cancelled; your data remains, but paid features lock until you resubscribe.</p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Annual Plans</h2>
          <p>Annual billing includes a 2-month discount. If you downgrade or cancel before the 12 months are up, you keep access through the end of the paid period (e.g., cancel in month 6, access until month 12). No partial refunds for unused months.</p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Customer Invoice Payments (Stripe Connect)</h2>
          <p>If your customers pay your Slate-generated invoices via Stripe Connect, those funds flow directly to your Stripe account. Refunds for those transactions are between you and your customer — SDub Media has no role in those refunds.</p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">How to Request a Refund</h2>
          <p>Email <a href="mailto:support@sdubmedia.com" className="text-primary hover:underline">support@sdubmedia.com</a> with your account email and the date/amount of the charge. We aim to respond within two business days.</p>
        </section>

        <p className="text-xs text-muted-foreground pt-6 border-t border-border">
          SDub Media LLC · Tennessee, USA
        </p>
      </div>
    </div>
  );
}
