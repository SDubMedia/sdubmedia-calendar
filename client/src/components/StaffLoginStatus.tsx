// ============================================================
// StaffLoginStatus — a small at-a-glance icon showing whether a crew member
// has an app login, so the owner sees it in any staff/crew list without
// clicking into a profile. Three states: no login / invited (hasn't signed in)
// / active login.
// ============================================================

import { CircleDashed, Clock, CheckCircle2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import type { UserProfile } from "@/lib/types";

/** The staff login (user_profile) for a crew member, if one exists. */
export function staffLoginFor(profiles: UserProfile[], crewMemberId: string): UserProfile | undefined {
  return profiles.find(p => p.role === "staff" && p.crewMemberId === crewMemberId);
}

export default function StaffLoginStatus({ crewMemberId, showLabel }: { crewMemberId: string; showLabel?: boolean }) {
  const { allProfiles } = useAuth();
  const p = staffLoginFor(allProfiles, crewMemberId);
  let Icon = CircleDashed, color = "text-muted-foreground/40", label = "No login yet";
  if (p && p.mustChangePassword) { Icon = Clock; color = "text-amber-500"; label = "Invited — hasn't signed in"; }
  else if (p) { Icon = CheckCircle2; color = "text-emerald-500"; label = "Has login"; }
  return (
    <span title={label} className="inline-flex items-center gap-1">
      <Icon className={`w-3.5 h-3.5 shrink-0 ${color}`} />
      {showLabel && <span className={`text-[11px] ${color}`}>{label}</span>}
    </span>
  );
}
