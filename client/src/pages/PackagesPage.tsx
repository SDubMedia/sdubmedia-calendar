// ============================================================
// PackagesPage — Owner-only library of reusable services that drop into
// any proposal template's `package_row` blocks. Sub-Phase 1A delivery.
//
// Each package: name, icon (curated Lucide vocabulary), description,
// default price, optional crossed-out discount-from price, optional photo
// (data URL ≤500KB), deliverables list.
// ============================================================

import { useState } from "react";
import { useApp } from "@/contexts/AppContext";
import type { Package } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Trash2, Image as ImageIcon, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ICON_VOCABULARY, PACKAGE_ICON_KEYS } from "@/components/proposal/icons";
import { usePasteCleaner } from "@/lib/usePasteCleaner";
import { cleanPastedText } from "@/lib/cleanPaste";

const MAX_IMAGE_BYTES = 500_000;
const MAX_ICON_BYTES = 50_000;

interface PackageDraft {
  name: string;
  icon: string;
  iconCustomDataUrl?: string;
  description: string;
  defaultPrice: number;
  discountFromPrice: number | null;
  photoDataUrl: string;
  deliverables: string[];
}

function emptyDraft(): PackageDraft {
  return {
    name: "",
    icon: "heart",
    iconCustomDataUrl: "",
    description: "",
    defaultPrice: 0,
    discountFromPrice: null,
    photoDataUrl: "",
    deliverables: [],
  };
}

// Seed packages from the Wedding Day Proposal PDF — used by the "Try example
// packages" button on the empty state. Lets new users populate a realistic
// library in one click instead of typing each from scratch.
const EXAMPLE_PACKAGES: PackageDraft[] = [
  {
    name: "Full Coverage Wedding Day",
    icon: "heart",
    description: "Experience the joy of your wedding day again and again with our all-day wedding video coverage. From the early morning preparations to the last dance of the evening, we capture every heartfelt moment and detail.",
    defaultPrice: 1200,
    discountFromPrice: 3500,
    photoDataUrl: "",
    deliverables: ["All-day coverage from prep through reception", "Cinematic full-length wedding film", "Online delivery + private viewing link"],
  },
  {
    name: "Elopement Wedding Video",
    icon: "heart",
    description: "Capture the magic of your special day with our wedding elopement video service. We offer all day of dedicated coverage to ensure every precious moment is beautifully documented. From intimate vows to spontaneous celebrations.",
    defaultPrice: 2500,
    discountFromPrice: null,
    photoDataUrl: "",
    deliverables: ["All-day elopement coverage", "Full ceremony edit included", "Cinematic feature film"],
  },
  {
    name: "Engagement Video",
    icon: "sparkles",
    description: "Your engagement is a special and exciting time in your lives, and we are dedicated to capturing it with up to 2 hours of exceptional, discreet coverage.",
    defaultPrice: 500,
    discountFromPrice: null,
    photoDataUrl: "",
    deliverables: ["Up to 2 hours of coverage", "Cinematic engagement film", "Music-licensed final delivery"],
  },
  {
    name: "Ceremony Edit",
    icon: "sparkles",
    description: "Capture the essence of your wedding ceremony with our specialized edit. We meticulously film every significant moment, from the entrance to the exchange of vows and rings.",
    defaultPrice: 800,
    discountFromPrice: null,
    photoDataUrl: "",
    deliverables: ["Full ceremony edit (entrance through recessional)", "Multiple camera angles", "Audio-balanced for vows & readings"],
  },
  {
    name: "Toast Edit",
    icon: "champagne",
    description: "Capture the heartfelt words and joyous moments of your wedding toasts with our specialized edit. We carefully film each toast, ensuring we catch every laugh, tear, and touching story.",
    defaultPrice: 600,
    discountFromPrice: null,
    photoDataUrl: "",
    deliverables: ["Edit of all wedding toasts", "Audio-balanced and color-graded", "Shareable highlight version"],
  },
  {
    name: "Sizzle Reel",
    icon: "film",
    description: "Capture the highlights of your special day with our 60-second sizzle reel. We expertly condense the most memorable moments into a dynamic and engaging video, perfect for sharing on social media.",
    defaultPrice: 200,
    discountFromPrice: null,
    photoDataUrl: "",
    deliverables: ["60-second highlight reel", "Vertical & horizontal exports", "Perfect for social media"],
  },
  {
    name: "Additional Videographer",
    icon: "cameras",
    description: "Hiring a second videographer significantly enhances the quality of your wedding film. With an additional videographer, we can capture more angles and moments, ensuring a more comprehensive and dynamic coverage.",
    defaultPrice: 500,
    discountFromPrice: null,
    photoDataUrl: "",
    deliverables: ["Second camera operator on-site", "Additional angles and reactions", "Richer, more dynamic edit"],
  },
  {
    name: "Rehearsal Dinner",
    icon: "plate",
    description: "Capture the special moments of your rehearsal dinner with our dedicated coverage. Often filled with heartfelt speeches, toasts, and memorable moments — our 4-hour coverage ensures these pre-wedding moments are beautifully documented.",
    defaultPrice: 1000,
    discountFromPrice: null,
    photoDataUrl: "",
    deliverables: ["4 hours of dedicated coverage", "Speeches and toasts captured", "Family interactions and atmosphere"],
  },
  {
    name: "Wedding Weekend (additional day)",
    icon: "calendar",
    description: "Enhance your wedding experience with our comprehensive weekend wedding service. This package includes full wedding day coverage plus one additional day of filming for pre-wedding dinners, parties, or other planned events. *Travel rates apply*",
    defaultPrice: 1500,
    discountFromPrice: null,
    photoDataUrl: "",
    deliverables: ["One additional day of coverage", "Pre-wedding dinners or events", "Footage integrated into final film"],
  },
  {
    name: "Expedite Edit — 2 Weeks",
    icon: "gauge",
    description: "Geoff prioritizes your wedding video above all other projects, ensuring your wedding film receives the utmost attention and care. Your beautifully crafted wedding film will be completed within 14 days.",
    defaultPrice: 1800,
    discountFromPrice: null,
    photoDataUrl: "",
    deliverables: ["14-day turnaround guarantee", "Priority queue placement", "Same quality, faster delivery"],
  },
];

function packageToDraft(p: Package): PackageDraft {
  return {
    name: p.name,
    icon: p.icon,
    iconCustomDataUrl: p.iconCustomDataUrl,
    description: p.description,
    defaultPrice: p.defaultPrice,
    discountFromPrice: p.discountFromPrice,
    photoDataUrl: p.photoDataUrl,
    deliverables: [...p.deliverables],
  };
}

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

export default function PackagesPage() {
  const { data, addPackage, updatePackage, deletePackage } = useApp();
  const packages = data.packages;

  const [editing, setEditing] = useState<{ id: string | null; draft: PackageDraft } | null>(null);
  const [saving, setSaving] = useState(false);
  const [imageError, setImageError] = useState("");

  function openNew() {
    setImageError("");
    setEditing({ id: null, draft: emptyDraft() });
  }

  function openEdit(p: Package) {
    setImageError("");
    setEditing({ id: p.id, draft: packageToDraft(p) });
  }

  function close() {
    setEditing(null);
    setImageError("");
  }

  async function save() {
    if (!editing) return;
    if (!editing.draft.name.trim()) {
      toast.error("Name is required");
      return;
    }
    setSaving(true);
    try {
      if (editing.id) {
        await updatePackage(editing.id, editing.draft);
        toast.success("Package updated");
      } else {
        await addPackage({ ...editing.draft, iconCustomDataUrl: editing.draft.iconCustomDataUrl ?? "", sortOrder: packages.length });
        toast.success("Package created");
      }
      close();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this package? Templates referencing it will show 'package not found'.")) return;
    try {
      await deletePackage(id);
      toast.success("Package deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  }

  function patchDraft(partial: Partial<PackageDraft>) {
    setEditing(s => (s ? { ...s, draft: { ...s.draft, ...partial } } : s));
  }

  // Paste handlers — strip PDF copy artifacts (NBSPs, "o f" → "of",
  // collapsed whitespace, smart quotes) before the value lands in state.
  const handleNamePaste = usePasteCleaner(next => patchDraft({ name: next }));
  const handleDescPaste = usePasteCleaner(next => patchDraft({ description: next }));

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    if (file.size > MAX_IMAGE_BYTES) {
      setImageError(`Image is ${(file.size / 1000).toFixed(0)}KB — please use one under ${MAX_IMAGE_BYTES / 1000}KB.`);
      return;
    }
    try {
      const dataUrl = await fileToDataUrl(file);
      setImageError("");
      patchDraft({ photoDataUrl: dataUrl });
    } catch (err) {
      setImageError(err instanceof Error ? err.message : "Upload failed");
    }
  }

  function addDeliverable() {
    if (!editing) return;
    patchDraft({ deliverables: [...editing.draft.deliverables, ""] });
  }

  function updateDeliverable(idx: number, value: string) {
    if (!editing) return;
    const next = [...editing.draft.deliverables];
    next[idx] = value;
    patchDraft({ deliverables: next });
  }

  function removeDeliverable(idx: number) {
    if (!editing) return;
    patchDraft({ deliverables: editing.draft.deliverables.filter((_, i) => i !== idx) });
  }

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            Packages
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Reusable services that drop into any proposal template.
          </p>
        </div>
        <Button onClick={openNew} className="gap-2">
          <Plus className="w-4 h-4" /> New package
        </Button>
      </div>

      {packages.length === 0 ? (
        <div className="border-2 border-dashed border-border rounded-lg p-12 text-center">
          <p className="text-sm text-muted-foreground mb-4">
            No packages yet. Create your first reusable service — once built, you can drop it into any proposal template's page.
          </p>
          <div className="flex items-center justify-center gap-2">
            <Button onClick={openNew} variant="outline" className="gap-2">
              <Plus className="w-4 h-4" /> New package
            </Button>
            <Button
              onClick={async () => {
                if (!confirm(`Seed ${EXAMPLE_PACKAGES.length} example packages from the Wedding Day Proposal PDF? You can edit or delete them afterwards.`)) return;
                try {
                  for (let i = 0; i < EXAMPLE_PACKAGES.length; i++) {
                    await addPackage({ ...EXAMPLE_PACKAGES[i], iconCustomDataUrl: "", sortOrder: i });
                  }
                  toast.success(`${EXAMPLE_PACKAGES.length} example packages added`);
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Seed failed");
                }
              }}
              variant="default"
              className="gap-2"
            >
              Try example packages
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {packages.map(pkg => {
            const Icon = ICON_VOCABULARY[pkg.icon] ?? ICON_VOCABULARY.heart;
            return (
              <button
                key={pkg.id}
                onClick={() => openEdit(pkg)}
                className="text-left bg-card border border-border rounded-xl p-5 hover:border-primary/50 transition-colors group"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="w-12 h-12 rounded-full bg-slate-900 text-white flex items-center justify-center shrink-0">
                    <Icon className="w-5 h-5" strokeWidth={1.5} />
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); remove(pkg.id); }}
                    className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-destructive transition-opacity"
                    title="Delete"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <h3 className="text-base font-semibold text-foreground mb-1 truncate">
                  {pkg.name || "(unnamed)"}
                </h3>
                {pkg.description && (
                  <p className="text-xs text-muted-foreground line-clamp-2 mb-3">
                    {pkg.description}
                  </p>
                )}
                <div className="flex items-baseline gap-2">
                  {pkg.discountFromPrice && pkg.discountFromPrice > pkg.defaultPrice && (
                    <span className="text-xs text-muted-foreground line-through font-mono">
                      ${pkg.discountFromPrice.toFixed(2)}
                    </span>
                  )}
                  <span className="text-lg font-bold text-foreground font-mono">
                    ${pkg.defaultPrice.toFixed(2)}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Edit modal */}
      <Dialog open={editing !== null} onOpenChange={open => { if (!open) close(); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Edit package" : "New package"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="pkg-name">Name</Label>
                <Input
                  id="pkg-name"
                  value={editing.draft.name}
                  onChange={e => patchDraft({ name: e.target.value })}
                  onPaste={handleNamePaste}
                  placeholder="Full Coverage Wedding Day"
                />
              </div>

              <div>
                <Label className="block mb-2">Icon</Label>
                {/* Live preview of how the navy circle will render */}
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-16 h-16 rounded-full bg-slate-900 text-white flex items-center justify-center shrink-0 overflow-hidden">
                    {editing.draft.iconCustomDataUrl ? (
                      <img src={editing.draft.iconCustomDataUrl} alt="" className="w-full h-full object-contain p-2" />
                    ) : (() => {
                      const I = ICON_VOCABULARY[editing.draft.icon] ?? ICON_VOCABULARY.heart;
                      return <I className="w-7 h-7" strokeWidth={1.25} />;
                    })()}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {editing.draft.iconCustomDataUrl
                      ? "Custom icon — will scale into the navy circle on every package row."
                      : "Pick a built-in icon below, or upload your own."}
                  </p>
                </div>

                <div className={cn(
                  "flex flex-wrap gap-2",
                  editing.draft.iconCustomDataUrl && "opacity-50",
                )}>
                  {PACKAGE_ICON_KEYS.map(key => {
                    const I = ICON_VOCABULARY[key];
                    return (
                      <button
                        key={key}
                        onClick={() => patchDraft({ icon: key, iconCustomDataUrl: "" })}
                        className={cn(
                          "w-10 h-10 rounded-full flex items-center justify-center border-2 transition-colors",
                          editing.draft.icon === key && !editing.draft.iconCustomDataUrl
                            ? "bg-slate-900 text-white border-primary"
                            : "bg-secondary text-muted-foreground border-transparent hover:border-border"
                        )}
                        title={key}
                      >
                        <I className="w-4 h-4" strokeWidth={1.5} />
                      </button>
                    );
                  })}
                </div>

                {/* Custom upload — recommended dimensions called out so the
                    uploaded asset displays properly in the navy circle. */}
                <div className="mt-3 pt-3 border-t border-border">
                  <p className="text-[11px] text-muted-foreground mb-2">
                    <strong>Or upload your own.</strong> Recommended: 96×96px or larger, transparent PNG / SVG. Max {MAX_ICON_BYTES / 1000}KB.
                  </p>
                  <div className="flex items-center gap-2">
                    <label className="flex-1 flex items-center justify-center gap-2 py-2 border-2 border-dashed border-border rounded cursor-pointer hover:border-primary/50 hover:bg-secondary/30 transition-colors text-xs text-muted-foreground">
                      <input
                        type="file"
                        accept="image/png,image/svg+xml,image/jpeg"
                        onChange={async e => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          e.target.value = "";
                          if (file.size > MAX_ICON_BYTES) {
                            setImageError(`Icon is ${(file.size / 1000).toFixed(0)}KB — please use one under ${MAX_ICON_BYTES / 1000}KB.`);
                            return;
                          }
                          try {
                            const dataUrl = await fileToDataUrl(file);
                            setImageError("");
                            patchDraft({ iconCustomDataUrl: dataUrl });
                          } catch (err) {
                            setImageError(err instanceof Error ? err.message : "Upload failed");
                          }
                        }}
                        className="hidden"
                      />
                      <ImageIcon className="w-3.5 h-3.5" />
                      {editing.draft.iconCustomDataUrl ? "Replace custom icon" : "Upload custom icon"}
                    </label>
                    {editing.draft.iconCustomDataUrl && (
                      <button
                        onClick={() => patchDraft({ iconCustomDataUrl: "" })}
                        className="text-xs text-muted-foreground hover:text-destructive px-2"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div>
                <Label htmlFor="pkg-desc">Description</Label>
                <textarea
                  id="pkg-desc"
                  value={editing.draft.description}
                  onChange={e => patchDraft({ description: e.target.value })}
                  onPaste={handleDescPaste}
                  rows={10}
                  className="w-full px-3 py-2 text-sm leading-relaxed rounded border border-border bg-background resize-y min-h-[200px]"
                  placeholder="Experience the joy of your wedding day again and again with our all-day video coverage…"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="pkg-price">Price</Label>
                  <Input
                    id="pkg-price"
                    type="text"
                    inputMode="decimal"
                    value={editing.draft.defaultPrice || ""}
                    onChange={e => patchDraft({ defaultPrice: Number(e.target.value) || 0 })}
                    placeholder="1200"
                  />
                </div>
                <div>
                  <Label htmlFor="pkg-discount">Crossed-out from (optional)</Label>
                  <Input
                    id="pkg-discount"
                    type="text"
                    inputMode="decimal"
                    value={editing.draft.discountFromPrice ?? ""}
                    onChange={e => {
                      const v = e.target.value.trim();
                      patchDraft({ discountFromPrice: v === "" ? null : Number(v) || null });
                    }}
                    placeholder="3500"
                  />
                </div>
              </div>

              <div>
                <Label className="block mb-2">Photo (optional)</Label>
                {editing.draft.photoDataUrl ? (
                  <div className="space-y-2">
                    <img
                      src={editing.draft.photoDataUrl}
                      alt=""
                      className="w-full h-40 object-cover rounded border border-border"
                    />
                    <button
                      onClick={() => patchDraft({ photoDataUrl: "" })}
                      className="text-xs text-muted-foreground hover:text-destructive"
                    >
                      Remove photo
                    </button>
                  </div>
                ) : (
                  <label className="flex items-center justify-center gap-2 py-4 border-2 border-dashed border-border rounded cursor-pointer hover:border-primary/50 hover:bg-secondary/30 transition-colors text-sm text-muted-foreground">
                    <input type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" />
                    <ImageIcon className="w-4 h-4" /> Upload photo (≤500KB)
                  </label>
                )}
                {imageError && <p className="text-xs text-destructive mt-1">{imageError}</p>}
              </div>

              <div>
                <Label className="block mb-2">Deliverables</Label>
                <div className="space-y-2">
                  {editing.draft.deliverables.map((d, idx) => (
                    <div key={idx} className="flex gap-2">
                      <Input
                        value={d}
                        onChange={e => updateDeliverable(idx, e.target.value)}
                        onPaste={e => {
                          const pasted = e.clipboardData.getData("text/plain");
                          const cleaned = cleanPastedText(pasted);
                          if (cleaned === pasted) return;
                          e.preventDefault();
                          const target = e.currentTarget as HTMLInputElement;
                          const start = target.selectionStart ?? target.value.length;
                          const end = target.selectionEnd ?? target.value.length;
                          updateDeliverable(idx, target.value.slice(0, start) + cleaned + target.value.slice(end));
                        }}
                        placeholder="5 professionally edited digital images"
                      />
                      <button
                        onClick={() => removeDeliverable(idx)}
                        className="p-2 text-muted-foreground hover:text-destructive"
                        title="Remove"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                  <Button onClick={addDeliverable} variant="outline" size="sm" className="gap-1.5 w-full">
                    <Plus className="w-3.5 h-3.5" /> Add deliverable
                  </Button>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={close} variant="outline" disabled={saving}>Cancel</Button>
            <Button onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
