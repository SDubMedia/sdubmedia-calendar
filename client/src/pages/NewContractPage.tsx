// ============================================================
// NewContractPage — 3-step wizard for creating a contract.
// Pixieset Studio-style flow: Client → Project → Template → Editor.
// On finish: creates a draft contract and routes to /contracts/:id/edit.
// ============================================================

import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useApp } from "@/contexts/AppContext";
import type { Client, ContractTemplate, Project } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, X, FileText, Plus, ChevronRight, Sparkles, Search } from "lucide-react";
import AddContactModal from "@/components/AddContactModal";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { nanoid } from "nanoid";

type Step = 1 | 2 | 3;

export default function NewContractPage() {
  const { data, addContract, addProject } = useApp();
  const [, setLocation] = useLocation();

  // Pre-select template from ?template=<id> query param (sent from the
  // template detail panel's "Use in new contract" CTA).
  const initialTemplateId = useMemo(() => {
    const sp = new URLSearchParams(window.location.search);
    return sp.get("template") || null;
  }, []);

  const [step, setStep] = useState<Step>(1);

  // Step 1 — Client
  const [clientQuery, setClientQuery] = useState("");
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [addContactOpen, setAddContactOpen] = useState(false);

  // Step 2 — Project (existing or new)
  const [projectMode, setProjectMode] = useState<"existing" | "new" | "none">("none");
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectTypeId, setNewProjectTypeId] = useState<string>("");

  // Step 3 — Template
  const [creating, setCreating] = useState(false);

  // ----- Filtered client list for the typeahead -----
  const filteredClients = useMemo(() => {
    const q = clientQuery.trim().toLowerCase();
    if (!q) return data.clients.slice(0, 8);
    return data.clients.filter(c =>
      c.company.toLowerCase().includes(q) ||
      c.contactName.toLowerCase().includes(q) ||
      c.email.toLowerCase().includes(q),
    ).slice(0, 8);
  }, [data.clients, clientQuery]);

  const exactMatch = useMemo(() => {
    const q = clientQuery.trim().toLowerCase();
    if (!q) return null;
    return data.clients.find(c =>
      c.email.toLowerCase() === q ||
      c.company.toLowerCase() === q ||
      c.contactName.toLowerCase() === q,
    ) || null;
  }, [data.clients, clientQuery]);

  // Auto-default the project type when entering step 2 with a client
  useEffect(() => {
    if (step !== 2) return;
    if (newProjectTypeId) return;
    const def = selectedClient?.defaultProjectTypeId
      || data.projectTypes[0]?.id
      || "";
    setNewProjectTypeId(def);
    if (!newProjectName && selectedClient) {
      setNewProjectName(`${selectedClient.company || selectedClient.contactName}'s Project`);
    }
  }, [step, selectedClient, data.projectTypes, newProjectTypeId, newProjectName]);

  const clientProjects = useMemo(() => {
    if (!selectedClient) return [] as Project[];
    return data.projects.filter(p => p.clientId === selectedClient.id).slice().sort((a, b) => b.date.localeCompare(a.date));
  }, [data.projects, selectedClient]);

  // ----- Finishers -----
  const handleClientSelect = (c: Client) => {
    setSelectedClient(c);
    setClientQuery(c.company || c.contactName);
  };

  const handleNext = () => {
    if (step === 1) {
      if (!selectedClient) { toast.error("Pick or add a client"); return; }
      setStep(2);
      return;
    }
    if (step === 2) {
      if (projectMode === "existing" && !selectedProjectId) { toast.error("Pick a project or choose Skip"); return; }
      setStep(3);
      return;
    }
  };

  const handleBack = () => {
    if (step === 1) return setLocation("/contracts");
    setStep(s => (s - 1) as Step);
  };

  // Final create — runs from step 3 when user picks a template OR Blank.
  const handleCreate = async (template: ContractTemplate | null) => {
    if (!selectedClient) return;
    setCreating(true);
    try {
      // Resolve / create project
      let projectId: string | null = null;
      if (projectMode === "existing" && selectedProjectId) {
        projectId = selectedProjectId;
      } else if (projectMode === "new" && newProjectName.trim()) {
        const today = new Date().toISOString().slice(0, 10);
        const proj = await addProject({
          clientId: selectedClient.id,
          projectTypeId: newProjectTypeId || data.projectTypes[0]?.id || "",
          locationId: "",
          date: today,
          startTime: "09:00",
          endTime: "11:00",
          status: "upcoming",
          crew: [],
          postProduction: [],
          editorBilling: null,
          projectRate: null,
          billingModel: null,
          billingRate: null,
          paidDate: null,
          editTypes: [],
          notes: "",
          deliverableUrl: "",
          cancellationReason: "",
          cancelledAt: null,
        });
        projectId = proj.id;
      }

      const title = template?.name
        ? `${template.name} — ${selectedClient.company || selectedClient.contactName}`
        : `Contract — ${selectedClient.company || selectedClient.contactName}`;

      const contract = await addContract({
        templateId: template?.id || null,
        clientId: selectedClient.id,
        projectId,
        title,
        content: template?.content || "",
        status: "draft",
        sentAt: null,
        clientSignedAt: null,
        ownerSignedAt: null,
        clientSignature: null,
        ownerSignature: null,
        clientEmail: selectedClient.email || "",
        signToken: nanoid(32),
        fieldValues: {},
        additionalSigners: [],
        documentExpiresAt: null,
        // Default reminders ON for new contracts. The cron only fires for
        // contracts whose status is `sent` or `client_signed`, so this is
        // harmless until the user actually sends.
        remindersEnabled: true,
        lastReminderSentAt: null,
      });

      toast.success("Contract draft created");
      setLocation(`/contracts/${contract.id}/edit`);
    } catch (err: any) {
      toast.error(err.message || "Failed to create contract");
    } finally {
      setCreating(false);
    }
  };

  // ----- UI -----
  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top bar — close + breadcrumb */}
      <div className="px-4 sm:px-6 py-3 flex items-center justify-between border-b border-border">
        <button
          onClick={() => setLocation("/contracts")}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <X className="w-4 h-4" />
          New Contract
        </button>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className={cn(step === 1 && "text-foreground font-medium")}>Client</span>
          <ChevronRight className="w-3 h-3" />
          <span className={cn(step === 2 && "text-foreground font-medium")}>Project</span>
          <ChevronRight className="w-3 h-3" />
          <span className={cn(step === 3 && "text-foreground font-medium")}>Template</span>
        </div>
        <div className="w-[140px]" /> {/* spacer to balance the X */}
      </div>

      <div className="flex-1 overflow-auto">
        <div className="max-w-2xl mx-auto px-6 py-12">
          {step !== 1 && (
            <button onClick={handleBack} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-6">
              <ArrowLeft className="w-3.5 h-3.5" /> Back
            </button>
          )}

          {/* Step 1 — Client */}
          {step === 1 && (
            <>
              <h1 className="text-2xl font-semibold text-foreground mb-1" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                Create a new contract
              </h1>
              <p className="text-sm text-muted-foreground mb-6">Who is this contract for?</p>

              <Label className="text-xs text-muted-foreground">Client</Label>
              <div className="relative mt-1.5">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={clientQuery}
                  onChange={(e) => { setClientQuery(e.target.value); setSelectedClient(null); }}
                  placeholder="Type a name or email"
                  className="bg-secondary border-border pl-9 h-11 text-sm"
                  autoFocus
                />
              </div>

              {/* Selected client chip */}
              {selectedClient && (
                <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-primary/10 border border-primary/30 px-3 py-1 text-sm text-primary">
                  {selectedClient.company || selectedClient.contactName}
                  <button onClick={() => { setSelectedClient(null); setClientQuery(""); }} className="hover:text-primary/70">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* Suggestions / typeahead */}
              {!selectedClient && clientQuery.trim() && (
                <div className="mt-2 rounded-lg border border-border bg-card overflow-hidden">
                  {filteredClients.map(c => (
                    <button
                      key={c.id}
                      onClick={() => handleClientSelect(c)}
                      className="w-full text-left px-3 py-2 hover:bg-secondary/60 flex items-center gap-3 border-b border-border last:border-b-0"
                    >
                      <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-xs font-medium">
                        {(c.contactName || c.company).slice(0, 1).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground truncate">{c.company || c.contactName}</p>
                        <p className="text-xs text-muted-foreground truncate">{c.email || c.contactName}</p>
                      </div>
                    </button>
                  ))}
                  {!exactMatch && (
                    <button
                      onClick={() => setAddContactOpen(true)}
                      className="w-full text-left px-3 py-2.5 hover:bg-secondary/60 flex items-center gap-3 text-primary border-t border-border"
                    >
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                        <Plus className="w-4 h-4" />
                      </div>
                      <span className="text-sm font-medium">Add &quot;{clientQuery.trim()}&quot;</span>
                    </button>
                  )}
                </div>
              )}

              <div className="mt-8">
                <Button onClick={handleNext} disabled={!selectedClient}>
                  Next <ChevronRight className="w-4 h-4 ml-1.5" />
                </Button>
              </div>
            </>
          )}

          {/* Step 2 — Project */}
          {step === 2 && selectedClient && (
            <>
              <h1 className="text-2xl font-semibold text-foreground mb-1" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                Link a project
              </h1>
              <p className="text-sm text-muted-foreground mb-6">Optional — helps you find this contract later. Skip if it's standalone.</p>

              <div className="space-y-3">
                <button
                  onClick={() => setProjectMode("none")}
                  className={cn("w-full text-left px-4 py-3 rounded-lg border transition-colors",
                    projectMode === "none" ? "border-primary bg-primary/5" : "border-border hover:border-primary/40")}
                >
                  <div className="text-sm font-medium text-foreground">No project</div>
                  <div className="text-xs text-muted-foreground mt-0.5">Skip — this contract isn't tied to a specific shoot.</div>
                </button>

                {clientProjects.length > 0 && (
                  <button
                    onClick={() => setProjectMode("existing")}
                    className={cn("w-full text-left px-4 py-3 rounded-lg border transition-colors",
                      projectMode === "existing" ? "border-primary bg-primary/5" : "border-border hover:border-primary/40")}
                  >
                    <div className="text-sm font-medium text-foreground">Existing project</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{clientProjects.length} project{clientProjects.length === 1 ? "" : "s"} for {selectedClient.company || selectedClient.contactName}</div>
                  </button>
                )}

                <button
                  onClick={() => setProjectMode("new")}
                  className={cn("w-full text-left px-4 py-3 rounded-lg border transition-colors",
                    projectMode === "new" ? "border-primary bg-primary/5" : "border-border hover:border-primary/40")}
                >
                  <div className="text-sm font-medium text-foreground">New project</div>
                  <div className="text-xs text-muted-foreground mt-0.5">Create a draft project alongside this contract.</div>
                </button>
              </div>

              {projectMode === "existing" && (
                <div className="mt-4 space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Pick a project</Label>
                  <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
                    <SelectTrigger className="bg-secondary border-border h-11"><SelectValue placeholder="Select a project" /></SelectTrigger>
                    <SelectContent className="bg-popover border-border">
                      {clientProjects.map(p => {
                        const t = data.projectTypes.find(x => x.id === p.projectTypeId);
                        return (
                          <SelectItem key={p.id} value={p.id}>{p.date} · {t?.name || "Project"}</SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {projectMode === "new" && (
                <div className="mt-4 space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Project name</Label>
                    <Input value={newProjectName} onChange={(e) => setNewProjectName(e.target.value)} className="bg-secondary border-border h-11" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Project type</Label>
                    <Select value={newProjectTypeId} onValueChange={setNewProjectTypeId}>
                      <SelectTrigger className="bg-secondary border-border h-11"><SelectValue placeholder="Pick a type" /></SelectTrigger>
                      <SelectContent className="bg-popover border-border">
                        {data.projectTypes.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              <div className="mt-8">
                <Button onClick={handleNext}>Next <ChevronRight className="w-4 h-4 ml-1.5" /></Button>
              </div>
            </>
          )}

          {/* Step 3 — Template */}
          {step === 3 && (
            <>
              <h1 className="text-2xl font-semibold text-foreground mb-1" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                How would you like to start?
              </h1>
              <p className="text-sm text-muted-foreground mb-6">Pick a lawyer-vetted template or start from a blank document.</p>

              <button
                onClick={() => handleCreate(null)}
                disabled={creating}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-lg border border-border hover:border-primary/40 transition-colors mb-6"
              >
                <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center">
                  <Plus className="w-5 h-5 text-muted-foreground" />
                </div>
                <div className="flex-1 text-left">
                  <div className="text-sm font-medium text-foreground">Blank contract</div>
                  <div className="text-xs text-muted-foreground mt-0.5">Write your own from scratch.</div>
                </div>
              </button>

              <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">Start with a template</div>
              <div className="rounded-lg border border-border bg-card overflow-hidden">
                {data.contractTemplates.length === 0 && (
                  <div className="px-4 py-8 text-center text-sm text-muted-foreground">No templates yet. Pick Blank to start writing.</div>
                )}
                {data.contractTemplates.map((tpl, i) => {
                  const preselected = initialTemplateId === tpl.id;
                  return (
                    <button
                      key={tpl.id}
                      onClick={() => handleCreate(tpl)}
                      disabled={creating}
                      className={cn(
                        "w-full flex items-center gap-3 px-4 py-3 text-left transition-colors",
                        i > 0 && "border-t border-border",
                        preselected ? "bg-primary/10 hover:bg-primary/15" : "hover:bg-secondary/60",
                      )}
                    >
                      <div className="w-9 h-9 rounded bg-[#f6f2e8] flex items-center justify-center shrink-0">
                        <FileText className="w-4 h-4 text-zinc-700" />
                      </div>
                      <span className="text-sm text-foreground">{tpl.name}</span>
                      {preselected && <span className="ml-auto text-[10px] uppercase tracking-wider text-primary">Pre-selected</span>}
                    </button>
                  );
                })}
              </div>

              {creating && <p className="text-xs text-muted-foreground mt-4 flex items-center gap-1.5"><Sparkles className="w-3 h-3" /> Creating contract…</p>}
            </>
          )}
        </div>
      </div>

      <AddContactModal
        open={addContactOpen}
        onClose={() => setAddContactOpen(false)}
        prefill={clientQuery}
        onCreated={(c) => handleClientSelect(c)}
      />
    </div>
  );
}
