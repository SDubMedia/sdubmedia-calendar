// ============================================================
// GettingStartedCard — owner-only first-run checklist.
// Shows the few things a new owner needs to do before the app is useful, each
// linking to the right page. Steps complete themselves from real data, the card
// auto-hides once they're all done, and the owner can dismiss it early (stored
// in guidance.seenGuides.gettingStarted so it stays gone).
// ============================================================

import { Link } from "wouter";
import { useApp } from "@/contexts/AppContext";
import { useAuth } from "@/contexts/AuthContext";
import { CheckCircle2, Circle, X, Rocket } from "lucide-react";
import { cn } from "@/lib/utils";

interface Step { label: string; done: boolean; href: string; cta: string }

export default function GettingStartedCard() {
  const { data } = useApp();
  const { profile, markGuideSeen } = useAuth();
  const org = data.organization;

  const dismissed = !!profile?.guidance?.seenGuides?.gettingStarted;

  const steps: Step[] = [
    { label: "Add your business info", done: !!profile?.guidance?.businessInfoSetupSeen, href: "/manage?tab=settings", cta: "Set up" },
    { label: "Add your logo", done: !!org?.logoUrl, href: "/manage?tab=settings", cta: "Upload" },
    { label: "Add your services & rates", done: data.services.length > 0, href: "/manage?tab=services", cta: "Add" },
    { label: "Add your first client", done: data.clients.length > 0, href: "/clients", cta: "Add" },
    { label: "Add a crew member", done: data.crewMembers.length > 0, href: "/staff", cta: "Add" },
    { label: "Connect Stripe to get paid", done: !!org?.stripeAccountId || !!profile?.guidance?.stripeOptedOut, href: "/manage?tab=settings", cta: "Connect" },
    { label: "Book your first shoot", done: data.projects.length > 0, href: "/calendar", cta: "Book" },
  ];

  const allDone = steps.every(s => s.done);
  if (dismissed || allDone) return null;

  const doneCount = steps.filter(s => s.done).length;

  return (
    <div style={{ order: -1 }} className="bg-card border border-border rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2 min-w-0">
          <Rocket className="w-4 h-4 text-primary shrink-0" />
          <span className="text-sm font-semibold text-foreground truncate" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            Get set up — {doneCount}/{steps.length} done
          </span>
        </div>
        <button onClick={() => markGuideSeen("gettingStarted")} className="text-muted-foreground hover:text-foreground shrink-0" title="Dismiss">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="divide-y divide-border">
        {steps.map((s, i) => (
          <div key={i} className="flex items-center justify-between gap-3 px-4 py-2.5">
            <div className="flex items-center gap-2 min-w-0">
              {s.done
                ? <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
                : <Circle className="w-4 h-4 text-muted-foreground shrink-0" />}
              <span className={cn("text-sm truncate", s.done ? "text-muted-foreground line-through" : "text-foreground")}>{s.label}</span>
            </div>
            {!s.done && (
              <Link href={s.href} className="text-xs font-semibold text-primary hover:underline shrink-0">{s.cta}</Link>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
