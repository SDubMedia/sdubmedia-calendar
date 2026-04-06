// ============================================================
// SettingsPage — Organization settings, feature toggles, defaults
// Owner-only
// ============================================================

import { useState, useEffect } from "react";
import { useApp } from "@/contexts/AppContext";
import type { OrgFeatures, BillingModel, ProductionType, OrgBusinessInfo, DashboardWidgetConfig, DashboardWidgetId, PipelineStageConfig, ServiceItem } from "@/lib/types";
import { DEFAULT_DASHBOARD_WIDGETS, DASHBOARD_WIDGET_LABELS, DEFAULT_PIPELINE_STAGES } from "@/lib/types";
import { DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Settings, Film, Camera, Video, Save, Building2, GripVertical, LayoutDashboard, CreditCard, ExternalLink, CheckCircle, Plus, X, ArrowUp, ArrowDown } from "lucide-react";
import { nanoid } from "nanoid";
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
  const [pipelineStages, setPipelineStages] = useState<PipelineStageConfig[]>(
    org?.pipelineStages?.length ? org.pipelineStages : DEFAULT_PIPELINE_STAGES
  );
  const [services, setServices] = useState<ServiceItem[]>(org?.services || []);
  const [saving, setSaving] = useState(false);
  const [stripeStatus, setStripeStatus] = useState<{ connected: boolean; loading: boolean }>({ connected: false, loading: true });
  const [connectingStripe, setConnectingStripe] = useState(false);

  // Check Stripe Connect status
  useEffect(() => {
    if (org?.id) {
      fetch(`/api/stripe-connect?action=status&orgId=${org.id}`)
        .then(r => r.json())
        .then(d => setStripeStatus({ connected: d.connected, loading: false }))
        .catch(() => setStripeStatus({ connected: false, loading: false }));
    }
  }, [org?.id]);

  async function connectStripe() {
    if (!org?.id) { toast.error("Organization not found"); return; }
    setConnectingStripe(true);
    try {
      const res = await fetch("/api/stripe-connect?action=connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId: org.id, returnUrl: window.location.href }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Failed to connect Stripe");
      if (result.url) {
        window.location.href = result.url;
      } else {
        throw new Error("No redirect URL received from Stripe");
      }
    } catch (e: any) {
      toast.error(e.message || "Failed to connect Stripe");
      setConnectingStripe(false);
    }
  }

  async function disconnectStripe() {
    if (!org?.id || !confirm("Disconnect your Stripe account?")) return;
    await fetch("/api/stripe-connect?action=disconnect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orgId: org.id }),
    });
    setStripeStatus({ connected: false, loading: false });
    toast.success("Stripe disconnected");
  }

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
        pipelineStages,
        services,
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

        {/* Stripe Connect */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2" style={{ fontFamily: "'Space Grotesk', system-ui" }}>
              <CreditCard className="w-4 h-4 text-primary" />
              Payment Processing
            </CardTitle>
            <p className="text-xs text-muted-foreground">Connect your Stripe account to accept invoice payments from clients.</p>
          </CardHeader>
          <CardContent>
            {stripeStatus.loading ? (
              <p className="text-sm text-muted-foreground">Checking connection...</p>
            ) : stripeStatus.connected ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 border border-green-500/30">
                  <CheckCircle className="w-5 h-5 text-green-400" />
                  <div>
                    <p className="text-sm font-medium text-green-300">Stripe Connected</p>
                    <p className="text-xs text-green-400/70">Your clients can pay invoices online</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <a href="https://dashboard.stripe.com" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-primary hover:underline">
                    <ExternalLink className="w-3 h-3" /> Stripe Dashboard
                  </a>
                  <button onClick={disconnectStripe} className="text-xs text-muted-foreground hover:text-destructive ml-auto">
                    Disconnect
                  </button>
                </div>
              </div>
            ) : (
              <Button onClick={connectStripe} disabled={connectingStripe} variant="outline" className="gap-2">
                <CreditCard className="w-4 h-4" />
                {connectingStripe ? "Connecting..." : "Connect Stripe Account"}
              </Button>
            )}
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

        {/* Feature Visibility */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              Feature Visibility
            </CardTitle>
            <p className="text-xs text-muted-foreground">You (owner) always have access to everything. These toggles control what your team sees.</p>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Staff & Crew */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Staff & Crew</p>
              <div className="space-y-1.5">
                {FEATURE_TOGGLES.filter(ft => ["calendar", "crewManagement", "invoicing", "mileage"].includes(ft.key)).map(ft => (
                  <FeatureToggleRow key={ft.key} ft={ft} features={features} onToggle={() => toggleFeature(ft.key)} />
                ))}
              </div>
            </div>

            {/* Partners */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Partners</p>
              <div className="space-y-1.5">
                {FEATURE_TOGGLES.filter(ft => ["calendar", "invoicing", "partnerSplits", "contentSeries"].includes(ft.key)).map(ft => (
                  <FeatureToggleRow key={`partner-${ft.key}`} ft={ft} features={features} onToggle={() => toggleFeature(ft.key)} />
                ))}
              </div>
            </div>

            {/* Clients */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Clients</p>
              <div className="space-y-1.5">
                {FEATURE_TOGGLES.filter(ft => ["clientPortal", "contentSeries", "calendar"].includes(ft.key)).map(ft => (
                  <FeatureToggleRow key={`client-${ft.key}`} ft={ft} features={features} onToggle={() => toggleFeature(ft.key)} />
                ))}
              </div>
            </div>

            {/* All Features (master toggles) */}
            <div className="border-t border-border pt-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">All Features (Master Toggles)</p>
              <p className="text-[10px] text-muted-foreground mb-2">Turn features on/off globally. Affects all non-owner roles above.</p>
              <div className="space-y-1.5">
                {FEATURE_TOGGLES.map(ft => (
                  <FeatureToggleRow key={`all-${ft.key}`} ft={ft} features={features} onToggle={() => toggleFeature(ft.key)} />
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* My Services */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              <Film className="w-4 h-4 text-primary" />
              My Services
            </CardTitle>
            <p className="text-xs text-muted-foreground">Define your standard services. These appear as quick-add buttons when building proposals.</p>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {services.length === 0 && (
                <p className="text-xs text-muted-foreground italic py-2">No services yet. Add your standard offerings below.</p>
              )}
              {services.map((svc) => (
                <div key={svc.id} className="flex items-center gap-2 bg-secondary/30 rounded-lg p-2">
                  <select
                    value={svc.category}
                    onChange={e => setServices(s => s.map(x => x.id === svc.id ? { ...x, category: e.target.value } : x))}
                    className="w-16 bg-secondary border border-border rounded px-1 py-1.5 text-xs text-foreground"
                  >
                    <option value="photo">Photo</option>
                    <option value="video">Video</option>
                    <option value="other">Other</option>
                  </select>
                  <Input
                    value={svc.name}
                    onChange={e => setServices(s => s.map(x => x.id === svc.id ? { ...x, name: e.target.value } : x))}
                    className="bg-secondary border-border text-sm flex-1"
                    placeholder="Service name"
                  />
                  <Input
                    type="number"
                    value={svc.defaultPrice || ""}
                    onChange={e => setServices(s => s.map(x => x.id === svc.id ? { ...x, defaultPrice: Number(e.target.value) || 0 } : x))}
                    className="bg-secondary border-border text-sm w-24"
                    placeholder="Price"
                    min={0}
                    step={0.01}
                  />
                  <button
                    onClick={() => setServices(s => s.filter(x => x.id !== svc.id))}
                    className="p-1.5 text-muted-foreground hover:text-destructive"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              <button
                onClick={() => setServices(s => [...s, { id: nanoid(6), name: "", description: "", defaultPrice: 0, category: "photo" }])}
                className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 mt-2"
              >
                <Plus className="w-3.5 h-3.5" /> Add Service
              </button>
            </div>
          </CardContent>
        </Card>

        {/* Pipeline Stages */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              <Settings className="w-4 h-4 text-primary" />
              Pipeline Stages
            </CardTitle>
            <p className="text-xs text-muted-foreground">Customize the stages in your sales pipeline. Add, remove, rename, or reorder.</p>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {pipelineStages.map((stage, idx) => (
                <div key={stage.id} className="flex items-center gap-2">
                  <div className="flex flex-col gap-0.5">
                    <button
                      onClick={() => {
                        if (idx === 0) return;
                        const arr = [...pipelineStages];
                        [arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]];
                        setPipelineStages(arr);
                      }}
                      disabled={idx === 0}
                      className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-20"
                    >
                      <ArrowUp className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => {
                        if (idx === pipelineStages.length - 1) return;
                        const arr = [...pipelineStages];
                        [arr[idx], arr[idx + 1]] = [arr[idx + 1], arr[idx]];
                        setPipelineStages(arr);
                      }}
                      disabled={idx === pipelineStages.length - 1}
                      className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-20"
                    >
                      <ArrowDown className="w-3 h-3" />
                    </button>
                  </div>
                  <select
                    value={stage.color}
                    onChange={e => setPipelineStages(s => s.map(st => st.id === stage.id ? { ...st, color: e.target.value } : st))}
                    className="w-20 bg-secondary border border-border rounded px-1.5 py-1.5 text-xs text-foreground"
                  >
                    {["blue","cyan","indigo","amber","green","emerald","orange","purple","pink","zinc","red","yellow"].map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                  <Input
                    value={stage.label}
                    onChange={e => setPipelineStages(s => s.map(st => st.id === stage.id ? { ...st, label: e.target.value } : st))}
                    className="bg-secondary border-border text-sm flex-1"
                    placeholder="Stage name"
                  />
                  <button
                    onClick={() => {
                      if (pipelineStages.length <= 2) { toast.error("Need at least 2 stages"); return; }
                      setPipelineStages(s => s.filter(st => st.id !== stage.id));
                    }}
                    className="p-1.5 text-muted-foreground hover:text-destructive"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              <button
                onClick={() => setPipelineStages(s => [...s, { id: nanoid(6), label: "New Stage", color: "blue" }])}
                className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 mt-2"
              >
                <Plus className="w-3.5 h-3.5" /> Add Stage
              </button>
              <button
                onClick={() => setPipelineStages(DEFAULT_PIPELINE_STAGES)}
                className="text-xs text-muted-foreground hover:text-foreground mt-1"
              >
                Reset to defaults
              </button>
            </div>
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

function FeatureToggleRow({ ft, features, onToggle }: { ft: FeatureToggle; features: OrgFeatures; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className={cn(
        "w-full flex items-center justify-between p-2.5 rounded-lg border transition-colors text-left",
        features[ft.key] ? "border-primary/30 bg-primary/5" : "border-border hover:border-primary/20"
      )}
    >
      <div className="min-w-0">
        <p className={cn("text-sm font-medium", features[ft.key] ? "text-foreground" : "text-muted-foreground")}>
          {ft.label}
        </p>
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
