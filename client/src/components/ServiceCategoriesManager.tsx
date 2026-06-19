// ============================================================
// ServiceCategoriesManager — Manage page UI for the hierarchical
// pricing model: Category → Service → Variant.
//
// Each category is a card. Inside, services are rows with their
// default price + a variant list. The owner can edit prices here;
// changes flow into projects when those services are picked.
// ============================================================

import { useState } from "react";
import { useApp } from "@/contexts/AppContext";
import type { ServiceCategory, Service, ServiceVariant } from "@/lib/types";
import { Plus, Trash2, ChevronDown, ChevronRight, Pencil, Save, X } from "lucide-react";
import { toast } from "sonner";

export default function ServiceCategoriesManager() {
  const { data, addServiceCategory } = useApp();
  const [newCategoryName, setNewCategoryName] = useState("");
  const [adding, setAdding] = useState(false);

  const handleAddCategory = async () => {
    const name = newCategoryName.trim();
    if (!name) { toast.error("Category name is required"); return; }
    try {
      await addServiceCategory({ name, position: data.serviceCategories.length });
      setNewCategoryName("");
      setAdding(false);
      toast.success(`Added "${name}"`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add category");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            Service Categories
          </h2>
          <p className="text-sm text-muted-foreground">
            Bundle the work you sell — e.g. "Real Estate Shoot" with Photos, Video, and Drone services. Set prices here; they auto-fill when you create a project.
          </p>
        </div>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90"
          >
            <Plus className="w-4 h-4" /> Add Category
          </button>
        )}
      </div>

      {adding && (
        <div className="rounded-lg border border-border bg-secondary/30 p-3 flex items-center gap-2">
          <input
            type="text"
            autoFocus
            value={newCategoryName}
            onChange={(e) => setNewCategoryName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleAddCategory(); if (e.key === "Escape") { setAdding(false); setNewCategoryName(""); } }}
            placeholder="Category name (e.g. Real Estate Shoot)"
            className="flex-1 bg-background border border-border rounded px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <button onClick={handleAddCategory} className="px-3 py-1.5 rounded bg-primary text-primary-foreground text-sm">Add</button>
          <button onClick={() => { setAdding(false); setNewCategoryName(""); }} className="px-3 py-1.5 rounded bg-secondary text-muted-foreground text-sm">Cancel</button>
        </div>
      )}

      {data.serviceCategories.length === 0 && !adding && (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <p className="text-sm text-muted-foreground">
            No categories yet. Add one above to start building bundles.
          </p>
        </div>
      )}

      <div className="space-y-3">
        {data.serviceCategories.map((cat) => (
          <CategoryCard key={cat.id} category={cat} />
        ))}
      </div>
    </div>
  );
}

function CategoryCard({ category }: { category: ServiceCategory }) {
  const { data, updateServiceCategory, deleteServiceCategory, addService } = useApp();
  const [expanded, setExpanded] = useState(true);
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState(category.name);
  const [addingService, setAddingService] = useState(false);
  const [newServiceName, setNewServiceName] = useState("");
  const [newServicePrice, setNewServicePrice] = useState("0");
  const [newServiceCost, setNewServiceCost] = useState("0");

  const services = data.services.filter(s => s.categoryId === category.id);

  const handleRename = async () => {
    const trimmed = name.trim();
    if (!trimmed) { toast.error("Name required"); return; }
    if (trimmed === category.name) { setEditingName(false); return; }
    try {
      await updateServiceCategory(category.id, { name: trimmed });
      setEditingName(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update");
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(`Delete "${category.name}" and all its services? This won't affect existing projects.`)) return;
    try {
      await deleteServiceCategory(category.id);
      toast.success(`Deleted "${category.name}"`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
    }
  };

  const handleAddService = async () => {
    const sname = newServiceName.trim();
    if (!sname) { toast.error("Service name is required"); return; }
    try {
      await addService({
        categoryId: category.id,
        name: sname,
        defaultPrice: Number(newServicePrice) || 0,
        defaultCost: Number(newServiceCost) || 0,
        position: services.length,
      });
      setNewServiceName("");
      setNewServicePrice("0");
      setNewServiceCost("0");
      setAddingService(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add service");
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 bg-secondary/30">
        <button onClick={() => setExpanded(v => !v)} className="text-muted-foreground hover:text-foreground">
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
        {editingName ? (
          <>
            <input
              type="text"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleRename(); if (e.key === "Escape") { setEditingName(false); setName(category.name); } }}
              className="flex-1 bg-background border border-border rounded px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <button onClick={handleRename} className="p-1 text-primary hover:bg-primary/10 rounded"><Save className="w-4 h-4" /></button>
            <button onClick={() => { setEditingName(false); setName(category.name); }} className="p-1 text-muted-foreground hover:bg-secondary rounded"><X className="w-4 h-4" /></button>
          </>
        ) : (
          <>
            <h3 className="flex-1 text-sm font-semibold text-foreground">{category.name}</h3>
            <span className="text-xs text-muted-foreground">{services.length} service{services.length === 1 ? "" : "s"}</span>
            <button onClick={() => setEditingName(true)} className="p-1 text-muted-foreground hover:text-foreground rounded" title="Rename">
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button onClick={handleDelete} className="p-1 text-muted-foreground hover:text-red-400 rounded" title="Delete">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </>
        )}
      </div>

      {expanded && (
        <div className="p-3 space-y-2">
          {services.map(svc => (
            <ServiceRow key={svc.id} service={svc} />
          ))}

          {addingService ? (
            <div className="flex items-center gap-2 rounded border border-dashed border-border p-2">
              <input
                type="text"
                autoFocus
                value={newServiceName}
                onChange={(e) => setNewServiceName(e.target.value)}
                placeholder="Service name (e.g. Photos)"
                className="flex-1 bg-background border border-border rounded px-2 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <div className="flex items-center gap-1 text-sm text-muted-foreground" title="Price (what you charge)">
                <span>$</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={newServicePrice}
                  onChange={(e) => setNewServicePrice(e.target.value.replace(/[^0-9.]/g, ""))}
                  placeholder="price"
                  className="w-16 bg-background border border-border rounded px-2 py-1.5 text-sm text-foreground text-right focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div className="flex items-center gap-1 text-sm text-amber-300/80" title="Cost (your payout)">
                <span>−$</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={newServiceCost}
                  onChange={(e) => setNewServiceCost(e.target.value.replace(/[^0-9.]/g, ""))}
                  placeholder="cost"
                  className="w-16 bg-background border border-border rounded px-2 py-1.5 text-sm text-foreground text-right focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <button onClick={handleAddService} className="px-3 py-1.5 rounded bg-primary text-primary-foreground text-sm">Add</button>
              <button onClick={() => { setAddingService(false); setNewServiceName(""); setNewServicePrice("0"); setNewServiceCost("0"); }} className="px-3 py-1.5 rounded bg-secondary text-muted-foreground text-sm">Cancel</button>
            </div>
          ) : (
            <button
              onClick={() => setAddingService(true)}
              className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded border border-dashed border-border text-xs text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Add Service
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function ServiceRow({ service }: { service: Service }) {
  const { data, updateService, deleteService, addServiceVariant } = useApp();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(service.name);
  const [price, setPrice] = useState(String(service.defaultPrice));
  const [cost, setCost] = useState(String(service.defaultCost ?? 0));
  const [showVariants, setShowVariants] = useState(false);
  const [addingVariant, setAddingVariant] = useState(false);
  const [newVariantLabel, setNewVariantLabel] = useState("");
  const [newVariantPrice, setNewVariantPrice] = useState("0");
  const [newVariantCost, setNewVariantCost] = useState("0");

  const variants = data.serviceVariants.filter(v => v.serviceId === service.id);

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) { toast.error("Name required"); return; }
    try {
      await updateService(service.id, { name: trimmed, defaultPrice: Number(price) || 0, defaultCost: Number(cost) || 0 });
      setEditing(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update");
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(`Delete service "${service.name}" and its variants?`)) return;
    try {
      await deleteService(service.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
    }
  };

  const handleAddVariant = async () => {
    const label = newVariantLabel.trim();
    if (!label) { toast.error("Variant label required"); return; }
    try {
      await addServiceVariant({
        serviceId: service.id,
        label,
        price: Number(newVariantPrice) || 0,
        cost: Number(newVariantCost) || 0,
        position: variants.length,
      });
      setNewVariantLabel("");
      setNewVariantPrice("0");
      setNewVariantCost("0");
      setAddingVariant(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add variant");
    }
  };

  return (
    <div className="rounded border border-border bg-secondary/20 overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2">
        {variants.length > 0 ? (
          <button onClick={() => setShowVariants(v => !v)} className="shrink-0 p-1.5 -m-1.5 text-muted-foreground hover:text-foreground">
            {showVariants ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </button>
        ) : (
          <span className="w-3.5 h-3.5 shrink-0" />
        )}
        {editing ? (
          <>
            <input
              type="text"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="flex-1 min-w-0 basis-full sm:basis-auto bg-background border border-border rounded px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <div className="flex items-center gap-1 text-sm text-muted-foreground" title="Price (what you charge)">
              <span>$</span>
              <input
                type="text"
                inputMode="decimal"
                value={price}
                onChange={(e) => setPrice(e.target.value.replace(/[^0-9.]/g, ""))}
                className="w-16 bg-background border border-border rounded px-2 py-1 text-sm text-foreground text-right focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div className="flex items-center gap-1 text-sm text-amber-300/80" title="Cost (your payout)">
              <span>−$</span>
              <input
                type="text"
                inputMode="decimal"
                value={cost}
                onChange={(e) => setCost(e.target.value.replace(/[^0-9.]/g, ""))}
                className="w-16 bg-background border border-border rounded px-2 py-1 text-sm text-foreground text-right focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <button onClick={handleSave} className="p-2 text-primary hover:bg-primary/10 rounded"><Save className="w-4 h-4" /></button>
            <button onClick={() => { setEditing(false); setName(service.name); setPrice(String(service.defaultPrice)); setCost(String(service.defaultCost ?? 0)); }} className="p-2 text-muted-foreground rounded"><X className="w-4 h-4" /></button>
          </>
        ) : (
          <>
            <button
              onClick={() => setEditing(true)}
              className="flex-1 min-w-0 text-left text-sm text-foreground truncate hover:text-primary py-1"
              title="Edit"
            >
              {service.name}
            </button>
            {variants.length === 0 ? (
              <button
                onClick={() => setEditing(true)}
                className="shrink-0 text-sm font-medium text-foreground tabular-nums hover:text-primary py-1"
                title="Edit price"
              >
                ${service.defaultPrice.toLocaleString()}
              </button>
            ) : (
              <span className="shrink-0 text-xs text-muted-foreground italic">{variants.length} variant{variants.length === 1 ? "" : "s"}</span>
            )}
            <button onClick={() => setEditing(true)} className="shrink-0 p-2 text-muted-foreground hover:text-foreground" title="Edit">
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button onClick={handleDelete} className="shrink-0 p-2 text-muted-foreground hover:text-red-400" title="Delete">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </>
        )}
      </div>

      {(showVariants || variants.length === 0) && (
        <div className="px-3 pb-2 pl-9 space-y-1.5">
          {variants.map(v => (
            <VariantRow key={v.id} variant={v} />
          ))}
          {addingVariant ? (
            <div className="flex items-center gap-2">
              <input
                type="text"
                autoFocus
                value={newVariantLabel}
                onChange={(e) => setNewVariantLabel(e.target.value)}
                placeholder="Variant label (e.g. 2,000–3,000 sqft)"
                className="flex-1 bg-background border border-border rounded px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <div className="flex items-center gap-1 text-xs text-muted-foreground" title="Price">
                <span>$</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={newVariantPrice}
                  onChange={(e) => setNewVariantPrice(e.target.value.replace(/[^0-9.]/g, ""))}
                  placeholder="price"
                  className="w-14 bg-background border border-border rounded px-2 py-1 text-xs text-foreground text-right focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div className="flex items-center gap-1 text-xs text-amber-300/80" title="Cost (your payout)">
                <span>−$</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={newVariantCost}
                  onChange={(e) => setNewVariantCost(e.target.value.replace(/[^0-9.]/g, ""))}
                  placeholder="cost"
                  className="w-14 bg-background border border-border rounded px-2 py-1 text-xs text-foreground text-right focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <button onClick={handleAddVariant} className="px-2 py-1 rounded bg-primary text-primary-foreground text-xs">Add</button>
              <button onClick={() => { setAddingVariant(false); setNewVariantLabel(""); setNewVariantPrice("0"); setNewVariantCost("0"); }} className="px-2 py-1 rounded bg-secondary text-muted-foreground text-xs">×</button>
            </div>
          ) : (
            <button
              onClick={() => setAddingVariant(true)}
              className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
            >
              <Plus className="w-3 h-3" /> Add variant {variants.length === 0 ? "(e.g. by size, tier, style)" : ""}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function VariantRow({ variant }: { variant: ServiceVariant }) {
  const { updateServiceVariant, deleteServiceVariant } = useApp();
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(variant.label);
  const [price, setPrice] = useState(String(variant.price));
  const [cost, setCost] = useState(String(variant.cost ?? 0));

  const handleSave = async () => {
    const trimmed = label.trim();
    if (!trimmed) { toast.error("Label required"); return; }
    try {
      await updateServiceVariant(variant.id, { label: trimmed, price: Number(price) || 0, cost: Number(cost) || 0 });
      setEditing(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update");
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(`Delete variant "${variant.label}"?`)) return;
    try {
      await deleteServiceVariant(variant.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
    }
  };

  if (editing) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          autoFocus
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className="flex-1 min-w-0 basis-full sm:basis-auto bg-background border border-border rounded px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <div className="flex items-center gap-1 text-xs text-muted-foreground" title="Price">
          <span>$</span>
          <input
            type="text"
            inputMode="decimal"
            value={price}
            onChange={(e) => setPrice(e.target.value.replace(/[^0-9.]/g, ""))}
            className="w-14 bg-background border border-border rounded px-2 py-1 text-xs text-foreground text-right focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <div className="flex items-center gap-1 text-xs text-amber-300/80" title="Cost (your payout)">
          <span>−$</span>
          <input
            type="text"
            inputMode="decimal"
            value={cost}
            onChange={(e) => setCost(e.target.value.replace(/[^0-9.]/g, ""))}
            className="w-14 bg-background border border-border rounded px-2 py-1 text-xs text-foreground text-right focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <button onClick={handleSave} className="p-2 text-primary"><Save className="w-3.5 h-3.5" /></button>
        <button onClick={() => { setEditing(false); setLabel(variant.label); setPrice(String(variant.price)); setCost(String(variant.cost ?? 0)); }} className="p-2 text-muted-foreground"><X className="w-3.5 h-3.5" /></button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <button
        onClick={() => setEditing(true)}
        className="flex-1 min-w-0 text-left text-muted-foreground truncate hover:text-primary py-1"
        title="Edit"
      >
        {variant.label}
      </button>
      <button
        onClick={() => setEditing(true)}
        className="shrink-0 tabular-nums hover:text-primary py-1"
        title="Price · cost · margin"
      >
        <span className="text-foreground">${variant.price.toLocaleString()}</span>
        {(variant.cost ?? 0) > 0 && (
          <span className="text-muted-foreground"> · −${(variant.cost ?? 0).toLocaleString()} · <span className="text-green-400">${(variant.price - (variant.cost ?? 0)).toLocaleString()}</span></span>
        )}
      </button>
      <button onClick={() => setEditing(true)} className="shrink-0 p-2 text-muted-foreground hover:text-foreground" title="Edit"><Pencil className="w-3 h-3" /></button>
      <button onClick={handleDelete} className="shrink-0 p-2 text-muted-foreground hover:text-red-400" title="Delete"><Trash2 className="w-3 h-3" /></button>
    </div>
  );
}
