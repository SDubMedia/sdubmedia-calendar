// ============================================================
// StaffAgreementResign — a banner shown on the staff dashboard when an
// already-onboarded staff member hasn't signed the CURRENT agreement version
// (e.g. the owner edited it). Tapping it opens the updated agreement + a
// signature pad. New staff still in onboarding sign via the onboarding gate;
// this covers everyone who already finished.
// ============================================================

import { useState } from "react";
import { FileSignature } from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import { useAuth } from "@/contexts/AuthContext";
import { getAuthToken } from "@/lib/supabase";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import SignaturePad, { type CapturedSignature } from "@/components/SignaturePad";
import { STAFF_AGREEMENT_VERSION, STAFF_AGREEMENT_TITLE, defaultAgreementText } from "@/lib/staffAgreement";

export default function StaffAgreementResign() {
  const { data, refresh } = useApp();
  const { effectiveProfile } = useAuth();
  const [open, setOpen] = useState(false);

  const crewMemberId = effectiveProfile?.crewMemberId || "";
  if (effectiveProfile?.role !== "staff" || !crewMemberId) return null;

  const version = (data.organization?.staffAgreementVersion || "").trim() || STAFF_AGREEMENT_VERSION;
  const text = (data.organization?.staffAgreementText || "").trim() || defaultAgreementText(data.organization?.name || "");
  const signed = data.staffAgreements.some(a => a.crewMemberId === crewMemberId && a.agreementVersion === version && a.staffSignedAt);
  if (signed) return null;

  const sign = async (sig: CapturedSignature) => {
    const token = await getAuthToken();
    const res = await fetch("/api/staff-sign-agreement", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ agreementVersion: version, agreementTitle: STAFF_AGREEMENT_TITLE, signature: { ...sig, email: effectiveProfile?.email || "" } }),
    });
    const body = await res.json().catch(() => ({ error: "Failed" }));
    if (!res.ok) throw new Error(body.error || "Couldn't sign");
    await refresh();
    setOpen(false);
    toast.success("Signed — thank you!");
  };

  return (
    <>
      <button onClick={() => setOpen(true)} className="w-full text-left bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 flex items-center gap-3 hover:bg-amber-500/15 transition-colors">
        <FileSignature className="w-5 h-5 text-amber-400 shrink-0" />
        <div className="min-w-0">
          <div className="text-sm font-medium text-foreground">Review &amp; sign the updated agreement</div>
          <div className="text-xs text-muted-foreground">Your company updated the contractor agreement — tap to review and sign.</div>
        </div>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-card border-border text-foreground max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{STAFF_AGREEMENT_TITLE}</DialogTitle>
          </DialogHeader>
          <div className="overflow-y-auto pr-1">
            <p className="text-[11px] text-muted-foreground leading-relaxed whitespace-pre-wrap">{text}</p>
          </div>
          <SignaturePad
            defaultName={effectiveProfile?.name || ""}
            buttonLabel="Sign agreement"
            consentText="By signing, you agree this is your legal signature and you accept the agreement terms."
            onSign={sign}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
