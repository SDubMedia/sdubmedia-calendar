// ============================================================
// ProjectServiceBundlePicker — Service bundle picker for the
// Project Dialog. Lets the owner check off services within a
// category, pick a variant for services that have them, and
// edit prices inline. The picked services + denormalized labels
// + prices flow into project.services on save.
//
// Per-client overrides (client.serviceRates) auto-populate the
// price field but the owner can still edit per-project.
// ============================================================

import { useMemo } from "react";
import { useApp } from "@/contexts/AppContext";
import type { ProjectServiceSelection, Client } from "@/lib/types";
import { Plus } from "lucide-react";

interface Props {
  clientId: string;
  categoryId: string | null;
  services: ProjectServiceSelection[];
  onChange: (categoryId: string | null, services: ProjectServiceSelection[]) => void;
}

function fmt(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

// Resolve the price for a service (or service+variant) on a given client.
// Lookup priority:
//   1. client.serviceRates with matching { serviceId, variantId }
//   2. client.serviceRates with matching { serviceId, variantId: null } (service-level)
//   3. variant.price (if variantId set)
//   4. service.defaultPrice
function resolvePrice(
  serviceId: string,
  variantId: string | null,
  client: Client | undefined,
  defaultPrice: number,
  variantPrice: number | null,
): number {
  const overrides = client?.serviceRates || [];
  const exact = overrides.find(r => r.serviceId === serviceId && r.variantId === variantId);
  if (exact) return Number(exact.rate);
  if (variantId) {
    const serviceLevel = overrides.find(r => r.serviceId === serviceId && r.variantId === null);
    if (serviceLevel) return Number(serviceLevel.rate);
  }
  if (variantId && variantPrice !== null) return variantPrice;
  return defaultPrice;
}

// Resolve your cost (photographer/editor payout) for a service/variant:
// the variant's cost if it has one, else the service's defaultCost.
function resolveCost(
  variantId: string | null,
  defaultCost: number,
  variantCost: number | null,
): number {
  if (variantId && variantCost !== null) return variantCost;
  return defaultCost;
}

// On-site minutes for a piece: the variant's duration if set, else the service's.
function resolveDuration(variantDuration: number | null, serviceDuration: number): number {
  return (variantDuration && variantDuration > 0) ? variantDuration : serviceDuration;
}

export default function ProjectServiceBundlePicker({ clientId, categoryId, services, onChange }: Props) {
  const { data } = useApp();
  const client = data.clients.find(c => c.id === clientId);

  // Show only the bundles meant for this client's type (plus "any" bundles, and
  // whatever's already selected so editing an old project never hides its bundle).
  const categories = useMemo(() => {
    const ct = client?.clientType ?? "standard";
    const scopes = (ct === "broker" || ct === "agent") ? ["any", "real_estate"]
      : ct === "photography" ? ["any", "photography"]
      : ["any", "wedding"];
    return data.serviceCategories.filter(c =>
      scopes.includes(c.appliesTo ?? "any")
      || (c.clientIds ?? []).includes(clientId)   // hand-pinned to this specific client
      || c.id === categoryId                       // keep an already-selected bundle visible
    );
  }, [data.serviceCategories, client?.clientType, clientId, categoryId]);
  const servicesInCategory = useMemo(
    () => categoryId ? data.services.filter(s => s.categoryId === categoryId) : [],
    [data.services, categoryId]
  );

  const subtotal = services.reduce((s, sel) => s + Number(sel.price || 0), 0);
  const costTotal = services.reduce((s, sel) => s + Number(sel.cost || 0), 0);

  const isSelected = (serviceId: string) => services.some(sel => sel.serviceId === serviceId);
  const getSelection = (serviceId: string) => services.find(sel => sel.serviceId === serviceId);

  const handleCategoryChange = (newCategoryId: string) => {
    // Switching category clears the service selections (different services per category).
    onChange(newCategoryId || null, []);
  };

  const handleToggleService = (serviceId: string) => {
    const svc = data.services.find(s => s.id === serviceId);
    if (!svc) return;
    const cat = data.serviceCategories.find(c => c.id === svc.categoryId);
    const variants = data.serviceVariants.filter(v => v.serviceId === serviceId);

    if (isSelected(serviceId)) {
      onChange(categoryId, services.filter(sel => sel.serviceId !== serviceId));
      return;
    }

    // Adding the service. Pick the first variant (if any) by default.
    const defaultVariant = variants[0] || null;
    const price = resolvePrice(
      serviceId,
      defaultVariant?.id ?? null,
      client,
      svc.defaultPrice,
      defaultVariant ? defaultVariant.price : null,
    );
    const cost = resolveCost(defaultVariant?.id ?? null, svc.defaultCost ?? 0, defaultVariant ? (defaultVariant.cost ?? 0) : null);
    const durationMinutes = resolveDuration(defaultVariant ? (defaultVariant.durationMinutes ?? 0) : null, svc.durationMinutes ?? 0);
    const label = `${cat?.name ? cat.name + " — " : ""}${svc.name}${defaultVariant ? ` (${defaultVariant.label})` : ""}`;
    onChange(categoryId, [
      ...services,
      { serviceId, variantId: defaultVariant?.id ?? null, label, price, cost, crewRole: svc.crewRole ?? null, durationMinutes },
    ]);
  };

  const handleVariantChange = (serviceId: string, newVariantId: string | null) => {
    const svc = data.services.find(s => s.id === serviceId);
    if (!svc) return;
    const cat = data.serviceCategories.find(c => c.id === svc.categoryId);
    const variant = newVariantId ? data.serviceVariants.find(v => v.id === newVariantId) : null;
    const price = resolvePrice(
      serviceId,
      newVariantId,
      client,
      svc.defaultPrice,
      variant ? variant.price : null,
    );
    const cost = resolveCost(newVariantId, svc.defaultCost ?? 0, variant ? (variant.cost ?? 0) : null);
    const durationMinutes = resolveDuration(variant ? (variant.durationMinutes ?? 0) : null, svc.durationMinutes ?? 0);
    const label = `${cat?.name ? cat.name + " — " : ""}${svc.name}${variant ? ` (${variant.label})` : ""}`;
    onChange(
      categoryId,
      services.map(sel => sel.serviceId === serviceId
        ? { ...sel, variantId: newVariantId, label, price, cost, crewRole: svc.crewRole ?? null, durationMinutes }
        : sel
      ),
    );
  };

  const handlePriceChange = (serviceId: string, newPrice: number) => {
    onChange(
      categoryId,
      services.map(sel => sel.serviceId === serviceId ? { ...sel, price: newPrice } : sel),
    );
  };

  const handleCostChange = (serviceId: string, newCost: number) => {
    onChange(
      categoryId,
      services.map(sel => sel.serviceId === serviceId ? { ...sel, cost: newCost } : sel),
    );
  };

  if (categories.length === 0) {
    return null; // Don't render anything if the owner hasn't created any categories yet.
  }

  return (
    <div className="space-y-3 rounded-lg border border-border bg-secondary/20 p-3">
      <div className="flex items-center justify-between gap-2">
        <label className="text-xs uppercase tracking-wider text-muted-foreground">Service Bundle (optional)</label>
        {categoryId && (
          <button
            type="button"
            onClick={() => onChange(null, [])}
            className="text-[11px] text-muted-foreground hover:text-foreground"
          >
            Clear
          </button>
        )}
      </div>

      <select
        value={categoryId || ""}
        onChange={(e) => handleCategoryChange(e.target.value)}
        className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
      >
        <option value="">— No bundle —</option>
        {categories.map(c => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>

      {categoryId && servicesInCategory.length === 0 && (
        <p className="text-xs text-muted-foreground italic">
          This category has no services yet. Add some in Manage → Services.
        </p>
      )}

      {categoryId && servicesInCategory.length > 0 && (
        <div className="space-y-2">
          {servicesInCategory.map(svc => {
            const variants = data.serviceVariants.filter(v => v.serviceId === svc.id);
            const selected = isSelected(svc.id);
            const selection = getSelection(svc.id);

            return (
              <div key={svc.id} className={`rounded border p-2 transition-colors ${selected ? "border-primary/40 bg-primary/5" : "border-border bg-background"}`}>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => handleToggleService(svc.id)}
                    className="accent-primary"
                  />
                  <span className="flex-1 text-sm text-foreground">{svc.name}</span>
                  {!selected && variants.length === 0 && (
                    <span className="text-xs text-muted-foreground tabular-nums">{fmt(svc.defaultPrice)}</span>
                  )}
                  {!selected && variants.length > 0 && (
                    <span className="text-[11px] text-muted-foreground">{variants.length} variant{variants.length === 1 ? "" : "s"}</span>
                  )}
                </label>

                {selected && (
                  <div className="mt-2 ml-6 flex items-center gap-2">
                    {variants.length > 0 ? (
                      <select
                        value={selection?.variantId || ""}
                        onChange={(e) => handleVariantChange(svc.id, e.target.value || null)}
                        className="flex-1 bg-background border border-border rounded px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                      >
                        {variants.map(v => (
                          <option key={v.id} value={v.id}>{v.label} ({fmt(v.price)})</option>
                        ))}
                      </select>
                    ) : (
                      <span className="flex-1 text-xs text-muted-foreground italic">No variants — flat price</span>
                    )}
                    <div className="flex items-center gap-1 text-xs text-muted-foreground" title="Charge (price)">
                      <span>$</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={selection?.price ?? 0}
                        onChange={(e) => handlePriceChange(svc.id, Number(e.target.value.replace(/[^0-9.-]/g, "")) || 0)}
                        className="w-16 bg-background border border-border rounded px-2 py-1 text-xs text-foreground text-right focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>
                    <div className="flex items-center gap-1 text-xs text-amber-300/80" title="Your cost (photographer payout)">
                      <span>−$</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={selection?.cost ?? 0}
                        onChange={(e) => handleCostChange(svc.id, Number(e.target.value.replace(/[^0-9.-]/g, "")) || 0)}
                        className="w-16 bg-background border border-border rounded px-2 py-1 text-xs text-foreground text-right focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>
                    <span className="text-xs text-green-400 tabular-nums shrink-0" title="Margin on this piece">
                      ={fmt(Number(selection?.price ?? 0) - Number(selection?.cost ?? 0))}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {services.length > 0 && (
        <div className="space-y-1 pt-2 border-t border-border text-xs">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Bundle charge</span>
            <span className="font-semibold text-foreground tabular-nums">{fmt(subtotal)}</span>
          </div>
          {costTotal > 0 && (
            <>
              <div className="flex items-center justify-between text-muted-foreground">
                <span>− Your cost</span>
                <span className="tabular-nums">−{fmt(costTotal)}</span>
              </div>
              <div className="flex items-center justify-between font-semibold">
                <span>Bundle margin</span>
                <span className={`tabular-nums ${subtotal - costTotal >= 0 ? "text-green-400" : "text-red-400"}`}>{fmt(subtotal - costTotal)}</span>
              </div>
            </>
          )}
        </div>
      )}

      {!categoryId && (
        <p className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
          <Plus className="w-3 h-3" />
          Add a category in Manage → Services to build bundles like "Real Estate Shoot" or "Wedding Package".
        </p>
      )}
    </div>
  );
}
