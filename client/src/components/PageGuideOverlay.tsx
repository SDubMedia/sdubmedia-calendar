// ============================================================
// PageGuideOverlay — floating ? help button on pages that have
// a guide entry in lib/pageGuides.tsx. The button reveals the
// guide content as a modal on demand. Auto-popping was removed
// per design: only prereq blockers should interrupt the user.
// Currently 3 pages have guides: Pipeline, Contracts, Galleries.
// ============================================================

import { useState } from "react";
import { useLocation } from "wouter";
import { HelpCircle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { getGuideForPath, renderGuideBody } from "@/lib/pageGuides";

export default function PageGuideOverlay() {
  const [location, setLocation] = useLocation();
  const { markGuideSeen } = useAuth();
  const [open, setOpen] = useState(false);

  const guide = getGuideForPath(location);

  function dismiss() {
    if (guide) void markGuideSeen(guide.pageId);
    setOpen(false);
  }

  if (!guide) return null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label={`Show help for ${guide.title}`}
        className="fixed bottom-4 right-4 z-40 w-11 h-11 rounded-full bg-primary text-primary-foreground shadow-lg hover:scale-105 active:scale-95 transition-transform flex items-center justify-center"
      >
        <HelpCircle className="w-5 h-5" />
      </button>

      <Dialog open={open} onOpenChange={(v) => { if (!v) dismiss(); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-lg" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              {guide.title}
            </DialogTitle>
          </DialogHeader>
          {renderGuideBody(guide)}
          <DialogFooter className="flex-col-reverse sm:flex-row gap-2 sm:gap-0">
            {guide.primaryCta && (
              <Button
                variant="outline"
                onClick={() => { dismiss(); setLocation(guide.primaryCta!.href); }}
              >
                {guide.primaryCta.label}
              </Button>
            )}
            <Button onClick={dismiss}>Got it</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
