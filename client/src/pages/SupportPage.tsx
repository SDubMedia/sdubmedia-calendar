// ============================================================
// Support — Slate (public, no auth required)
// Linked from App Store listing as the Support URL.
// ============================================================

import { Link } from "wouter";
import { Film, ArrowLeft, Mail, FileText, Shield } from "lucide-react";

export default function SupportPage() {
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

      <div className="max-w-3xl mx-auto px-6 py-10 space-y-8 text-sm leading-relaxed">
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Support</h1>
          <p className="text-muted-foreground mt-1">We answer email Monday – Friday and try to reply within one business day.</p>
        </div>

        <section className="rounded-lg border border-border bg-card p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Mail className="w-4 h-4 text-primary" />
            <h2 className="text-base font-semibold" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Get in touch</h2>
          </div>
          <p>
            Email us at{" "}
            <a href="mailto:support@sdubmedia.com" className="text-primary hover:underline font-medium">
              support@sdubmedia.com
            </a>
            . Please include your account email so we can locate your data quickly.
          </p>
          <p className="text-xs text-muted-foreground">
            For billing or refund questions, mention your subscription tier and the date of purchase. For bug reports, a screenshot speeds things up.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Common questions</h2>

          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold mb-1">How do I cancel my subscription?</h3>
              <p className="text-muted-foreground">
                <strong className="text-foreground">iOS app:</strong> Settings app on your iPhone → tap your Apple ID at the top → Subscriptions → Slate Studio → Cancel.
              </p>
              <p className="text-muted-foreground mt-1">
                <strong className="text-foreground">Web:</strong> Sign in at slate.sdubmedia.com → Subscription → Manage Subscription → Cancel.
              </p>
            </div>

            <div>
              <h3 className="text-sm font-semibold mb-1">Can I get a refund?</h3>
              <p className="text-muted-foreground">
                Subscriptions purchased through the iOS App Store are refunded by Apple — request one at{" "}
                <a href="https://reportaproblem.apple.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">reportaproblem.apple.com</a>
                . For web (Stripe) subscriptions, see our <Link href="/refund" className="text-primary hover:underline">refund policy</Link> or email us.
              </p>
            </div>

            <div>
              <h3 className="text-sm font-semibold mb-1">How do I delete my account?</h3>
              <p className="text-muted-foreground">
                In the app, tap your name → Delete Account. This permanently removes your account and all data. If you're an owner, your entire organization is deleted too.
              </p>
            </div>

            <div>
              <h3 className="text-sm font-semibold mb-1">My subscription on iOS doesn't unlock features on the web (or vice versa). What now?</h3>
              <p className="text-muted-foreground">
                Sign in with the same email on both platforms. If you're still seeing the old plan, sign out and back in, or tap "Restore Purchases" on iOS. Email us if it still isn't right.
              </p>
            </div>

            <div>
              <h3 className="text-sm font-semibold mb-1">I forgot my password.</h3>
              <p className="text-muted-foreground">
                On the sign-in screen tap "Forgot password" and follow the reset email. Or email support and we'll send a reset link.
              </p>
            </div>

            <div>
              <h3 className="text-sm font-semibold mb-1">Where is my data stored?</h3>
              <p className="text-muted-foreground">
                Slate runs on Supabase (PostgreSQL) hosted in the United States. See our <Link href="/privacy" className="text-primary hover:underline">privacy policy</Link> for the full breakdown of what we collect and why.
              </p>
            </div>
          </div>
        </section>

        <section className="flex flex-col sm:flex-row gap-2 pt-4 border-t border-border text-xs">
          <Link href="/privacy" className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground">
            <Shield className="w-3 h-3" /> Privacy Policy
          </Link>
          <Link href="/terms" className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground">
            <FileText className="w-3 h-3" /> Terms of Service
          </Link>
          <Link href="/refund" className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground">
            <FileText className="w-3 h-3" /> Refund Policy
          </Link>
        </section>

        <p className="text-xs text-muted-foreground pt-4">
          Slate is operated by SDub Media LLC.
        </p>
      </div>
    </div>
  );
}
