// ============================================================
// Terms of Service — Slate (public, no auth required)
// ============================================================

import { Link } from "wouter";
import { Film, ArrowLeft } from "lucide-react";

export default function TermsPage() {
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
          <h1 className="text-2xl font-bold" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Terms of Service</h1>
          <p className="text-xs text-muted-foreground mt-1">Effective April 18, 2026</p>
        </div>

        <p>
          These Terms of Service ("Terms") govern your use of Slate (the "Service"), operated by SDub Media LLC ("we", "us", "our"). By creating an account or using the Service, you agree to these Terms.
        </p>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">1. The Service</h2>
          <p>Slate is a production management platform for creative teams — calendar, client management, invoicing, crew scheduling, contracts, proposals, and financial reporting. Features available to you depend on your subscription tier.</p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">2. Your Account</h2>
          <p>You must provide accurate information when creating an account and keep your password confidential. You are responsible for all activity under your account. You must be at least 18 years old to use Slate.</p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">3. Subscription & Billing</h2>
          <p>Paid plans are billed monthly or annually in advance via Stripe. Prices are shown on the in-app upgrade dialog. Annual billing includes a 2-month discount versus monthly. New paid subscriptions start with a 14-day free trial; you will not be charged until the trial ends.</p>
          <p>We may change prices with 30 days' notice; existing paid subscriptions retain their current price until the next renewal after the change.</p>
          <p>The free tier is limited to 10 projects per organization. Paid tiers remove that cap and unlock additional features as described at the time of purchase.</p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">4. Cancellations & Refunds</h2>
          <p>You can cancel your subscription at any time through the Subscription link in the sidebar. Cancellation takes effect at the end of your current billing period; you keep access until then. We do not issue refunds for partial months. See our <Link href="/refund" className="text-primary hover:underline">Refund Policy</Link> for full details.</p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">5. Your Data</h2>
          <p>You own the data you put into Slate — projects, client records, invoices, contracts, proposals, and all related business information. We store it on your behalf and do not sell it. You can export your data at any time via CSV export. On account deletion, we remove your data within 30 days unless longer retention is legally required.</p>
          <p>See our <Link href="/privacy" className="text-primary hover:underline">Privacy Policy</Link> for how we handle personal information.</p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">6. Acceptable Use</h2>
          <p>Don't use Slate to: (a) violate any law or third-party right, (b) upload malicious code, (c) attempt to breach security or access other accounts, (d) resell the Service, or (e) scrape or reverse-engineer the platform. We may suspend or terminate accounts that violate these rules.</p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">7. Customer Payments via Stripe Connect</h2>
          <p>If you enable Stripe Connect to accept payments on your Slate-generated invoices, funds flow directly to your Stripe account. SDub Media never touches your customers' payments. Stripe's terms and fees apply separately.</p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">8. AI Features</h2>
          <p>AI-powered features (receipt scanning, content brainstorming) are available on the Pro tier. When you use an AI feature, the content you submit is sent to our AI provider for processing. We do not use your content to train AI models. AI outputs may contain errors — always verify before relying on them for financial or legal decisions.</p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">9. Our Intellectual Property</h2>
          <p>The Slate software, design, and brand are owned by SDub Media LLC. These Terms grant you a limited, non-exclusive, non-transferable license to use the Service for your business. You may not copy, modify, or distribute the Slate software.</p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">10. Service Availability</h2>
          <p>We aim for high availability but do not guarantee uninterrupted service. We may perform maintenance, updates, or temporarily suspend the Service for technical reasons. We are not liable for losses caused by downtime.</p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">11. Limitation of Liability</h2>
          <p>To the maximum extent permitted by law, SDub Media LLC is not liable for indirect, incidental, special, or consequential damages, or for lost profits, revenue, data, or goodwill. Our total liability in any 12-month period is limited to the amount you paid us in that period.</p>
          <p>The Service is provided "as is" without warranties of any kind, express or implied.</p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">12. Termination</h2>
          <p>You may close your account at any time. We may suspend or terminate your account for material violations of these Terms, non-payment, or if required by law. On termination, your right to use the Service ends immediately.</p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">13. Governing Law</h2>
          <p>These Terms are governed by the laws of the State of Tennessee, without regard to conflict of law rules. Any dispute will be resolved in the state or federal courts located in Davidson County, Tennessee.</p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">14. Changes to these Terms</h2>
          <p>We may update these Terms occasionally. We'll notify you of material changes by email or through the app at least 30 days before they take effect. Continued use of the Service after changes take effect means you accept the new Terms.</p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">15. Contact</h2>
          <p>Questions? Email <a href="mailto:support@sdubmedia.com" className="text-primary hover:underline">support@sdubmedia.com</a>.</p>
        </section>

        <p className="text-xs text-muted-foreground pt-6 border-t border-border">
          SDub Media LLC · Tennessee, USA
        </p>
      </div>
    </div>
  );
}
