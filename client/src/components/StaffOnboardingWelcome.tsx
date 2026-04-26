// ============================================================
// StaffOnboardingWelcome — Simple welcome + address input for staff
// ============================================================

import { useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { useAuth } from "@/contexts/AuthContext";
import type { HomeAddress } from "@/lib/types";
import { CalendarDays, DollarSign, Car, CheckCircle, MapPin } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getAuthToken } from "@/lib/supabase";

export default function StaffOnboardingWelcome() {
  const { data, updateCrewMember, upsertDistance } = useApp();
  const { profile, completeOnboarding } = useAuth();
  const firstName = (profile?.name || "").split(" ")[0] || "there";
  const crewMemberId = profile?.crewMemberId || "";
  const orgName = data.organization?.name || "the team";

  const [address, setAddress] = useState<HomeAddress>({ address: "", city: "", state: "", zip: "" });
  const [completing, setCompleting] = useState(false);

  async function handleComplete() {
    setCompleting(true);
    try {
      // Save home address if provided
      if (address.address && crewMemberId) {
        await updateCrewMember(crewMemberId, { homeAddress: address });

        // Calculate distances
        const origin = `${address.address}, ${address.city}, ${address.state} ${address.zip}`;
        for (const loc of data.locations.filter(l => l.address && l.city)) {
          const dest = `${loc.address}, ${loc.city}, ${loc.state} ${loc.zip}`;
          try {
            const token = await getAuthToken();
            const res = await fetch("/api/calculate-distance", {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
              body: JSON.stringify({ origin, destination: dest }),
            });
            if (res.ok) {
              const { distanceMiles } = await res.json();
              await upsertDistance(crewMemberId, loc.id, distanceMiles);
            }
          } catch { /* skip */ }
        }
      }

      await completeOnboarding();
    } catch {
      setCompleting(false);
    }
  }

  return (
    <div className="flex h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-lg">
        <div className="bg-card border border-border rounded-xl p-8">
          {/* Welcome */}
          <div className="text-center mb-8">
            <img src="/pwa-192x192.png" alt="Slate" className="w-16 h-16 rounded-2xl mx-auto mb-6" />
            <h1 className="text-2xl font-bold text-foreground mb-2" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              Hey {firstName}, welcome to {orgName}!
            </h1>
            <p className="text-muted-foreground text-sm">Let's get you set up in 30 seconds.</p>
          </div>

          {/* Home Address */}
          <div className="space-y-3 mb-8">
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-primary" />
              <Label className="text-sm font-medium text-foreground">Your Home Address</Label>
            </div>
            <p className="text-xs text-muted-foreground">Used to calculate mileage to job sites for your tax records. Only you and the owner can see this.</p>
            <Input
              placeholder="Street address"
              value={address.address}
              onChange={e => setAddress(a => ({ ...a, address: e.target.value }))}
              className="bg-secondary border-border"
              autoFocus
            />
            <div className="grid grid-cols-3 gap-2">
              <Input placeholder="City" value={address.city} onChange={e => setAddress(a => ({ ...a, city: e.target.value }))} className="bg-secondary border-border" />
              <Input placeholder="State" value={address.state} onChange={e => setAddress(a => ({ ...a, state: e.target.value }))} className="bg-secondary border-border" />
              <Input placeholder="ZIP" value={address.zip} onChange={e => setAddress(a => ({ ...a, zip: e.target.value }))} className="bg-secondary border-border" />
            </div>
          </div>

          {/* What you can do */}
          <div className="mb-8">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-3">Here's what you can do</p>
            <div className="grid grid-cols-2 gap-3">
              {[
                { icon: CalendarDays, color: "text-blue-400", bg: "bg-blue-500/20", label: "My Schedule", desc: "See your upcoming shoots" },
                { icon: DollarSign, color: "text-green-400", bg: "bg-green-500/20", label: "My Earnings", desc: "Track hours and pay" },
                { icon: Car, color: "text-cyan-400", bg: "bg-cyan-500/20", label: "Mileage", desc: "Log trips for tax records" },
                { icon: DollarSign, color: "text-amber-400", bg: "bg-amber-500/20", label: "My Invoices", desc: "Generate 1099 invoices" },
              ].map((item, i) => (
                <div key={i} className="flex items-start gap-2 p-3 rounded-lg bg-secondary/30 border border-border/50">
                  <div className={`w-8 h-8 rounded-lg ${item.bg} flex items-center justify-center shrink-0`}>
                    <item.icon className={`w-4 h-4 ${item.color}`} />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-foreground">{item.label}</p>
                    <p className="text-[10px] text-muted-foreground">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Go */}
          <button
            onClick={handleComplete}
            disabled={completing}
            className="w-full px-6 py-3 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors font-medium flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <CheckCircle className="w-4 h-4" />
            {completing ? "Setting up..." : "Get Started"}
          </button>
          <p className="text-[10px] text-muted-foreground text-center mt-3">You can update your address anytime from your dashboard.</p>
        </div>
      </div>
    </div>
  );
}
