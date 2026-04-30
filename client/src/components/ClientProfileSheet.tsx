// ============================================================
// ClientProfileSheet — Slide-in panel for editing a client
// Reused by ClientsPage and ProjectDetailSheet
// ============================================================

import { useState, useEffect } from "react";
import { Plus, Trash2, Film } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useScopedData as useApp } from "@/hooks/useScopedData";
import type { Client, RoleBillingMultiplier, BillingModel, PartnerSplit } from "@/lib/types";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface ClientFormData {
  company: string;
  contactName: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  billingModel: BillingModel;
  billingRatePerHour: number;
  perProjectRate: number;
  projectTypeRates: { projectTypeId: string; rate: number }[];
  allowedProjectTypeIds: string[];
  defaultProjectTypeId: string;
  roleBillingMultipliers: RoleBillingMultiplier[];
  partnerSplit: PartnerSplit | null;
}

const DEFAULT_PARTNER_SPLIT: PartnerSplit = {
  partnerName: "",
  partnerPercent: 0.45,
  adminPercent: 0.45,
  marketingPercent: 0.10,
  crewSplitThreshold: 0.5,
  crewMarketingPercent: 0.10,
  crewRemainderSplit: 0.5,
  editorPartnerPercent: 0.45,
  editorAdminPercent: 0.45,
  editorMarketingPercent: 0.10,
  spendingBudgetEnabled: true,
};

const emptyForm = (): ClientFormData => ({
  company: "",
  contactName: "",
  phone: "",
  email: "",
  address: "",
  city: "",
  state: "",
  zip: "",
  billingModel: "hourly",
  billingRatePerHour: 200,
  perProjectRate: 0,
  projectTypeRates: [],
  allowedProjectTypeIds: [],
  defaultProjectTypeId: "",
  roleBillingMultipliers: [],
  partnerSplit: null,
});

interface Props {
  /** When non-null, edit that client. When null and open, create a new client. */
  client: Client | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function ClientProfileSheet({ client, open, onOpenChange }: Props) {
  const { data, addClient, updateClient } = useApp();
  const [form, setForm] = useState<ClientFormData>(emptyForm());

  // Hydrate form when sheet opens or client changes
  useEffect(() => {
    if (!open) return;
    if (client) {
      setForm({
        company: client.company,
        contactName: client.contactName,
        phone: client.phone,
        email: client.email,
        address: client.address || "",
        city: client.city || "",
        state: client.state || "",
        zip: client.zip || "",
        billingModel: client.billingModel || "hourly",
        billingRatePerHour: client.billingRatePerHour,
        perProjectRate: client.perProjectRate || 0,
        projectTypeRates: client.projectTypeRates || [],
        allowedProjectTypeIds: client.allowedProjectTypeIds || [],
        defaultProjectTypeId: client.defaultProjectTypeId || "",
        roleBillingMultipliers: client.roleBillingMultipliers || [],
        partnerSplit: client.partnerSplit || null,
      });
    } else {
      setForm(emptyForm());
    }
  }, [open, client]);

  const handleSave = () => {
    if (!form.company) { toast.error("Company name is required"); return; }
    if (client) {
      updateClient(client.id, form);
      toast.success("Client updated");
    } else {
      addClient(form);
      toast.success("Client added");
    }
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:w-[560px] sm:max-w-[560px] bg-card border-border text-foreground overflow-y-auto overflow-x-hidden max-h-[100dvh]">
        <SheetHeader className="px-4 sm:px-6 pt-4 pb-4">
          <SheetTitle className="text-lg" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            {client ? (form.company || "Edit Client") : "Add Client"}
          </SheetTitle>
        </SheetHeader>
        <div className="space-y-5 px-4 sm:px-6 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Company Name *</Label>
            <Input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} className="bg-secondary border-border" placeholder="e.g. Coldwell Banker Southern Realty" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Contact Name</Label>
            <Input value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} className="bg-secondary border-border" placeholder="e.g. Sam Sizemore" />
          </div>

          {/* Project Types — prominent, at the top for quick setup */}
          <div className="space-y-2 p-3 rounded-lg bg-primary/5 border border-primary/20">
            <div className="flex items-center gap-2">
              <Film className="w-4 h-4 text-primary" />
              <Label className="text-xs font-semibold text-foreground uppercase tracking-wider">Project Types</Label>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Click to toggle which project types this client uses. Leave empty to allow all types.
            </p>
            <div className="flex flex-wrap gap-2">
              {data.projectTypes.map(pt => (
                <button
                  key={pt.id}
                  onClick={() => setForm(f => ({
                    ...f,
                    allowedProjectTypeIds: f.allowedProjectTypeIds.includes(pt.id)
                      ? f.allowedProjectTypeIds.filter(id => id !== pt.id)
                      : [...f.allowedProjectTypeIds, pt.id],
                  }))}
                  className={cn(
                    "px-2.5 py-1 rounded text-xs border-2 transition-colors",
                    form.allowedProjectTypeIds.includes(pt.id)
                      ? "bg-primary/20 border-primary text-primary"
                      : "border-border text-muted-foreground hover:border-primary/40"
                  )}
                >
                  {pt.name}
                </button>
              ))}
            </div>
            {form.allowedProjectTypeIds.length > 0 && (
              <div className="space-y-1.5 pt-2">
                <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">Default Project Type</Label>
                <select
                  value={form.defaultProjectTypeId}
                  onChange={e => setForm(f => ({ ...f, defaultProjectTypeId: e.target.value }))}
                  className="w-full bg-background border border-border rounded-md px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="">None</option>
                  {data.projectTypes
                    .filter(pt => form.allowedProjectTypeIds.includes(pt.id))
                    .map(pt => (
                      <option key={pt.id} value={pt.id}>{pt.name}</option>
                    ))}
                </select>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Phone</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="bg-secondary border-border" placeholder="615-000-0000" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Email</Label>
              <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="bg-secondary border-border" placeholder="email@example.com" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Street Address</Label>
            <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="bg-secondary border-border" placeholder="123 Main St" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">City</Label>
              <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} className="bg-secondary border-border" placeholder="Nashville" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">State</Label>
              <Input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} className="bg-secondary border-border" placeholder="TN" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">ZIP</Label>
              <Input value={form.zip} onChange={(e) => setForm({ ...form, zip: e.target.value })} className="bg-secondary border-border" placeholder="37201" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Billing Model</Label>
            <select
              value={form.billingModel}
              onChange={e => setForm({ ...form, billingModel: e.target.value as BillingModel })}
              className="w-full bg-secondary border border-border rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="hourly">Hourly Rate</option>
              <option value="per_project">Per Project (Flat Rate)</option>
            </select>
          </div>
          {form.billingModel === "hourly" ? (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Billing Rate ($/hr)</Label>
              <Input
                type="text" inputMode="decimal"
                value={form.billingRatePerHour}
                onChange={(e) => setForm({ ...form, billingRatePerHour: parseFloat(e.target.value) || 0 })}
                className="bg-secondary border-border"
                placeholder="200"
              />
            </div>
          ) : (
            <>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Default Rate Per Project ($)</Label>
              <Input
                type="text" inputMode="decimal"
                value={form.perProjectRate}
                onChange={(e) => setForm({ ...form, perProjectRate: parseFloat(e.target.value) || 0 })}
                className="bg-secondary border-border"
                placeholder="300"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">Per-Type Rates (overrides default)</Label>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs gap-1 text-primary hover:text-primary"
                  onClick={() => setForm(f => ({
                    ...f,
                    projectTypeRates: [...f.projectTypeRates, { projectTypeId: "", rate: 0 }],
                  }))}
                >
                  <Plus className="w-3 h-3" /> Add
                </Button>
              </div>
              {form.projectTypeRates.map((ptr, idx) => (
                <div key={idx} className="grid grid-cols-[1fr_80px_28px] gap-2 items-center">
                  <select
                    value={ptr.projectTypeId}
                    onChange={e => {
                      const updated = [...form.projectTypeRates];
                      updated[idx] = { ...updated[idx], projectTypeId: e.target.value };
                      setForm(f => ({ ...f, projectTypeRates: updated }));
                    }}
                    className="bg-secondary border border-border rounded-md px-2 py-1.5 text-xs text-foreground h-8"
                  >
                    <option value="">Select type</option>
                    {data.projectTypes.map(pt => (
                      <option key={pt.id} value={pt.id}>{pt.name}</option>
                    ))}
                  </select>
                  <Input
                    type="text" inputMode="decimal"
                    value={ptr.rate || ""}
                    onChange={e => {
                      const updated = [...form.projectTypeRates];
                      updated[idx] = { ...updated[idx], rate: parseFloat(e.target.value) || 0 };
                      setForm(f => ({ ...f, projectTypeRates: updated }));
                    }}
                    className="bg-secondary border-border h-8 text-xs"
                    placeholder="$"
                  />
                  <button
                    onClick={() => setForm(f => ({
                      ...f,
                      projectTypeRates: f.projectTypeRates.filter((_, i) => i !== idx),
                    }))}
                    className="text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
            </>
          )}
          {/* Role Billing Multipliers */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">Role Billing Multipliers</Label>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs gap-1 text-primary hover:text-primary"
                onClick={() => setForm(f => ({
                  ...f,
                  roleBillingMultipliers: [...f.roleBillingMultipliers, { role: "", multiplier: 0.5 }],
                }))}
              >
                <Plus className="w-3 h-3" /> Add
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Set how many hours are billed per hour worked for specific roles. Default is 1.0 (1hr worked = 1hr billed).
            </p>
            {form.roleBillingMultipliers.map((m, idx) => (
              <div key={idx} className="grid grid-cols-[1fr_80px_28px] gap-2 items-center">
                <Input
                  value={m.role}
                  onChange={e => {
                    const updated = [...form.roleBillingMultipliers];
                    updated[idx] = { ...updated[idx], role: e.target.value };
                    setForm(f => ({ ...f, roleBillingMultipliers: updated }));
                  }}
                  className="bg-secondary border-border h-8 text-xs"
                  placeholder="e.g. 2nd Videographer"
                />
                <Input
                  type="text" inputMode="decimal"
                  min="0"
                  value={m.multiplier}
                  onChange={e => {
                    const updated = [...form.roleBillingMultipliers];
                    updated[idx] = { ...updated[idx], multiplier: parseFloat(e.target.value) || 0 };
                    setForm(f => ({ ...f, roleBillingMultipliers: updated }));
                  }}
                  className="bg-secondary border-border h-8 text-xs"
                  placeholder="0.5"
                />
                <button
                  onClick={() => setForm(f => ({
                    ...f,
                    roleBillingMultipliers: f.roleBillingMultipliers.filter((_, i) => i !== idx),
                  }))}
                  className="text-muted-foreground hover:text-destructive transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
          {/* Partner Toggle */}
          <div className="space-y-2 border-t border-border pt-4">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Partner</Label>
              <button
                onClick={() => setForm(f => ({
                  ...f,
                  partnerSplit: f.partnerSplit ? null : { ...DEFAULT_PARTNER_SPLIT },
                }))}
                className={cn(
                  "relative w-10 h-5 rounded-full transition-colors",
                  form.partnerSplit ? "bg-primary" : "bg-secondary border border-border"
                )}
              >
                <span className={cn(
                  "absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform",
                  form.partnerSplit ? "translate-x-5" : "translate-x-0.5"
                )} />
              </button>
            </div>
            {form.partnerSplit && (
              <div className="space-y-3 bg-secondary/30 rounded-lg p-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Partner Name</Label>
                  <Input
                    value={form.partnerSplit.partnerName}
                    onChange={e => setForm(f => ({ ...f, partnerSplit: f.partnerSplit ? { ...f.partnerSplit, partnerName: e.target.value } : null }))}
                    className="bg-secondary border-border h-8 text-sm"
                    placeholder="e.g. Showcase Media"
                  />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">Partner %</Label>
                    <Input type="text" inputMode="decimal"
                      value={form.partnerSplit.partnerPercent}
                      onChange={e => setForm(f => ({ ...f, partnerSplit: f.partnerSplit ? { ...f.partnerSplit, partnerPercent: parseFloat(e.target.value) || 0 } : null }))}
                      className="bg-secondary border-border h-8 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">Admin %</Label>
                    <Input type="text" inputMode="decimal"
                      value={form.partnerSplit.adminPercent}
                      onChange={e => setForm(f => ({ ...f, partnerSplit: f.partnerSplit ? { ...f.partnerSplit, adminPercent: parseFloat(e.target.value) || 0 } : null }))}
                      className="bg-secondary border-border h-8 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">Marketing %</Label>
                    <Input type="text" inputMode="decimal"
                      value={form.partnerSplit.marketingPercent}
                      onChange={e => setForm(f => ({ ...f, partnerSplit: f.partnerSplit ? { ...f.partnerSplit, marketingPercent: parseFloat(e.target.value) || 0 } : null }))}
                      className="bg-secondary border-border h-8 text-xs"
                    />
                  </div>
                </div>

                {/* Crew Split Settings */}
                <div className="space-y-2 border-t border-border/50 pt-2">
                  <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">Crew Split Rules</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">Crew Cost Threshold</Label>
                      <Input type="text" inputMode="decimal"
                        value={form.partnerSplit.crewSplitThreshold}
                        onChange={e => setForm(f => ({ ...f, partnerSplit: f.partnerSplit ? { ...f.partnerSplit, crewSplitThreshold: parseFloat(e.target.value) || 0 } : null }))}
                        className="bg-secondary border-border h-8 text-xs"
                      />
                      <p className="text-[9px] text-muted-foreground">If crew ≤ this % of billing, deduct marketing</p>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">Crew Marketing %</Label>
                      <Input type="text" inputMode="decimal"
                        value={form.partnerSplit.crewMarketingPercent}
                        onChange={e => setForm(f => ({ ...f, partnerSplit: f.partnerSplit ? { ...f.partnerSplit, crewMarketingPercent: parseFloat(e.target.value) || 0 } : null }))}
                        className="bg-secondary border-border h-8 text-xs"
                      />
                    </div>
                  </div>
                </div>

                {/* Editor Split Settings */}
                <div className="space-y-2 border-t border-border/50 pt-2">
                  <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">Editor Split Rules</Label>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">Partner %</Label>
                      <Input type="text" inputMode="decimal"
                        value={form.partnerSplit.editorPartnerPercent}
                        onChange={e => setForm(f => ({ ...f, partnerSplit: f.partnerSplit ? { ...f.partnerSplit, editorPartnerPercent: parseFloat(e.target.value) || 0 } : null }))}
                        className="bg-secondary border-border h-8 text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">Admin %</Label>
                      <Input type="text" inputMode="decimal"
                        value={form.partnerSplit.editorAdminPercent}
                        onChange={e => setForm(f => ({ ...f, partnerSplit: f.partnerSplit ? { ...f.partnerSplit, editorAdminPercent: parseFloat(e.target.value) || 0 } : null }))}
                        className="bg-secondary border-border h-8 text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">Marketing %</Label>
                      <Input type="text" inputMode="decimal"
                        value={form.partnerSplit.editorMarketingPercent}
                        onChange={e => setForm(f => ({ ...f, partnerSplit: f.partnerSplit ? { ...f.partnerSplit, editorMarketingPercent: parseFloat(e.target.value) || 0 } : null }))}
                        className="bg-secondary border-border h-8 text-xs"
                      />
                    </div>
                  </div>
                </div>

                {/* Spending Budget Toggle */}
                <div className="flex items-center justify-between border-t border-border/50 pt-2">
                  <div>
                    <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">Spending Budget</Label>
                    <p className="text-[9px] text-muted-foreground">Track marketing budget deductions for this client</p>
                  </div>
                  <button
                    onClick={() => setForm(f => ({
                      ...f,
                      partnerSplit: f.partnerSplit ? { ...f.partnerSplit, spendingBudgetEnabled: !f.partnerSplit.spendingBudgetEnabled } : null,
                    }))}
                    className={cn(
                      "relative w-10 h-5 rounded-full transition-colors",
                      form.partnerSplit?.spendingBudgetEnabled ? "bg-primary" : "bg-secondary border border-border"
                    )}
                  >
                    <span className={cn(
                      "absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform",
                      form.partnerSplit?.spendingBudgetEnabled ? "translate-x-5" : "translate-x-0.5"
                    )} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="flex justify-end gap-2 px-4 sm:px-6 pt-4 mt-4 border-t border-border">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} className="bg-primary text-primary-foreground hover:bg-primary/90">
            {client ? "Save Changes" : "Add Client"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
