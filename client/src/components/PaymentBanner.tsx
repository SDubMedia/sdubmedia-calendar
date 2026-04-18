// ============================================================
// PaymentBanner — shown when Stripe reports a failed charge.
// User still has access during the retry window; this is the
// visible nudge to fix their card before the subscription cancels.
// ============================================================

import { useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { AlertCircle, Loader2 } from "lucide-react";

export default function PaymentBanner() {
  const { data } = useApp();
  const { profile } = useAuth();
  const [loading, setLoading] = useState(false);

  if (profile?.role !== "owner") return null;
  if (data.organization?.billingStatus !== "past_due") return null;

  const openPortal = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { toast.error("Please sign in again"); return; }
      const res = await fetch("/api/stripe-subscribe?action=portal", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          orgId: data.organization?.id,
          returnUrl: `${window.location.origin}/`,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.url) throw new Error(json.error || "Failed to open billing portal");
      window.location.href = json.url;
    } catch (err: any) {
      toast.error(err.message || "Could not open billing portal");
      setLoading(false);
    }
  };

  return (
    <div className="bg-red-500/15 border-b border-red-500/30 px-4 py-2 flex items-center gap-3 text-sm">
      <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
      <span className="flex-1 text-foreground">
        Your last payment failed. You still have access while we retry, but please update your card to avoid interruption.
      </span>
      <button
        onClick={openPortal}
        disabled={loading}
        className="text-xs font-medium text-red-300 hover:text-red-200 whitespace-nowrap flex items-center gap-1.5 disabled:opacity-50"
      >
        {loading && <Loader2 className="w-3 h-3 animate-spin" />}
        Update card
      </button>
    </div>
  );
}
