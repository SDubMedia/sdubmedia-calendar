// ============================================================
// InvoiceEditDialog — Edit line items, tax, and discount on an
// unpaid invoice (draft or sent status). Paid invoices are locked
// to preserve the audit trail.
// ============================================================

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useScopedData as useApp } from "@/hooks/useScopedData";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { Invoice, InvoiceLineItem, InvoicePaymentMethod } from "@/lib/types";

const PAYMENT_METHOD_OPTIONS: { value: InvoicePaymentMethod; label: string; hint: string }[] = [
  { value: "stripe", label: "Stripe / card", hint: "Generates a payment link the client can pay online" },
  { value: "venmo", label: "Venmo", hint: "Shows your Venmo handle on the invoice" },
];

interface Props {
  invoice: Invoice | null;
  onClose: () => void;
}

function fmt(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export default function InvoiceEditDialog({ invoice, onClose }: Props) {
  const { updateInvoice } = useApp();
  const [items, setItems] = useState<InvoiceLineItem[]>([]);
  // Tax rate stored as percent (e.g. 7 for 7%) in the form for readability;
  // converted to a decimal (0.07) before saving so it matches the DB shape.
  const [taxPct, setTaxPct] = useState("0");
  const [dueDate, setDueDate] = useState("");
  const [paymentMethods, setPaymentMethods] = useState<InvoicePaymentMethod[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!invoice) return;
    setItems(invoice.lineItems.map(li => ({ ...li })));
    setTaxPct(((invoice.taxRate || 0) * 100).toString());
    setDueDate(invoice.dueDate || "");
    setPaymentMethods([...(invoice.paymentMethods || ["stripe"])]);
  }, [invoice]);

  const togglePaymentMethod = (method: InvoicePaymentMethod) => {
    setPaymentMethods(prev =>
      prev.includes(method) ? prev.filter(m => m !== method) : [...prev, method]
    );
  };

  if (!invoice) return null;

  const updateItem = (idx: number, patch: Partial<InvoiceLineItem>) => {
    setItems(prev => prev.map((li, i) => {
      if (i !== idx) return li;
      const next = { ...li, ...patch };
      // Auto-recompute amount when quantity or unitPrice changes. If the
      // user typed an amount manually, respect it (don't overwrite).
      if (("quantity" in patch || "unitPrice" in patch) && !("amount" in patch)) {
        next.amount = round2(Number(next.quantity || 0) * Number(next.unitPrice || 0));
      }
      return next;
    }));
  };

  const addItem = () => {
    setItems(prev => [...prev, {
      projectId: "",
      date: new Date().toISOString().slice(0, 10),
      description: "",
      quantity: 1,
      unitPrice: 0,
      amount: 0,
    }]);
  };

  const addDiscount = () => {
    setItems(prev => [...prev, {
      projectId: "",
      date: new Date().toISOString().slice(0, 10),
      description: "Discount",
      quantity: 1,
      unitPrice: 0,
      amount: 0,
    }]);
  };

  const removeItem = (idx: number) => {
    setItems(prev => prev.filter((_, i) => i !== idx));
  };

  const subtotal = round2(items.reduce((s, li) => s + Number(li.amount || 0), 0));
  const taxRate = Math.max(0, Number(taxPct) || 0) / 100;
  const taxAmount = round2(subtotal * taxRate);
  const total = round2(subtotal + taxAmount);

  const handleSave = async () => {
    // Validate
    for (const li of items) {
      if (!li.description.trim()) {
        toast.error("Every line item needs a description");
        return;
      }
    }
    setSaving(true);
    try {
      await updateInvoice(invoice.id, {
        lineItems: items,
        subtotal,
        taxRate,
        taxAmount,
        total,
        dueDate: dueDate || invoice.dueDate,
        paymentMethods: paymentMethods.length > 0 ? paymentMethods : ["stripe"],
      });
      toast.success("Invoice updated");
      onClose();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to update invoice");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!invoice} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            Edit Invoice {invoice.invoiceNumber}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Due date */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground uppercase tracking-wider block mb-1">Due Date</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground uppercase tracking-wider block mb-1">Tax Rate (%)</label>
              <input
                type="text"
                inputMode="decimal"
                value={taxPct}
                onChange={(e) => setTaxPct(e.target.value.replace(/[^0-9.]/g, ""))}
                placeholder="0"
                className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>

          {/* Line items */}
          <div className="border border-border rounded-md overflow-hidden">
            <div className="bg-secondary/50 px-3 py-2 grid grid-cols-12 gap-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              <div className="col-span-6">Description</div>
              <div className="col-span-2 text-right">Qty</div>
              <div className="col-span-2 text-right">Unit Price</div>
              <div className="col-span-1 text-right">Amount</div>
              <div className="col-span-1" />
            </div>
            <div className="divide-y divide-border">
              {items.length === 0 && (
                <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                  No line items. Add one below.
                </div>
              )}
              {items.map((li, i) => (
                <div key={i} className="px-3 py-2 grid grid-cols-12 gap-2 items-center">
                  <input
                    type="text"
                    value={li.description}
                    onChange={(e) => updateItem(i, { description: e.target.value })}
                    placeholder="e.g. Brand Film — Studio A"
                    className="col-span-6 bg-background border border-border rounded px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <input
                    type="text"
                    inputMode="decimal"
                    value={li.quantity}
                    onChange={(e) => updateItem(i, { quantity: Number(e.target.value.replace(/[^0-9.-]/g, "")) || 0 })}
                    className="col-span-2 bg-background border border-border rounded px-2 py-1 text-sm text-foreground text-right focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <input
                    type="text"
                    inputMode="decimal"
                    value={li.unitPrice}
                    onChange={(e) => updateItem(i, { unitPrice: Number(e.target.value.replace(/[^0-9.-]/g, "")) || 0 })}
                    className="col-span-2 bg-background border border-border rounded px-2 py-1 text-sm text-foreground text-right focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <div className="col-span-1 text-right text-sm text-foreground font-medium tabular-nums">
                    {fmt(Number(li.amount || 0))}
                  </div>
                  <button
                    onClick={() => removeItem(i)}
                    className="col-span-1 justify-self-end text-muted-foreground hover:text-red-400 p-1"
                    title="Remove line item"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
            <div className="bg-secondary/30 border-t border-border px-3 py-2 flex gap-2">
              <button
                onClick={addItem}
                className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-secondary text-foreground hover:bg-secondary/80 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> Add Line Item
              </button>
              <button
                onClick={addDiscount}
                className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-secondary text-foreground hover:bg-secondary/80 transition-colors"
                title="Add a discount as a negative line item (enter the unit price as a negative number, e.g. -100)"
              >
                <Plus className="w-3.5 h-3.5" /> Add Discount
              </button>
            </div>
          </div>

          {/* Totals */}
          <div className="bg-secondary/30 rounded-md px-4 py-3 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="text-foreground tabular-nums">{fmt(subtotal)}</span>
            </div>
            {taxRate > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tax ({(taxRate * 100).toFixed(2)}%)</span>
                <span className="text-foreground tabular-nums">{fmt(taxAmount)}</span>
              </div>
            )}
            <div className="flex justify-between font-semibold pt-1 border-t border-border">
              <span className="text-foreground">Total</span>
              <span className="text-foreground tabular-nums">{fmt(total)}</span>
            </div>
          </div>

          {/* Payment methods */}
          <div className="border border-border rounded-md p-3 space-y-2">
            <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              Accepted Payment Methods
            </div>
            <div className="space-y-1.5">
              {PAYMENT_METHOD_OPTIONS.map(opt => {
                const checked = paymentMethods.includes(opt.value);
                return (
                  <label key={opt.value} className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => togglePaymentMethod(opt.value)}
                      className="mt-0.5 accent-primary"
                    />
                    <div className="text-sm">
                      <div className="text-foreground">{opt.label}</div>
                      <div className="text-[11px] text-muted-foreground">{opt.hint}</div>
                    </div>
                  </label>
                );
              })}
            </div>
            {paymentMethods.length === 0 && (
              <p className="text-[11px] text-amber-400">At least one payment method is recommended — Stripe will be used if none are selected.</p>
            )}
          </div>

          <p className="text-[11px] text-muted-foreground">
            Tip: to apply a discount, add a line item with a negative unit price (e.g. <span className="font-mono">-100</span>).
          </p>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving} className="bg-primary text-primary-foreground">
            {saving ? "Saving…" : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
