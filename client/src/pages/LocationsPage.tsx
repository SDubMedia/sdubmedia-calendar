// ============================================================
// LocationsPage — Saved shoot locations
// Design: Dark Cinematic Studio
// ============================================================

import { useState } from "react";
import { Plus, MapPin, Edit3, Trash2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useApp } from "@/contexts/AppContext";
import type { Location } from "@/lib/types";
import { toast } from "sonner";

interface LocationFormData {
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
}

const emptyForm = (): LocationFormData => ({
  name: "", address: "", city: "", state: "TN", zip: "",
});

export default function LocationsPage() {
  const { data, addLocation, updateLocation, deleteLocation } = useApp();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingLocation, setEditingLocation] = useState<Location | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Location | null>(null);
  const [form, setForm] = useState<LocationFormData>(emptyForm());

  const openAdd = () => { setEditingLocation(null); setForm(emptyForm()); setDialogOpen(true); };
  const openEdit = (loc: Location) => {
    setEditingLocation(loc);
    setForm({ name: loc.name, address: loc.address, city: loc.city, state: loc.state, zip: loc.zip });
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!form.name || !form.address) { toast.error("Name and address are required"); return; }
    if (editingLocation) {
      updateLocation(editingLocation.id, form);
      toast.success("Location updated");
    } else {
      addLocation(form);
      toast.success("Location added");
    }
    setDialogOpen(false);
  };

  const getMapsUrl = (loc: Location) =>
    `https://maps.google.com/?q=${encodeURIComponent(`${loc.address}, ${loc.city}, ${loc.state} ${loc.zip}`)}`;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card/50">
        <div>
          <h1 className="text-xl font-semibold text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Locations</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{data.locations.length} saved location{data.locations.length !== 1 ? "s" : ""}</p>
        </div>
        <Button onClick={openAdd} className="bg-primary text-primary-foreground hover:bg-primary/90 gap-2">
          <Plus className="w-4 h-4" /> Add Location
        </Button>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {data.locations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
            <MapPin className="w-12 h-12 mb-3 opacity-30" />
            <p className="text-sm">No locations saved yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {data.locations.map((loc) => (
              <div key={loc.id} className="bg-card border border-border rounded-lg p-4 hover:border-border/80 transition-colors">
                <div className="flex items-start justify-between mb-2">
                  <div className="w-8 h-8 rounded-md bg-primary/15 flex items-center justify-center flex-shrink-0">
                    <MapPin className="w-4 h-4 text-primary" />
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => openEdit(loc)}>
                      <Edit3 className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => setDeleteTarget(loc)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
                <div className="font-medium text-foreground text-sm mb-1" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{loc.name}</div>
                <div className="text-xs text-muted-foreground leading-relaxed">
                  {loc.address}<br />
                  {loc.city}, {loc.state} {loc.zip}
                </div>
                <a
                  href={getMapsUrl(loc)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 text-xs text-primary flex items-center gap-1 hover:underline"
                >
                  <ExternalLink className="w-3 h-3" /> Open in Maps
                </a>
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
              {editingLocation ? "Edit Location" : "Add Location"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Location Name *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="bg-secondary border-border" placeholder="e.g. CBSR Nashville" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Street Address *</Label>
              <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="bg-secondary border-border" placeholder="123 Main St" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-1 space-y-1.5">
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
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} className="bg-primary text-primary-foreground hover:bg-primary/90">
              {editingLocation ? "Save Changes" : "Add Location"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent className="bg-card border-border text-foreground">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Location?</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              This will permanently delete "{deleteTarget?.name}". This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-border">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { deleteLocation(deleteTarget!.id); toast.success("Location deleted"); setDeleteTarget(null); }} className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
