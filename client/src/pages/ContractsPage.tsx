// ============================================================
// ContractsPage — Create, send, and manage contracts with e-signatures
// ============================================================

import { useState, useMemo, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { useScopedData as useApp } from "@/hooks/useScopedData";
import { useAuth } from "@/contexts/AuthContext";
import type { Contract, ContractTemplate, ContractStatus } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, FileText, Send, CheckCircle, Eye, Trash2, Edit3, Copy, PenTool, Upload, X, Clapperboard, ScrollText, Handshake, Users, Package, Lock, UserCheck, Baby, MapPin, Key, Music, ArrowRight, Sparkles } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { WysiwygContractEditor } from "@/components/WysiwygContractEditor";
import { ContractLetterhead } from "@/components/ContractLetterhead";
import DOMPurify from "dompurify";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { nanoid } from "nanoid";
import { getAuthToken } from "@/lib/supabase";

const STATUS_COLORS: Record<ContractStatus, string> = {
  draft: "bg-zinc-500/20 text-zinc-300 border-zinc-500/30",
  sent: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  client_signed: "bg-amber-500/20 text-amber-300 border-amber-500/30",
  completed: "bg-green-500/20 text-green-300 border-green-500/30",
  void: "bg-red-500/20 text-red-300 border-red-500/30",
};

const STATUS_LABELS: Record<ContractStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  client_signed: "Awaiting Your Signature",
  completed: "Completed",
  void: "Void",
};

// Maps the seeded library template names to a display category.
// User-created templates that don't match fall through to "Custom".
const TEMPLATE_CATEGORIES: Record<string, "Agreements" | "Releases & Licensing"> = {
  "Video Production Contract": "Agreements",
  "Proposal / Statement of Work": "Agreements",
  "Independent Contractor Agreement": "Agreements",
  "Crew Deal Memo": "Agreements",
  "Equipment Rental Agreement": "Agreements",
  "Mutual NDA": "Agreements",
  "Model Release": "Releases & Licensing",
  "Minor Model Release": "Releases & Licensing",
  "Location Release": "Releases & Licensing",
  "Usage License": "Releases & Licensing",
  "Music License Request": "Releases & Licensing",
};

const CATEGORY_ORDER = ["Proposals", "Agreements", "Releases & Licensing", "Custom"] as const;
type CategoryName = typeof CATEGORY_ORDER[number];

// Visual identity per category. Icon in a tinted box, short subtitle.
const CATEGORY_META: Record<CategoryName, { icon: LucideIcon; subtitle: string; tint: string; iconColor: string }> = {
  "Proposals": {
    icon: ScrollText,
    subtitle: "Pre-contract pitches with packages and milestones",
    tint: "bg-sky-500/10 border-sky-500/20",
    iconColor: "text-sky-300",
  },
  "Agreements": {
    icon: Handshake,
    subtitle: "Signable contracts you send to clients",
    tint: "bg-amber-500/10 border-amber-500/20",
    iconColor: "text-amber-300",
  },
  "Releases & Licensing": {
    icon: Key,
    subtitle: "On-set permissions and rights grants",
    tint: "bg-purple-500/10 border-purple-500/20",
    iconColor: "text-purple-300",
  },
  "Custom": {
    icon: Sparkles,
    subtitle: "Templates you've created or duplicated",
    tint: "bg-zinc-500/10 border-zinc-500/20",
    iconColor: "text-zinc-300",
  },
};

// Template icon by name. Falls back to FileText for user-created templates.
const TEMPLATE_ICONS: Record<string, LucideIcon> = {
  "Video Production Contract": Clapperboard,
  "Proposal / Statement of Work": ScrollText,
  "Independent Contractor Agreement": Handshake,
  "Crew Deal Memo": Users,
  "Equipment Rental Agreement": Package,
  "Mutual NDA": Lock,
  "Model Release": UserCheck,
  "Minor Model Release": Baby,
  "Location Release": MapPin,
  "Usage License": Key,
  "Music License Request": Music,
};

function templateIcon(name: string): LucideIcon {
  return TEMPLATE_ICONS[name] || FileText;
}

// Strip HTML tags for the cream-paper thumbnail preview while keeping
// {{merge_field}} tokens visible. Falls through cleanly for legacy
// plain-text templates.
function templatePreviewText(content: string): string {
  if (!content) return "";
  // Drop chip wrappers but keep the {{token}} text inside.
  return content
    .replace(/<br\s*\/?>(\s*)/gi, "\n$1")
    .replace(/<\/p>\s*<p[^>]*>/gi, "\n\n")
    .replace(/<\/(h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export default function ContractsPage() {
  const { data, addClient, addContractTemplate, updateContractTemplate, deleteContractTemplate, addContract, updateContract, deleteContract, addProposalTemplate } = useApp();
  const { profile } = useAuth();
  const [, setLocation] = useLocation();
  const [tab, setTab] = useState<"contracts" | "templates">("templates");

  // Template dialog
  const [tplDialogOpen, setTplDialogOpen] = useState(false);
  const [editingTplId, setEditingTplId] = useState<string | null>(null);
  const [tplName, setTplName] = useState("");
  const [tplContent, setTplContent] = useState("");

  // Template detail panel — opens before edit so user can preview + see usage stats
  const [detailTplId, setDetailTplId] = useState<string | null>(null);

  // Contract dialog
  const [contractDialogOpen, setContractDialogOpen] = useState(false);
  const [contractTitle, setContractTitle] = useState("");
  const [contractClientId, setContractClientId] = useState("");
  const [contractProjectId, setContractProjectId] = useState("");
  const [contractTemplateId, setContractTemplateId] = useState("");
  const [contractContent, setContractContent] = useState("");
  const [contractClientEmail, setContractClientEmail] = useState("");

  // Quick-add client
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickAddName, setQuickAddName] = useState("");
  const [quickAddEmail, setQuickAddEmail] = useState("");

  async function quickAddClient() {
    if (!quickAddName.trim() || !quickAddEmail.trim()) { toast.error("Name and email required"); return; }
    try {
      const client = await addClient({
        company: quickAddName.trim(), contactName: quickAddName.trim(), email: quickAddEmail.trim(), phone: "",
        address: "", city: "", state: "", zip: "",
        billingModel: "per_project" as any, billingRatePerHour: 0, perProjectRate: 0,
        projectTypeRates: [], allowedProjectTypeIds: [], defaultProjectTypeId: "", roleBillingMultipliers: [],
      });
      setContractClientId(client.id);
      setContractClientEmail(quickAddEmail.trim());
      setQuickAddOpen(false);
      setQuickAddName(""); setQuickAddEmail("");
      toast.success(`Client "${client.company}" created`);
    } catch (e: any) {
      toast.error(e.message || "Failed to create client");
    }
  }

  // View contract
  const [viewContract, setViewContract] = useState<Contract | null>(null);

  // Signature dialog
  const [signDialogOpen, setSignDialogOpen] = useState(false);
  const [signingContractId, setSigningContractId] = useState<string | null>(null);
  const [signatureType, setSignatureType] = useState<"drawn" | "typed">("typed");
  const [typedName, setTypedName] = useState("");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  // Upload PDF
  const pdfRef = useRef<HTMLInputElement>(null);
  const [uploadingPdf, setUploadingPdf] = useState(false);

  function openEditTemplate(tpl: ContractTemplate) {
    setEditingTplId(tpl.id);
    setTplName(tpl.name);
    setTplContent(tpl.content);
    setTplDialogOpen(true);
  }

  async function saveTemplate() {
    if (!tplName.trim()) { toast.error("Template name required"); return; }
    if (editingTplId) {
      await updateContractTemplate(editingTplId, { name: tplName.trim(), content: tplContent });
      toast.success("Template updated");
    } else {
      await addContractTemplate({ name: tplName.trim(), content: tplContent });
      toast.success("Template created");
    }
    setTplDialogOpen(false);
  }

  function openNewContract() {
    setContractTitle("");
    setContractClientId("");
    setContractProjectId("");
    setContractTemplateId("");
    setContractContent("");
    setContractClientEmail("");
    setContractDialogOpen(true);
  }

  function applyTemplate(templateId: string) {
    setContractTemplateId(templateId);
    const tpl = data.contractTemplates.find(t => t.id === templateId);
    if (tpl) {
      setContractContent(tpl.content);
      if (!contractTitle) setContractTitle(tpl.name);
    }
  }

  // Open the new-contract dialog pre-loaded with this template
  function applyTemplateToNewContract(tpl: ContractTemplate) {
    setDetailTplId(null);
    openNewContract();
    setContractTemplateId(tpl.id);
    setContractContent(tpl.content);
    setContractTitle(tpl.name);
  }

  // Stats for detail panel
  const detailTpl = detailTplId ? data.contractTemplates.find(t => t.id === detailTplId) : null;
  const detailUsage = useMemo(() => {
    if (!detailTpl) return { count: 0, lastUsed: null as string | null };
    const matching = data.contracts.filter(c => c.templateId === detailTpl.id);
    const lastUsed = matching.length > 0
      ? matching.map(c => c.sentAt || c.createdAt).filter(Boolean).sort().pop() || null
      : null;
    return { count: matching.length, lastUsed };
  }, [detailTpl, data.contracts]);

  function resolveMergeFields(content: string): string {
    const client = data.clients.find(c => c.id === contractClientId);
    const project = contractProjectId ? data.projects.find(p => p.id === contractProjectId) : null;
    const projectType = project ? data.projectTypes.find(t => t.id === project.projectTypeId) : null;
    const location = project ? data.locations.find(l => l.id === project.locationId) : null;
    const replacements: Record<string, string> = {
      client_name: client?.contactName || "",
      client_company: client?.company || "",
      client_email: client?.email || "",
      project_type: projectType?.name || "",
      project_date: project?.date ? new Date(project.date + "T00:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "TBD",
      project_location: location?.name || "TBD",
      date: new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }),
      owner_name: profile?.name || "",
      company_name: data.organization?.name || "",
    };
    return content
      // Replace WYSIWYG chip spans with their resolved value (drops the styling).
      .replace(/<span\s+data-merge-field="(\w+)"[^>]*>\s*\{\{\1\}\}\s*<\/span>/g, (_, field) => replacements[field] ?? "")
      // Then any unwrapped {{token}} in plain text or pasted content.
      .replace(/\{\{(\w+)\}\}/g, (_, field) => replacements[field] ?? "");
  }

  async function createContract() {
    if (!contractTitle.trim()) { toast.error("Title required"); return; }
    if (!contractClientId) { toast.error("Select a client"); return; }
    if (!contractClientEmail.trim()) { toast.error("Client email required"); return; }

    const resolved = resolveMergeFields(contractContent);
    const token = nanoid(32);

    await addContract({
      templateId: contractTemplateId || null,
      clientId: contractClientId,
      projectId: contractProjectId || null,
      title: contractTitle.trim(),
      content: resolved,
      status: "draft",
      sentAt: null,
      clientSignedAt: null,
      ownerSignedAt: null,
      clientSignature: null,
      ownerSignature: null,
      clientEmail: contractClientEmail.trim(),
      signToken: token,
    });
    toast.success("Contract created as draft");
    setContractDialogOpen(false);
  }

  async function sendContract(contractId: string) {
    const contract = data.contracts.find(c => c.id === contractId);
    if (!contract) return;

    // Send email with signing link
    try {
      const token = await getAuthToken();
      const signUrl = `${window.location.origin}/sign/${contract.signToken}`;
      const orgName = data.organization?.name || "Your production company";
      const res = await fetch("/api/send-contract-email", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          to: contract.clientEmail,
          cc: profile?.email || "",
          subject: `Contract: ${contract.title} — ${orgName}`,
          signUrl,
          contractTitle: contract.title,
          orgName,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed" }));
        throw new Error(err.error || "Failed to send email");
      }
      await updateContract(contractId, { status: "sent", sentAt: new Date().toISOString() });
      toast.success("Contract sent to " + contract.clientEmail);
    } catch (e: any) {
      toast.error(e.message || "Failed to send");
    }
  }

  // Owner countersign
  function openSignDialog(contractId: string) {
    setSigningContractId(contractId);
    setTypedName(profile?.name || "");
    setSignatureType("typed");
    setSignDialogOpen(true);
  }

  async function submitSignature() {
    if (!signingContractId) return;

    let signatureData: string;
    if (signatureType === "typed") {
      if (!typedName.trim()) { toast.error("Type your name"); return; }
      signatureData = typedName.trim();
    } else {
      const canvas = canvasRef.current;
      if (!canvas) return;
      signatureData = canvas.toDataURL("image/png");
    }

    const sig = {
      name: profile?.name || "",
      email: profile?.email || "",
      ip: "server-side",
      timestamp: new Date().toISOString(),
      signatureData,
      signatureType,
    };

    await updateContract(signingContractId, {
      ownerSignature: sig,
      ownerSignedAt: new Date().toISOString(),
      status: "completed",
    });
    toast.success("Contract signed and completed!");
    setSignDialogOpen(false);
    setViewContract(null);
  }

  // Canvas drawing handlers
  const startDraw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    setIsDrawing(true);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const x = ("touches" in e) ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = ("touches" in e) ? e.touches[0].clientY - rect.top : e.clientY - rect.top;
    ctx.beginPath();
    ctx.moveTo(x, y);
  }, []);

  const draw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const x = ("touches" in e) ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = ("touches" in e) ? e.touches[0].clientY - rect.top : e.clientY - rect.top;
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#ffffff";
    ctx.lineTo(x, y);
    ctx.stroke();
  }, [isDrawing]);

  const stopDraw = useCallback(() => setIsDrawing(false), []);

  function clearCanvas() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  // Auto-fill client email
  function handleClientChange(clientId: string) {
    setContractClientId(clientId);
    const client = data.clients.find(c => c.id === clientId);
    if (client?.email) setContractClientEmail(client.email);
  }

  async function handlePdfUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    const isPdf = file.type === "application/pdf" || file.name.endsWith(".pdf");

    if (isPdf) {
      setUploadingPdf(true);
      try {
        const buffer = await file.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        let binary = "";
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
        const base64 = btoa(binary);

        const token = await getAuthToken();
        const res = await fetch("/api/parse-pdf", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ fileData: base64 }),
        });
        if (!res.ok) throw new Error("Failed to parse PDF");
        const { text } = await res.json();
        if (text) {
          setContractContent(text);
          toast.success("PDF content imported — review and edit as needed");
        } else {
          toast.error("No text found in PDF");
        }
      } catch (err: any) {
        toast.error(err.message || "Failed to upload");
      } finally {
        setUploadingPdf(false);
      }
    } else {
      // Text file
      const reader = new FileReader();
      reader.onload = (ev) => {
        const text = ev.target?.result as string;
        if (text) {
          setContractContent(text);
          toast.success("Document imported");
        }
      };
      reader.readAsText(file);
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-border bg-card/50">
        <div>
          <h1 className="text-xl font-semibold text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            Contracts
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">{data.contracts.length} contract{data.contracts.length !== 1 ? "s" : ""}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setTab("contracts")} className={cn("px-3 py-1.5 rounded-md text-xs font-medium transition-colors", tab === "contracts" ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground")}>
            Contracts
          </button>
          <button onClick={() => setTab("templates")} className={cn("px-3 py-1.5 rounded-md text-xs font-medium transition-colors", tab === "templates" ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground")}>
            Templates
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-3 sm:p-6">
        {tab === "contracts" ? (
          <div className="space-y-4">
            <Button onClick={openNewContract} className="gap-2">
              <Plus className="w-4 h-4" /> New Contract
            </Button>

            {data.contracts.length === 0 ? (
              <div className="space-y-4">
                {(data.contractTemplates.length > 0 || data.proposalTemplates.length > 0) && (
                  <button
                    onClick={() => setTab("templates")}
                    className="group relative w-full overflow-hidden rounded-xl border border-primary/30 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-5 text-left transition-all hover:border-primary/50 hover:shadow-lg hover:-translate-y-0.5"
                  >
                    <div className="flex items-start gap-4">
                      <div className="shrink-0 rounded-lg bg-primary/15 p-2.5">
                        <Sparkles className="w-5 h-5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                          Start with a template
                        </p>
                        <p className="text-sm text-muted-foreground mt-1">
                          {data.contractTemplates.length + data.proposalTemplates.length} ready to use — NDAs, releases, production contracts. Pick one and we'll auto-fill your client and project details.
                        </p>
                      </div>
                      <ArrowRight className="w-4 h-4 text-primary opacity-60 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all shrink-0 mt-3" />
                    </div>
                  </button>
                )}
                <div className="text-center py-8 text-muted-foreground">
                  <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">No contracts yet. {data.contractTemplates.length === 0 && data.proposalTemplates.length === 0 ? "Create one above or build a template first." : "Pick a template above, or click \"New Contract\" to start blank."}</p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {data.contracts.map(c => {
                  const client = data.clients.find(cl => cl.id === c.clientId);
                  return (
                    <div key={c.id} className="bg-card border border-border rounded-lg p-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-semibold text-foreground text-sm">{c.title}</span>
                            <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded border", STATUS_COLORS[c.status])}>
                              {STATUS_LABELS[c.status]}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground">{client?.company || "Unknown"} · {c.clientEmail}</p>
                          {c.clientSignedAt && <p className="text-xs text-green-400 mt-1">Client signed {new Date(c.clientSignedAt).toLocaleDateString()}</p>}
                          {c.ownerSignedAt && <p className="text-xs text-green-400">You signed {new Date(c.ownerSignedAt).toLocaleDateString()}</p>}
                        </div>
                        <div className="flex items-center gap-1">
                          <button onClick={() => setViewContract(c)} className="p-1.5 text-muted-foreground hover:text-foreground"><Eye className="w-4 h-4" /></button>
                          {c.status === "draft" && (
                            <button onClick={() => sendContract(c.id)} className="p-1.5 text-blue-400 hover:text-blue-300" title="Send"><Send className="w-4 h-4" /></button>
                          )}
                          {c.status === "sent" && (
                            <button onClick={() => sendContract(c.id)} className="p-1.5 text-blue-400 hover:text-blue-300" title="Resend"><Send className="w-4 h-4" /></button>
                          )}
                          {c.status === "client_signed" && (
                            <button onClick={() => openSignDialog(c.id)} className="p-1.5 text-amber-400 hover:text-amber-300" title="Countersign"><PenTool className="w-4 h-4" /></button>
                          )}
                          {c.status !== "completed" && (
                            <button onClick={async () => { await updateContract(c.id, { status: "void" }); toast.success("Contract voided"); }} className="p-1.5 text-muted-foreground hover:text-red-400" title="Void"><X className="w-4 h-4" /></button>
                          )}
                          {(c.status === "draft" || c.status === "void") && (
                            <button onClick={async () => { await deleteContract(c.id); toast.success("Deleted"); }} className="p-1.5 text-muted-foreground hover:text-destructive" title="Delete"><Trash2 className="w-4 h-4" /></button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          /* Templates Tab */
          <div className="space-y-6">
            <div className="flex gap-2">
              <Button onClick={() => setLocation("/proposals/templates/new/edit")} className="gap-2">
                <Plus className="w-4 h-4" /> New Template
              </Button>
            </div>

            {data.contractTemplates.length === 0 && data.proposalTemplates.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">No templates yet. Create a reusable template.</p>
              </div>
            ) : (
              CATEGORY_ORDER.map(cat => {
                const proposalsForCat = cat === "Proposals" ? data.proposalTemplates : [];
                const contractsForCat = data.contractTemplates.filter(t => {
                  const c = TEMPLATE_CATEGORIES[t.name];
                  if (cat === "Custom") return !c;
                  if (cat === "Proposals") return false;
                  return c === cat;
                });
                const total = proposalsForCat.length + contractsForCat.length;
                if (total === 0) return null;
                const meta = CATEGORY_META[cat];
                const CatIcon = meta.icon;
                return (
                  <div key={cat} className="space-y-4">
                    <div className="flex items-center gap-3 pb-2 border-b border-border/60">
                      <div className={cn("shrink-0 rounded-lg border p-2", meta.tint)}>
                        <CatIcon className={cn("w-5 h-5", meta.iconColor)} strokeWidth={1.75} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-base font-semibold text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{cat}</h3>
                        <p className="text-xs text-muted-foreground mt-0.5">{meta.subtitle}</p>
                      </div>
                      <span className="text-xs text-muted-foreground tabular-nums">{total} {total === 1 ? "template" : "templates"}</span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                      {/* Proposal templates (V2 - full editor) */}
                      {proposalsForCat.map(tpl => {
                        const Icon = templateIcon(tpl.name);
                        return (
                          <div
                            key={`p-${tpl.id}`}
                            className="group bg-card border border-border rounded-xl overflow-hidden hover:border-primary/40 hover:shadow-lg hover:-translate-y-0.5 transition-all cursor-pointer"
                            onClick={() => setLocation(`/proposals/templates/${tpl.id}/edit`)}
                          >
                            <div className="aspect-[4/3] relative overflow-hidden bg-[#f6f2e8]">
                              {tpl.coverImageUrl ? (
                                <img src={tpl.coverImageUrl} alt={tpl.name} className="w-full h-full object-cover" />
                              ) : (
                                <div className="absolute inset-0 flex items-center justify-center px-4 text-center">
                                  <div>
                                    <Icon className="w-8 h-8 mx-auto mb-2 text-zinc-700/40" strokeWidth={1.5} />
                                    <div className="text-zinc-800 leading-tight" style={{ fontFamily: "'Source Serif Pro', 'Georgia', serif", fontStyle: "italic", fontSize: "13px" }}>
                                      {tpl.name}
                                    </div>
                                  </div>
                                </div>
                              )}
                              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                <button onClick={(e) => { e.stopPropagation(); setLocation(`/proposals/templates/${tpl.id}/edit`); }} className="p-2 bg-white/20 rounded-lg hover:bg-white/30 text-white" title="Edit"><Edit3 className="w-4 h-4" /></button>
                                <button onClick={async (e) => { e.stopPropagation(); await addProposalTemplate({ name: `${tpl.name} (Copy)`, coverImageUrl: tpl.coverImageUrl, pages: tpl.pages, packages: tpl.packages, lineItems: tpl.lineItems, contractContent: tpl.contractContent, paymentConfig: tpl.paymentConfig, notes: tpl.notes }); toast.success("Duplicated"); }} className="p-2 bg-white/20 rounded-lg hover:bg-white/30 text-white" title="Duplicate"><Copy className="w-4 h-4" /></button>
                              </div>
                            </div>
                            <div className="p-3 flex items-start gap-2">
                              <Icon className="w-4 h-4 text-muted-foreground/60 shrink-0 mt-0.5" strokeWidth={1.75} />
                              <div className="min-w-0 flex-1">
                                <p className="font-semibold text-foreground text-sm truncate" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{tpl.name}</p>
                                <p className="text-[10px] text-muted-foreground mt-0.5">{tpl.pages.length > 0 ? `${tpl.pages.length} pages` : "Proposal template"}</p>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                      {/* Contract templates — serif preview on cream paper */}
                      {contractsForCat.map(tpl => {
                        const Icon = templateIcon(tpl.name);
                        return (
                          <div
                            key={`c-${tpl.id}`}
                            className="group bg-card border border-border rounded-xl overflow-hidden hover:border-primary/40 hover:shadow-lg hover:-translate-y-0.5 transition-all cursor-pointer"
                            onClick={() => setDetailTplId(tpl.id)}
                          >
                            <div className="aspect-[4/3] relative overflow-hidden bg-[#f6f2e8]">
                              <div className="absolute inset-0 px-4 py-3 overflow-hidden pointer-events-none">
                                <div
                                  className="text-[7.5px] text-zinc-800 leading-[1.55] line-clamp-[14] whitespace-pre-wrap"
                                  style={{ fontFamily: "'Source Serif Pro', 'Georgia', serif" }}
                                >
                                  {templatePreviewText(tpl.content) || "Empty template"}
                                </div>
                              </div>
                              <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-[#f6f2e8] to-transparent pointer-events-none" />
                              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                <span className="text-white/90 text-xs font-medium">Click to preview</span>
                              </div>
                            </div>
                            <div className="p-3 flex items-start gap-2">
                              <Icon className="w-4 h-4 text-muted-foreground/60 shrink-0 mt-0.5" strokeWidth={1.75} />
                              <div className="min-w-0 flex-1">
                                <p className="font-semibold text-foreground text-sm truncate" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{tpl.name}</p>
                                <p className="text-[10px] text-muted-foreground mt-0.5">Contract template</p>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* Template Dialog */}
      <Dialog open={tplDialogOpen} onOpenChange={setTplDialogOpen}>
        <DialogContent className="bg-card border-border text-foreground max-w-4xl max-h-[95dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              {editingTplId ? "Edit Template" : "New Template"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Template Name</Label>
              <Input value={tplName} onChange={e => setTplName(e.target.value)} className="bg-secondary border-border" placeholder="e.g. Standard Video Production Agreement" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Contract Content</Label>
              <WysiwygContractEditor
                value={tplContent}
                onChange={setTplContent}
                placeholder="Start typing or paste your contract. Insert merge fields from the toolbar — they'll auto-fill with client and project data when used."
                minHeight="55vh"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setTplDialogOpen(false)}>Cancel</Button>
            <Button onClick={saveTemplate}>{editingTplId ? "Save" : "Create Template"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Template Detail Dialog — preview before edit */}
      <Dialog open={!!detailTpl} onOpenChange={(open) => !open && setDetailTplId(null)}>
        <DialogContent className="bg-card border-border text-foreground max-w-3xl max-h-[90dvh] overflow-y-auto">
          {detailTpl && (() => {
            const Icon = templateIcon(detailTpl.name);
            const cat = TEMPLATE_CATEGORIES[detailTpl.name] || "Custom";
            return (
              <>
                <DialogHeader>
                  <div className="flex items-start gap-3">
                    <div className="shrink-0 rounded-lg bg-primary/10 p-2.5">
                      <Icon className="w-5 h-5 text-primary" strokeWidth={1.75} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <DialogTitle style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                        {detailTpl.name}
                      </DialogTitle>
                      <p className="text-[11px] uppercase tracking-wider text-muted-foreground/70 mt-1">{cat}</p>
                    </div>
                  </div>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-lg border border-border bg-secondary/50 p-3">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70">Used in</p>
                      <p className="text-lg font-semibold text-foreground mt-0.5" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                        {detailUsage.count} {detailUsage.count === 1 ? "contract" : "contracts"}
                      </p>
                    </div>
                    <div className="rounded-lg border border-border bg-secondary/50 p-3">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70">Last used</p>
                      <p className="text-sm font-semibold text-foreground mt-0.5">
                        {detailUsage.lastUsed ? new Date(detailUsage.lastUsed).toLocaleDateString() : "Never"}
                      </p>
                    </div>
                    <div className="rounded-lg border border-border bg-secondary/50 p-3">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70">Length</p>
                      <p className="text-sm font-semibold text-foreground mt-0.5">
                        {detailTpl.content.length.toLocaleString()} chars
                      </p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs uppercase tracking-wider text-muted-foreground/70">Preview</p>
                      <p className="text-[10px] text-muted-foreground/60">This is what your client sees</p>
                    </div>
                    <div className="bg-white rounded-lg max-h-[60vh] overflow-y-auto border border-gray-200">
                      <ContractLetterhead
                        orgName={data.organization?.name}
                        ownerName={profile?.name}
                        orgLogo={data.organization?.logoUrl}
                        businessInfo={data.organization?.businessInfo}
                        intro="The contract is ready for review and signature. If you have any questions, just ask."
                      />
                      {/^\s*<(p|h[1-6]|ul|ol|div|span|strong|em|br)\b/i.test(detailTpl.content) ? (
                        <div
                          className="px-6 sm:px-10 py-8 contract-html-light"
                          dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(detailTpl.content) }}
                        />
                      ) : (
                        <div className="px-6 sm:px-10 py-8 text-sm text-gray-700 leading-relaxed whitespace-pre-wrap" style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif" }}>
                          {detailTpl.content || "Empty template"}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <DialogFooter className="gap-2 flex-row sm:justify-between">
                  <Button
                    variant="ghost"
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={async () => {
                      if (!confirm(`Delete "${detailTpl.name}"?`)) return;
                      await deleteContractTemplate(detailTpl.id);
                      setDetailTplId(null);
                      toast.success("Template deleted");
                    }}
                  >
                    <Trash2 className="w-4 h-4 mr-1.5" /> Delete
                  </Button>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={async () => {
                        const copy = await addContractTemplate({
                          name: `${detailTpl.name} (Copy)`,
                          content: detailTpl.content,
                        });
                        toast.success("Duplicated — opening your copy");
                        setDetailTplId(copy.id);
                      }}
                    >
                      <Copy className="w-4 h-4 mr-1.5" /> Duplicate
                    </Button>
                    <Button variant="outline" onClick={() => { setDetailTplId(null); openEditTemplate(detailTpl); }}>
                      <Edit3 className="w-4 h-4 mr-1.5" /> Edit
                    </Button>
                    <Button onClick={() => applyTemplateToNewContract(detailTpl)}>
                      <ArrowRight className="w-4 h-4 mr-1.5" /> Use in new contract
                    </Button>
                  </div>
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* New Contract Dialog */}
      <Dialog open={contractDialogOpen} onOpenChange={setContractDialogOpen}>
        <DialogContent className="bg-card border-border text-foreground max-w-4xl max-h-[95dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: "'Space Grotesk', sans-serif" }}>New Contract</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Title</Label>
              <Input value={contractTitle} onChange={e => setContractTitle(e.target.value)} className="bg-secondary border-border" placeholder="e.g. Video Production Agreement — CBSR" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">Client</Label>
                  <button onClick={() => setQuickAddOpen(!quickAddOpen)} className="text-[10px] text-primary hover:text-primary/80">
                    {quickAddOpen ? "Cancel" : "+ New Client"}
                  </button>
                </div>
                {quickAddOpen ? (
                  <div className="space-y-2 p-2 bg-secondary/50 rounded-lg border border-border">
                    <Input value={quickAddName} onChange={e => setQuickAddName(e.target.value)} className="bg-secondary border-border text-sm" placeholder="Client name" />
                    <Input value={quickAddEmail} onChange={e => setQuickAddEmail(e.target.value)} className="bg-secondary border-border text-sm" placeholder="Email" />
                    <Button size="sm" onClick={quickAddClient} className="w-full text-xs">Create & Select</Button>
                  </div>
                ) : (
                  <Select value={contractClientId} onValueChange={handleClientChange}>
                    <SelectTrigger className="bg-secondary border-border"><SelectValue placeholder="Select client" /></SelectTrigger>
                    <SelectContent className="bg-popover border-border">
                      {data.clients.map(c => <SelectItem key={c.id} value={c.id}>{c.company}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Client Email</Label>
                <Input value={contractClientEmail} onChange={e => setContractClientEmail(e.target.value)} className="bg-secondary border-border" placeholder="client@email.com" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Start from Template (optional)</Label>
              <Select value={contractTemplateId} onValueChange={applyTemplate}>
                <SelectTrigger className="bg-secondary border-border"><SelectValue placeholder="Blank contract" /></SelectTrigger>
                <SelectContent className="bg-popover border-border">
                  {data.contractTemplates.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">Contract Content</Label>
                <div className="flex gap-2">
                  <input ref={pdfRef} type="file" accept=".pdf,.txt,.doc,.docx,text/plain,application/pdf" onChange={handlePdfUpload} className="hidden" />
                  <button
                    onClick={() => pdfRef.current?.click()}
                    disabled={uploadingPdf}
                    className="flex items-center gap-1 text-xs text-primary hover:text-primary/80"
                  >
                    <Upload className="w-3 h-3" />
                    {uploadingPdf ? "Uploading..." : "Upload PDF/Doc"}
                  </button>
                </div>
              </div>
              <WysiwygContractEditor
                value={contractContent}
                onChange={setContractContent}
                placeholder="Enter or paste contract text, or upload a PDF. Pick a template above to start from a legal-vetted draft."
                minHeight="45vh"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setContractDialogOpen(false)}>Cancel</Button>
            <Button onClick={createContract}>Create Draft</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Contract Dialog */}
      <Dialog open={!!viewContract} onOpenChange={o => !o && setViewContract(null)}>
        <DialogContent className="bg-card border-border text-foreground max-w-4xl max-h-[95dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{viewContract?.title}</DialogTitle>
          </DialogHeader>
          {viewContract && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <span className={cn("text-xs font-semibold px-2 py-0.5 rounded border", STATUS_COLORS[viewContract.status])}>
                  {STATUS_LABELS[viewContract.status]}
                </span>
                <span className="text-xs text-muted-foreground">{data.clients.find(c => c.id === viewContract.clientId)?.company}</span>
              </div>
              <div className="bg-white rounded-lg max-h-[60vh] overflow-y-auto border border-gray-200">
                <ContractLetterhead
                  orgName={data.organization?.name}
                  ownerName={profile?.name}
                  orgLogo={data.organization?.logoUrl}
                  businessInfo={data.organization?.businessInfo}
                  intro="The contract is ready for review and signature. If you have any questions, just ask."
                />
                {/^\s*<(p|h[1-6]|ul|ol|div|span|strong|em|br)\b/i.test(viewContract.content) ? (
                  <div
                    className="px-6 sm:px-10 py-8 contract-html-light"
                    dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(viewContract.content) }}
                  />
                ) : (
                  <div className="px-6 sm:px-10 py-8 text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                    {viewContract.content}
                  </div>
                )}
              </div>
              {viewContract.clientSignature && (
                <div className="bg-secondary/50 rounded-lg p-4">
                  <p className="text-xs text-muted-foreground mb-1">Client Signature</p>
                  {viewContract.clientSignature.signatureType === "drawn" ? (
                    <img src={viewContract.clientSignature.signatureData} alt="Client signature" className="h-12" />
                  ) : (
                    <p className="text-lg font-cursive italic text-foreground">{viewContract.clientSignature.signatureData}</p>
                  )}
                  <p className="text-[10px] text-muted-foreground mt-1">{viewContract.clientSignature.name} · {new Date(viewContract.clientSignature.timestamp).toLocaleString()}</p>
                </div>
              )}
              {viewContract.ownerSignature && (
                <div className="bg-secondary/50 rounded-lg p-4">
                  <p className="text-xs text-muted-foreground mb-1">Owner Signature</p>
                  {viewContract.ownerSignature.signatureType === "drawn" ? (
                    <img src={viewContract.ownerSignature.signatureData} alt="Owner signature" className="h-12" />
                  ) : (
                    <p className="text-lg font-cursive italic text-foreground">{viewContract.ownerSignature.signatureData}</p>
                  )}
                  <p className="text-[10px] text-muted-foreground mt-1">{viewContract.ownerSignature.name} · {new Date(viewContract.ownerSignature.timestamp).toLocaleString()}</p>
                </div>
              )}
              <div className="flex gap-2">
                {viewContract.status === "draft" && (
                  <Button onClick={() => { sendContract(viewContract.id); setViewContract(null); }} className="gap-2">
                    <Send className="w-4 h-4" /> Send to Client
                  </Button>
                )}
                {viewContract.status === "client_signed" && (
                  <Button onClick={() => { openSignDialog(viewContract.id); }} className="gap-2">
                    <PenTool className="w-4 h-4" /> Countersign
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Signature Dialog (Owner Countersign) */}
      <Dialog open={signDialogOpen} onOpenChange={setSignDialogOpen}>
        <DialogContent className="bg-card border-border text-foreground max-w-md">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Sign Contract</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex gap-2">
              <button onClick={() => setSignatureType("typed")} className={cn("flex-1 py-2 rounded-lg border text-sm font-medium", signatureType === "typed" ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground")}>
                Type Name
              </button>
              <button onClick={() => setSignatureType("drawn")} className={cn("flex-1 py-2 rounded-lg border text-sm font-medium", signatureType === "drawn" ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground")}>
                Draw Signature
              </button>
            </div>

            {signatureType === "typed" ? (
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Full Legal Name</Label>
                <Input value={typedName} onChange={e => setTypedName(e.target.value)} className="bg-secondary border-border text-lg" placeholder="Your full name" />
                {typedName && (
                  <div className="p-4 bg-white rounded-lg text-center">
                    <p className="text-2xl italic text-black" style={{ fontFamily: "cursive" }}>{typedName}</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Draw your signature below</Label>
                <div className="border border-border rounded-lg bg-[#1a1a2e] overflow-hidden">
                  <canvas
                    ref={canvasRef}
                    width={350}
                    height={120}
                    className="w-full cursor-crosshair touch-none"
                    onMouseDown={startDraw}
                    onMouseMove={draw}
                    onMouseUp={stopDraw}
                    onMouseLeave={stopDraw}
                    onTouchStart={startDraw}
                    onTouchMove={draw}
                    onTouchEnd={stopDraw}
                  />
                </div>
                <button onClick={clearCanvas} className="text-xs text-muted-foreground hover:text-foreground">Clear</button>
              </div>
            )}

            <p className="text-[10px] text-muted-foreground">
              By signing, you agree this is your legal signature and you accept the terms of this contract. Timestamp and IP will be recorded.
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSignDialogOpen(false)}>Cancel</Button>
            <Button onClick={submitSignature} className="gap-2">
              <CheckCircle className="w-4 h-4" /> Sign Contract
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
