// ============================================================
// Privacy Policy — Slate (public, no auth required)
// ============================================================

import { Link } from "wouter";
import { Film, ArrowLeft } from "lucide-react";

export default function PrivacyPage() {
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
          <h1 className="text-2xl font-bold" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Privacy Policy</h1>
          <p className="text-xs text-muted-foreground mt-1">Effective April 18, 2026</p>
        </div>

        <p>
          SDub Media LLC ("we", "us", "our") runs Slate. This Privacy Policy explains what we collect, why, and what control you have over your information.
        </p>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">What we collect</h2>
          <ul className="list-disc pl-6 space-y-1">
            <li><strong>Account info:</strong> email, name, organization name, role.</li>
            <li><strong>Business data you enter:</strong> projects, clients, crew, invoices, contracts, proposals, schedules, financial data — the normal stuff for running a production company. You own this data.</li>
            <li><strong>Billing data:</strong> if you subscribe to a paid plan, Stripe collects your card details directly. We never see or store your card number. We receive and store your Stripe customer ID and subscription status.</li>
            <li><strong>Stripe Connect data:</strong> if you enable Stripe Connect to receive payments from your customers, we store your Stripe account ID. Your customers' payment details never touch our servers.</li>
            <li><strong>Usage logs:</strong> standard server logs (IP, browser, timestamps) kept for security and debugging.</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">How we use it</h2>
          <ul className="list-disc pl-6 space-y-1">
            <li>To run the Service — show you your projects, send you notifications, process payments.</li>
            <li>To support you when you contact us.</li>
            <li>To improve the product — aggregated, non-identifying usage signals.</li>
            <li>To comply with legal obligations.</li>
          </ul>
          <p>We do not sell your data. We do not use your business data to train AI models.</p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Third-party services we use</h2>
          <p>We rely on a short list of vendors who process data on our behalf under contract:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li><strong>Supabase</strong> — authentication and database hosting.</li>
            <li><strong>Vercel</strong> — application hosting.</li>
            <li><strong>Stripe</strong> — subscription billing and customer invoice payments (PCI-compliant).</li>
            <li><strong>Anthropic</strong> — AI receipt parsing and content-series brainstorming (Pro tier only; data is submitted only when you initiate an AI action).</li>
            <li><strong>Resend</strong> — transactional email delivery.</li>
          </ul>
          <p>Each vendor is bound by their own privacy policy and data-processing commitments.</p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Data retention</h2>
          <p>We keep your account data for as long as your account is active. When you delete your account, we delete your data within 30 days unless we're legally required to keep it longer (for example, tax records). Backups may persist for up to 90 days before they're overwritten.</p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Your rights</h2>
          <p>You can:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Access or export your data at any time via CSV export inside the app.</li>
            <li>Request deletion of your account — email <a href="mailto:support@sdubmedia.com" className="text-primary hover:underline">support@sdubmedia.com</a> with the account email.</li>
            <li>Request a copy of what we have on you.</li>
            <li>Correct inaccurate information directly in the app or by contacting support.</li>
          </ul>
          <p>If you're in a jurisdiction with additional privacy rights (GDPR, CCPA), those apply to you too — email us and we'll honor them.</p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Cookies</h2>
          <p>We use a small number of cookies for authentication (keeping you signed in) and basic app functionality. We don't use advertising cookies or cross-site trackers.</p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Children</h2>
          <p>Slate is for business use. We don't knowingly collect data from anyone under 13. If we learn we have, we'll delete it.</p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Security</h2>
          <p>Data is encrypted in transit (HTTPS) and at rest (via Supabase's managed Postgres). Access to production data is limited to authorized personnel. Row-level security policies prevent cross-organization data access. We audit these policies regularly.</p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Changes</h2>
          <p>If we materially change this policy, we'll notify you by email or in-app at least 30 days before it takes effect.</p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Contact</h2>
          <p>Questions or requests? <a href="mailto:support@sdubmedia.com" className="text-primary hover:underline">support@sdubmedia.com</a></p>
        </section>

        <p className="text-xs text-muted-foreground pt-6 border-t border-border">
          SDub Media LLC · Tennessee, USA
        </p>
      </div>
    </div>
  );
}
