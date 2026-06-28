// ============================================================
// ClientProfileSheet — Slide-in panel for editing a client
// Reused by ClientsPage and ProjectDetailSheet
// ============================================================

import { useState, useEffect, useMemo } from "react";
import { Plus, Trash2, Film, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { DateField } from "@/components/DateTimeField";
import { Label } from "@/components/ui/label";
import { useScopedData as useApp } from "@/hooks/useScopedData";
import { useAuth } from "@/contexts/AuthContext";
import { getAuthToken } from "@/lib/supabase";
import { showInviteCredentials } from "@/lib/inviteCredentials";
import type { Client, RoleBillingMultiplier, BillingModel, PartnerSplit } from "@/lib/types";
import { toast } from "sonner";
import { cn, formatPhoneInput } from "@/lib/utils";
import BrandNotesAssistant from "./BrandNotesAssistant";

function genTempPassword(): string {
  return "Ph" + Math.random().toString(36).slice(2, 10) + "7a";
}

interface ClientFormData {
  company: string;
  contactName: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  billingModel: BillingModel;
  billingRatePerHour: number;
  perProjectRate: number;
  projectTypeRates: { projectTypeId: string; rate: number }[];
  allowedProjectTypeIds: string[];
  defaultProjectTypeId: string;
  roleBillingMultipliers: RoleBillingMultiplier[];
  partnerSplit: PartnerSplit | null;
  brandNotes: string;
  clientType: "standard" | "broker" | "agent" | "photography";
  brokerId: string | null;
}

const DEFAULT_PARTNER_SPLIT: PartnerSplit = {
  partnerName: "",
  partnerPercent: 0.45,
  adminPercent: 0.45,
  marketingPercent: 0.10,
  crewSplitThreshold: 0.5,
  crewMarketingPercent: 0.10,
  crewRemainderSplit: 0.5,
  editorPartnerPercent: 0.45,
  editorAdminPercent: 0.45,
  editorMarketingPercent: 0.10,
  spendingBudgetEnabled: true,
};

const emptyForm = (): ClientFormData => ({
  company: "",
  contactName: "",
  phone: "",
  email: "",
  address: "",
  city: "",
  state: "",
  zip: "",
  billingModel: "hourly",
  billingRatePerHour: 200,
  perProjectRate: 0,
  projectTypeRates: [],
  allowedProjectTypeIds: [],
  defaultProjectTypeId: "",
  roleBillingMultipliers: [],
  partnerSplit: null,
  brandNotes: "",
  clientType: "standard",
  brokerId: null,
});

interface Props {
  /** When non-null, edit that client. When null and open, create a new client. */
  client: Client | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-set the type/broker for a NEW client (e.g. "Add Broker" / "Add Agent"). */
  initialClientType?: "standard" | "broker" | "agent" | "photography";
  initialBrokerId?: string | null;
}

export default function ClientProfileSheet({ client, open, onOpenChange, initialClientType, initialBrokerId }: Props) {
  const { data, addClient, updateClient } = useApp();
  const { createUser, allProfiles, refreshProfiles } = useAuth();
  const [sendingLogin, setSendingLogin] = useState(false);
  const [addingPerson, setAddingPerson] = useState(false);
  const [newLoginName, setNewLoginName] = useState("");
  const [newLoginEmail, setNewLoginEmail] = useState("");
  // Everyone who can log in for this client (a brokerage's two partners each get
  // their own account — multiple profiles can link to the same client).
  const logins = client ? allProfiles.filter(p => (p.clientIds ?? []).includes(client.id)) : [];

  // Create (or re-send) a portal login for an existing client: temp password +
  // welcome email, with an in-app fallback if the email doesn't send.
  // Create a portal login for a specific person (name + email) tied to this
  // client, with a temp password + welcome email. Call it once per partner.
  async function sendLoginFor(name: string, email: string) {
    if (!client) return;
    const em = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) { toast.error("Enter a valid email address"); return; }
    setSendingLogin(true);
    try {
      const tempPassword = genTempPassword();
      const userId = await createUser(em, tempPassword, (name.trim() || form.company.trim()), "client", [client.id]);
      const token = await getAuthToken();
      const res = await fetch("/api/invite-user", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ userId, tempPassword }),
      });
      showInviteCredentials("Login sent", tempPassword, res.ok);
      await refreshProfiles();
      setAddingPerson(false); setNewLoginName(""); setNewLoginEmail("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't send the login");
    } finally {
      setSendingLogin(false);
    }
  }
  const [brandAssistantOpen, setBrandAssistantOpen] = useState(false);
  const [form, setForm] = useState<ClientFormData>(emptyForm());

  // The Real Estate project type — agents only book real-estate shoots, so they
  // default to it (and their order menu is the live Real Estate service bundle,
  // shared by every agent — see RequestShootDialog).
  const reType = useMemo(
    () => data.projectTypes.find(pt => /real\s*estate/i.test(pt.name)) ?? null,
    [data.projectTypes]
  );

  // Only show project types that apply to this client's type (plus any already
  // picked), matching the per-type "Shown for" scoping set in Manage.
  const scopedProjectTypes = useMemo(() => {
    const scope = (form.clientType === "broker" || form.clientType === "agent") ? "real_estate"
      : form.clientType === "photography" ? "photography" : "wedding";
    return data.projectTypes.filter(pt => {
      const s = pt.appliesTo ?? "any";
      return s === "any" || s === scope || form.allowedProjectTypeIds.includes(pt.id);
    });
  }, [data.projectTypes, form.clientType, form.allowedProjectTypeIds]);

  // Hydrate form when sheet opens or client changes
  useEffect(() => {
    if (!open) return;
    if (client) {
      setForm({
        company: client.company,
        contactName: client.contactName,
        phone: client.phone,
        email: client.email,
        address: client.address || "",
        city: client.city || "",
        state: client.state || "",
        zip: client.zip || "",
        billingModel: client.billingModel || "hourly",
        billingRatePerHour: client.billingRatePerHour,
        perProjectRate: client.perProjectRate || 0,
        projectTypeRates: client.projectTypeRates || [],
        allowedProjectTypeIds: client.allowedProjectTypeIds || [],
        defaultProjectTypeId: client.defaultProjectTypeId || "",
        roleBillingMultipliers: client.roleBillingMultipliers || [],
        partnerSplit: client.partnerSplit || null,
        brandNotes: client.brandNotes || "",
        clientType: client.clientType || "standard",
        brokerId: client.brokerId || null,
      });
    } else {
      const isAgent = initialClientType === "agent";
      setForm({
        ...emptyForm(),
        clientType: initialClientType ?? "standard",
        brokerId: initialBrokerId ?? null,
        allowedProjectTypeIds: isAgent && reType ? [reType.id] : [],
        defaultProjectTypeId: isAgent && reType ? reType.id : "",
      });
    }
    // initial* are read only on open for a new client; intentionally not deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, client]);

  const handleSave = () => {
    if (!form.company) { toast.error("Company name is required"); return; }
    if (client) {
      updateClient(client.id, form);
      toast.success("Client updated");
    } else {
      addClient(form);
      toast.success("Client added");
    }
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:w-[560px] sm:max-w-[560px] bg-card border-border text-foreground overflow-y-auto overflow-x-hidden max-h-[100dvh]">
        <SheetHeader className="px-4 sm:px-6 pt-4 pb-4">
          <SheetTitle className="text-lg" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            {client ? (form.company || "Edit Client") : "Add Client"}
          </SheetTitle>
        </SheetHeader>
        <div className="space-y-5 px-4 sm:px-6 py-2">
          {/* Client type — only for non-real-estate clients (brokers/agents are
              created/managed from the Brokers area). Lets you tag a photography
              client, including after they're already created. */}
          {form.clientType !== "broker" && form.clientType !== "agent" && (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Client type</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setForm({ ...form, clientType: "standard" })}
                  className={cn("rounded-md border px-3 py-2 text-sm font-medium transition-colors",
                    form.clientType !== "photography" ? "border-primary bg-primary/15 text-foreground" : "border-border text-muted-foreground hover:bg-white/5")}
                >
                  Regular client
                </button>
                <button
                  type="button"
                  onClick={() => setForm({ ...form, clientType: "photography" })}
                  className={cn("rounded-md border px-3 py-2 text-sm font-medium transition-colors",
                    form.clientType === "photography" ? "border-primary bg-primary/15 text-foreground" : "border-border text-muted-foreground hover:bg-white/5")}
                >
                  Photography
                </button>
              </div>
            </div>
          )}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">
              {form.clientType === "agent" ? "Agent Name *" : form.clientType === "broker" ? "Brokerage Name *" : "Company Name *"}
            </Label>
            <Input
              value={form.company}
              onChange={(e) => setForm({ ...form, company: e.target.value })}
              className="bg-secondary border-border"
              placeholder={form.clientType === "agent" ? "e.g. Holly Huddleston" : form.clientType === "broker" ? "e.g. Realty One" : "e.g. Coldwell Banker Southern Realty"}
            />
            {form.clientType === "agent" && (
              <p className="text-[11px] text-muted-foreground">Use the agent's own name here — not the brokerage. They bill up to their broker.</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">{form.clientType === "agent" ? "Contact Name (optional)" : "Contact Name"}</Label>
            <Input value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} className="bg-secondary border-border" placeholder={form.clientType === "agent" ? "(usually same as agent name)" : "e.g. Sam Sizemore"} />
          </div>
          {/* Client type — Broker (a real-estate office that pays for its
              agents' shoots) / Agent (belongs to a broker) / Standard. */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Client Type</Label>
            <select
              value={form.clientType}
              onChange={e => {
                const t = e.target.value as "standard" | "broker" | "agent";
                setForm(f => ({
                  ...f,
                  clientType: t,
                  brokerId: t === "agent" ? f.brokerId : null,
                  // Agents are locked to Real Estate; clear the forced default when leaving.
                  allowedProjectTypeIds: t === "agent" && reType ? [reType.id] : f.allowedProjectTypeIds,
                  defaultProjectTypeId: t === "agent" && reType ? reType.id : f.defaultProjectTypeId,
                }));
              }}
              className="w-full bg-secondary border border-border rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="standard">Standard client</option>
              <option value="broker">Broker / Brokerage (pays for its agents)</option>
              <option value="agent">Agent (belongs to a broker)</option>
            </select>
          </div>
          {form.clientType === "agent" && (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Bills To (Broker)</Label>
              <select
                value={form.brokerId || ""}
                onChange={e => setForm(f => ({ ...f, brokerId: e.target.value || null }))}
                className="w-full bg-secondary border border-border rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="">— Select broker —</option>
                {data.clients
                  .filter(c => c.clientType === "broker" && c.id !== client?.id)
                  .sort((a, b) => a.company.localeCompare(b.company))
                  .map(b => <option key={b.id} value={b.id}>{b.company}</option>)}
              </select>
              {data.clients.filter(c => c.clientType === "broker").length === 0 && (
                <p className="text-[11px] text-amber-300">No brokers yet — add a client and set its type to "Broker" first.</p>
              )}
            </div>
          )}

          {/* Project Types — prominent, at the top for quick setup */}
          <div className="space-y-2 p-3 rounded-lg bg-primary/5 border border-primary/20">
            <div className="flex items-center gap-2">
              <Film className="w-4 h-4 text-primary" />
              <Label className="text-xs font-semibold text-foreground uppercase tracking-wider">Project Types</Label>
            </div>
            {form.clientType === "agent" ? (
              <>
                <p className="text-[10px] text-muted-foreground">
                  Agents book real-estate shoots. Their order menu is the Real Estate service bundle — anything you add to it under Manage → Services shows up for every agent automatically.
                </p>
                <div className="flex flex-wrap gap-2">
                  <span className="px-2.5 py-1 rounded text-xs border-2 bg-primary/20 border-primary text-primary">
                    {reType?.name ?? "Real Estate"}
                  </span>
                </div>
                {!reType && (
                  <p className="text-[11px] text-amber-300">No "Real Estate" project type found — add one under Manage so agents are scoped to it.</p>
                )}
              </>
            ) : (
              <>
            <p className="text-[10px] text-muted-foreground">
              Click to toggle which project types this client uses. Leave empty to allow all types.
            </p>
            <div className="flex flex-wrap gap-2">
              {scopedProjectTypes.map(pt => (
                <button
                  key={pt.id}
                  onClick={() => setForm(f => ({
                    ...f,
                    allowedProjectTypeIds: f.allowedProjectTypeIds.includes(pt.id)
                      ? f.allowedProjectTypeIds.filter(id => id !== pt.id)
                      : [...f.allowedProjectTypeIds, pt.id],
                  }))}
                  className={cn(
                    "px-2.5 py-1 rounded text-xs border-2 transition-colors",
                    form.allowedProjectTypeIds.includes(pt.id)
                      ? "bg-primary/20 border-primary text-primary"
                      : "border-border text-muted-foreground hover:border-primary/40"
                  )}
                >
                  {pt.name}
                </button>
              ))}
            </div>
            {form.allowedProjectTypeIds.length > 0 && (
              <div className="space-y-1.5 pt-2">
                <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">Default Project Type</Label>
                <select
                  value={form.defaultProjectTypeId}
                  onChange={e => setForm(f => ({ ...f, defaultProjectTypeId: e.target.value }))}
                  className="w-full bg-background border border-border rounded-md px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="">None</option>
                  {scopedProjectTypes
                    .filter(pt => form.allowedProjectTypeIds.includes(pt.id))
                    .map(pt => (
                      <option key={pt.id} value={pt.id}>{pt.name}</option>
                    ))}
                </select>
              </div>
            )}
              </>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Phone</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: formatPhoneInput(e.target.value) })} inputMode="tel" className="bg-secondary border-border" placeholder="615-000-0000" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Email</Label>
              <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="bg-secondary border-border" placeholder="email@example.com" />
            </div>
          </div>

          {/* Portal access — one login per person. A brokerage's two partners
              each get their own account; add as many as you need. Only after the
              client record is saved. Agents are invited from the Brokers page. */}
          {client && form.clientType !== "agent" && (
            <div className="rounded-lg border border-border bg-card p-3 space-y-3">
              <div>
                <p className="text-sm font-medium text-foreground">Portal access</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  People who can log in to see {form.clientType === "broker" ? "this brokerage's agents, shoots," : "their galleries"} and invoices. Add one per person — partners each get their own login.
                </p>
              </div>

              {logins.length > 0 && (
                <div className="space-y-1.5">
                  {logins.map(p => (
                    <div key={p.id} className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-secondary/30 px-2.5 py-1.5">
                      <div className="min-w-0">
                        <div className="text-xs text-foreground truncate">{p.name}</div>
                        <div className="text-[11px] text-muted-foreground truncate">{p.email}</div>
                      </div>
                      <span className={`text-[11px] shrink-0 ${p.mustChangePassword ? "text-amber-400" : "text-emerald-400"}`}>
                        {p.mustChangePassword ? "Invited" : "✓ Active"}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {addingPerson ? (
                <div className="space-y-2">
                  <Input value={newLoginName} onChange={(e) => setNewLoginName(e.target.value)} placeholder="Name (e.g. partner's name)" className="bg-secondary border-border h-9 text-sm" />
                  <Input value={newLoginEmail} onChange={(e) => setNewLoginEmail(e.target.value)} placeholder="their@email.com" inputMode="email" className="bg-secondary border-border h-9 text-sm" />
                  <div className="flex gap-2">
                    <Button onClick={() => sendLoginFor(newLoginName, newLoginEmail)} disabled={sendingLogin || !newLoginEmail.trim()} size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90">
                      {sendingLogin ? "Sending…" : "Send invite"}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => { setAddingPerson(false); setNewLoginName(""); setNewLoginEmail(""); }}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <Button
                  onClick={() => { setAddingPerson(true); setNewLoginName(logins.length === 0 ? form.contactName : ""); setNewLoginEmail(logins.length === 0 ? form.email : ""); }}
                  variant="outline" size="sm" className="border-border gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" /> {logins.length === 0 ? "Send a login" : "Add another login"}
                </Button>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Street Address</Label>
            <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="bg-secondary border-border" placeholder="123 Main St" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
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
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Billing Model</Label>
            <select
              value={form.billingModel}
              onChange={e => setForm({ ...form, billingModel: e.target.value as BillingModel })}
              className="w-full bg-secondary border border-border rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="hourly">Hourly Rate</option>
              <option value="per_project">Per Project (Flat Rate)</option>
            </select>
          </div>
          {form.billingModel === "hourly" ? (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Billing Rate ($/hr)</Label>
              <Input
                type="text" inputMode="decimal"
                value={form.billingRatePerHour}
                onChange={(e) => setForm({ ...form, billingRatePerHour: parseFloat(e.target.value) || 0 })}
                className="bg-secondary border-border"
                placeholder="200"
              />
            </div>
          ) : (
            <>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Default Rate Per Project ($)</Label>
              <Input
                type="text" inputMode="decimal"
                value={form.perProjectRate}
                onChange={(e) => setForm({ ...form, perProjectRate: parseFloat(e.target.value) || 0 })}
                className="bg-secondary border-border"
                placeholder="300"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">Per-Type Rates (overrides default)</Label>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs gap-1 text-primary hover:text-primary"
                  onClick={() => setForm(f => ({
                    ...f,
                    projectTypeRates: [...f.projectTypeRates, { projectTypeId: "", rate: 0 }],
                  }))}
                >
                  <Plus className="w-3 h-3" /> Add
                </Button>
              </div>
              {form.projectTypeRates.map((ptr, idx) => (
                <div key={idx} className="grid grid-cols-[1fr_80px_28px] gap-2 items-center">
                  <select
                    value={ptr.projectTypeId}
                    onChange={e => {
                      const updated = [...form.projectTypeRates];
                      updated[idx] = { ...updated[idx], projectTypeId: e.target.value };
                      setForm(f => ({ ...f, projectTypeRates: updated }));
                    }}
                    className="bg-secondary border border-border rounded-md px-2 py-1.5 text-xs text-foreground h-8"
                  >
                    <option value="">Select type</option>
                    {data.projectTypes.map(pt => (
                      <option key={pt.id} value={pt.id}>{pt.name}</option>
                    ))}
                  </select>
                  <Input
                    type="text" inputMode="decimal"
                    value={ptr.rate || ""}
                    onChange={e => {
                      const updated = [...form.projectTypeRates];
                      updated[idx] = { ...updated[idx], rate: parseFloat(e.target.value) || 0 };
                      setForm(f => ({ ...f, projectTypeRates: updated }));
                    }}
                    className="bg-secondary border-border h-8 text-xs"
                    placeholder="$"
                  />
                  <button
                    onClick={() => setForm(f => ({
                      ...f,
                      projectTypeRates: f.projectTypeRates.filter((_, i) => i !== idx),
                    }))}
                    className="text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
            </>
          )}
          {/* Role Billing Multipliers */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">Role Billing Multipliers</Label>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs gap-1 text-primary hover:text-primary"
                onClick={() => setForm(f => ({
                  ...f,
                  roleBillingMultipliers: [...f.roleBillingMultipliers, { role: "", multiplier: 0.5 }],
                }))}
              >
                <Plus className="w-3 h-3" /> Add
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Set how many hours are billed per hour worked for specific roles. Default is 1.0 (1hr worked = 1hr billed).
            </p>
            {form.roleBillingMultipliers.map((m, idx) => (
              <div key={idx} className="grid grid-cols-[1fr_80px_28px] gap-2 items-center">
                <Input
                  value={m.role}
                  onChange={e => {
                    const updated = [...form.roleBillingMultipliers];
                    updated[idx] = { ...updated[idx], role: e.target.value };
                    setForm(f => ({ ...f, roleBillingMultipliers: updated }));
                  }}
                  className="bg-secondary border-border h-8 text-xs"
                  placeholder="e.g. 2nd Videographer"
                />
                <Input
                  type="text" inputMode="decimal"
                  min="0"
                  value={m.multiplier}
                  onChange={e => {
                    const updated = [...form.roleBillingMultipliers];
                    updated[idx] = { ...updated[idx], multiplier: parseFloat(e.target.value) || 0 };
                    setForm(f => ({ ...f, roleBillingMultipliers: updated }));
                  }}
                  className="bg-secondary border-border h-8 text-xs"
                  placeholder="0.5"
                />
                <button
                  onClick={() => setForm(f => ({
                    ...f,
                    roleBillingMultipliers: f.roleBillingMultipliers.filter((_, i) => i !== idx),
                  }))}
                  className="text-muted-foreground hover:text-destructive transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
          {/* Brand & Voice Notes — long-form context the AI uses when
              suggesting video series. Has a "Help me fill this in"
              button that launches a guided AI interview to draft notes. */}
          <div className="space-y-2 border-t border-border pt-4">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Brand & Voice Notes</Label>
              <button
                type="button"
                onClick={() => setBrandAssistantOpen(true)}
                disabled={!form.company.trim()}
                className="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-md bg-primary/15 text-primary hover:bg-primary/25 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                title={form.company.trim() ? "Open the brand-notes interviewer" : "Enter a company name first"}
              >
                <Sparkles className="w-3 h-3" /> Help me fill this in
              </button>
            </div>
            <textarea
              value={form.brandNotes}
              onChange={e => setForm(f => ({ ...f, brandNotes: e.target.value }))}
              rows={8}
              placeholder="Who they are, what they sell, audience, voice, hooks, what to avoid. Paste socials/website links too. The AI uses this for every series suggestion."
              className="w-full bg-secondary border border-border rounded-md px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-y"
            />
            <p className="text-[10px] text-muted-foreground">Auto-included in series-chat AI prompts. Plain text or markdown — your call.</p>
          </div>

          {/* Partner Toggle — only shown when the org has Partner Splits
              enabled in feature flags. Profit-sharing partners are niche;
              hiding this for new users avoids "what's a partner split?"
              confusion. Existing clients with partnerSplit set still
              honor the data even if the toggle is hidden. */}
          {(data.organization?.features?.partnerSplits || form.partnerSplit) && (
          <div className="space-y-2 border-t border-border pt-4">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Partner</Label>
              <button
                onClick={() => setForm(f => ({
                  ...f,
                  partnerSplit: f.partnerSplit ? null : { ...DEFAULT_PARTNER_SPLIT },
                }))}
                className={cn(
                  "relative w-10 h-5 rounded-full transition-colors",
                  form.partnerSplit ? "bg-primary" : "bg-secondary border border-border"
                )}
              >
                <span className={cn(
                  "absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform",
                  form.partnerSplit ? "translate-x-5" : "translate-x-0.5"
                )} />
              </button>
            </div>
            {form.partnerSplit && (
              <div className="space-y-3 bg-secondary/30 rounded-lg p-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Partner Name</Label>
                  <Input
                    value={form.partnerSplit.partnerName}
                    onChange={e => setForm(f => ({ ...f, partnerSplit: f.partnerSplit ? { ...f.partnerSplit, partnerName: e.target.value } : null }))}
                    className="bg-secondary border-border h-8 text-sm"
                    placeholder="e.g. Showcase Media"
                  />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">Partner %</Label>
                    <Input type="text" inputMode="decimal"
                      value={form.partnerSplit.partnerPercent}
                      onChange={e => setForm(f => ({ ...f, partnerSplit: f.partnerSplit ? { ...f.partnerSplit, partnerPercent: parseFloat(e.target.value) || 0 } : null }))}
                      className="bg-secondary border-border h-8 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">Admin %</Label>
                    <Input type="text" inputMode="decimal"
                      value={form.partnerSplit.adminPercent}
                      onChange={e => setForm(f => ({ ...f, partnerSplit: f.partnerSplit ? { ...f.partnerSplit, adminPercent: parseFloat(e.target.value) || 0 } : null }))}
                      className="bg-secondary border-border h-8 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">Marketing %</Label>
                    <Input type="text" inputMode="decimal"
                      value={form.partnerSplit.marketingPercent}
                      onChange={e => setForm(f => ({ ...f, partnerSplit: f.partnerSplit ? { ...f.partnerSplit, marketingPercent: parseFloat(e.target.value) || 0 } : null }))}
                      className="bg-secondary border-border h-8 text-xs"
                    />
                  </div>
                </div>

                {/* Crew Split Settings */}
                <div className="space-y-2 border-t border-border/50 pt-2">
                  <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">Crew Split Rules</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">Crew Cost Threshold</Label>
                      <Input type="text" inputMode="decimal"
                        value={form.partnerSplit.crewSplitThreshold}
                        onChange={e => setForm(f => ({ ...f, partnerSplit: f.partnerSplit ? { ...f.partnerSplit, crewSplitThreshold: parseFloat(e.target.value) || 0 } : null }))}
                        className="bg-secondary border-border h-8 text-xs"
                      />
                      <p className="text-[9px] text-muted-foreground">If crew ≤ this % of billing, deduct marketing</p>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">Crew Marketing %</Label>
                      <Input type="text" inputMode="decimal"
                        value={form.partnerSplit.crewMarketingPercent}
                        onChange={e => setForm(f => ({ ...f, partnerSplit: f.partnerSplit ? { ...f.partnerSplit, crewMarketingPercent: parseFloat(e.target.value) || 0 } : null }))}
                        className="bg-secondary border-border h-8 text-xs"
                      />
                    </div>
                  </div>
                </div>

                {/* Editor Split Settings */}
                <div className="space-y-2 border-t border-border/50 pt-2">
                  <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">Editor Split Rules</Label>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">Partner %</Label>
                      <Input type="text" inputMode="decimal"
                        value={form.partnerSplit.editorPartnerPercent}
                        onChange={e => setForm(f => ({ ...f, partnerSplit: f.partnerSplit ? { ...f.partnerSplit, editorPartnerPercent: parseFloat(e.target.value) || 0 } : null }))}
                        className="bg-secondary border-border h-8 text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">Admin %</Label>
                      <Input type="text" inputMode="decimal"
                        value={form.partnerSplit.editorAdminPercent}
                        onChange={e => setForm(f => ({ ...f, partnerSplit: f.partnerSplit ? { ...f.partnerSplit, editorAdminPercent: parseFloat(e.target.value) || 0 } : null }))}
                        className="bg-secondary border-border h-8 text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">Marketing %</Label>
                      <Input type="text" inputMode="decimal"
                        value={form.partnerSplit.editorMarketingPercent}
                        onChange={e => setForm(f => ({ ...f, partnerSplit: f.partnerSplit ? { ...f.partnerSplit, editorMarketingPercent: parseFloat(e.target.value) || 0 } : null }))}
                        className="bg-secondary border-border h-8 text-xs"
                      />
                    </div>
                  </div>
                </div>

                {/* Spending Budget Toggle + end date */}
                <div className="space-y-2 border-t border-border/50 pt-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">Spending Budget</Label>
                      <p className="text-[9px] text-muted-foreground">Track marketing budget deductions for this client</p>
                    </div>
                    <button
                      onClick={() => setForm(f => ({
                        ...f,
                        partnerSplit: f.partnerSplit ? { ...f.partnerSplit, spendingBudgetEnabled: !f.partnerSplit.spendingBudgetEnabled } : null,
                      }))}
                      className={cn(
                        "relative w-10 h-5 rounded-full transition-colors",
                        form.partnerSplit?.spendingBudgetEnabled ? "bg-primary" : "bg-secondary border border-border"
                      )}
                    >
                      <span className={cn(
                        "absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform",
                        form.partnerSplit?.spendingBudgetEnabled ? "translate-x-5" : "translate-x-0.5"
                      )} />
                    </button>
                  </div>
                  {form.partnerSplit?.spendingBudgetEnabled && (
                    <div className="space-y-1.5 pl-1">
                      <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">Budget Active Through</Label>
                      <div className="flex items-center gap-2">
                        <DateField
                          value={form.partnerSplit.spendingBudgetEndedAt || ""}
                          onChange={v => setForm(f => ({ ...f, partnerSplit: f.partnerSplit ? { ...f.partnerSplit, spendingBudgetEndedAt: v || undefined } : null }))}
                          className="h-8 flex-1 text-xs"
                        />
                        {form.partnerSplit.spendingBudgetEndedAt && (
                          <button
                            type="button"
                            onClick={() => setForm(f => ({ ...f, partnerSplit: f.partnerSplit ? { ...f.partnerSplit, spendingBudgetEndedAt: undefined } : null }))}
                            className="text-[10px] text-muted-foreground hover:text-foreground px-2 py-1"
                          >
                            Clear
                          </button>
                        )}
                      </div>
                      <p className="text-[9px] text-muted-foreground">
                        Leave blank if active. Projects after this date skip the 10% budget allocation — full profit splits 50/50 between you and the partner.
                      </p>
                    </div>
                  )}
                </div>

                {/* Partnership end date — leave blank for active. Projects
                    after this date treat the client as non-partner so the
                    owner keeps 100% of profit; on/before stays under the
                    legacy split. Preserves historical P&L when a partnership
                    actually ends. */}
                <div className="space-y-1.5 border-t border-border/50 pt-2">
                  <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">Partnership Active Through</Label>
                  <div className="flex items-center gap-2">
                    <DateField
                      value={form.partnerSplit.endedAt || ""}
                      onChange={v => setForm(f => ({ ...f, partnerSplit: f.partnerSplit ? { ...f.partnerSplit, endedAt: v || undefined } : null }))}
                      className="h-8 flex-1 text-xs"
                    />
                    {form.partnerSplit.endedAt && (
                      <button
                        type="button"
                        onClick={() => setForm(f => ({ ...f, partnerSplit: f.partnerSplit ? { ...f.partnerSplit, endedAt: undefined } : null }))}
                        className="text-[10px] text-muted-foreground hover:text-foreground px-2 py-1"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  <p className="text-[9px] text-muted-foreground">
                    Leave blank if active. Projects dated after this end with the partnership and flow as non-partner in P&L (no partner/admin/spending split).
                  </p>
                </div>
              </div>
            )}
          </div>
          )}
        </div>
        <div className="flex justify-end gap-2 px-4 sm:px-6 pt-4 mt-4 border-t border-border">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} className="bg-primary text-primary-foreground hover:bg-primary/90">
            {client ? "Save Changes" : "Add Client"}
          </Button>
        </div>
      </SheetContent>

      {/* Brand-notes guided interview. Drafts a notes blob the owner
          reviews + appends to the textarea above. */}
      <BrandNotesAssistant
        open={brandAssistantOpen}
        onOpenChange={setBrandAssistantOpen}
        clientName={form.company}
        onApply={(draft) => setForm(f => ({ ...f, brandNotes: f.brandNotes ? `${f.brandNotes}\n\n${draft}` : draft }))}
      />
    </Sheet>
  );
}
