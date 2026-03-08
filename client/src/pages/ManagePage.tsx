// ============================================================
// ManagePage — Manage crew, project types
// Design: Dark Cinematic Studio
// ============================================================

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, Edit3, Trash2, Users, Briefcase } from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import type { CrewMember, ProjectType, CrewRole } from "@/lib/types";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const ALL_ROLES: CrewRole[] = ["Videographer", "Main Videographer", "Secondary Videographer", "Photographer", "Editor", "Video Editor", "Photo Editor", "Audio Engineer", "Director", "Producer", "Crew"];

const ROLE_LABELS: Record<CrewRole, string> = {
  Videographer: "Videographer",
  "Main Videographer": "Main Videographer",
  "Secondary Videographer": "Secondary Videographer",
  Photographer: "Photographer",
  Editor: "Editor",
  "Video Editor": "Video Editor",
  "Photo Editor": "Photo Editor",
  "Audio Engineer": "Audio Engineer",
  Director: "Director",
  Producer: "Producer",
  Crew: "Crew",
};

export default function ManagePage() {
  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-4 border-b border-border bg-card/50">
        <h1 className="text-xl font-semibold text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Manage</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Crew members, project types, and settings</p>
      </div>
      <div className="flex-1 overflow-auto p-6">
        <Tabs defaultValue="crew">
          <TabsList className="bg-secondary border border-border mb-6">
            <TabsTrigger value="crew" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Users className="w-3.5 h-3.5 mr-1.5" /> Crew & Editors
            </TabsTrigger>
            <TabsTrigger value="types" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Briefcase className="w-3.5 h-3.5 mr-1.5" /> Project Types
            </TabsTrigger>
          </TabsList>
          <TabsContent value="crew"><CrewTab /></TabsContent>
          <TabsContent value="types"><ProjectTypesTab /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

// ---- Crew Tab ----
function CrewTab() {
  const { data, addCrewMember, updateCrewMember, deleteCrewMember } = useApp();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CrewMember | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CrewMember | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [roles, setRoles] = useState<CrewRole[]>([]);
  const [defaultPayRate, setDefaultPayRate] = useState<number>(0);

  const openAdd = () => { setEditing(null); setName(""); setPhone(""); setEmail(""); setRoles([]); setDefaultPayRate(0); setDialogOpen(true); };
  const openEdit = (m: CrewMember) => { setEditing(m); setName(m.name); setPhone(m.phone); setEmail(m.email); setRoles(m.roles); setDefaultPayRate(m.defaultPayRatePerHour ?? 0); setDialogOpen(true); };

  const toggleRole = (r: CrewRole) => setRoles((prev) => prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]);

  const handleSave = () => {
    if (!name) { toast.error("Name is required"); return; }
    if (editing) {
      updateCrewMember(editing.id, { name, phone, email, roles, defaultPayRatePerHour: defaultPayRate });
      toast.success("Crew member updated");
    } else {
      addCrewMember({ name, phone, email, roles, defaultPayRatePerHour: defaultPayRate });
      toast.success("Crew member added");
    }
    setDialogOpen(false);
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button onClick={openAdd} className="bg-primary text-primary-foreground hover:bg-primary/90 gap-2">
          <Plus className="w-4 h-4" /> Add Person
        </Button>
      </div>
      {data.crewMembers.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">No crew members yet.</div>
      ) : (
        data.crewMembers.map((member) => (
          <div key={member.id} className="bg-card border border-border rounded-lg p-4 flex items-center gap-4">
            <div className="w-9 h-9 rounded-full bg-primary/15 flex items-center justify-center flex-shrink-0 text-primary font-semibold text-sm" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              {member.name.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-foreground">{member.name}</div>
              <div className="flex flex-wrap gap-1 mt-1">
                {member.roles.map((r) => (
                  <span key={r} className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground border border-border">
                    {ROLE_LABELS[r]}
                  </span>
                ))}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {member.phone}{member.phone && member.email ? " · " : ""}{member.email}
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={() => openEdit(member)}>
                <Edit3 className="w-3.5 h-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => setDeleteTarget(member)}>
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        ))
      )}

      <Dialog open={dialogOpen} onOpenChange={(o) => !o && setDialogOpen(false)}>
        <DialogContent className="bg-card border-border text-foreground max-w-md">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{editing ? "Edit Crew Member" : "Add Crew Member"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Name *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} className="bg-secondary border-border" placeholder="Full name" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Phone</Label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} className="bg-secondary border-border" placeholder="615-000-0000" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Email</Label>
                <Input value={email} onChange={(e) => setEmail(e.target.value)} className="bg-secondary border-border" placeholder="email@example.com" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Default Pay Rate ($/hr)</Label>
              <Input type="number" value={defaultPayRate} onChange={(e) => setDefaultPayRate(parseFloat(e.target.value) || 0)} className="bg-secondary border-border" placeholder="0" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Roles</Label>
              <div className="flex flex-wrap gap-2">
                {ALL_ROLES.map((r) => (
                  <button
                    key={r}
                    onClick={() => toggleRole(r)}
                    className={cn(
                      "px-2.5 py-1 rounded text-xs border transition-colors",
                      roles.includes(r)
                        ? "bg-primary/20 border-primary/50 text-primary"
                        : "border-border text-muted-foreground hover:border-primary/30"
                    )}
                  >
                    {ROLE_LABELS[r]}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} className="bg-primary text-primary-foreground hover:bg-primary/90">
              {editing ? "Save Changes" : "Add Person"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent className="bg-card border-border text-foreground">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Crew Member?</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              This will permanently delete "{deleteTarget?.name}".
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-border">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { deleteCrewMember(deleteTarget!.id); toast.success("Deleted"); setDeleteTarget(null); }} className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ---- Project Types Tab ----
function ProjectTypesTab() {
  const { data, addProjectType, updateProjectType, deleteProjectType } = useApp();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ProjectType | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProjectType | null>(null);
  const [name, setName] = useState("");

  const openAdd = () => { setEditing(null); setName(""); setDialogOpen(true); };
  const openEdit = (pt: ProjectType) => { setEditing(pt); setName(pt.name); setDialogOpen(true); };

  const handleSave = () => {
    if (!name) { toast.error("Name is required"); return; }
    if (editing) {
      updateProjectType(editing.id, { name });
      toast.success("Project type updated");
    } else {
      addProjectType({ name });
      toast.success("Project type added");
    }
    setDialogOpen(false);
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button onClick={openAdd} className="bg-primary text-primary-foreground hover:bg-primary/90 gap-2">
          <Plus className="w-4 h-4" /> Add Type
        </Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {data.projectTypes.map((pt) => (
          <div key={pt.id} className="bg-card border border-border rounded-lg px-4 py-3 flex items-center gap-3">
            <div className="w-7 h-7 rounded bg-primary/15 flex items-center justify-center flex-shrink-0">
              <Briefcase className="w-3.5 h-3.5 text-primary" />
            </div>
            <span className="flex-1 text-sm text-foreground">{pt.name}</span>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => openEdit(pt)}>
                <Edit3 className="w-3.5 h-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => setDeleteTarget(pt)}>
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={dialogOpen} onOpenChange={(o) => !o && setDialogOpen(false)}>
        <DialogContent className="bg-card border-border text-foreground max-w-sm">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{editing ? "Edit Project Type" : "Add Project Type"}</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <Label className="text-xs text-muted-foreground">Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="bg-secondary border-border mt-1.5" placeholder="e.g. Headshot Photography" />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} className="bg-primary text-primary-foreground hover:bg-primary/90">
              {editing ? "Save" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent className="bg-card border-border text-foreground">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Project Type?</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              This will permanently delete "{deleteTarget?.name}".
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-border">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { deleteProjectType(deleteTarget!.id); toast.success("Deleted"); setDeleteTarget(null); }} className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
