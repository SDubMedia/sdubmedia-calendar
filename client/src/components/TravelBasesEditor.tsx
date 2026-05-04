// ============================================================
// HomeBasesEditor (file kept as TravelBasesEditor for git history) —
// manages a crew member's list of home/travel bases. The first
// base is typically your "Home" (where you live and where your
// car is most days). Additional bases are "Travel Bases" — places
// you fly to and drive from for some shoots.
//
// First click on the section title fires the educational
// HomeBaseInfoModal. After that, an (i) icon next to the title
// re-opens it on demand.
//
// Exactly one base can be primary. Marking a different one
// primary unsets the previous primary.
// ============================================================

import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2, Star, Info, MapPinned, Home, Plane } from "lucide-react";
import { nanoid } from "nanoid";
import { cn } from "@/lib/utils";
import type { TravelBase } from "@/lib/types";
import TravelBaseInfoModal from "./TravelBaseInfoModal";

interface Props {
  bases: TravelBase[];
  onChange: (bases: TravelBase[]) => void;
  // When true, skip the collapsible header — render the editor
  // fully expanded. Used inside Settings where the editor already
  // sits in its own Card with a title.
  embedded?: boolean;
}

function emptyBase(label: string = "", isPrimary: boolean = false, type: "home" | "travel" = "home"): TravelBase {
  return { id: nanoid(8), type, label, address: "", city: "", state: "", zip: "", isPrimary };
}

export default function TravelBasesEditor({ bases, onChange, embedded = false }: Props) {
  const { profile, markSeenTravelBaseInfo } = useAuth();
  const seenInfo = !!profile?.guidance?.seenTravelBaseInfo;
  const [infoOpen, setInfoOpen] = useState(false);
  // Embedded mode (used in Settings) is always expanded — the
  // surrounding Card already provides the section frame.
  const [expanded, setExpanded] = useState(embedded);

  // The collapsed-section header is what triggers the first-time
  // educational modal. Subsequent expansions skip the modal but
  // the (i) icon next to the title still opens it on demand.
  function handleHeaderClick() {
    if (!expanded && !seenInfo) {
      setInfoOpen(true);
      void markSeenTravelBaseInfo();
    }
    setExpanded(e => !e);
  }

  function addBase() {
    const next: TravelBase[] = [...bases];
    // First base added is automatically primary + Home type.
    // Subsequent ones default to Travel Base.
    const isFirstEver = next.length === 0;
    next.push(emptyBase("", isFirstEver, isFirstEver ? "home" : "travel"));
    onChange(next);
  }

  function updateBase(id: string, patch: Partial<TravelBase>) {
    onChange(bases.map(b => b.id === id ? { ...b, ...patch } : b));
  }

  function removeBase(id: string) {
    const removing = bases.find(b => b.id === id);
    let next = bases.filter(b => b.id !== id);
    // If we removed the primary and there's still at least one
    // base left, promote the first remaining base to primary so
    // the project crew default never points at nothing.
    if (removing?.isPrimary && next.length > 0 && !next.some(b => b.isPrimary)) {
      next = next.map((b, i) => i === 0 ? { ...b, isPrimary: true } : b);
    }
    onChange(next);
  }

  function makePrimary(id: string) {
    onChange(bases.map(b => ({ ...b, isPrimary: b.id === id })));
  }

  // Editor body — the per-base list + "Add a base" button. Shared
  // between the embedded (Settings) and collapsible (Staff dialog)
  // layouts.
  const editorBody = (
    <>
      {bases.length === 0 && (
        <p className="text-xs text-muted-foreground">
          No bases yet. Add your home address as the primary base. If you ever drive to shoots from a different starting point (e.g. a relative's house in another state), add that as a Travel Base later.
        </p>
      )}

      {bases.map((b) => {
        const baseType: "home" | "travel" = b.type || "home";
        return (
          <div key={b.id} className="rounded-md border border-border bg-background p-3 space-y-2">
            <div className="flex items-center gap-2">
              <div className="flex bg-secondary border border-border rounded-md overflow-hidden text-xs shrink-0">
                <button
                  type="button"
                  onClick={() => updateBase(b.id, { type: "home" })}
                  className={cn(
                    "flex items-center gap-1 px-2 py-1.5 transition-colors",
                    baseType === "home" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Home className="w-3 h-3" /> Home
                </button>
                <button
                  type="button"
                  onClick={() => updateBase(b.id, { type: "travel" })}
                  className={cn(
                    "flex items-center gap-1 px-2 py-1.5 transition-colors",
                    baseType === "travel" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Plane className="w-3 h-3" /> Travel
                </button>
              </div>
              <Input
                value={b.label}
                onChange={(e) => updateBase(b.id, { label: e.target.value })}
                placeholder={baseType === "home" ? "Name (e.g. Tennessee)" : "Name (e.g. California — sister's)"}
                className="bg-secondary border-border text-sm"
              />
              <button
                type="button"
                onClick={() => makePrimary(b.id)}
                aria-label={b.isPrimary ? "Primary base" : "Make this the primary base"}
                className={cn(
                  "p-1.5 rounded-md transition-colors shrink-0",
                  b.isPrimary
                    ? "text-yellow-500 bg-yellow-500/10"
                    : "text-muted-foreground hover:text-yellow-500 hover:bg-yellow-500/10",
                )}
              >
                <Star className={cn("w-4 h-4", b.isPrimary && "fill-current")} />
              </button>
              <button
                type="button"
                onClick={() => removeBase(b.id)}
                aria-label="Remove base"
                className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>

            <Input
              value={b.address}
              onChange={(e) => updateBase(b.id, { address: e.target.value })}
              placeholder="Street address"
              className="bg-secondary border-border text-sm"
            />
            <div className="grid grid-cols-3 gap-2">
              <Input value={b.city} onChange={(e) => updateBase(b.id, { city: e.target.value })} placeholder="City" className="bg-secondary border-border text-sm" />
              <Input value={b.state} onChange={(e) => updateBase(b.id, { state: e.target.value })} placeholder="State" className="bg-secondary border-border text-sm" />
              <Input value={b.zip} onChange={(e) => updateBase(b.id, { zip: e.target.value })} placeholder="ZIP" className="bg-secondary border-border text-sm" />
            </div>

            {b.isPrimary && (
              <p className="text-[10px] text-yellow-500 flex items-center gap-1">
                <Star className="w-3 h-3 fill-current" /> Primary base — used by default for new projects
              </p>
            )}
          </div>
        );
      })}

      <Button type="button" variant="outline" size="sm" onClick={addBase} className="w-full gap-1">
        <Plus className="w-3.5 h-3.5" /> Add a base
      </Button>
    </>
  );

  // Embedded layout (Settings) skips the collapsible chrome — the
  // parent Card already provides the section frame and title. We
  // also expose a tiny (i) icon for the explainer modal.
  if (embedded) {
    return (
      <>
        <div className="space-y-3">
          <div className="flex items-center gap-1 -mt-1">
            <span className="text-[11px] text-muted-foreground">Manage one or more bases below.</span>
            <button
              type="button"
              onClick={() => setInfoOpen(true)}
              aria-label="What's a home base?"
              className="text-muted-foreground hover:text-primary"
            >
              <Info className="w-3.5 h-3.5" />
            </button>
          </div>
          {editorBody}
        </div>
        <TravelBaseInfoModal open={infoOpen} onClose={() => setInfoOpen(false)} />
      </>
    );
  }

  return (
    <>
      <div className="border border-border rounded-lg bg-card/50 overflow-hidden">
        <button
          type="button"
          onClick={handleHeaderClick}
          className="w-full flex items-center justify-between gap-2 px-4 py-3 hover:bg-secondary/50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <MapPinned className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              Home Bases
            </span>
            <span className="text-xs text-muted-foreground">
              {bases.length === 0 ? "(none yet)" : `${bases.length}`}
            </span>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setInfoOpen(true); }}
              aria-label="What's a home base?"
              className="text-muted-foreground hover:text-primary"
            >
              <Info className="w-3.5 h-3.5" />
            </button>
          </div>
          <span className="text-xs text-muted-foreground">{expanded ? "Hide" : "Show"}</span>
        </button>

        {expanded && (
          <div className="px-4 pb-4 pt-3 space-y-3 border-t border-border">
            {editorBody}
          </div>
        )}
      </div>

      <TravelBaseInfoModal open={infoOpen} onClose={() => setInfoOpen(false)} />
    </>
  );
}
