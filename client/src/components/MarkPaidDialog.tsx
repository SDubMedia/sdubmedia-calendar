// ============================================================
// MarkPaidDialog — admin marks a contractor invoice as paid.
// Slate doesn't process the payment itself. The admin pays
// outside the app (Venmo, Zelle, check, etc.) and uses this
// dialog to record it: how it was paid, when, and an optional
// reference number.
// ============================================================

import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle2 } from "lucide-react";
import type { ContractorInvoice, ContractorPaymentMethod, CrewMember } from "@/lib/types";

const METHOD_LABELS: Record<ContractorPaymentMethod, string> = {
  venmo: "Venmo",
  zelle: "Zelle",
  check: "Check",
  cash: "Cash",
  bank_transfer: "Bank Transfer (ACH)",
  stripe: "Stripe Transfer",
  other: "Other",
};

interface Props {
  invoice: ContractorInvoice;
  crewMember: CrewMember | null;
  open: boolean;
  onClose: () => void;
  onConfirm: (method: ContractorPaymentMethod, reference: string) => Promise<void>;
}

export default function MarkPaidDialog({ invoice, crewMember, open, onClose, onConfirm }: Props) {
  // Default to the contractor's preferred method if they set one,
  // otherwise Venmo (most common for small shops). Reference defaults
  // to their preferred-payment-details string so the admin sees the
  // handle/email right next to the dropdown.
  const defaultMethod: ContractorPaymentMethod = (crewMember?.preferredPaymentMethod as ContractorPaymentMethod) || "venmo";
  const [method, setMethod] = useState<ContractorPaymentMethod>(defaultMethod);
  const [reference, setReference] = useState("");
  const [saving, setSaving] = useState(false);

  async function confirm() {
    setSaving(true);
    try {
      await onConfirm(method, reference.trim());
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            <CheckCircle2 className="w-5 h-5 text-green-500" />
            Mark invoice paid
          </DialogTitle>
        </DialogHeader>

        <div className="text-sm space-y-1">
          <div className="text-muted-foreground">
            <span className="font-semibold text-foreground">{invoice.invoiceNumber}</span> · {crewMember?.name || "Unknown contractor"}
          </div>
          <div className="text-2xl font-bold tabular-nums" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            ${invoice.total.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>

        {crewMember?.preferredPaymentMethod && (
          <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-xs">
            <div className="font-semibold text-foreground mb-0.5">Their preferred method</div>
            <div className="text-muted-foreground">
              {METHOD_LABELS[crewMember.preferredPaymentMethod]}
              {crewMember.preferredPaymentDetails ? ` · ${crewMember.preferredPaymentDetails}` : ""}
            </div>
          </div>
        )}

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-foreground">Payment method</Label>
            <Select value={method} onValueChange={(v) => setMethod(v as ContractorPaymentMethod)}>
              <SelectTrigger className="bg-secondary border-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-popover border-border">
                {(Object.keys(METHOD_LABELS) as ContractorPaymentMethod[]).map(k => (
                  <SelectItem key={k} value={k}>{METHOD_LABELS[k]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-foreground">Reference / confirmation number <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Check #, transaction ID, etc."
              className="bg-secondary border-border"
            />
          </div>
        </div>

        <DialogFooter className="flex-col-reverse sm:flex-row gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={confirm} disabled={saving} className="bg-green-600 text-white hover:bg-green-500">
            {saving ? "Saving..." : "Confirm Paid"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
