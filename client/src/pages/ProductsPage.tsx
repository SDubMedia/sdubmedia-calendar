// ============================================================
// ProductsPage — owner-only catalog of per-house software/tool costs
// (e.g. Fotello). Each product has a per-house cost that gets dropped
// onto a shoot and counted against per-house profit. Pure setup/config.
// ============================================================

import { useState } from "react";
import { useScopedData as useApp } from "@/hooks/useScopedData";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Package as PackageIcon, Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { Product } from "@/lib/types";

function formatCurrency(n: number): string {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function ProductsPage() {
  const { data, addProduct, updateProduct, deleteProduct } = useApp();
  const [editing, setEditing] = useState<Product | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [cost, setCost] = useState("");
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);

  const products = [...data.products].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));

  function openNew() {
    setEditing(null);
    setName("");
    setCost("");
    setActive(true);
    setDialogOpen(true);
  }
  function openEdit(p: Product) {
    setEditing(p);
    setName(p.name);
    setCost(String(p.unitCost));
    setActive(p.active);
    setDialogOpen(true);
  }

  const parsedCost = parseFloat(cost);
  const canSave = name.trim() !== "" && !isNaN(parsedCost) && parsedCost >= 0;

  async function save() {
    if (!canSave) return;
    setSaving(true);
    try {
      if (editing) {
        await updateProduct(editing.id, { name: name.trim(), unitCost: parsedCost, active });
        toast.success("Product updated");
      } else {
        await addProduct({ name: name.trim(), unitCost: parsedCost, active, sortOrder: products.length });
        toast.success("Product added");
      }
      setDialogOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save product");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(p: Product) {
    try {
      await deleteProduct(p.id);
      toast.success("Product removed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove product");
    }
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            Products & Software
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Per-house tool costs (e.g. Fotello). Added to a shoot, they count against your profit.
          </p>
        </div>
        <Button onClick={openNew} className="gap-1.5">
          <Plus className="w-4 h-4" /> Add Product
        </Button>
      </div>

      {products.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <PackageIcon className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <div className="text-sm">No products yet.</div>
          <div className="text-xs mt-1">Add Fotello (or any per-house tool) to track its cost.</div>
        </div>
      ) : (
        <div className="space-y-2">
          {products.map(p => (
            <div key={p.id} className="bg-secondary rounded-lg p-4 flex items-center justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm">{p.name}</span>
                  {!p.active && <span className="text-[10px] uppercase tracking-wider text-muted-foreground border border-border rounded px-1.5 py-0.5">Inactive</span>}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">{formatCurrency(p.unitCost)} per house</div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button size="sm" variant="ghost" onClick={() => openEdit(p)} className="text-muted-foreground hover:text-foreground" title="Edit"><Pencil className="w-4 h-4" /></Button>
                <Button size="sm" variant="ghost" onClick={() => handleDelete(p)} className="text-muted-foreground hover:text-red-400" title="Remove"><Trash2 className="w-4 h-4" /></Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={(v) => { if (!v) setDialogOpen(false); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{editing ? "Edit product" : "Add product"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-foreground">Name</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Fotello" className="bg-secondary border-border" autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-foreground">Cost per house</Label>
              <Input value={cost} onChange={e => setCost(e.target.value)} inputMode="decimal" type="text" placeholder="0.00" className="bg-secondary border-border tabular-nums" />
            </div>
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} className="accent-primary" />
              Active (show in the shoot picker)
            </label>
          </div>
          <DialogFooter className="flex-col-reverse sm:flex-row gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving || !canSave}>{saving ? "Saving..." : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
