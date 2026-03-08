// ============================================================
// Staff Page — Manage crew members and their default pay rates
// Design: Dark Cinematic Studio | Amber accent on charcoal
// ============================================================

import { useState } from "react";
import { useApp } from "@/contexts/AppContext";
import type { CrewMember, CrewRole } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { UserPlus, Pencil, Trash2, DollarSign, User } from "lucide-react";
import { toast } from "sonner";
import { nanoid } from "nanoid";

const ALL_ROLES = [
  "Main Videographer",
  "Secondary Videographer",
  "Photographer",
  "Video Editor",
  "Photo Editor",
  "Audio Engineer",
  "Director",
  "Producer",
];

interface StaffFormData {
  name: string;
  roles: string[];
  phone: string;
  email: string;
  defaultPayRatePerHour: number;
}

const emptyForm = (): StaffFormData => ({
  name: "",
  roles: [],
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

  function openAdd() {
    setEditingId(null);
    setForm(emptyForm());
    setDialogOpen(true);
  }

  function openEdit(member: CrewMember) {
    setEditingId(member.id);
    setForm({
      name: member.name,
      roles: member.roles,
      phone: member.phone,
      email: member.email,
      defaultPayRatePerHour: Number(member.defaultPayRatePerHour ?? 0),
    });
    setDialogOpen(true);
  }

  function toggleRole(role: string) {
    setForm(f => ({
      ...f,
      roles: (f.roles.includes(role)
        ? f.roles.filter(r => r !== role)
        : [...f.roles, role]) as CrewRole[],
    }));
  }

  async function handleSave() {
    if (!form.name.trim()) { toast.error("Name is required"); return; }
    setSaving(true);
    try {
      if (editingId) {
        await updateCrewMember(editingId, {
          name: form.name.trim(),
          roles: form.roles as CrewRole[],
          phone: form.phone.trim(),
          email: form.email.trim(),
          defaultPayRatePerHour: form.defaultPayRatePerHour,
        });
        toast.success("Staff member updated");
      } else {
        await addCrewMember({
          name: form.name.trim(),
          roles: form.roles as CrewRole[],
          phone: form.phone.trim(),
          email: form.email.trim(),
          defaultPayRatePerHour: form.defaultPayRatePerHour,
        });
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
            Set each crew member's default hourly pay rate — it will auto-fill when you add them to a project.
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
                  <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                    <span className="text-primary font-bold text-sm">
                      {member.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
                    </span>
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                        {member.name}
                      </p>
                      <div className="flex items-center gap-1 bg-amber-500/15 text-amber-400 rounded-md px-2 py-0.5">
                        <DollarSign className="w-3 h-3" />
                        <span className="text-xs font-bold">{Number(member.defaultPayRatePerHour ?? 0).toFixed(0)}/hr</span>
                      </div>
                    </div>
                    {member.roles.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {member.roles.map(role => (
                          <Badge key={role} variant="secondary" className="text-[10px] px-2 py-0">
                            {role}
                          </Badge>
                        ))}
                      </div>
                    )}
                    {(member.phone || member.email) && (
                      <p className="text-xs text-muted-foreground mt-1.5">
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

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Name *</Label>
              <Input
                placeholder="Full name"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              />
            </div>

            {/* Pay rate — most prominent field */}
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                <DollarSign className="w-3.5 h-3.5 text-amber-400" />
                Default Hourly Pay Rate
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
              <p className="text-xs text-muted-foreground">This rate will auto-fill when you add this person to a project.</p>
            </div>

            <div className="space-y-1.5">
              <Label>Roles</Label>
              <div className="flex flex-wrap gap-2">
                {ALL_ROLES.map(role => (
                  <button
                    key={role}
                    type="button"
                    onClick={() => toggleRole(role)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
                      form.roles.includes(role)
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-transparent text-muted-foreground border-border hover:border-primary/50"
                    }`}
                  >
                    {role}
                  </button>
                ))}
              </div>
            </div>

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
