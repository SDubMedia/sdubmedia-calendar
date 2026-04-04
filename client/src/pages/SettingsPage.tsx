// ============================================================
// SettingsPage — Organization settings, feature toggles, defaults
// Owner-only
// ============================================================

import { useState, useEffect } from "react";
import { useApp } from "@/contexts/AppContext";
import type { OrgFeatures, BillingModel, ProductionType, OrgBusinessInfo, DashboardWidgetConfig, DashboardWidgetId } from "@/lib/types";
import { DEFAULT_DASHBOARD_WIDGETS, DASHBOARD_WIDGET_LABELS } from "@/lib/types";
import { DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Settings, Film, Camera, Video, Save, Building2, GripVertical, LayoutDashboard } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface FeatureToggle {
  key: keyof OrgFeatures;
  label: string;
  description: string;
}

const FEATURE_TOGGLES: FeatureToggle[] = [
  { key: "calendar", label: "Production Calendar", description: "Schedule shoots and track project status" },
  { key: "crewManagement", label: "Crew Management", description: "Manage staff, roles, and pay rates" },
  { key: "invoicing", label: "Invoicing", description: "Create invoices, track payments, contractor invoices" },
  { key: "mileage", label: "Mileage Tracking", description: "Track business miles with Google Maps distance calculation" },
  { key: "expenses", label: "Expense Tracking", description: "Import credit card statements, categorize expenses for CPA" },
  { key: "clientPortal", label: "Client Portal", description: "Give clients login access to view their projects and reports" },
  { key: "contentSeries", label: "Content Series", description: "Plan multi-episode video series with AI brainstorming" },
  { key: "partnerSplits", label: "Partner & Revenue Splits", description: "Split revenue with business partners, track spending budgets" },
];

export default function SettingsPage() {
  const { data, updateOrganization, addLocation, updateLocation } = useApp();
  const org = data.organization;

  const [name, setName] = useState(org?.name || "");
  const [productionType, setProductionType] = useState<ProductionType>(org?.productionType || "both");
  const [billingModel, setBillingModel] = useState<BillingModel>(org?.defaultBillingModel || "hourly");
  const [billingRate, setBillingRate] = useState(org?.defaultBillingRate || 0);
  const [features, setFeatures] = useState<OrgFeatures>(org?.features || {
    calendar: true, crewManagement: true, invoicing: true, mileage: false,
    expenses: false, clientPortal: false, contentSeries: false, partnerSplits: false,
  });
  const [businessInfo, setBusinessInfo] = useState<OrgBusinessInfo>(org?.businessInfo || {
    address: "", city: "", state: "", zip: "", phone: "", email: "", website: "", ein: "",
  });
  const [dashboardWidgets, setDashboardWidgets] = useState<DashboardWidgetConfig[]>(
    org?.dashboardWidgets || DEFAULT_DASHBOARD_WIDGETS
  );
  const [saving, setSaving] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } })
  );

  // Sync when org loads
  useEffect(() => {
    if (org) {
      setName(org.name);
      setProductionType(org.productionType);
      setBillingModel(org.defaultBillingModel);
      setBillingRate(org.defaultBillingRate);
      setFeatures(org.features);
      setBusinessInfo(org.businessInfo || { address: "", city: "", state: "", zip: "", phone: "", email: "", website: "", ein: "" });
      setDashboardWidgets(org.dashboardWidgets || DEFAULT_DASHBOARD_WIDGETS);
    }
  }, [org]);

  async function handleSave() {
    setSaving(true);
    try {
      await updateOrganization({
        name,
        productionType,
        defaultBillingModel: billingModel,
        defaultBillingRate: billingRate,
        features,
        businessInfo,
        dashboardWidgets,
      });

      // Auto-create or update office location if business address is set
      if (businessInfo.address && businessInfo.city) {
        const officeName = `${name || "Company"} Office`;
        const existingOffice = data.locations.find(l => l.name.includes("Office") && l.address === businessInfo.address);
        if (!existingOffice) {
          const officeByName = data.locations.find(l => l.name.includes("Office"));
          if (officeByName) {
            await updateLocation(officeByName.id, {
              name: officeName,
              address: businessInfo.address,
              city: businessInfo.city,
              state: businessInfo.state,
              zip: businessInfo.zip,
            });
          } else {
            await addLocation({
              name: officeName,
              address: businessInfo.address,
              city: businessInfo.city,
              state: businessInfo.state,
              zip: businessInfo.zip,
            });
          }
        }
      }

      toast.success("Settings saved");
    } catch (e: any) {
      toast.error(e.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  function toggleFeature(key: keyof OrgFeatures) {
    setFeatures(f => ({ ...f, [key]: !f[key] }));
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-border bg-card/50">
        <div>
          <h1 className="text-xl font-semibold text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            Settings
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Company settings and feature configuration</p>
        </div>
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          <Save className="w-4 h-4" />
          {saving ? "Saving..." : "Save Changes"}
        </Button>
      </div>

      <div className="flex-1 overflow-auto p-3 sm:p-6 space-y-6 max-w-2xl">
        {/* Company Info */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              <Settings className="w-4 h-4 text-primary" />
              Company
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Company Name</Label>
              <Input
                value={name}
                onChange={e => setName(e.target.value)}
                className="bg-secondary border-border"
                placeholder="Your company name"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Production Type</Label>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { value: "video" as ProductionType, label: "Video", icon: Video },
                  { value: "photo" as ProductionType, label: "Photo", icon: Camera },
                  { value: "both" as ProductionType, label: "Both", icon: Film },
                ]).map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setProductionType(opt.value)}
                    className={cn(
                      "flex items-center justify-center gap-2 p-2.5 rounded-lg border text-sm transition-colors",
                      productionType === opt.value ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/30"
                    )}
                  >
                    <opt.icon className="w-4 h-4" />
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* My Business */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              <Building2 className="w-4 h-4 text-primary" />
              My Business
            </CardTitle>
            <p className="text-xs text-muted-foreground">Appears on invoices and reports. Office address auto-creates a location for mileage.</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Business Address</Label>
              <Input value={businessInfo.address} onChange={e => setBusinessInfo(b => ({ ...b, address: e.target.value }))} className="bg-secondary border-border" placeholder="123 Main St" />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Input placeholder="City" value={businessInfo.city} onChange={e => setBusinessInfo(b => ({ ...b, city: e.target.value }))} className="bg-secondary border-border" />
              <Input placeholder="State" value={businessInfo.state} onChange={e => setBusinessInfo(b => ({ ...b, state: e.target.value }))} className="bg-secondary border-border" />
              <Input placeholder="ZIP" value={businessInfo.zip} onChange={e => setBusinessInfo(b => ({ ...b, zip: e.target.value }))} className="bg-secondary border-border" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Phone</Label>
                <Input value={businessInfo.phone} onChange={e => setBusinessInfo(b => ({ ...b, phone: e.target.value }))} className="bg-secondary border-border" placeholder="(615) 555-0000" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Email</Label>
                <Input value={businessInfo.email} onChange={e => setBusinessInfo(b => ({ ...b, email: e.target.value }))} className="bg-secondary border-border" placeholder="info@company.com" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Website</Label>
                <Input value={businessInfo.website} onChange={e => setBusinessInfo(b => ({ ...b, website: e.target.value }))} className="bg-secondary border-border" placeholder="company.com" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">EIN (Tax ID)</Label>
                <Input value={businessInfo.ein} onChange={e => setBusinessInfo(b => ({ ...b, ein: e.target.value }))} className="bg-secondary border-border" placeholder="XX-XXXXXXX" type="password" autoComplete="off" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Default Billing */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              Default Billing
            </CardTitle>
            <p className="text-xs text-muted-foreground">Default for new clients. Can be overridden per client.</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setBillingModel("hourly")}
                className={cn(
                  "p-3 rounded-lg border text-sm font-medium transition-colors text-center",
                  billingModel === "hourly" ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/30"
                )}
              >
                Hourly
              </button>
              <button
                onClick={() => setBillingModel("per_project")}
                className={cn(
                  "p-3 rounded-lg border text-sm font-medium transition-colors text-center",
                  billingModel === "per_project" ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/30"
                )}
              >
                Per Project
              </button>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                {billingModel === "hourly" ? "Default Rate ($/hr)" : "Default Rate ($/project)"}
              </Label>
              <Input
                type="number"
                value={billingRate || ""}
                onChange={e => setBillingRate(parseFloat(e.target.value) || 0)}
                className="bg-secondary border-border w-32"
                placeholder="200"
              />
            </div>
          </CardContent>
        </Card>

        {/* Feature Toggles */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              Features
            </CardTitle>
            <p className="text-xs text-muted-foreground">Toggle features on or off. Disabled features are hidden from the sidebar and your team.</p>
          </CardHeader>
          <CardContent className="space-y-2">
            {FEATURE_TOGGLES.map(ft => (
              <button
                key={ft.key}
                onClick={() => toggleFeature(ft.key)}
                className={cn(
                  "w-full flex items-center justify-between p-3 rounded-lg border transition-colors text-left",
                  features[ft.key] ? "border-primary/30 bg-primary/5" : "border-border hover:border-primary/20"
                )}
              >
                <div className="min-w-0">
                  <p className={cn("text-sm font-medium", features[ft.key] ? "text-foreground" : "text-muted-foreground")}>
                    {ft.label}
                  </p>
                  <p className="text-xs text-muted-foreground">{ft.description}</p>
                </div>
                <div className={cn(
                  "w-10 h-5 rounded-full transition-colors shrink-0 ml-3",
                  features[ft.key] ? "bg-primary" : "bg-secondary border border-border"
                )}>
                  <span className={cn(
                    "block w-4 h-4 rounded-full bg-white transition-transform mt-0.5",
                    features[ft.key] ? "translate-x-5" : "translate-x-0.5"
                  )} />
                </div>
              </button>
            ))}
          </CardContent>
        </Card>

        {/* Dashboard Layout */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              <LayoutDashboard className="w-4 h-4 text-primary" />
              Dashboard Layout
            </CardTitle>
            <p className="text-xs text-muted-foreground">Toggle widgets on/off and drag to reorder. Press and hold to move.</p>
          </CardHeader>
          <CardContent>
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={(event) => {
                const { active, over } = event;
                if (over && active.id !== over.id) {
                  const oldIndex = dashboardWidgets.findIndex(w => w.id === active.id);
                  const newIndex = dashboardWidgets.findIndex(w => w.id === over.id);
                  setDashboardWidgets(arrayMove(dashboardWidgets, oldIndex, newIndex));
                }
              }}
            >
              <SortableContext items={dashboardWidgets.map(w => w.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-2">
                  {dashboardWidgets.map(widget => (
                    <SortableWidget
                      key={widget.id}
                      widget={widget}
                      onToggle={() => setDashboardWidgets(ws => ws.map(w => w.id === widget.id ? { ...w, enabled: !w.enabled } : w))}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function SortableWidget({ widget, onToggle }: { widget: DashboardWidgetConfig; onToggle: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: widget.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-3 p-3 rounded-lg border transition-colors",
        widget.enabled ? "border-primary/30 bg-primary/5" : "border-border",
        isDragging && "shadow-lg"
      )}
    >
      <button {...attributes} {...listeners} className="touch-none text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing p-1">
        <GripVertical className="w-4 h-4" />
      </button>
      <div className="flex-1 min-w-0">
        <p className={cn("text-sm font-medium", widget.enabled ? "text-foreground" : "text-muted-foreground")}>
          {DASHBOARD_WIDGET_LABELS[widget.id]}
        </p>
      </div>
      <button
        onClick={onToggle}
        className={cn(
          "w-10 h-5 rounded-full transition-colors shrink-0",
          widget.enabled ? "bg-primary" : "bg-secondary border border-border"
        )}
      >
        <span className={cn(
          "block w-4 h-4 rounded-full bg-white transition-transform mt-0.5",
          widget.enabled ? "translate-x-5" : "translate-x-0.5"
        )} />
      </button>
    </div>
  );
}
