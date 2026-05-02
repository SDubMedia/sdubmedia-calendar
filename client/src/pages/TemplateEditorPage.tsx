// ============================================================
// TemplateEditorPage — Full-page multi-section document builder
// 3-column layout: page sidebar | document editor | properties
// ============================================================

import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { useApp } from "@/contexts/AppContext";
import type { ProposalPage, ProposalPackage, ProposalLineItem, PaymentMilestone, ProposalPaymentConfig } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Plus, ArrowLeft, FileText, Receipt, CreditCard, File, ChevronUp, ChevronDown, Save, X, Image } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { nanoid } from "nanoid";
import { BlockEditor } from "@/components/proposal-editor/BlockEditor";
import { LibraryPanel, type LibraryDragData } from "@/components/proposal-editor/LibraryPanel";
import type { ProposalBlock } from "@/lib/types";
import { DndContext, type DragEndEvent, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";

const MERGE_FIELDS = [
  { key: "{{client_name}}", label: "Client Name" },
  { key: "{{client_company}}", label: "Client Company" },
  { key: "{{client_email}}", label: "Client Email" },
  { key: "{{project_date}}", label: "Project Date" },
  { key: "{{project_location}}", label: "Location" },
  { key: "{{date}}", label: "Today's Date" },
  { key: "{{owner_name}}", label: "Your Name" },
  { key: "{{company_name}}", label: "Your Company" },
  { key: "{{package_name}}", label: "Package Name" },
  { key: "{{package_price}}", label: "Package Price" },
  { key: "{{deposit_amount}}", label: "Deposit Amount" },
];

const PAGE_ICONS = {
  agreement: FileText,
  invoice: Receipt,
  payment: CreditCard,
  custom: File,
};

function emptyPage(type: ProposalPage["type"] = "agreement", order: number = 0): ProposalPage {
  const labels = { agreement: "Agreement", invoice: "Invoice", payment: "Payment", custom: "Custom Page" };
  return { id: nanoid(6), type, label: labels[type], content: "", sortOrder: order };
}

function emptyLineItem(): ProposalLineItem {
  return { id: nanoid(6), description: "", details: "", quantity: 1, unitPrice: 0, amount: 0 };
}

function emptyMilestone(): PaymentMilestone {
  return { id: nanoid(6), label: "Deposit", type: "percent", percent: 50, dueType: "at_signing", status: "pending" };
}

// When an existing template page has only legacy `content` HTML (no blocks
// yet), seed the block editor with a single prose block so the user's existing
// content is preserved and can be split/extended into more specific blocks.
// This is purely view-time — the actual blocks aren't persisted until the
// user makes any edit, at which point the seeded block is saved as part of
// the new structure.
function effectiveBlocks(page: ProposalPage): ProposalBlock[] {
  if (page.blocks && page.blocks.length > 0) return page.blocks;
  if (page.content && page.content.trim()) {
    return [{ id: "imported-content", type: "prose", html: page.content }];
  }
  return [];
}

function emptyPackage(): ProposalPackage {
  return {
    id: nanoid(6), name: "", description: "",
    lineItems: [emptyLineItem()],
    totalPrice: 0,
    paymentMilestones: [emptyMilestone()],
  };
}

export default function TemplateEditorPage() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { data, addProposalTemplate, updateProposalTemplate } = useApp();

  const isNew = params.id === "new";
  const existing = isNew ? null : data.proposalTemplates.find(t => t.id === params.id);

  // Template state
  const [name, setName] = useState("");
  const [coverImageUrl, setCoverImageUrl] = useState("");
  const [pages, setPages] = useState<ProposalPage[]>([emptyPage("agreement", 0)]);
  const [packages, setPackages] = useState<ProposalPackage[]>([]);
  // Master contract that auto-generates a draft on client acceptance.
  const [contractTemplateId, setContractTemplateId] = useState<string | null>(null);
  const [activePageId, setActivePageId] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [showProperties, setShowProperties] = useState(true);
  // Left sidebar (page list) — collapse to maximize canvas width on desktop.
  const [showPageList, setShowPageList] = useState(true);

  // Legacy fields for backward compat
  const [legacyPayment, setLegacyPayment] = useState<ProposalPaymentConfig>({ option: "none", depositPercent: 50, depositAmount: 0 });


  // Load existing template
  useEffect(() => {
    if (existing) {
      setName(existing.name);
      setCoverImageUrl(existing.coverImageUrl || "");
      setContractTemplateId(existing.contractTemplateId ?? null);
      // Migrate: if old template has contractContent but no pages, create a page from it
      if (existing.pages.length > 0) {
        setPages(existing.pages);
        setActivePageId(existing.pages[0].id);
      } else if (existing.contractContent) {
        const p = emptyPage("agreement", 0);
        p.content = existing.contractContent;
        setPages([p, emptyPage("invoice", 1), emptyPage("payment", 2)]);
        setActivePageId(p.id);
      } else {
        const p = emptyPage("agreement", 0);
        setPages([p]);
        setActivePageId(p.id);
      }
      if (existing.packages.length > 0) {
        setPackages(existing.packages);
      } else if (existing.lineItems.length > 0) {
        // Migrate old lineItems to a single package
        const pkg = emptyPackage();
        pkg.name = existing.name;
        pkg.lineItems = existing.lineItems;
        pkg.totalPrice = existing.lineItems.reduce((s, li) => s + li.quantity * li.unitPrice, 0);
        setPackages([pkg]);
      }
      setLegacyPayment(existing.paymentConfig || { option: "none", depositPercent: 50, depositAmount: 0 });
    } else if (isNew) {
      const p = emptyPage("agreement", 0);
      setPages([p, emptyPage("invoice", 1), emptyPage("payment", 2)]);
      setActivePageId(p.id);
    }
    // Deliberately narrow deps: re-running on every realtime update of `existing`
    // would clobber the user's in-progress edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing?.id, isNew]);

  // Set initial active page
  useEffect(() => {
    if (!activePageId && pages.length > 0) setActivePageId(pages[0].id);
  }, [pages, activePageId]);

  const activePage = pages.find(p => p.id === activePageId);

  // ---- Page management ----
  function addPage(type: ProposalPage["type"]) {
    const p = emptyPage(type, pages.length);
    setPages([...pages, p]);
    setActivePageId(p.id);
  }

  function removePage(id: string) {
    if (pages.length <= 1) return;
    const filtered = pages.filter(p => p.id !== id);
    setPages(filtered);
    if (activePageId === id) setActivePageId(filtered[0]?.id || "");
  }

  function movePage(id: string, dir: -1 | 1) {
    const idx = pages.findIndex(p => p.id === id);
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= pages.length) return;
    const arr = [...pages];
    [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
    setPages(arr.map((p, i) => ({ ...p, sortOrder: i })));
  }

  function updatePageBlocks(id: string, blocks: ProposalBlock[]) {
    setPages(pages.map(p => p.id === id ? { ...p, blocks } : p));
  }

  // ---- dnd-kit: library → canvas drop ----
  // Sensor with a small activation distance so single-clicks on cards still
  // open the picker rather than starting a phantom drag.
  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  function handleLibraryDrop(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || !active) return;
    const drag = active.data.current as LibraryDragData | undefined;
    const drop = over.data.current as { insertIndex?: number } | undefined;
    if (!drag || typeof drop?.insertIndex !== "number") return;
    if (!activePageId) return;
    const page = pages.find(p => p.id === activePageId);
    if (!page) return;
    const currentBlocks = effectiveBlocks(page);

    let newBlock: ProposalBlock | null = null;
    if (drag.source === "package" && drag.packageId) {
      newBlock = { id: nanoid(6), type: "package_row", packageId: drag.packageId };
    } else if (drag.source === "image" && drag.imageDataUrl) {
      newBlock = { id: nanoid(6), type: "image", imageDataUrl: drag.imageDataUrl, caption: "" };
    }
    if (!newBlock) return;

    const next = [...currentBlocks];
    next.splice(drop.insertIndex, 0, newBlock);
    updatePageBlocks(activePageId, next);
  }

  function updatePageLabel(id: string, label: string) {
    setPages(pages.map(p => p.id === id ? { ...p, label } : p));
  }

  // ---- Cover image upload ----
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
      setCoverImageUrl(urlData.publicUrl);
      toast.success("Cover uploaded");
    } catch (err: any) {
      toast.error(err.message || "Upload failed");
    } finally {
      setUploadingCover(false);
    }
  }

  // ---- Save ----
  async function save() {
    if (!name.trim()) { toast.error("Template name required"); return; }
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        coverImageUrl,
        pages,
        packages,
        contractTemplateId,
        // Legacy fields — derive from first agreement page + first package
        lineItems: packages[0]?.lineItems || [],
        contractContent: pages.find(p => p.type === "agreement")?.content || "",
        paymentConfig: legacyPayment,
        notes: "",
      };

      if (isNew) {
        const tpl = await addProposalTemplate(payload);
        toast.success("Template created");
        setLocation(`/proposals/templates/${tpl.id}/edit`);
      } else {
        await updateProposalTemplate(params.id!, payload);
        toast.success("Template saved");
      }
    } catch (err: any) {
      toast.error(err.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-card/50">
        <div className="flex items-center gap-3">
          <button onClick={() => setLocation("/proposals")} className="p-1.5 text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              className="text-lg font-semibold text-foreground bg-transparent border-none outline-none w-full max-w-xs sm:max-w-md"
              placeholder="Template name..."
              style={{ fontFamily: "'Space Grotesk', sans-serif" }}
            />
            <p className="text-[10px] text-muted-foreground">
              {isNew ? "New template" : "Saved template"} · {pages.length} page{pages.length !== 1 ? "s" : ""} · {packages.length} package{packages.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowPageList(!showPageList)}
            className="text-xs hidden sm:inline-flex gap-1"
            title="Toggle page list"
          >
            {showPageList ? "Hide pages" : "Show pages"}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowProperties(!showProperties)} className="text-xs">
            {showProperties ? "Hide library" : "Show library"}
          </Button>
          <Button size="sm" onClick={save} disabled={saving} className="gap-1.5">
            <Save className="w-3.5 h-3.5" />
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>

      {/* Mobile Page Tabs */}
      <div className="flex sm:hidden border-b border-border bg-card/30 overflow-x-auto">
        <div className="flex gap-1 p-2 min-w-max">
          {[...pages].sort((a, b) => a.sortOrder - b.sortOrder).map((page) => {
            const Icon = PAGE_ICONS[page.type];
            return (
              <button
                key={page.id}
                onClick={() => setActivePageId(page.id)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap",
                  activePageId === page.id
                    ? "bg-primary/10 text-primary border border-primary/30"
                    : "text-muted-foreground"
                )}
              >
                <Icon className="w-3 h-3" />
                {page.label}
              </button>
            );
          })}
          <button onClick={() => addPage("agreement")} className="flex items-center gap-1 px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground">
            <Plus className="w-3 h-3" /> Page
          </button>
        </div>
      </div>

      {/* 3-Column Layout — wrapped in DndContext so the right-sidebar
          LibraryPanel can drag Packages/Images onto the canvas's
          InsertBar drop zones (desktop fast-path; mobile uses + button). */}
      <DndContext sensors={dndSensors} onDragEnd={handleLibraryDrop}>
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar — Page Thumbnails (desktop). Collapsible via the
            "Hide pages" header toggle so the canvas can claim the full width. */}
        <div className={cn(
          "border-r border-border bg-card/30 flex flex-col overflow-hidden shrink-0",
          showPageList ? "w-48 hidden sm:flex" : "hidden",
        )}>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {[...pages].sort((a, b) => a.sortOrder - b.sortOrder).map((page) => {
              const Icon = PAGE_ICONS[page.type];
              return (
                <div
                  key={page.id}
                  onClick={() => setActivePageId(page.id)}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer text-xs transition-colors group",
                    activePageId === page.id
                      ? "bg-primary/10 text-primary border border-primary/30"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                  )}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate flex-1">{page.label}</span>
                  <div className="flex gap-0.5 opacity-0 group-hover:opacity-100">
                    <button onClick={(e) => { e.stopPropagation(); movePage(page.id, -1); }} className="p-0.5 hover:text-foreground"><ChevronUp className="w-3 h-3" /></button>
                    <button onClick={(e) => { e.stopPropagation(); movePage(page.id, 1); }} className="p-0.5 hover:text-foreground"><ChevronDown className="w-3 h-3" /></button>
                    {pages.length > 1 && (
                      <button onClick={(e) => { e.stopPropagation(); removePage(page.id); }} className="p-0.5 hover:text-destructive"><X className="w-3 h-3" /></button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="p-2 border-t border-border space-y-1">
            <button onClick={() => addPage("agreement")} className="flex items-center gap-2 w-full px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-secondary">
              <Plus className="w-3 h-3" /> Agreement Page
            </button>
            <button onClick={() => addPage("invoice")} className="flex items-center gap-2 w-full px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-secondary">
              <Plus className="w-3 h-3" /> Invoice Page
            </button>
            <button onClick={() => addPage("payment")} className="flex items-center gap-2 w-full px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-secondary">
              <Plus className="w-3 h-3" /> Payment Page
            </button>
            <button onClick={() => addPage("custom")} className="flex items-center gap-2 w-full px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-secondary">
              <Plus className="w-3 h-3" /> Custom Page
            </button>
          </div>
        </div>

        {/* Center — Document Editor */}
        <div className="flex-1 overflow-y-auto bg-secondary/30 p-4 sm:p-8">
          {activePage ? (
            <div className="max-w-3xl mx-auto">
              {/* Page label editor */}
              <div className="flex items-center gap-2 mb-3">
                <input
                  value={activePage.label}
                  onChange={e => updatePageLabel(activePage.id, e.target.value)}
                  className="text-sm font-semibold text-foreground bg-transparent border-none outline-none"
                  placeholder="Page title..."
                />
                <span className="text-[10px] text-muted-foreground uppercase">{activePage.type}</span>
                <span className="text-[10px] text-muted-foreground">PAGE {pages.findIndex(p => p.id === activePage.id) + 1} OF {pages.length}</span>
              </div>

              {activePage.type === "agreement" || activePage.type === "custom" ? (
                <>
                  {/* Merge field reference — copy a token into a Text block to
                      have it filled with the client's data when sent. */}
                  {activePage.type === "agreement" && (
                    <details className="mb-3 text-xs">
                      <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                        Merge fields (click to copy)
                      </summary>
                      <div className="flex flex-wrap gap-1 mt-2">
                        {MERGE_FIELDS.map(f => (
                          <button
                            key={f.key}
                            onClick={() => {
                              navigator.clipboard?.writeText(f.key).catch(() => {});
                              toast.success(`Copied ${f.key}`);
                            }}
                            className="text-[10px] px-2 py-1 rounded bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20"
                            title={`Copy ${f.key}`}
                          >
                            {f.label}
                          </button>
                        ))}
                      </div>
                    </details>
                  )}
                  {/* Live canvas — what you see is what the client sees.
                      Hover any block for move/delete; click to edit inline.
                      Hover between blocks for the + button to insert a new
                      block, package from your library, or image. */}
                  <BlockEditor
                    blocks={effectiveBlocks(activePage)}
                    onChange={blocks => updatePageBlocks(activePage.id, blocks)}
                    libraryPackages={data.packages}
                  />
                </>
              ) : activePage.type === "invoice" ? (
                <div className="bg-white rounded-xl shadow-sm border border-border overflow-hidden">
                  {/* Invoice Header */}
                  <div className="p-8 pb-0">
                    <div className="flex justify-between items-start mb-6">
                      <div>
                        <h2 className="text-xl font-bold text-gray-900" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                          {data.organization?.name || "Your Company"}
                        </h2>
                        <p className="text-xs text-gray-400 mt-1">
                          {data.organization?.businessInfo?.phone}{data.organization?.businessInfo?.phone && data.organization?.businessInfo?.email ? " | " : ""}{data.organization?.businessInfo?.email}
                        </p>
                        {data.organization?.businessInfo?.address && (
                          <p className="text-xs text-gray-400">{data.organization.businessInfo.address}, {data.organization.businessInfo.city}, {data.organization.businessInfo.state} {data.organization.businessInfo.zip}</p>
                        )}
                      </div>
                      <div className="text-right">
                        <h3 className="text-lg font-bold text-gray-900">Invoice</h3>
                        <p className="text-xs text-gray-400 mt-1">INV-XXXX</p>
                      </div>
                    </div>
                    <div className="flex gap-8 mb-6 bg-gray-50 rounded-lg p-4">
                      <div>
                        <p className="text-[10px] text-gray-400 uppercase tracking-wider">Bill to</p>
                        <p className="text-sm font-semibold text-gray-900 mt-1">{"{{client_name}}"}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-gray-400 uppercase tracking-wider">Date Issued</p>
                        <p className="text-sm font-semibold text-gray-900 mt-1">{"{{date}}"}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-gray-400 uppercase tracking-wider">Next Payment Due</p>
                        <p className="text-sm font-semibold text-gray-900 mt-1">{"{{project_date}}"}</p>
                      </div>
                    </div>
                  </div>
                  {/* Line Items Table */}
                  <div className="px-8">
                    <div className="grid grid-cols-[1fr_60px_60px_80px_80px] gap-2 px-3 py-2 text-[10px] text-gray-400 uppercase tracking-wider border-b border-gray-200">
                      <span>Service Info</span><span className="text-center">Qty</span><span className="text-center">Unit</span><span className="text-right">Unit Price</span><span className="text-right">Total</span>
                    </div>
                    {packages.length === 0 ? (
                      <p className="text-sm text-gray-400 italic py-6 text-center">Add packages in the properties panel</p>
                    ) : (
                      packages.map(pkg => pkg.lineItems.map(li => (
                        <div key={li.id} className="grid grid-cols-[1fr_60px_60px_80px_80px] gap-2 px-3 py-3 border-b border-gray-100 text-sm">
                          <div>
                            <p className="font-semibold text-gray-900">{li.description || "Service"}</p>
                            {li.details && <p className="text-xs text-gray-400 mt-0.5">{li.details}</p>}
                          </div>
                          <span className="text-center text-gray-600">{li.quantity}</span>
                          <span className="text-center text-gray-600">Unit</span>
                          <span className="text-right text-gray-600 font-mono">${li.unitPrice.toFixed(2)}</span>
                          <span className="text-right font-semibold text-gray-900 font-mono">${(li.quantity * li.unitPrice).toFixed(2)}</span>
                        </div>
                      )))
                    )}
                  </div>
                  {/* Totals */}
                  <div className="p-8 pt-4">
                    <div className="flex justify-end">
                      <div className="w-64 space-y-2">
                        <div className="flex justify-between text-sm text-gray-500">
                          <span>Subtotal</span>
                          <span className="font-mono">${packages.reduce((s, p) => s + p.totalPrice, 0).toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-sm text-gray-500">
                          <span>Tax</span>
                          <span className="font-mono">$0.00</span>
                        </div>
                        <div className="flex justify-between text-base font-bold text-gray-900 border-t border-gray-200 pt-2">
                          <span>Total (USD)</span>
                          <span className="font-mono">${packages.reduce((s, p) => s + p.totalPrice, 0).toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : activePage.type === "payment" ? (
                <div className="bg-white rounded-xl shadow-sm border border-border overflow-hidden">
                  {/* Payment Header */}
                  <div className="p-8 text-center border-b border-gray-100">
                    <h2 className="text-xl font-bold text-gray-900" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                      {data.organization?.name || "Your Company"}
                    </h2>
                    <p className="text-xs text-gray-400 mt-1">
                      {data.organization?.businessInfo?.phone}{data.organization?.businessInfo?.phone && data.organization?.businessInfo?.email ? " | " : ""}{data.organization?.businessInfo?.email}
                    </p>
                  </div>
                  {/* Payment Schedule */}
                  <div className="p-8">
                    <p className="text-xs text-gray-400 uppercase tracking-wider mb-4">Payment</p>
                    {packages.length === 0 ? (
                      <p className="text-sm text-gray-400 italic text-center py-6">Add packages with payment milestones in the properties panel</p>
                    ) : (
                      packages.map(pkg => (
                        <div key={pkg.id} className="space-y-4">
                          {pkg.paymentMilestones.length === 0 ? (
                            <p className="text-sm text-gray-400 italic">No payment milestones configured for {pkg.name}</p>
                          ) : (
                            pkg.paymentMilestones.map((ms, idx) => {
                              const amount = ms.type === "percent" ? (pkg.totalPrice * (ms.percent || 0) / 100) : (ms.fixedAmount || 0);
                              return (
                                <div key={ms.id} className="bg-gray-50 rounded-xl p-6">
                                  <div className="flex items-center justify-between mb-4">
                                    <div>
                                      <p className="text-sm font-semibold text-gray-900">Payment {idx + 1} of {pkg.paymentMilestones.length}</p>
                                      <p className="text-xs text-gray-400">
                                        {ms.dueType === "at_signing" ? `Due: At signing` : ms.dueType === "relative_days" ? `Due: ${ms.dueDays} days after signing` : `Due: ${ms.dueDate || "TBD"}`}
                                      </p>
                                    </div>
                                    <span className="text-xs text-blue-500 font-medium">View Invoice</span>
                                  </div>
                                  <div className="mb-4">
                                    <p className="text-xs text-gray-400">Amount due</p>
                                    <p className="text-3xl font-bold text-gray-900 font-mono">${amount.toFixed(2)}</p>
                                  </div>
                                  <div className="flex gap-2">
                                    <div className="flex-1 py-2.5 text-center text-sm font-medium border border-gray-300 rounded-lg text-gray-700 bg-white">Debit or credit card</div>
                                    <div className="flex-1 py-2.5 text-center text-sm font-medium border border-gray-200 rounded-lg text-gray-400 bg-gray-50">Bank account</div>
                                  </div>
                                  <div className="mt-6">
                                    <button className="w-full py-3 bg-blue-600 text-white font-semibold rounded-xl text-sm">
                                      Pay ${amount.toFixed(2)}
                                    </button>
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              <p className="text-sm">Select a page from the sidebar</p>
            </div>
          )}
        </div>

        {/* Right Sidebar — Properties */}
        {showProperties && (
          <>
          {/* Mobile backdrop */}
          <div className="fixed inset-0 bg-black/50 z-40 md:hidden" onClick={() => setShowProperties(false)} />
          <div className={cn(
            "border-l border-border bg-card overflow-y-auto shrink-0",
            "fixed inset-x-0 bottom-0 z-50 border-t border-l-0 rounded-t-xl max-h-[75vh] w-full",
            "md:static md:w-72 md:max-h-none md:rounded-none md:border-t-0 md:border-l md:z-auto",
          )}>
            {/* Mobile close handle */}
            <div className="flex items-center justify-between px-4 pt-3 pb-1 md:hidden">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Properties</span>
              <button onClick={() => setShowProperties(false)} className="p-1 text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-4 space-y-6">
              {/* Library — drag a Package or Image from here onto any
                  agreement/custom page to drop it as a new block. */}
              <LibraryPanel
                packages={data.packages}
                images={data.proposalImages}
                onAddPackage={(packageId) => {
                  if (!activePageId) return;
                  const page = pages.find(p => p.id === activePageId);
                  if (!page) return;
                  const next = [...effectiveBlocks(page), { id: nanoid(6), type: "package_row" as const, packageId }];
                  updatePageBlocks(activePageId, next);
                }}
                onAddImage={(img) => {
                  if (!activePageId) return;
                  const page = pages.find(p => p.id === activePageId);
                  if (!page) return;
                  const next = [...effectiveBlocks(page), { id: nanoid(6), type: "image" as const, imageDataUrl: img.imageDataUrl, caption: "" }];
                  updatePageBlocks(activePageId, next);
                }}
              />

              {/* Linked Contract — when the client accepts a proposal built
                  from this template, this is the master contract that auto-
                  generates a draft for owner approval. */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Linked Contract</Label>
                <select
                  value={contractTemplateId ?? ""}
                  onChange={e => setContractTemplateId(e.target.value || null)}
                  className="w-full px-2 py-1.5 text-xs rounded border border-border bg-background"
                >
                  <option value="">— None (legacy embedded content) —</option>
                  {data.contractTemplates.map(ct => (
                    <option key={ct.id} value={ct.id}>{ct.name}</option>
                  ))}
                </select>
                <p className="text-[10px] text-muted-foreground">
                  Auto-generates a draft contract for your review when a client accepts.
                </p>
              </div>

              {/* Cover Image */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Cover Image</Label>
                <div className="aspect-[4/3] rounded-lg border border-border overflow-hidden bg-secondary relative group">
                  {coverImageUrl ? (
                    <img src={coverImageUrl} alt="Cover" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground gap-1">
                      <Image className="w-6 h-6" />
                      <span className="text-[10px]">Upload cover</span>
                    </div>
                  )}
                  <input type="file" accept="image/*" onChange={handleCoverUpload} className="absolute inset-0 opacity-0 cursor-pointer" disabled={uploadingCover} />
                  {uploadingCover && <div className="absolute inset-0 bg-black/50 flex items-center justify-center"><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /></div>}
                </div>
              </div>

            </div>
          </div>
          </>
        )}
      </div>
      </DndContext>
    </div>
  );
}
