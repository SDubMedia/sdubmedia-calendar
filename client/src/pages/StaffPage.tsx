// ============================================================
// Staff Page — Manage crew members with per-role pay rates
// Design: Dark Cinematic Studio | Amber accent on charcoal
// Each crew member can have multiple roles, each with its own hourly rate.
// When added to a project, selecting a role auto-fills the correct rate.
// ============================================================

import { useState } from "react";
import { useApp } from "@/contexts/AppContext";
import type { CrewMember, CrewRole, RoleRate } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { UserPlus, Pencil, Trash2, DollarSign, User, Plus, X } from "lucide-react";
import { toast } from "sonner";

const ALL_ROLES: CrewRole[] = [
  "Main Videographer",
  "Secondary Videographer",
  "Videographer",
  "Photographer",
  "Video Editor",
  "Photo Editor",
  "Editor",
  "Audio Engineer",
  "Director",
  "Producer",
  "Crew",
];

interface StaffFormData {
  name: string;
  roleRates: RoleRate[];
  phone: string;
  email: string;
  defaultPayRatePerHour: number;
}

const emptyForm = (): StaffFormData => ({
  name: "",
  roleRates: [],
  phone: "",
  email: "",
  defaultPayRatePerHour: 0,
});

export default function StaffPage() {
  const { data, addCrewMember, updateCrewMember, deleteCrewMember } = useApp();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<StaffFormData>(emptyForm());
  const [saving, setSaving] = useState(false);

  // For adding a new role row in the form
  const [newRole, setNewRole] = useState<CrewRole | "">("");
  const [newRate, setNewRate] = useState<number>(0);

  function openAdd() {
    setEditingId(null);
    setForm(emptyForm());
    setNewRole("");
    setNewRate(0);
    setDialogOpen(true);
  }

  function openEdit(member: CrewMember) {
    setEditingId(member.id);
    setForm({
      name: member.name,
      roleRates: member.roleRates ?? [],
      phone: member.phone,
      email: member.email,
      defaultPayRatePerHour: Number(member.defaultPayRatePerHour ?? 0),
    });
    setNewRole("");
    setNewRate(0);
    setDialogOpen(true);
  }

  function addRoleRate() {
    if (!newRole) { toast.error("Select a role first"); return; }
    if (form.roleRates.some(rr => rr.role === newRole)) {
      toast.error("That role is already added");
      return;
    }
    setForm(f => ({
      ...f,
      roleRates: [...f.roleRates, { role: newRole as CrewRole, payRatePerHour: newRate }],
    }));
    setNewRole("");
    setNewRate(0);
  }

  function removeRoleRate(role: CrewRole) {
    setForm(f => ({ ...f, roleRates: f.roleRates.filter(rr => rr.role !== role) }));
  }

  function updateRoleRate(role: CrewRole, rate: number) {
    setForm(f => ({
      ...f,
      roleRates: f.roleRates.map(rr => rr.role === role ? { ...rr, payRatePerHour: rate } : rr),
    }));
  }

  async function handleSave() {
    if (!form.name.trim()) { toast.error("Name is required"); return; }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        roleRates: form.roleRates,
        phone: form.phone.trim(),
        email: form.email.trim(),
        defaultPayRatePerHour: form.defaultPayRatePerHour,
      };
      if (editingId) {
        await updateCrewMember(editingId, payload);
        toast.success("Staff member updated");
      } else {
        await addCrewMember(payload);
        toast.success("Staff member added");
      }
      setDialogOpen(false);
    } catch (e: any) {
      toast.error(e.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Remove ${name} from staff?`)) return;
    try {
      await deleteCrewMember(id);
      toast.success("Staff member removed");
    } catch (e: any) {
      toast.error(e.message || "Failed to delete");
    }
  }

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            Staff
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Assign roles and hourly pay rates to each crew member. Rates auto-fill when you add them to a project.
          </p>
        </div>
        <Button onClick={openAdd} className="gap-2">
          <UserPlus className="w-4 h-4" />
          Add Staff
        </Button>
      </div>

      {/* Staff list */}
      {data.crewMembers.length === 0 ? (
        <Card className="bg-card border-border">
          <CardContent className="py-12 text-center">
            <User className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">No staff members yet. Add your first crew member above.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {data.crewMembers.map(member => (
            <Card key={member.id} className="bg-card border-border hover:border-primary/40 transition-colors">
              <CardContent className="py-4 px-5">
                <div className="flex items-start gap-4">
                  {/* Avatar */}
                  <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-primary font-bold text-sm">
                      {member.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
                    </span>
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                      {member.name}
                    </p>

                    {/* Role + Rate table */}
                    {(member.roleRates ?? []).length > 0 ? (
                      <div className="mt-2 space-y-1">
                        {(member.roleRates ?? []).map(rr => (
                          <div key={rr.role} className="flex items-center gap-2">
                            <Badge variant="secondary" className="text-[10px] px-2 py-0 shrink-0">{rr.role}</Badge>
                            <div className="flex items-center gap-0.5 text-amber-400 text-xs font-bold">
                              <DollarSign className="w-3 h-3" />
                              {Number(rr.payRatePerHour).toFixed(0)}/hr
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground mt-1">No roles assigned yet</p>
                    )}

                    {(member.phone || member.email) && (
                      <p className="text-xs text-muted-foreground mt-2">
                        {[member.phone, member.email].filter(Boolean).join(" · ")}
                      </p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(member)}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => handleDelete(member.id, member.name)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              {editingId ? "Edit Staff Member" : "Add Staff Member"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {/* Name */}
            <div className="space-y-1.5">
              <Label>Name *</Label>
              <Input
                placeholder="Full name"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              />
            </div>

            {/* Roles + Rates */}
            <div className="space-y-2">
              <Label>Roles & Pay Rates</Label>
              <p className="text-xs text-muted-foreground">Add each role this person performs and their hourly rate for that role.</p>

              {/* Existing role-rate rows */}
              {form.roleRates.length > 0 && (
                <div className="space-y-2 mb-2">
                  {form.roleRates.map(rr => (
                    <div key={rr.role} className="flex items-center gap-2 bg-secondary/50 rounded-md px-3 py-2">
                      <Badge variant="secondary" className="text-[10px] shrink-0">{rr.role}</Badge>
                      <div className="flex items-center flex-1 gap-1">
                        <span className="text-muted-foreground text-sm">$</span>
                        <Input
                          type="number"
                          min="0"
                          step="5"
                          className="h-7 text-sm bg-transparent border-border w-20"
                          value={rr.payRatePerHour || ""}
                          onChange={e => updateRoleRate(rr.role, Number(e.target.value))}
                        />
                        <span className="text-xs text-muted-foreground">/hr</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-destructive"
                        onClick={() => removeRoleRate(rr.role)}
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {/* Add new role row */}
              <div className="flex items-center gap-2">
                <Select value={newRole} onValueChange={v => setNewRole(v as CrewRole)}>
                  <SelectTrigger className="flex-1 h-9 bg-secondary border-border text-sm">
                    <SelectValue placeholder="Select role..." />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border-border">
                    {ALL_ROLES.filter(r => !form.roleRates.some(rr => rr.role === r)).map(role => (
                      <SelectItem key={role} value={role}>{role}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex items-center gap-1">
                  <span className="text-muted-foreground text-sm">$</span>
                  <Input
                    type="number"
                    min="0"
                    step="5"
                    placeholder="0"
                    className="h-9 w-20 bg-secondary border-border text-sm"
                    value={newRate || ""}
                    onChange={e => setNewRate(Number(e.target.value))}
                  />
                </div>
                <Button size="sm" variant="outline" className="h-9 px-3" onClick={addRoleRate}>
                  <Plus className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>

            {/* Default/fallback rate */}
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                <DollarSign className="w-3.5 h-3.5 text-amber-400" />
                Default Rate (fallback)
              </Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                <Input
                  type="number"
                  min="0"
                  step="5"
                  placeholder="0"
                  className="pl-7"
                  value={form.defaultPayRatePerHour || ""}
                  onChange={e => setForm(f => ({ ...f, defaultPayRatePerHour: Number(e.target.value) }))}
                />
              </div>
              <p className="text-xs text-muted-foreground">Used if no role-specific rate is found.</p>
            </div>

            {/* Contact */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Phone</Label>
                <Input
                  placeholder="(555) 000-0000"
                  value={form.phone}
                  onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input
                  type="email"
                  placeholder="email@example.com"
                  value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : editingId ? "Save Changes" : "Add Staff Member"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
