// ============================================================
// SignaturePad — reusable typed/drawn signature capture, wrapping
// useSignatureCanvas. Used by staff onboarding (1099 + W-9) and the owner's
// 1099 countersign. Mirrors the contract CountersignModal UX. The parent
// controls `disabled` (e.g. the W-9 sign button stays disabled until every
// required field is filled) and handles the captured signature in onSign.
// ============================================================

import { useState } from "react";
import { useSignatureCanvas } from "@/hooks/useSignatureCanvas";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export interface CapturedSignature {
  name: string;
  signatureData: string;             // typed name or base64 PNG data URL
  signatureType: "typed" | "drawn";
}

export default function SignaturePad({
  defaultName,
  buttonLabel,
  disabled,
  disabledHint,
  consentText,
  onSign,
}: {
  defaultName: string;
  buttonLabel: string;
  disabled?: boolean;
  disabledHint?: string;
  consentText?: string;
  onSign: (sig: CapturedSignature) => void | Promise<void>;
}) {
  const [signatureType, setSignatureType] = useState<"typed" | "drawn">("typed");
  const [typedName, setTypedName] = useState(defaultName);
  const [busy, setBusy] = useState(false);
  const sig = useSignatureCanvas();

  const handleSign = async () => {
    if (disabled) return;
    // Validate BEFORE flipping the busy flag (avoids the stuck-button bug).
    let signatureData: string;
    if (signatureType === "typed") {
      if (!typedName.trim()) { toast.error("Type your name to sign"); return; }
      signatureData = typedName.trim();
    } else {
      if (!sig.hasInk) { toast.error("Draw your signature"); return; }
      signatureData = sig.toDataUrl();
    }
    setBusy(true);
    try {
      await onSign({ name: typedName.trim() || defaultName, signatureData, signatureType });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't sign");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <button type="button" onClick={() => setSignatureType("typed")} className={cn("flex-1 py-2 rounded-lg border text-sm", signatureType === "typed" ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground")}>Type Name</button>
        <button type="button" onClick={() => setSignatureType("drawn")} className={cn("flex-1 py-2 rounded-lg border text-sm", signatureType === "drawn" ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground")}>Draw</button>
      </div>
      {signatureType === "typed" ? (
        <Input value={typedName} onChange={(e) => setTypedName(e.target.value)} placeholder="Your full legal name" className="bg-secondary border-border text-lg" />
      ) : (
        <div>
          <div className="border border-border rounded-lg bg-[#1a1a2e] overflow-hidden">
            <canvas {...sig.canvasProps} width={350} height={120} className="w-full cursor-crosshair touch-none" />
          </div>
          <button type="button" onClick={sig.clear} className="text-xs text-muted-foreground hover:text-foreground mt-1">Clear</button>
        </div>
      )}
      {consentText && <p className="text-[10px] text-muted-foreground">{consentText}</p>}
      <Button onClick={handleSign} disabled={disabled || busy} className="w-full">
        {busy ? "Signing…" : buttonLabel}
      </Button>
      {disabled && disabledHint && <p className="text-xs text-amber-400 text-center">{disabledHint}</p>}
    </div>
  );
}
