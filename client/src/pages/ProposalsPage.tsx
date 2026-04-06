// ============================================================
// ProposalsPage — Create, send, and manage proposals (HoneyBook-style)
// Bundles services + contract + payment into one client-facing link
// ============================================================

import { useState, useMemo, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { useApp } from "@/contexts/AppContext";
import { useAuth } from "@/contexts/AuthContext";
import type { Proposal, ProposalTemplate, ProposalStatus, ProposalLineItem, ProposalPaymentConfig, ServiceItem } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, FileText, Send, CheckCircle, Eye, Trash2, Edit3, PenTool, Upload, X, DollarSign, Link2, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { nanoid } from "nanoid";
import { getAuthToken } from "@/lib/supabase";

const STATUS_COLORS: Record<ProposalStatus, string> = {
  draft: "bg-zinc-500/20 text-zinc-300 border-zinc-500/30",
  sent: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  accepted: "bg-amber-500/20 text-amber-300 border-amber-500/30",
  completed: "bg-green-500/20 text-green-300 border-green-500/30",
  void: "bg-red-500/20 text-red-300 border-red-500/30",
};

const STATUS_LABELS: Record<ProposalStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  accepted: "Accepted — Awaiting Your Signature",
  completed: "Completed",
  void: "Void",
};

const MERGE_FIELDS = [
  { key: "{{client_name}}", label: "Client Name" },
  { key: "{{client_company}}", label: "Client Company" },
  { key: "{{client_email}}", label: "Client Email" },
  { key: "{{project_type}}", label: "Project Type" },
  { key: "{{date}}", label: "Today's Date" },
  { key: "{{owner_name}}", label: "Your Name" },
  { key: "{{company_name}}", label: "Your Company" },
  { key: "{{proposal_total}}", label: "Proposal Total" },
  { key: "{{deposit_amount}}", label: "Deposit Amount" },
];

const DEFAULT_PAYMENT: ProposalPaymentConfig = { option: "none", depositPercent: 50, depositAmount: 0 };

function emptyLineItem(): ProposalLineItem {
  return { id: nanoid(6), description: "", details: "", quantity: 1, unitPrice: 0, amount: 0 };
}

// ---- Line item helpers (outside component to avoid re-creation) ----
function calcLineItems(items: ProposalLineItem[]): ProposalLineItem[] {
  return items.map(li => ({ ...li, amount: li.quantity * li.unitPrice }));
}

function calcTotal(items: ProposalLineItem[]) {
  return items.reduce((sum, li) => sum + li.quantity * li.unitPrice, 0);
}

function updateLineItem(items: ProposalLineItem[], id: string, field: keyof ProposalLineItem, value: any, setter: (items: ProposalLineItem[]) => void) {
  setter(items.map(li => {
    if (li.id !== id) return li;
    const updated = { ...li, [field]: value };
    updated.amount = updated.quantity * updated.unitPrice;
    return updated;
  }));
}

function addLineItemTo(items: ProposalLineItem[], setter: (items: ProposalLineItem[]) => void) {
  setter([...items, emptyLineItem()]);
}

function removeLineItemFrom(items: ProposalLineItem[], id: string, setter: (items: ProposalLineItem[]) => void) {
  if (items.length <= 1) return;
  setter(items.filter(li => li.id !== id));
}

// ---- Extracted sub-components ----
function LineItemEditor({ items, setter, services }: { items: ProposalLineItem[]; setter: (i: ProposalLineItem[]) => void; services?: ServiceItem[] }) {
  const total = calcTotal(items);
  function addFromService(svc: ServiceItem) {
    setter([...items, { id: nanoid(6), description: svc.name, details: svc.description, quantity: 1, unitPrice: svc.defaultPrice, amount: svc.defaultPrice }]);
  }
  return (
    <div className="space-y-2">
      <Label className="text-xs text-muted-foreground">Services / Line Items</Label>
      {items.map((li, idx) => (
        <div key={li.id} className="flex gap-2 items-start">
          <div className="flex-1 space-y-1">
            <Input
              value={li.description}
              onChange={e => updateLineItem(items, li.id, "description", e.target.value, setter)}
              className="bg-secondary border-border text-sm"
              placeholder={`Service ${idx + 1} (e.g. Full Day Video Production)`}
            />
            <Input
              value={li.details}
              onChange={e => updateLineItem(items, li.id, "details", e.target.value, setter)}
              className="bg-secondary border-border text-xs"
              placeholder="Details (optional)"
            />
          </div>
          <div className="w-16">
            <Input
              type="number"
              value={li.quantity}
              onChange={e => updateLineItem(items, li.id, "quantity", Number(e.target.value) || 0, setter)}
              className="bg-secondary border-border text-sm text-center"
              min={1}
            />
            <span className="text-[10px] text-muted-foreground">Qty</span>
          </div>
          <div className="w-28">
            <Input
              type="number"
              value={li.unitPrice || ""}
              onChange={e => updateLineItem(items, li.id, "unitPrice", Number(e.target.value) || 0, setter)}
              className="bg-secondary border-border text-sm"
              placeholder="0.00"
              min={0}
              step={0.01}
            />
            <span className="text-[10px] text-muted-foreground">Price</span>
          </div>
          <div className="w-20 text-right pt-2">
            <span className="text-sm font-mono text-foreground">${(li.quantity * li.unitPrice).toFixed(2)}</span>
          </div>
          <button
            onClick={() => removeLineItemFrom(items, li.id, setter)}
            className="p-1.5 mt-1 text-muted-foreground hover:text-destructive"
            disabled={items.length <= 1}
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      ))}
      <div className="flex items-center justify-between pt-1">
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => addLineItemTo(items, setter)} className="text-xs text-primary hover:text-primary/80 flex items-center gap-1">
            <Plus className="w-3 h-3" /> Blank
          </button>
          {services?.map(svc => (
            <button key={svc.id} onClick={() => addFromService(svc)} className="text-[10px] px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20">
              {svc.name} · ${svc.defaultPrice}
            </button>
          ))}
        </div>
        <div className="text-sm font-semibold text-foreground">
          Total: <span className="font-mono">${total.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
}

function PaymentEditor({ config, setConfig, total }: { config: ProposalPaymentConfig; setConfig: (c: ProposalPaymentConfig) => void; total: number }) {
  const depositAmount = config.option === "deposit" ? Math.round(total * (config.depositPercent / 100) * 100) / 100 : 0;
  return (
    <div className="space-y-3">
      <Label className="text-xs text-muted-foreground">Payment at Signing</Label>
      <div className="flex gap-2">
        {(["none", "deposit", "full"] as const).map(opt => (
          <button
            key={opt}
            onClick={() => setConfig({ ...config, option: opt, depositAmount: opt === "deposit" ? depositAmount : 0 })}
            className={cn(
              "flex-1 py-2 rounded-lg border text-xs font-medium transition-colors",
              config.option === opt ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"
            )}
          >
            {opt === "none" ? "No Payment" : opt === "deposit" ? "Deposit" : "Full Payment"}
          </button>
        ))}
      </div>
      {config.option === "deposit" && (
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <Input
              type="number"
              value={config.depositPercent}
              onChange={e => {
                const pct = Math.max(0, Math.min(100, Number(e.target.value) || 0));
                setConfig({ ...config, depositPercent: pct, depositAmount: Math.round(total * (pct / 100) * 100) / 100 });
              }}
              className="bg-secondary border-border w-20 text-sm text-center"
              min={1} max={100}
            />
            <span className="text-xs text-muted-foreground">%</span>
          </div>
          <span className="text-sm text-foreground font-mono">= ${depositAmount.toFixed(2)}</span>
        </div>
      )}
      {config.option === "full" && total > 0 && (
        <p className="text-xs text-muted-foreground">Client will pay <span className="font-mono font-semibold text-foreground">${total.toFixed(2)}</span> at signing via Stripe</p>
      )}
      {config.option === "none" && (
        <p className="text-xs text-muted-foreground">No payment will be collected. You can invoice separately later.</p>
      )}
    </div>
  );
}

export default function ProposalsPage() {
  const { data, addClient, addProposalTemplate, updateProposalTemplate, deleteProposalTemplate, addProposal, updateProposal, deleteProposal } = useApp();
  const { profile } = useAuth();
  const [, setLocation] = useLocation();
  const [tab, setTab] = useState<"proposals" | "templates">("templates");

  // Template dialog state
  const [tplDialogOpen, setTplDialogOpen] = useState(false);
  const [editingTplId, setEditingTplId] = useState<string | null>(null);
  const [tplName, setTplName] = useState("");
  const [tplLineItems, setTplLineItems] = useState<ProposalLineItem[]>([emptyLineItem()]);
  const [tplContractContent, setTplContractContent] = useState("");
  const [tplPayment, setTplPayment] = useState<ProposalPaymentConfig>(DEFAULT_PAYMENT);
  const [tplNotes, setTplNotes] = useState("");
  const [tplCoverUrl, setTplCoverUrl] = useState("");
  const [uploadingCover, setUploadingCover] = useState(false);

  // Proposal dialog state
  const [proposalDialogOpen, setProposalDialogOpen] = useState(false);
  const [propTitle, setPropTitle] = useState("");
  const [propClientId, setPropClientId] = useState("");
  const [propProjectId, setPropProjectId] = useState("");
  const [propTemplateId, setPropTemplateId] = useState("");
  const [propLineItems, setPropLineItems] = useState<ProposalLineItem[]>([emptyLineItem()]);
  const [propContractContent, setPropContractContent] = useState("");
  const [propPayment, setPropPayment] = useState<ProposalPaymentConfig>(DEFAULT_PAYMENT);
  const [propClientEmail, setPropClientEmail] = useState("");
  const [propNotes, setPropNotes] = useState("");

  // View proposal
  const [viewProposal, setViewProposal] = useState<Proposal | null>(null);

  // Signature dialog
  const [signDialogOpen, setSignDialogOpen] = useState(false);
  const [signingProposalId, setSigningProposalId] = useState<string | null>(null);
  const [signatureType, setSignatureType] = useState<"drawn" | "typed">("typed");
  const [typedName, setTypedName] = useState("");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  // HoneyBook import
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importUrl, setImportUrl] = useState("");
  const [importPasteContent, setImportPasteContent] = useState("");
  const [importing, setImporting] = useState(false);
  const [importTarget, setImportTarget] = useState<"template" | "proposal">("template");

  // Quick-add client
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickAddName, setQuickAddName] = useState("");
  const [quickAddEmail, setQuickAddEmail] = useState("");

  async function quickAddClient() {
    if (!quickAddName.trim() || !quickAddEmail.trim()) { toast.error("Name and email required"); return; }
    try {
      const client = await addClient({
        company: quickAddName.trim(),
        contactName: quickAddName.trim(),
        email: quickAddEmail.trim(),
        phone: "",
        billingModel: "per_project" as any,
        billingRatePerHour: 0,
        perProjectRate: 0,
        projectTypeRates: [],
        allowedProjectTypeIds: [],
        defaultProjectTypeId: "",
        roleBillingMultipliers: [],
      });
      setPropClientId(client.id);
      setPropClientEmail(quickAddEmail.trim());
      setQuickAddOpen(false);
      setQuickAddName("");
      setQuickAddEmail("");
      toast.success(`Client "${client.company}" created`);
    } catch (e: any) {
      toast.error(e.message || "Failed to create client");
    }
  }

  // Textarea refs for cursor-position insert
  const tplTextareaRef = useRef<HTMLTextAreaElement>(null);
  const propTextareaRef = useRef<HTMLTextAreaElement>(null);

  function insertAtCursor(ref: React.RefObject<HTMLTextAreaElement | null>, text: string, setter: (val: string) => void, currentVal: string) {
    const el = ref.current;
    if (!el) { setter(currentVal + text); return; }
    const start = el.selectionStart ?? currentVal.length;
    const end = el.selectionEnd ?? currentVal.length;
    const newVal = currentVal.slice(0, start) + text + currentVal.slice(end);
    setter(newVal);
    // Restore cursor position after React re-render
    requestAnimationFrame(() => {
      el.focus();
      el.selectionStart = el.selectionEnd = start + text.length;
    });
  }

  // PDF upload
  const pdfRef = useRef<HTMLInputElement>(null);
  const [uploadingPdf, setUploadingPdf] = useState(false);

  // ---- Template CRUD ----
  function openNewTemplate() {
    setEditingTplId(null);
    setTplName("");
    setTplLineItems([emptyLineItem()]);
    setTplContractContent("");
    setTplPayment(DEFAULT_PAYMENT);
    setTplNotes("");
    setTplCoverUrl("");
    setTplDialogOpen(true);
  }

  function openEditTemplate(tpl: ProposalTemplate) {
    setEditingTplId(tpl.id);
    setTplName(tpl.name);
    setTplLineItems(tpl.lineItems.length > 0 ? tpl.lineItems : [emptyLineItem()]);
    setTplContractContent(tpl.contractContent);
    setTplPayment(tpl.paymentConfig);
    setTplNotes(tpl.notes);
    setTplCoverUrl(tpl.coverImageUrl || "");
    setTplDialogOpen(true);
  }

  async function handleCoverUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setUploadingCover(true);
    try {
      const { supabase } = await import("@/lib/supabase");
      const ext = file.name.split(".").pop() || "jpg";
      const path = `covers/${nanoid(10)}.${ext}`;
      const { error } = await supabase.storage.from("proposal-assets").upload(path, file, { upsert: true });
      if (error) throw new Error(error.message);
      const { data: urlData } = supabase.storage.from("proposal-assets").getPublicUrl(path);
      setTplCoverUrl(urlData.publicUrl);
      toast.success("Cover image uploaded");
    } catch (err: any) {
      toast.error(err.message || "Upload failed");
    } finally {
      setUploadingCover(false);
    }
  }

  async function saveTemplate() {
    if (!tplName.trim()) { toast.error("Template name required"); return; }
    const payload = {
      name: tplName.trim(),
      coverImageUrl: tplCoverUrl,
      pages: [] as any[],
      packages: [] as any[],
      lineItems: calcLineItems(tplLineItems),
      contractContent: tplContractContent,
      paymentConfig: { ...tplPayment, depositAmount: tplPayment.option === "deposit" ? Math.round(calcTotal(tplLineItems) * (tplPayment.depositPercent / 100) * 100) / 100 : 0 },
      notes: tplNotes,
    };
    if (editingTplId) {
      await updateProposalTemplate(editingTplId, payload);
      toast.success("Template updated");
    } else {
      await addProposalTemplate(payload);
      toast.success("Template created");
    }
    setTplDialogOpen(false);
  }

  // ---- Proposal CRUD ----
  function openNewProposal() {
    setPropTitle("");
    setPropClientId("");
    setPropProjectId("");
    setPropTemplateId("");
    setPropLineItems([emptyLineItem()]);
    setPropContractContent("");
    setPropPayment(DEFAULT_PAYMENT);
    setPropClientEmail("");
    setPropNotes("");
    setProposalDialogOpen(true);
  }

  function applyTemplate(templateId: string) {
    setPropTemplateId(templateId);
    const tpl = data.proposalTemplates.find(t => t.id === templateId);
    if (tpl) {
      setPropLineItems(tpl.lineItems.length > 0 ? tpl.lineItems.map(li => ({ ...li, id: nanoid(6) })) : [emptyLineItem()]);
      setPropContractContent(tpl.contractContent);
      setPropPayment(tpl.paymentConfig);
      if (!propTitle) setPropTitle(tpl.name);
    }
  }

  function handleClientChange(clientId: string) {
    setPropClientId(clientId);
    const client = data.clients.find(c => c.id === clientId);
    if (client?.email) setPropClientEmail(client.email);
  }

  function resolveMergeFields(content: string): string {
    const client = data.clients.find(c => c.id === propClientId);
    const project = propProjectId ? data.projects.find(p => p.id === propProjectId) : null;
    const projectType = project ? data.projectTypes.find(t => t.id === project.projectTypeId) : null;
    const total = calcTotal(propLineItems);
    const depositAmt = propPayment.option === "deposit" ? Math.round(total * (propPayment.depositPercent / 100) * 100) / 100 : 0;
    return content
      .replace(/\{\{client_name\}\}/g, client?.contactName || "")
      .replace(/\{\{client_company\}\}/g, client?.company || "")
      .replace(/\{\{client_email\}\}/g, client?.email || "")
      .replace(/\{\{project_type\}\}/g, projectType?.name || "")
      .replace(/\{\{date\}\}/g, new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }))
      .replace(/\{\{owner_name\}\}/g, profile?.name || "")
      .replace(/\{\{company_name\}\}/g, data.organization?.name || "")
      .replace(/\{\{proposal_total\}\}/g, `$${total.toFixed(2)}`)
      .replace(/\{\{deposit_amount\}\}/g, `$${depositAmt.toFixed(2)}`);
  }

  async function createProposal() {
    if (!propTitle.trim()) { toast.error("Title required"); return; }
    if (!propClientId) { toast.error("Select a client"); return; }
    if (!propClientEmail.trim()) { toast.error("Client email required"); return; }

    const resolved = resolveMergeFields(propContractContent);
    const items = calcLineItems(propLineItems);
    const subtotal = calcTotal(propLineItems);
    const depositAmount = propPayment.option === "deposit" ? Math.round(subtotal * (propPayment.depositPercent / 100) * 100) / 100 : 0;

    await addProposal({
      clientId: propClientId,
      projectId: propProjectId || null,
      title: propTitle.trim(),
      pages: [],
      packages: [],
      selectedPackageId: null,
      paymentMilestones: [],
      pipelineStage: "inquiry",
      viewedAt: null,
      leadSource: "",
      lineItems: items,
      subtotal,
      taxRate: 0,
      taxAmount: 0,
      total: subtotal,
      contractContent: resolved,
      paymentConfig: { ...propPayment, depositAmount },
      status: "draft",
      sentAt: null,
      acceptedAt: null,
      completedAt: null,
      clientSignature: null,
      ownerSignature: null,
      invoiceId: null,
      stripeSessionId: null,
      paidAt: null,
      clientEmail: propClientEmail.trim(),
      viewToken: nanoid(32),
      notes: propNotes,
    });
    toast.success("Proposal created as draft");
    setProposalDialogOpen(false);
  }

  async function sendProposal(proposalId: string) {
    const proposal = data.proposals.find(p => p.id === proposalId);
    if (!proposal) return;

    try {
      const token = await getAuthToken();
      const proposalUrl = `${window.location.origin}/proposal/${proposal.viewToken}`;
      const orgName = data.organization?.name || "";
      const res = await fetch("/api/send-proposal-email", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          to: proposal.clientEmail,
          cc: profile?.email || "",
          subject: `Proposal: ${proposal.title} — ${orgName}`,
          proposalUrl,
          proposalTitle: proposal.title,
          total: proposal.total,
          paymentOption: proposal.paymentConfig.option,
          depositPercent: proposal.paymentConfig.depositPercent,
          orgName,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed" }));
        throw new Error(err.error || "Failed to send email");
      }
      await updateProposal(proposalId, { status: "sent", sentAt: new Date().toISOString() });
      toast.success("Proposal sent to " + proposal.clientEmail);
    } catch (e: any) {
      toast.error(e.message || "Failed to send");
    }
  }

  // ---- Countersign ----
  function openSignDialog(proposalId: string) {
    setSigningProposalId(proposalId);
    setTypedName(profile?.name || "");
    setSignatureType("typed");
    setSignDialogOpen(true);
  }

  async function submitSignature() {
    if (!signingProposalId) return;

    let signatureData = "";
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

    await updateProposal(signingProposalId, {
      ownerSignature: sig,
      completedAt: new Date().toISOString(),
      status: "completed",
    });
    toast.success("Proposal signed and completed!");
    setSignDialogOpen(false);
    setViewProposal(null);
  }

  // Canvas drawing
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

  // ---- HoneyBook Import ----
  function openImport(target: "template" | "proposal") {
    setImportTarget(target);
    setImportUrl("");
    setImportPasteContent("");
    setImportDialogOpen(true);
  }

  async function doImport() {
    // If user pasted content directly, use that
    if (importPasteContent.trim()) {
      if (importTarget === "template") {
        setTplContractContent(importPasteContent.trim());
      } else {
        setPropContractContent(importPasteContent.trim());
      }
      toast.success("Content imported");
      setImportDialogOpen(false);
      return;
    }

    if (!importUrl.trim()) { toast.error("Enter a URL or paste content"); return; }

    setImporting(true);
    try {
      const token = await getAuthToken();
      const res = await fetch("/api/honeybook-import", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ url: importUrl.trim() }),
      });
      const result = await res.json();

      if (result.error && !result.contractContent) {
        toast.error(result.error);
        return;
      }
      if (result.error) {
        toast.warning(result.error);
      }
      if (result.contractContent) {
        if (importTarget === "template") {
          setTplContractContent(result.contractContent);
        } else {
          setPropContractContent(result.contractContent);
        }
        toast.success("Contract content imported");
        setImportDialogOpen(false);
      }
    } catch (e: any) {
      toast.error(e.message || "Import failed");
    } finally {
      setImporting(false);
    }
  }

  // ---- PDF Upload (for contract content) ----
  async function handlePdfUpload(e: React.ChangeEvent<HTMLInputElement>, target: "template" | "proposal") {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

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
        if (target === "template") setTplContractContent(text);
        else setPropContractContent(text);
        toast.success("PDF content imported");
      } else {
        toast.error("No text found in PDF");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to upload");
    } finally {
      setUploadingPdf(false);
    }
  }

  // Copy public link
  function copyLink(proposal: Proposal) {
    const url = `${window.location.origin}/proposal/${proposal.viewToken}`;
    navigator.clipboard.writeText(url);
    toast.success("Proposal link copied");
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-border bg-card/50">
        <div>
          <h1 className="text-xl font-semibold text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            Proposals
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">{data.proposals.length} proposal{data.proposals.length !== 1 ? "s" : ""}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setTab("proposals")} className={cn("px-3 py-1.5 rounded-md text-xs font-medium transition-colors", tab === "proposals" ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground")}>
            Proposals
          </button>
          <button onClick={() => setTab("templates")} className={cn("px-3 py-1.5 rounded-md text-xs font-medium transition-colors", tab === "templates" ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground")}>
            Templates
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-3 sm:p-6">
        {tab === "proposals" ? (
          <div className="space-y-4">
            <Button onClick={openNewProposal} className="gap-2">
              <Plus className="w-4 h-4" /> New Proposal
            </Button>

            {data.proposals.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">No proposals yet. Create your first proposal or template.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {data.proposals.map(p => {
                  const client = data.clients.find(cl => cl.id === p.clientId);
                  const payLabel = p.paymentConfig.option === "none" ? "" : p.paymentConfig.option === "deposit" ? ` · ${p.paymentConfig.depositPercent}% deposit` : " · Full payment";
                  return (
                    <div key={p.id} className="bg-card border border-border rounded-lg p-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-semibold text-foreground text-sm">{p.title}</span>
                            <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded border", STATUS_COLORS[p.status])}>
                              {STATUS_LABELS[p.status]}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {client?.company || "Unknown"} · {p.clientEmail}
                            {p.total > 0 && <> · <span className="font-mono">${p.total.toFixed(2)}</span>{payLabel}</>}
                          </p>
                          {p.acceptedAt && <p className="text-xs text-green-400 mt-1">Client accepted {new Date(p.acceptedAt).toLocaleDateString()}</p>}
                          {p.paidAt && <p className="text-xs text-green-400">Paid {new Date(p.paidAt).toLocaleDateString()}</p>}
                          {p.completedAt && <p className="text-xs text-green-400">Completed {new Date(p.completedAt).toLocaleDateString()}</p>}
                        </div>
                        <div className="flex items-center gap-1">
                          <button onClick={() => setViewProposal(p)} className="p-1.5 text-muted-foreground hover:text-foreground"><Eye className="w-4 h-4" /></button>
                          {(p.status === "sent" || p.status === "accepted") && (
                            <button onClick={() => copyLink(p)} className="p-1.5 text-muted-foreground hover:text-foreground" title="Copy link"><Link2 className="w-4 h-4" /></button>
                          )}
                          {p.status === "draft" && (
                            <button onClick={() => sendProposal(p.id)} className="p-1.5 text-blue-400 hover:text-blue-300" title="Send"><Send className="w-4 h-4" /></button>
                          )}
                          {p.status === "sent" && (
                            <button onClick={() => sendProposal(p.id)} className="p-1.5 text-blue-400 hover:text-blue-300" title="Resend"><Send className="w-4 h-4" /></button>
                          )}
                          {p.status === "accepted" && (
                            <button onClick={() => openSignDialog(p.id)} className="p-1.5 text-amber-400 hover:text-amber-300" title="Countersign"><PenTool className="w-4 h-4" /></button>
                          )}
                          {p.status !== "completed" && (
                            <button onClick={async () => { await updateProposal(p.id, { status: "void" }); toast.success("Proposal voided"); }} className="p-1.5 text-muted-foreground hover:text-red-400" title="Void"><X className="w-4 h-4" /></button>
                          )}
                          {(p.status === "draft" || p.status === "void") && (
                            <button onClick={async () => { await deleteProposal(p.id); toast.success("Deleted"); }} className="p-1.5 text-muted-foreground hover:text-destructive" title="Delete"><Trash2 className="w-4 h-4" /></button>
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
          <div className="space-y-4">
            <Button onClick={() => setLocation("/proposals/templates/new/edit")} className="gap-2">
              <Plus className="w-4 h-4" /> New Template
            </Button>

            {data.proposalTemplates.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">No templates yet. Create a reusable proposal template.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {data.proposalTemplates.map(tpl => (
                  <div key={tpl.id} className="group bg-card border border-border rounded-xl overflow-hidden hover:border-primary/40 transition-colors cursor-pointer" onClick={() => setLocation(`/proposals/templates/${tpl.id}/edit`)}>
                    {/* Cover Image */}
                    <div className="aspect-[4/3] bg-secondary relative overflow-hidden">
                      {tpl.coverImageUrl ? (
                        <img src={tpl.coverImageUrl} alt={tpl.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/10 to-primary/5">
                          <FileText className="w-10 h-10 text-primary/30" />
                        </div>
                      )}
                      {/* Hover overlay with actions */}
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                        <button onClick={(e) => { e.stopPropagation(); setLocation(`/proposals/templates/${tpl.id}/edit`); }} className="p-2 bg-white/20 rounded-lg hover:bg-white/30 text-white"><Edit3 className="w-4 h-4" /></button>
                        <button onClick={async (e) => { e.stopPropagation(); await deleteProposalTemplate(tpl.id); toast.success("Deleted"); }} className="p-2 bg-white/20 rounded-lg hover:bg-red-500/50 text-white"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </div>
                    {/* Info */}
                    <div className="p-3">
                      <p className="font-semibold text-foreground text-sm truncate">{tpl.name}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {tpl.packages.length > 0 ? `${tpl.packages.length} package${tpl.packages.length !== 1 ? "s" : ""}` : `${tpl.lineItems.length} service${tpl.lineItems.length !== 1 ? "s" : ""}`}
                        {" · "}Saved template
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ============ TEMPLATE DIALOG ============ */}
      <Dialog open={tplDialogOpen} onOpenChange={setTplDialogOpen}>
        <DialogContent className="bg-card border-border text-foreground max-w-2xl max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              {editingTplId ? "Edit Template" : "New Proposal Template"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-5 py-2">
            <div className="grid grid-cols-[1fr_auto] gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Template Name</Label>
                <Input value={tplName} onChange={e => setTplName(e.target.value)} className="bg-secondary border-border" placeholder="e.g. Full Day Video Production" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Cover Image</Label>
                <div className="w-24 h-16 rounded-lg border border-border overflow-hidden bg-secondary relative group">
                  {tplCoverUrl ? (
                    <img src={tplCoverUrl} alt="Cover" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                      <Upload className="w-4 h-4" />
                    </div>
                  )}
                  <input type="file" accept="image/*" onChange={handleCoverUpload} className="absolute inset-0 opacity-0 cursor-pointer" disabled={uploadingCover} />
                  {uploadingCover && <div className="absolute inset-0 bg-black/50 flex items-center justify-center"><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /></div>}
                </div>
              </div>
            </div>

            <LineItemEditor items={tplLineItems} setter={setTplLineItems} services={data.organization?.services} />

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">Agreement / Contract</Label>
                <div className="flex gap-2">
                  <button onClick={() => openImport("template")} className="flex items-center gap-1 text-xs text-primary hover:text-primary/80">
                    <ExternalLink className="w-3 h-3" /> Import from HoneyBook
                  </button>
                  <input ref={pdfRef} type="file" accept=".pdf,.txt,text/plain,application/pdf" onChange={e => handlePdfUpload(e, "template")} className="hidden" />
                  <button onClick={() => pdfRef.current?.click()} disabled={uploadingPdf} className="flex items-center gap-1 text-xs text-primary hover:text-primary/80">
                    <Upload className="w-3 h-3" /> {uploadingPdf ? "Uploading..." : "Upload PDF"}
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap gap-1 mb-1">
                {MERGE_FIELDS.map(f => (
                  <button key={f.key} onClick={() => insertAtCursor(tplTextareaRef, f.key, setTplContractContent, tplContractContent)} className="text-[10px] px-2 py-1 rounded bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20">
                    {f.label}
                  </button>
                ))}
              </div>
              <textarea
                ref={tplTextareaRef}
                value={tplContractContent}
                onChange={e => setTplContractContent(e.target.value)}
                className="w-full bg-secondary border border-border rounded-md p-3 text-sm text-foreground min-h-[400px] resize-y font-mono"
                placeholder="Enter your contract/agreement text here..."
              />
            </div>

            <PaymentEditor config={tplPayment} setConfig={setTplPayment} total={calcTotal(tplLineItems)} />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setTplDialogOpen(false)}>Cancel</Button>
            <Button onClick={saveTemplate}>{editingTplId ? "Save" : "Create Template"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============ PROPOSAL DIALOG ============ */}
      <Dialog open={proposalDialogOpen} onOpenChange={setProposalDialogOpen}>
        <DialogContent className="bg-card border-border text-foreground max-w-2xl max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: "'Space Grotesk', sans-serif" }}>New Proposal</DialogTitle>
          </DialogHeader>
          <div className="space-y-5 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Title</Label>
              <Input value={propTitle} onChange={e => setPropTitle(e.target.value)} className="bg-secondary border-border" placeholder="e.g. Full Day Video Production — CBSR" />
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
                  <Select value={propClientId} onValueChange={handleClientChange}>
                    <SelectTrigger className="bg-secondary border-border"><SelectValue placeholder="Select client" /></SelectTrigger>
                    <SelectContent className="bg-popover border-border">
                      {data.clients.map(c => <SelectItem key={c.id} value={c.id}>{c.company}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Client Email</Label>
                <Input value={propClientEmail} onChange={e => setPropClientEmail(e.target.value)} className="bg-secondary border-border" placeholder="client@email.com" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Start from Template (optional)</Label>
              <Select value={propTemplateId} onValueChange={applyTemplate}>
                <SelectTrigger className="bg-secondary border-border"><SelectValue placeholder="Blank proposal" /></SelectTrigger>
                <SelectContent className="bg-popover border-border">
                  {data.proposalTemplates.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <LineItemEditor items={propLineItems} setter={setPropLineItems} services={data.organization?.services} />

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">Agreement / Contract</Label>
                <div className="flex gap-2">
                  <button onClick={() => openImport("proposal")} className="flex items-center gap-1 text-xs text-primary hover:text-primary/80">
                    <ExternalLink className="w-3 h-3" /> Import
                  </button>
                  <input type="file" accept=".pdf,.txt,text/plain,application/pdf" onChange={e => handlePdfUpload(e, "proposal")} className="hidden" id="prop-pdf-upload" />
                  <button onClick={() => (document.getElementById("prop-pdf-upload") as HTMLInputElement)?.click()} disabled={uploadingPdf} className="flex items-center gap-1 text-xs text-primary hover:text-primary/80">
                    <Upload className="w-3 h-3" /> {uploadingPdf ? "Uploading..." : "Upload PDF"}
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap gap-1 mb-1">
                {MERGE_FIELDS.map(f => (
                  <button key={f.key} onClick={() => insertAtCursor(propTextareaRef, f.key, setPropContractContent, propContractContent)} className="text-[10px] px-2 py-1 rounded bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20">
                    {f.label}
                  </button>
                ))}
              </div>
              <textarea
                ref={propTextareaRef}
                value={propContractContent}
                onChange={e => setPropContractContent(e.target.value)}
                className="w-full bg-secondary border border-border rounded-md p-3 text-sm text-foreground min-h-[400px] resize-y"
                placeholder="Enter or paste your contract text, or import from HoneyBook..."
              />
            </div>

            <PaymentEditor config={propPayment} setConfig={setPropPayment} total={calcTotal(propLineItems)} />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setProposalDialogOpen(false)}>Cancel</Button>
            <Button onClick={createProposal}>Create Draft</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============ VIEW PROPOSAL DIALOG ============ */}
      <Dialog open={!!viewProposal} onOpenChange={o => !o && setViewProposal(null)}>
        <DialogContent className="bg-card border-border text-foreground max-w-2xl max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{viewProposal?.title}</DialogTitle>
          </DialogHeader>
          {viewProposal && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <span className={cn("text-xs font-semibold px-2 py-0.5 rounded border", STATUS_COLORS[viewProposal.status])}>
                  {STATUS_LABELS[viewProposal.status]}
                </span>
                <span className="text-xs text-muted-foreground">{data.clients.find(c => c.id === viewProposal.clientId)?.company}</span>
              </div>

              {/* Services */}
              <div className="bg-secondary/50 rounded-lg p-4">
                <p className="text-xs font-semibold text-muted-foreground mb-2">SERVICES</p>
                {viewProposal.lineItems.map((li, idx) => (
                  <div key={idx} className="flex justify-between text-sm py-1 border-b border-border/50 last:border-0">
                    <span>{li.description}</span>
                    <span className="font-mono">${(li.quantity * li.unitPrice).toFixed(2)}</span>
                  </div>
                ))}
                <div className="flex justify-between text-sm font-semibold pt-2 mt-1 border-t border-border">
                  <span>Total</span>
                  <span className="font-mono">${viewProposal.total.toFixed(2)}</span>
                </div>
                {viewProposal.paymentConfig.option !== "none" && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {viewProposal.paymentConfig.option === "deposit"
                      ? `${viewProposal.paymentConfig.depositPercent}% deposit ($${(viewProposal.total * viewProposal.paymentConfig.depositPercent / 100).toFixed(2)}) due at signing`
                      : "Full payment due at signing"}
                  </p>
                )}
              </div>

              {/* Contract preview */}
              <div className="bg-white text-black rounded-lg p-6 text-sm leading-relaxed whitespace-pre-wrap max-h-[40vh] overflow-y-auto">
                {viewProposal.contractContent || <span className="text-gray-400 italic">No contract content</span>}
              </div>

              {/* Signatures */}
              {viewProposal.clientSignature && (
                <div className="bg-secondary/50 rounded-lg p-4">
                  <p className="text-xs text-muted-foreground mb-1">Client Signature</p>
                  {viewProposal.clientSignature.signatureType === "drawn" ? (
                    <img src={viewProposal.clientSignature.signatureData} alt="Client signature" className="h-12" />
                  ) : (
                    <p className="text-lg italic text-foreground" style={{ fontFamily: "cursive" }}>{viewProposal.clientSignature.signatureData}</p>
                  )}
                  <p className="text-[10px] text-muted-foreground mt-1">{viewProposal.clientSignature.name} · {new Date(viewProposal.clientSignature.timestamp).toLocaleString()}</p>
                </div>
              )}
              {viewProposal.ownerSignature && (
                <div className="bg-secondary/50 rounded-lg p-4">
                  <p className="text-xs text-muted-foreground mb-1">Your Signature</p>
                  {viewProposal.ownerSignature.signatureType === "drawn" ? (
                    <img src={viewProposal.ownerSignature.signatureData} alt="Owner signature" className="h-12" />
                  ) : (
                    <p className="text-lg italic text-foreground" style={{ fontFamily: "cursive" }}>{viewProposal.ownerSignature.signatureData}</p>
                  )}
                  <p className="text-[10px] text-muted-foreground mt-1">{viewProposal.ownerSignature.name} · {new Date(viewProposal.ownerSignature.timestamp).toLocaleString()}</p>
                </div>
              )}

              <div className="flex gap-2">
                {viewProposal.status === "draft" && (
                  <Button onClick={() => { sendProposal(viewProposal.id); setViewProposal(null); }} className="gap-2">
                    <Send className="w-4 h-4" /> Send to Client
                  </Button>
                )}
                {viewProposal.status === "accepted" && (
                  <Button onClick={() => openSignDialog(viewProposal.id)} className="gap-2">
                    <PenTool className="w-4 h-4" /> Countersign
                  </Button>
                )}
                {(viewProposal.status === "sent" || viewProposal.status === "accepted") && (
                  <Button variant="outline" onClick={() => copyLink(viewProposal)} className="gap-2">
                    <Link2 className="w-4 h-4" /> Copy Link
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ============ SIGNATURE DIALOG ============ */}
      <Dialog open={signDialogOpen} onOpenChange={setSignDialogOpen}>
        <DialogContent className="bg-card border-border text-foreground max-w-md">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Sign Proposal</DialogTitle>
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
                  <canvas ref={canvasRef} width={350} height={120} className="w-full cursor-crosshair touch-none"
                    onMouseDown={startDraw} onMouseMove={draw} onMouseUp={stopDraw} onMouseLeave={stopDraw}
                    onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={stopDraw}
                  />
                </div>
                <button onClick={clearCanvas} className="text-xs text-muted-foreground hover:text-foreground">Clear</button>
              </div>
            )}
            <p className="text-[10px] text-muted-foreground">
              By signing, you agree this is your legal signature and you accept the terms. Timestamp and IP will be recorded.
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSignDialogOpen(false)}>Cancel</Button>
            <Button onClick={submitSignature} className="gap-2">
              <CheckCircle className="w-4 h-4" /> Sign Proposal
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============ HONEYBOOK IMPORT DIALOG ============ */}
      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent className="bg-card border-border text-foreground max-w-lg">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Import from HoneyBook</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="bg-secondary/50 rounded-lg p-3 space-y-2">
              <p className="text-xs font-semibold text-foreground">How to copy from HoneyBook:</p>
              <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
                <li>Open your HoneyBook contract/template</li>
                <li>Select all the contract text (<kbd className="px-1 py-0.5 bg-secondary rounded text-[10px] font-mono">Cmd+A</kbd>)</li>
                <li>Copy it (<kbd className="px-1 py-0.5 bg-secondary rounded text-[10px] font-mono">Cmd+C</kbd>)</li>
                <li>Paste it below</li>
              </ol>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Paste Contract Text</Label>
              <textarea
                value={importPasteContent}
                onChange={e => setImportPasteContent(e.target.value)}
                className="w-full bg-secondary border border-border rounded-md p-3 text-sm text-foreground min-h-[400px] resize-y"
                placeholder="Paste your contract text here..."
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setImportDialogOpen(false)}>Cancel</Button>
            <Button onClick={doImport} disabled={importing || !importPasteContent.trim()}>
              Import
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
