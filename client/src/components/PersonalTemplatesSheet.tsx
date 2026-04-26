// ============================================================
// PersonalTemplatesSheet — Manage personal event templates
// Each user has their own template list
// ============================================================

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import type { PersonalEventTemplate } from "@/lib/types";
import { EVENT_COLORS, DEFAULT_TEMPLATES } from "@/components/PersonalEventDialog";
import { cn } from "@/lib/utils";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { nanoid } from "nanoid";

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function PersonalTemplatesSheet({ open, onClose }: Props) {
  const { profile, saveMyTemplates } = useAuth();
  const [templates, setTemplates] = useState<PersonalEventTemplate[]>([]);
  const [editingTemplate, setEditingTemplate] = useState<PersonalEventTemplate | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const saved = profile?.personalEventTemplates;
    setTemplates(saved?.length ? saved : DEFAULT_TEMPLATES.map(t => ({ ...t, id: nanoid(8) })));
  }, [open, profile]);

  function openAdd() {
    setEditingTemplate({ id: "", label: "", title: "", category: "personal", color: "" });
    setEditDialogOpen(true);
  }

  function openEdit(t: PersonalEventTemplate) {
    setEditingTemplate({ ...t });
    setEditDialogOpen(true);
  }

  function deleteTemplate(id: string) {
    setTemplates(ts => ts.filter(t => t.id !== id));
  }

  function saveEditingTemplate() {
    if (!editingTemplate) return;
    if (!editingTemplate.label.trim()) {
      toast.error("Label is required");
      return;
    }
    if (!editingTemplate.title.trim()) {
      toast.error("Default title is required");
      return;
    }
    if (editingTemplate.id) {
      // Update existing
      setTemplates(ts => ts.map(t => t.id === editingTemplate.id ? editingTemplate : t));
    } else {
      // Add new
      setTemplates(ts => [...ts, { ...editingTemplate, id: nanoid(8) }]);
    }
    setEditDialogOpen(false);
    setEditingTemplate(null);
  }

  async function handleSave() {
    setSaving(true);
    try {
      await saveMyTemplates(templates);
      toast.success("Templates saved");
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Failed to save templates");
    } finally {
      setSaving(false);
    }
  }

  function getColor(color: string) {
    return EVENT_COLORS.find(c => c.value === color) || EVENT_COLORS[0];
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              My Event Templates
            </DialogTitle>
          </DialogHeader>

          <p className="text-xs text-muted-foreground">
            These templates appear when you create a new personal event. Each family member has their own list.
          </p>

          <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
            {templates.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground text-sm">
                No templates yet. Add one below.
              </div>
            ) : (
              templates.map((t) => {
                const ec = getColor(t.color);
                return (
                  <div key={t.id} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border hover:bg-white/3 dark:hover:bg-white/3 transition-colors">
                    <div className={cn("w-3 h-3 rounded-full flex-shrink-0", ec.dot)} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-foreground truncate">{t.label}</div>
                      <div className="text-xs text-muted-foreground truncate">{t.title}</div>
                    </div>
                    <button
                      onClick={() => openEdit(t)}
                      className="p-1.5 rounded hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => deleteTemplate(t.id)}
                      className="p-1.5 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })
            )}
          </div>

          <Button variant="outline" size="sm" onClick={openAdd} className="w-full gap-1.5">
            <Plus className="w-3.5 h-3.5" />
            Add Template
          </Button>

          <DialogFooter>
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save Templates"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit/Add template dialog */}
      <Dialog open={editDialogOpen} onOpenChange={(v) => { if (!v) setEditDialogOpen(false); }}>
        <DialogContent className="sm:max-w-sm pointer-events-auto">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              {editingTemplate?.id ? "Edit Template" : "New Template"}
            </DialogTitle>
          </DialogHeader>

          {editingTemplate && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="tpl-label">Button Label</Label>
                <Input
                  id="tpl-label"
                  value={editingTemplate.label}
                  onChange={e => setEditingTemplate(t => t ? { ...t, label: e.target.value } : t)}
                  placeholder="e.g. Dentist"
                  autoFocus
                />
              </div>

              <div>
                <Label htmlFor="tpl-title">Default Event Title</Label>
                <Input
                  id="tpl-title"
                  value={editingTemplate.title}
                  onChange={e => setEditingTemplate(t => t ? { ...t, title: e.target.value } : t)}
                  placeholder="e.g. Dentist Appointment"
                />
              </div>

              <div>
                <Label htmlFor="tpl-category">Category</Label>
                <select
                  id="tpl-category"
                  value={editingTemplate.category}
                  onChange={e => setEditingTemplate(t => t ? { ...t, category: e.target.value } : t)}
                  className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-foreground"
                >
                  <option value="personal">Personal</option>
                  <option value="appointment">Appointment</option>
                  <option value="reminder">Reminder</option>
                </select>
              </div>

              <div>
                <Label className="text-xs text-muted-foreground uppercase tracking-wider">Color</Label>
                <div className="flex gap-2 mt-1.5">
                  {EVENT_COLORS.map(c => (
                    <button
                      key={c.value}
                      onClick={() => setEditingTemplate(t => t ? { ...t, color: c.value } : t)}
                      className={cn(
                        "w-7 h-7 rounded-full flex items-center justify-center transition-all",
                        c.dot,
                        editingTemplate.color === c.value ? "ring-2 ring-white ring-offset-2 ring-offset-background scale-110" : "opacity-60 hover:opacity-100"
                      )}
                      title={c.label}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>Cancel</Button>
            <Button onClick={saveEditingTemplate}>
              {editingTemplate?.id ? "Update" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
