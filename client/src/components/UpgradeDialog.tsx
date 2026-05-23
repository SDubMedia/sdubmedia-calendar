// ============================================================
// UpgradeDialog — shown when a free-plan org hits the project limit
// or clicks "Upgrade" from the Subscription page.
//
// - Monthly/Annual toggle (annual = 2 months free)
// - Tier-aware buttons: Manage Subscription (current tier),
//   Upgrade to X / Downgrade to X (other paid tiers, opens portal),
//   Start Free Trial (when on Free)
// ============================================================

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Check, Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useApp } from "@/contexts/AppContext";
import { getEffectiveTier, type SlateTier } from "@/lib/tier-limits";
import { trackEvent } from "@/lib/analytics";

interface Props {
  open: boolean;
  onClose: () => void;
}

const PLANS: { id: "basic" | "pro"; name: string; monthly: number; annual: number; tagline: string; features: string[]; accent: string; button: string; highlight?: boolean }[] = [
  {
    id: "basic",
    name: "Basic",
    monthly: 9.99,
    annual: 99,
    tagline: "Unlimited projects, core features",
    features: [
      "Unlimited projects",
      "Clients, crew, invoices",
      "Calendar + scheduling",
      "Monthly billing reports",
    ],
    accent: "border-primary/50",
    button: "bg-primary text-primary-foreground hover:bg-primary/90",
  },
  {
    id: "pro",
    name: "Pro",
    monthly: 19.99,
    annual: 199,
    tagline: "Everything in Basic, plus financial tools",
    features: [
      "Profit & Loss reports",
      "Partner profit splits",
      "Mileage tracking",
      "Marketing Budget",
      "Client Health analytics",
      "Priority support",
    ],
    accent: "border-amber-400/60",
    button: "bg-amber-500 text-black hover:bg-amber-400",
    highlight: true,
  },
];

const TIER_ORDER: Record<SlateTier, number> = { free: 0, basic: 1, pro: 2 };

export default function UpgradeDialog({ open, onClose }: Props) {
  const { data } = useApp();
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [interval, setInterval] = useState<"monthly" | "annual">("monthly");
  const currentTier = getEffectiveTier(data.organization);
  const orgId = data.organization?.id || "";

  useEffect(() => {
    if (open) trackEvent("upgrade_dialog_viewed");
  }, [open]);

  async function postSubscribe(action: "create-checkout" | "portal", body: Record<string, unknown>) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { toast.error("Please sign in again"); return null; }
    const res = await fetch(`/api/stripe-subscribe?action=${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok || !json.url) {
      throw new Error(json.error || "Request failed");
    }
    return json.url as string;
  }

  async function handleSubscribe(planId: "basic" | "pro") {
    setLoadingId(planId);
    trackEvent("checkout_started", { tier: planId, interval });
    try {
      const url = await postSubscribe("create-checkout", {
        plan: planId,
        orgId,
        interval,
        email: data.organization?.businessInfo?.email || undefined,
        successUrl: `${window.location.origin}/?upgraded=${planId}`,
        cancelUrl: `${window.location.origin}/`,
      });
      if (url) window.location.assign(url);
    } catch (err: any) {
      toast.error(err.message || "Could not start checkout");
      setLoadingId(null);
    }
  }

  async function handleManage() {
    setLoadingId("manage");
    trackEvent("portal_opened");
    try {
      const url = await postSubscribe("portal", {
        orgId,
        returnUrl: `${window.location.origin}/`,
      });
      if (url) window.location.assign(url);
    } catch (err: any) {
      toast.error(err.message || "Could not open billing portal");
      setLoadingId(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl bg-card border-border text-foreground">
        <DialogHeader>
          <DialogTitle
            className="flex items-center gap-2 text-xl"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}
          >
            <Sparkles className="w-5 h-5 text-amber-400" />
            {currentTier === "free" ? "Choose your plan" : "Change your plan"}
          </DialogTitle>
          <p className="text-sm text-muted-foreground pt-1">
            {currentTier === "free"
              ? "Cancel any time — existing data stays yours."
              : `You're currently on the ${currentTier === "pro" ? "Pro" : "Basic"} plan. Switch at any time.`}
          </p>
        </DialogHeader>

        {/* Monthly / Annual toggle */}
        <div className="flex justify-center pt-1">
          <div className="inline-flex bg-secondary rounded-md p-1">
            <button
              onClick={() => setInterval("monthly")}
              className={`px-3 py-1 text-xs rounded ${interval === "monthly" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              Monthly
            </button>
            <button
              onClick={() => setInterval("annual")}
              className={`px-3 py-1 text-xs rounded flex items-center gap-1 ${interval === "annual" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              Annual
              <span className={`text-[9px] px-1 py-0.5 rounded ${interval === "annual" ? "bg-primary-foreground/20 text-primary-foreground" : "bg-amber-500/20 text-amber-300"}`}>
                2 mo free
              </span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-3">
          {PLANS.map((plan) => {
            const priceNum = interval === "annual" ? plan.annual : plan.monthly;
            const priceStr = `$${priceNum.toFixed(priceNum % 1 === 0 ? 0 : 2)}`;
            const period = interval === "annual" ? "/yr" : "/mo";

            const thisTierRank = TIER_ORDER[plan.id];
            const currentRank = TIER_ORDER[currentTier];
            const isCurrent = currentTier === plan.id;
            const isUpgrade = thisTierRank > currentRank && currentTier !== "free";
            const isDowngrade = thisTierRank < currentRank;

            let buttonLabel = `Upgrade to ${plan.name}`;
            let onClick: () => void = () => handleSubscribe(plan.id);
            let loadingKey: string = plan.id;
            if (isCurrent) {
              buttonLabel = "Manage Subscription";
              onClick = handleManage;
              loadingKey = "manage";
            } else if (isUpgrade) {
              buttonLabel = `Upgrade to ${plan.name}`;
              onClick = handleManage;
              loadingKey = "manage";
            } else if (isDowngrade) {
              buttonLabel = `Downgrade to ${plan.name}`;
              onClick = handleManage;
              loadingKey = "manage";
            } else if (currentTier === "free") {
              buttonLabel = `Start Free Trial`;
            }

            return (
              <div
                key={plan.id}
                className={`relative rounded-lg border ${plan.accent} bg-secondary/40 p-4 flex flex-col`}
              >
                {plan.highlight && (
                  <span className="absolute -top-2 right-3 bg-amber-500 text-black text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded">
                    Most popular
                  </span>
                )}
                <div className="mb-3">
                  <div className="text-base font-semibold">{plan.name}</div>
                  <div className="flex items-baseline gap-0.5 mt-1">
                    <span className="text-2xl font-bold">{priceStr}</span>
                    <span className="text-xs text-muted-foreground">{period}</span>
                  </div>
                  {interval === "annual" && (
                    <p className="text-[10px] text-amber-400 mt-0.5">
                      Save ${((plan.monthly * 12) - plan.annual).toFixed(0)} vs monthly
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">{plan.tagline}</p>
                </div>
                <ul className="space-y-1.5 mb-4 flex-1">
                  {plan.features.map((f) => (
                    <li key={f} className="text-xs flex items-start gap-1.5">
                      <Check className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <Button
                  onClick={onClick}
                  disabled={loadingId !== null}
                  className={`w-full ${plan.button}`}
                >
                  {loadingId === loadingKey ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Redirecting…</>
                  ) : buttonLabel}
                </Button>
              </div>
            );
          })}
        </div>

        <div className="text-center">
          <button
            onClick={onClose}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Maybe later
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
