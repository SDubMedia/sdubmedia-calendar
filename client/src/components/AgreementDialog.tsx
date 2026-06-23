// ============================================================
// AgreementDialog — one-time disclosure an agent or broker must accept before
// booking / being billed. Shows the terms, requires a consent checkbox, records
// acceptance (api/accept-agreement), then calls onAccepted so the caller can
// continue (e.g. an agent proceeds to save a card).
// ============================================================

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { getAuthToken } from "@/lib/supabase";
import { AGREEMENT_VERSION, agreementContent } from "@/lib/agreements";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onClose: () => void;
  kind: "agent" | "broker";
  /** Called after the agreement is successfully recorded. */
  onAccepted?: () => void;
  /** Override the accept button label (e.g. "Agree & add card"). */
  agreeLabel?: string;
  /** Read-only: just show the terms with a Close button (no consent/accept). */
  readOnly?: boolean;
}

export default function AgreementDialog({ open, onClose, kind, onAccepted, agreeLabel, readOnly }: Props) {
  const content = agreementContent(kind);
  const [checked, setChecked] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleAgree = async () => {
    if (!checked) { toast.error("Please check the box to agree"); return; }
    setSaving(true);
    try {
      const token = await getAuthToken();
      const res = await fetch("/api/accept-agreement", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ version: AGREEMENT_VERSION }),
      });
      const body = await res.json().catch(() => ({ error: "Failed" }));
      if (!res.ok) throw new Error(body.error || "Couldn't record your agreement");
      onAccepted?.();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't record your agreement");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="bg-card border-border text-foreground max-w-lg max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{content.title}</DialogTitle>
          <p className="text-xs text-muted-foreground">{content.intro}</p>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto pr-1">{content.body}</div>

        {readOnly ? (
          <DialogFooter className="mt-1">
            <Button onClick={onClose} className="bg-primary text-primary-foreground hover:bg-primary/90">Close</Button>
          </DialogFooter>
        ) : (
          <>
            <label className="flex items-start gap-2 cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={checked}
                onChange={e => setChecked(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-primary flex-shrink-0"
              />
              <span className="text-xs text-foreground">{content.consentLabel}</span>
            </label>

            <DialogFooter className="mt-1">
              <Button variant="ghost" onClick={onClose} className="text-muted-foreground">Cancel</Button>
              <Button onClick={handleAgree} disabled={saving || !checked} className="bg-primary text-primary-foreground hover:bg-primary/90">
                {saving ? "Saving…" : (agreeLabel ?? "Agree")}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
