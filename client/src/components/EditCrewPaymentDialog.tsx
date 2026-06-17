// ============================================================
// EditCrewPaymentDialog — fix a logged crew payment (amount, method,
// date, reference, note) instead of delete-and-redo. Member + project
// stay fixed; to move a payment to a different project, delete and re-log.
// ============================================================

import { useEffect, useRef, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Pencil } from "lucide-react";
import type { CrewPayment, ContractorPaymentMethod } from "@/lib/types";

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
  payment: CrewPayment | null;
  crewName: string;
  projectLabel: string;
  open: boolean;
  onClose: () => void;
  onSave: (id: string, patch: Partial<CrewPayment>) => Promise<void>;
}

function isoToDateInput(iso: string): string {
  // ISO timestamp -> yyyy-mm-dd in local time for the date input.
  const d = new Date(iso);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export default function EditCrewPaymentDialog({ payment, crewName, projectLabel, open, onClose, onSave }: Props) {
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<ContractorPaymentMethod>("venmo");
  const [paidDate, setPaidDate] = useState("");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  // Populate from the payment on open (not on every render).
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current && payment) {
      setAmount(String(payment.amount));
      setMethod(payment.paymentMethod);
      setPaidDate(isoToDateInput(payment.paidAt));
      setReference(payment.reference || "");
      setNote(payment.note || "");
      setSaving(false);
    }
    wasOpen.current = open;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const parsed = parseFloat(amount);
  const canSave = !isNaN(parsed) && parsed > 0 && !!paidDate;

  async function save() {
    if (!payment || !canSave) return;
    setSaving(true);
    try {
      await onSave(payment.id, {
        amount: parsed,
        paymentMethod: method,
        paidAt: new Date(paidDate + "T12:00:00").toISOString(),
        reference: reference.trim() || undefined,
        note: note.trim() || undefined,
      });
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
            <Pencil className="w-4 h-4 text-primary" />
            Edit payment
          </DialogTitle>
        </DialogHeader>

        <div className="text-xs text-muted-foreground -mt-1">
          {crewName} · {projectLabel}
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-foreground">Amount</Label>
              <Input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" type="text" placeholder="0.00" className="bg-secondary border-border tabular-nums" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-foreground">Date paid</Label>
              <Input value={paidDate} onChange={(e) => setPaidDate(e.target.value)} type="date" className="bg-secondary border-border" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-foreground">Payment method</Label>
            <Select value={method} onValueChange={(v) => setMethod(v as ContractorPaymentMethod)}>
              <SelectTrigger className="bg-secondary border-border"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-popover border-border">
                {(Object.keys(METHOD_LABELS) as ContractorPaymentMethod[]).map(k => (
                  <SelectItem key={k} value={k}>{METHOD_LABELS[k]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-foreground">Reference / note <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Check #, transaction ID, etc." className="bg-secondary border-border" />
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" className="bg-secondary border-border" />
          </div>
        </div>

        <DialogFooter className="flex-col-reverse sm:flex-row gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving || !canSave}>{saving ? "Saving..." : "Save changes"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
