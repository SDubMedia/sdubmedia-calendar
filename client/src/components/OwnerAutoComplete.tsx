// ============================================================
// OwnerAutoComplete — replaces the old 8-step OwnerOnboardingWizard.
// Brand-new owners no longer answer configuration questions on
// signup; we default everything sensibly and let them tweak in
// Settings later. This component just:
//   1. Creates a crew_member row for the owner so they can be
//      assigned to projects (used by the wizard previously).
//   2. Flips has_completed_onboarding=true so the dashboard
//      route opens up.
//   3. Shows a brief loading state during the round-trip.
// After this runs, AppLayout mounts and the BusinessInfoSetupModal
// fires to collect business identity (name, email, logo, etc.).
// ============================================================

import { useEffect, useRef } from "react";
import { useApp } from "@/contexts/AppContext";
import { useAuth } from "@/contexts/AuthContext";

export default function OwnerAutoComplete() {
  const { profile, completeOnboarding } = useAuth();
  const { addCrewMember } = useApp();
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    if (!profile) return;
    ranRef.current = true;

    (async () => {
      // Auto-create the owner as a crew member. The old wizard did
      // this when hasTeam=true; we always do it now since owners
      // need to be assignable to their own projects (and to show up
      // in the mileage report).
      if (profile.name) {
        try {
          await addCrewMember({
            name: profile.name,
            roleRates: [],
            phone: "",
            email: profile.email || "",
            defaultPayRatePerHour: 0,
          });
        } catch {
          // Most likely "already exists" from a retry — ignore.
        }
      }
      try {
        await completeOnboarding();
      } catch {
        // If the profile row is missing (shouldn't happen for a
        // freshly-signed-up owner), completeOnboarding throws a
        // human-readable error that AppLayout will surface
        // elsewhere. Avoid blocking here.
      }
    })();
  }, [profile, completeOnboarding, addCrewMember]);

  return (
    <div className="flex h-screen items-center justify-center bg-background p-4">
      <div className="text-center space-y-3">
        <div className="w-10 h-10 mx-auto rounded-full border-4 border-primary border-t-transparent animate-spin" />
        <p className="text-sm text-muted-foreground">Setting up your account…</p>
      </div>
    </div>
  );
}
