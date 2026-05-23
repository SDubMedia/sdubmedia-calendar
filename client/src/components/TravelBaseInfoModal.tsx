// ============================================================
// HomeBaseInfoModal (file kept as TravelBaseInfoModal for git
// history) — short explainer that fires the first time a user
// opens the Home Bases section. After dismissing it they can
// re-open via the (i) icon next to the section header. Tracked
// via guidance.seenTravelBaseInfo.
// ============================================================

import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { MapPinned, Plane, Home } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function TravelBaseInfoModal({ open, onClose }: Props) {
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            <MapPinned className="w-5 h-5 text-primary" />
            What's a Home Base?
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">
          <p>
            A home base is a place you start driving from for some shoots. Most people just have one — their actual home.
          </p>
          <p>
            Some people who travel for work have a second base — a Travel Base — where they keep a vehicle parked. When you fly out, get the car, and drive to shoots from there, mileage should be calculated from that location, not from your home.
          </p>

          <div className="rounded-md border border-border bg-secondary/40 p-3 space-y-2">
            <div className="flex items-start gap-2">
              <Plane className="w-4 h-4 text-primary shrink-0 mt-0.5" />
              <p className="text-xs">
                <span className="font-semibold text-foreground">Example:</span> You live in Tennessee but fly to California a few times a year, where your car is parked at a relative's house. Add a second base, mark it as Travel. When you create a CA shoot, pick that base on the project's crew entry. Slate calculates the round-trip from the relative's house, not from Tennessee.
              </p>
            </div>
            <div className="flex items-start gap-2">
              <Home className="w-4 h-4 text-primary shrink-0 mt-0.5" />
              <p className="text-xs">
                <span className="font-semibold text-foreground">If you don't travel:</span> Just keep your one Home base. Everything works the same as before.
              </p>
            </div>
          </div>

          <p className="text-xs">
            One base is always marked <span className="font-semibold text-foreground">primary</span> — that's the default for new projects.
          </p>
        </div>

        <DialogFooter>
          <Button onClick={onClose} className="w-full sm:w-auto">Got it</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
