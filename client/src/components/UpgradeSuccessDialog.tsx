// ============================================================
// UpgradeSuccessDialog — shown once when Stripe Checkout redirects
// back to /?upgraded=basic|pro. Reads the param, celebrates, cleans
// the URL so refreshing the page doesn't re-open it.
// ============================================================

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Sparkles, Check } from "lucide-react";
import { trackEvent } from "@/lib/analytics";

const COPY: Record<string, { title: string; blurb: string; perks: string[] }> = {
  basic: {
    title: "Welcome to Slate Basic",
    blurb: "You're all set. Unlimited projects, clients, and invoices — no more limits.",
    perks: [
      "Unlimited projects",
      "Unlimited clients, staff, and series",
      "Full calendar, invoicing, and reports",
    ],
  },
  pro: {
    title: "Welcome to Slate Pro",
    blurb: "Financial tools are unlocked — P&L, Mileage, Budget, and Client Health are live in the sidebar.",
    perks: [
      "Profit & Loss reports with partner splits",
      "Mileage tracking",
      "Marketing Budget tracking",
      "Client Health analytics",
      "Priority support",
    ],
  },
};

export default function UpgradeSuccessDialog() {
  const [tier, setTier] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const upgraded = params.get("upgraded");
    if (upgraded && COPY[upgraded]) {
      setTier(upgraded);
      trackEvent("checkout_completed", { tier: upgraded });
      // Clean the URL so a refresh doesn't re-trigger the dialog.
      params.delete("upgraded");
      const clean = window.location.pathname + (params.toString() ? `?${params}` : "");
      window.history.replaceState({}, "", clean);
    }
  }, []);

  if (!tier) return null;
  const copy = COPY[tier];

  return (
    <Dialog open={true} onOpenChange={(o) => !o && setTier(null)}>
      <DialogContent className="max-w-md bg-card border-border text-foreground">
        <DialogHeader>
          <div className="w-12 h-12 rounded-full bg-amber-500/15 flex items-center justify-center mx-auto mb-2">
            <Sparkles className="w-6 h-6 text-amber-400" />
          </div>
          <DialogTitle
            className="text-center text-xl"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}
          >
            {copy.title}
          </DialogTitle>
          <p className="text-sm text-muted-foreground text-center pt-1">{copy.blurb}</p>
        </DialogHeader>

        <ul className="space-y-2 py-2">
          {copy.perks.map((perk) => (
            <li key={perk} className="text-sm flex items-start gap-2">
              <Check className="w-4 h-4 text-primary shrink-0 mt-0.5" />
              <span>{perk}</span>
            </li>
          ))}
        </ul>

        <Button onClick={() => setTier(null)} className="w-full bg-amber-500 text-black hover:bg-amber-400">
          Let's go
        </Button>
      </DialogContent>
    </Dialog>
  );
}
