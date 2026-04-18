// ============================================================
// OverLimitBanner — shown when an org has more projects than its
// current plan allows. Happens after a paid→free downgrade.
// Existing projects stay editable; creation is blocked by ProjectDialog.
// ============================================================

import { useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { useAuth } from "@/contexts/AuthContext";
import { getProjectLimitState } from "@/lib/tier-limits";
import { AlertTriangle } from "lucide-react";
import UpgradeDialog from "@/components/UpgradeDialog";

export default function OverLimitBanner() {
  const { data } = useApp();
  const { profile } = useAuth();
  const [dialogOpen, setDialogOpen] = useState(false);

  if (profile?.role !== "owner") return null;

  const state = getProjectLimitState(data.organization, data.projects.length);
  if (!state.isOverLimit) return null;

  const overBy = state.currentCount - state.limit;

  return (
    <>
      <div className="bg-amber-500/15 border-b border-amber-500/30 px-4 py-2 flex items-center gap-3 text-sm">
        <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
        <span className="flex-1 text-foreground">
          You have {state.currentCount} projects but your current plan allows only {state.limit}.
          Existing projects stay editable; new projects are blocked until you upgrade.
        </span>
        <button
          onClick={() => setDialogOpen(true)}
          className="text-xs font-medium text-amber-300 hover:text-amber-200 whitespace-nowrap"
        >
          Upgrade ({overBy} over)
        </button>
      </div>
      <UpgradeDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />
    </>
  );
}
