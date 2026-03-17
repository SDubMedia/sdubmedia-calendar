// ============================================================
// ClientsPage — Client directory
// Design: Dark Cinematic Studio
// ============================================================

import { useState } from "react";
import { Plus, Building2, Phone, Mail, Edit3, Trash2, Calendar, DollarSign } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useApp } from "@/contexts/AppContext";
import type { Client, RoleBillingMultiplier, BillingModel } from "@/lib/types";
import { toast } from "sonner";

interface ClientFormData {
  company: string;
  contactName: string;
  phone: string;
  email: string;
  billingModel: BillingModel;
  billingRatePerHour: number;
  perProjectRate: number;
  projectTypeRates: { projectTypeId: string; rate: number }[];
  roleBillingMultipliers: RoleBillingMultiplier[];
}

const emptyForm = (): ClientFormData => ({
  company: "",
  contactName: "",
  phone: "",
  email: "",
  billingModel: "hourly",
  billingRatePerHour: 200,
  perProjectRate: 0,
  projectTypeRates: [],
  roleBillingMultipliers: [],
});

export default function ClientsPage() {
  const { data, addClient, updateClient, deleteClient } = useApp();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Client | null>(null);
  const [form, setForm] = useState<ClientFormData>(emptyForm());

  const openAdd = () => {
    setEditingClient(null);
    setForm(emptyForm());
    setDialogOpen(true);
  };

  const openEdit = (client: Client) => {
    setEditingClient(client);
    setForm({
      company: client.company,
      contactName: client.contactName,
      phone: client.phone,
      email: client.email,
      billingModel: client.billingModel || "hourly",
      billingRatePerHour: client.billingRatePerHour,
      perProjectRate: client.perProjectRate || 0,
      projectTypeRates: client.projectTypeRates || [],
      roleBillingMultipliers: client.roleBillingMultipliers || [],
    });
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!form.company) { toast.error("Company name is required"); return; }
    if (editingClient) {
      updateClient(editingClient.id, form);
      toast.success("Client updated");
    } else {
      addClient(form);
      toast.success("Client added");
    }
    setDialogOpen(false);
  };

  const handleDelete = () => {
    if (deleteTarget) {
      deleteClient(deleteTarget.id);
      toast.success("Client deleted");
      setDeleteTarget(null);
    }
  };

  const getProjectCount = (clientId: string) =>
    data.projects.filter((p) => p.clientId === clientId).length;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card/50">
        <div>
          <h1 className="text-xl font-semibold text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Clients</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{data.clients.length} client{data.clients.length !== 1 ? "s" : ""}</p>
        </div>
        <Button onClick={openAdd} className="bg-primary text-primary-foreground hover:bg-primary/90 gap-2">
          <Plus className="w-4 h-4" /> Add Client
        </Button>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {data.clients.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
            <Building2 className="w-12 h-12 mb-3 opacity-30" />
            <p className="text-sm">No clients yet. Add your first client.</p>
          </div>
        ) : (
          <div className="grid gap-3">
            {data.clients.map((client) => (
              <div key={client.id} className="bg-card border border-border rounded-lg p-4 flex items-center gap-4 hover:border-border/80 transition-colors">
                <div className="w-10 h-10 rounded-lg bg-primary/15 flex items-center justify-center flex-shrink-0">
                  <Building2 className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-foreground truncate" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                    {client.company}
                  </div>
                  <div className="text-sm text-muted-foreground">{client.contactName}</div>
                  <div className="flex items-center gap-4 mt-1.5 text-xs text-muted-foreground">
                    {client.phone && (
                      <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{client.phone}</span>
                    )}
                    {client.email && (
                      <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{client.email}</span>
                    )}
                  </div>
                </div>
                <div className="text-right flex-shrink-0 space-y-1">
                  <div className="text-xs text-muted-foreground flex items-center gap-1 justify-end">
                    <Calendar className="w-3 h-3" />
                    {getProjectCount(client.id)} projects
                  </div>
                  <div className="text-xs text-primary flex items-center gap-1 justify-end">
                    <DollarSign className="w-3 h-3" />
                    {client.billingModel === "per_project"
                      ? `$${Number(client.perProjectRate).toFixed(0)}/project`
                      : `$${Number(client.billingRatePerHour).toFixed(0)}/hr`
                    }
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={() => openEdit(client)}>
                    <Edit3 className="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => setDeleteTarget(client)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(o) => !o && setDialogOpen(false)}>
        <DialogContent className="bg-card border-border text-foreground max-w-md">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              {editingClient ? "Edit Client" : "Add Client"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Company Name *</Label>
              <Input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} className="bg-secondary border-border" placeholder="e.g. Coldwell Banker Southern Realty" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Contact Name</Label>
              <Input value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} className="bg-secondary border-border" placeholder="e.g. Sam Sizemore" />
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
                  type="number"
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
                  type="number"
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
                      type="number"
                      min="0"
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
                    type="number"
                    step="0.1"
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
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} className="bg-primary text-primary-foreground hover:bg-primary/90">
              {editingClient ? "Save Changes" : "Add Client"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent className="bg-card border-border text-foreground">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Client?</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              This will permanently delete "{deleteTarget?.company}". This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-border">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
