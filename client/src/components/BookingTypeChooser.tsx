// ============================================================
// BookingTypeChooser — "what are you booking?" before the form appears.
//
// The five options are FLOWS, not project types: each one needs a genuinely
// different form, so the list lives in code rather than in a table. That has a
// second payoff — a brand-new account with nothing configured sees exactly the
// same five plain-English choices as a two-year-old one, and each choice SEEDS
// what it needs on first use (a real-estate booking creates the real-estate
// type + category behind the scenes). The lists build themselves from use
// instead of being setup homework.
// ============================================================

import { useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Home, Camera, CalendarRange, QrCode, Users, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import type { LucideIcon } from "lucide-react";

export type BookingFlow = "real_estate" | "single" | "multi_day" | "mini" | "meeting";

interface Choice {
  flow: BookingFlow;
  label: string;
  blurb: string;
  icon: LucideIcon;
}

const CHOICES: Choice[] = [
  { flow: "real_estate", label: "Real estate shoot", blurb: "A property, for an agent — address, photo/video bundle, agent billing", icon: Home },
  { flow: "single", label: "Single-day shoot", blurb: "One session on one day — portraits, an event, a video shoot", icon: Camera },
  { flow: "multi_day", label: "Multi-day event", blurb: "One job across several days, one invoice — conferences, weddings, offsites", icon: CalendarRange },
  { flow: "mini", label: "Mini sessions", blurb: "A day of short slots people book themselves from a QR code", icon: QrCode },
  { flow: "meeting", label: "Meeting", blurb: "A consult or call — on the calendar, nothing billed", icon: Users },
];

export default function BookingTypeChooser({ open, onClose, onPick }: {
  open: boolean;
  onClose: () => void;
  /** Called with the chosen flow and, for real estate, the type id to preselect. */
  onPick: (flow: BookingFlow, seededProjectTypeId?: string) => void;
}) {
  const { data, addProjectType } = useApp();
  const [working, setWorking] = useState<BookingFlow | null>(null);

  /**
   * Make sure the pieces a flow needs exist, quietly, the first time it's used.
   * A new account has no project types at all — asking someone to go configure
   * a type list before they can book their first job is how trials die.
   */
  async function seedFor(flow: BookingFlow): Promise<string | undefined> {
    if (flow === "real_estate") {
      const existing = data.projectTypes.find(t => /real\s*estate/i.test(t.name));
      if (existing) return existing.id;
      const created = await addProjectType({ name: "Real Estate Shoot", lightweight: false });
      return created.id;
    }
    return undefined;
  }

  async function pick(flow: BookingFlow) {
    setWorking(flow);
    try {
      const seeded = await seedFor(flow);
      onPick(flow, seeded);
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't start that");
    } finally {
      setWorking(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="bg-card border-border text-foreground max-w-md">
        <DialogHeader>
          <DialogTitle style={{ fontFamily: "'Space Grotesk', sans-serif" }}>What are you booking?</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 py-1">
          {CHOICES.map(c => {
            const Icon = c.icon;
            return (
              <button
                key={c.flow}
                type="button"
                disabled={!!working}
                onClick={() => pick(c.flow)}
                className="w-full text-left flex items-start gap-3 rounded-lg border border-border bg-secondary/40 p-3 hover:border-primary/50 hover:bg-secondary/70 transition-colors disabled:opacity-60"
              >
                <span className="shrink-0 mt-0.5 w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center">
                  <Icon className="w-4 h-4 text-primary" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-foreground">{c.label}</span>
                  <span className="block text-xs text-muted-foreground">{c.blurb}</span>
                </span>
                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 mt-2" />
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
