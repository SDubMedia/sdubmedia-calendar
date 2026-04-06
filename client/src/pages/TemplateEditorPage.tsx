// ============================================================
// TemplateEditorPage — Full-page multi-section document builder
// 3-column layout: page sidebar | document editor | properties
// ============================================================

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import { useApp } from "@/contexts/AppContext";
import { useAuth } from "@/contexts/AuthContext";
import type { ProposalTemplate, ProposalPage, ProposalPackage, ProposalLineItem, PaymentMilestone, ProposalPaymentConfig, ServiceItem } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, ArrowLeft, FileText, Receipt, CreditCard, File, Trash2, ChevronUp, ChevronDown, Upload, Save, X, Image } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { nanoid } from "nanoid";

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
  const { profile } = useAuth();

  const isNew = params.id === "new";
  const existing = isNew ? null : data.proposalTemplates.find(t => t.id === params.id);

  // Template state
  const [name, setName] = useState("");
  const [coverImageUrl, setCoverImageUrl] = useState("");
  const [pages, setPages] = useState<ProposalPage[]>([emptyPage("agreement", 0)]);
  const [packages, setPackages] = useState<ProposalPackage[]>([]);
  const [activePageId, setActivePageId] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [showProperties, setShowProperties] = useState(true);

  // Legacy fields for backward compat
  const [legacyPayment, setLegacyPayment] = useState<ProposalPaymentConfig>({ option: "none", depositPercent: 50, depositAmount: 0 });

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Load existing template
  useEffect(() => {
    if (existing) {
      setName(existing.name);
      setCoverImageUrl(existing.coverImageUrl || "");
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
  }, [existing?.id]);

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

  function updatePageContent(id: string, content: string) {
    setPages(pages.map(p => p.id === id ? { ...p, content } : p));
  }

  function updatePageLabel(id: string, label: string) {
    setPages(pages.map(p => p.id === id ? { ...p, label } : p));
  }

  // ---- Insert merge field at cursor ----
  function insertField(fieldKey: string) {
    const el = textareaRef.current;
    if (!activePage || activePage.type !== "agreement") return;
    const content = activePage.content;
    if (!el) { updatePageContent(activePage.id, content + fieldKey); return; }
    const start = el.selectionStart ?? content.length;
    const end = el.selectionEnd ?? content.length;
    const newContent = content.slice(0, start) + fieldKey + content.slice(end);
    updatePageContent(activePage.id, newContent);
    requestAnimationFrame(() => {
      el.focus();
      el.selectionStart = el.selectionEnd = start + fieldKey.length;
    });
  }

  // ---- Package management ----
  function addPackageItem() {
    setPackages([...packages, emptyPackage()]);
  }

  function removePackage(id: string) {
    setPackages(packages.filter(p => p.id !== id));
  }

  function updatePackage(id: string, field: string, value: any) {
    setPackages(packages.map(p => {
      if (p.id !== id) return p;
      const updated = { ...p, [field]: value };
      if (field === "lineItems") {
        updated.totalPrice = (value as ProposalLineItem[]).reduce((s: number, li: ProposalLineItem) => s + li.quantity * li.unitPrice, 0);
      }
      return updated;
    }));
  }

  function updatePackageLineItem(pkgId: string, liId: string, field: keyof ProposalLineItem, value: any) {
    setPackages(packages.map(pkg => {
      if (pkg.id !== pkgId) return pkg;
      const newItems = pkg.lineItems.map(li => {
        if (li.id !== liId) return li;
        const updated = { ...li, [field]: value };
        updated.amount = updated.quantity * updated.unitPrice;
        return updated;
      });
      return { ...pkg, lineItems: newItems, totalPrice: newItems.reduce((s, li) => s + li.quantity * li.unitPrice, 0) };
    }));
  }

  function addLineItemToPackage(pkgId: string) {
    setPackages(packages.map(pkg => pkg.id === pkgId ? { ...pkg, lineItems: [...pkg.lineItems, emptyLineItem()] } : pkg));
  }

  function addServiceToPackage(pkgId: string, svc: ServiceItem) {
    const li: ProposalLineItem = { id: nanoid(6), description: svc.name, details: svc.description, quantity: 1, unitPrice: svc.defaultPrice, amount: svc.defaultPrice };
    setPackages(packages.map(pkg => {
      if (pkg.id !== pkgId) return pkg;
      const newItems = [...pkg.lineItems, li];
      return { ...pkg, lineItems: newItems, totalPrice: newItems.reduce((s, l) => s + l.quantity * l.unitPrice, 0) };
    }));
  }

  function removeLineItemFromPackage(pkgId: string, liId: string) {
    setPackages(packages.map(pkg => {
      if (pkg.id !== pkgId || pkg.lineItems.length <= 1) return pkg;
      const newItems = pkg.lineItems.filter(li => li.id !== liId);
      return { ...pkg, lineItems: newItems, totalPrice: newItems.reduce((s, li) => s + li.quantity * li.unitPrice, 0) };
    }));
  }

  // ---- Milestone management ----
  function addMilestone(pkgId: string) {
    setPackages(packages.map(pkg => pkg.id === pkgId ? { ...pkg, paymentMilestones: [...pkg.paymentMilestones, emptyMilestone()] } : pkg));
  }

  function removeMilestone(pkgId: string, msId: string) {
    setPackages(packages.map(pkg => pkg.id === pkgId ? { ...pkg, paymentMilestones: pkg.paymentMilestones.filter(m => m.id !== msId) } : pkg));
  }

  function updateMilestone(pkgId: string, msId: string, field: string, value: any) {
    setPackages(packages.map(pkg => pkg.id === pkgId ? {
      ...pkg, paymentMilestones: pkg.paymentMilestones.map(m => m.id === msId ? { ...m, [field]: value } : m),
    } : pkg));
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
              className="text-lg font-semibold text-foreground bg-transparent border-none outline-none w-64 sm:w-96"
              placeholder="Template name..."
              style={{ fontFamily: "'Space Grotesk', sans-serif" }}
            />
            <p className="text-[10px] text-muted-foreground">
              {isNew ? "New template" : "Saved template"} · {pages.length} page{pages.length !== 1 ? "s" : ""} · {packages.length} package{packages.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowProperties(!showProperties)} className="text-xs hidden sm:flex">
            {showProperties ? "Hide Properties" : "Show Properties"}
          </Button>
          <Button size="sm" onClick={save} disabled={saving} className="gap-1.5">
            <Save className="w-3.5 h-3.5" />
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>

      {/* 3-Column Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar — Page Thumbnails */}
        <div className="w-48 border-r border-border bg-card/30 flex flex-col overflow-hidden shrink-0 hidden sm:flex">
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
                  {/* Merge fields */}
                  {activePage.type === "agreement" && (
                    <div className="flex flex-wrap gap-1 mb-3">
                      {MERGE_FIELDS.map(f => (
                        <button key={f.key} onClick={() => insertField(f.key)} className="text-[10px] px-2 py-1 rounded bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20">
                          {f.label}
                        </button>
                      ))}
                    </div>
                  )}
                  {/* Document-style editor */}
                  <div className="bg-white rounded-xl shadow-sm border border-border overflow-hidden">
                    <textarea
                      ref={textareaRef}
                      value={activePage.content}
                      onChange={e => updatePageContent(activePage.id, e.target.value)}
                      className="w-full min-h-[600px] p-8 text-sm text-gray-800 leading-relaxed resize-y outline-none font-serif"
                      placeholder={activePage.type === "agreement"
                        ? "Enter your agreement text here...\n\nUse merge fields above to insert dynamic content like {{client_name}} and {{package_price}}."
                        : "Enter page content..."}
                      style={{ fontFamily: "'Georgia', 'Times New Roman', serif" }}
                    />
                  </div>
                </>
              ) : activePage.type === "invoice" ? (
                <div className="bg-white rounded-xl shadow-sm border border-border p-8">
                  <p className="text-sm text-gray-500 mb-4">This page auto-generates from the selected package. Preview:</p>
                  {packages.length === 0 ? (
                    <p className="text-sm text-gray-400 italic">Add packages in the properties panel to see the invoice preview.</p>
                  ) : (
                    packages.map(pkg => (
                      <div key={pkg.id} className="mb-6 last:mb-0">
                        <h3 className="text-sm font-bold text-gray-900 mb-2">{pkg.name || "Untitled Package"}</h3>
                        <div className="divide-y divide-gray-100">
                          {pkg.lineItems.map(li => (
                            <div key={li.id} className="flex justify-between py-1.5 text-sm text-gray-700">
                              <span>{li.description || "Service"}</span>
                              <span className="font-mono">${(li.quantity * li.unitPrice).toFixed(2)}</span>
                            </div>
                          ))}
                        </div>
                        <div className="border-t border-gray-200 pt-2 mt-1 flex justify-between text-sm font-bold text-gray-900">
                          <span>Total</span>
                          <span className="font-mono">${pkg.totalPrice.toFixed(2)}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              ) : activePage.type === "payment" ? (
                <div className="bg-white rounded-xl shadow-sm border border-border p-8">
                  <p className="text-sm text-gray-500 mb-4">Payment schedule auto-generates from package milestones. Preview:</p>
                  {packages.length === 0 ? (
                    <p className="text-sm text-gray-400 italic">Add packages with payment milestones in the properties panel.</p>
                  ) : (
                    packages.map(pkg => (
                      <div key={pkg.id} className="mb-6 last:mb-0">
                        <h3 className="text-sm font-bold text-gray-900 mb-3">{pkg.name || "Untitled Package"}</h3>
                        {pkg.paymentMilestones.map((ms, idx) => {
                          const amount = ms.type === "percent" ? (pkg.totalPrice * (ms.percent || 0) / 100) : (ms.fixedAmount || 0);
                          return (
                            <div key={ms.id} className="flex items-center gap-3 py-2 text-sm text-gray-700">
                              <div className="w-6 h-6 rounded-full border-2 border-gray-300 flex items-center justify-center text-[10px] font-bold text-gray-400">{idx + 1}</div>
                              <div className="flex-1">
                                <span className="font-medium">{ms.label}</span>
                                <span className="text-gray-400 ml-2">
                                  {ms.dueType === "at_signing" ? "Due at signing" : ms.dueType === "relative_days" ? `Due ${ms.dueDays || 0} days after signing` : ms.dueDate ? `Due ${ms.dueDate}` : ""}
                                </span>
                              </div>
                              <span className="font-mono font-semibold">${amount.toFixed(2)}</span>
                            </div>
                          );
                        })}
                      </div>
                    ))
                  )}
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
          <div className="w-72 border-l border-border bg-card/30 overflow-y-auto shrink-0 hidden md:block">
            <div className="p-4 space-y-6">
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

              {/* Packages */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Packages</Label>
                  <button onClick={addPackageItem} className="text-[10px] text-primary hover:text-primary/80 flex items-center gap-0.5">
                    <Plus className="w-3 h-3" /> Add
                  </button>
                </div>

                {packages.length === 0 && (
                  <p className="text-[10px] text-muted-foreground">No packages yet. Add packages that clients can choose from.</p>
                )}

                {packages.map((pkg, pkgIdx) => (
                  <div key={pkg.id} className="bg-secondary/50 rounded-lg border border-border p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-muted-foreground font-semibold">PACKAGE {pkgIdx + 1}</span>
                      <button onClick={() => removePackage(pkg.id)} className="text-muted-foreground hover:text-destructive"><X className="w-3 h-3" /></button>
                    </div>
                    <Input
                      value={pkg.name}
                      onChange={e => updatePackage(pkg.id, "name", e.target.value)}
                      className="bg-secondary border-border text-xs"
                      placeholder="Package name (e.g. Mini Session)"
                    />
                    <Input
                      value={pkg.description}
                      onChange={e => updatePackage(pkg.id, "description", e.target.value)}
                      className="bg-secondary border-border text-[10px]"
                      placeholder="Short description"
                    />

                    {/* Line items */}
                    <div className="space-y-1">
                      <span className="text-[10px] text-muted-foreground">Services</span>
                      {pkg.lineItems.map(li => (
                        <div key={li.id} className="flex gap-1 items-center">
                          <Input
                            value={li.description}
                            onChange={e => updatePackageLineItem(pkg.id, li.id, "description", e.target.value)}
                            className="bg-secondary border-border text-[10px] flex-1"
                            placeholder="Service"
                          />
                          <Input
                            type="number"
                            value={li.unitPrice || ""}
                            onChange={e => updatePackageLineItem(pkg.id, li.id, "unitPrice", Number(e.target.value) || 0)}
                            className="bg-secondary border-border text-[10px] w-20"
                            placeholder="Price"
                          />
                          <button onClick={() => removeLineItemFromPackage(pkg.id, li.id)} className="text-muted-foreground hover:text-destructive p-0.5">
                            <X className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      ))}
                      <div className="flex items-center gap-2 flex-wrap">
                        <button onClick={() => addLineItemToPackage(pkg.id)} className="text-[10px] text-primary hover:text-primary/80">+ Blank</button>
                        {(data.organization?.services || []).map(svc => (
                          <button key={svc.id} onClick={() => addServiceToPackage(pkg.id, svc)} className="text-[10px] px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20">
                            {svc.name} · ${svc.defaultPrice}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="text-xs font-semibold text-foreground text-right font-mono">
                      Total: ${pkg.totalPrice.toFixed(2)}
                    </div>

                    {/* Payment milestones */}
                    <div className="space-y-1 pt-1 border-t border-border/50">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-muted-foreground">Payment Schedule</span>
                        <button onClick={() => addMilestone(pkg.id)} className="text-[10px] text-primary hover:text-primary/80">+ Add</button>
                      </div>
                      {pkg.paymentMilestones.map(ms => (
                        <div key={ms.id} className="flex gap-1 items-center">
                          <Input
                            value={ms.label}
                            onChange={e => updateMilestone(pkg.id, ms.id, "label", e.target.value)}
                            className="bg-secondary border-border text-[10px] flex-1"
                            placeholder="Label"
                          />
                          <Input
                            type="number"
                            value={ms.percent || ""}
                            onChange={e => updateMilestone(pkg.id, ms.id, "percent", Number(e.target.value) || 0)}
                            className="bg-secondary border-border text-[10px] w-14"
                            placeholder="%"
                          />
                          <span className="text-[10px] text-muted-foreground">%</span>
                          <select
                            value={ms.dueType}
                            onChange={e => updateMilestone(pkg.id, ms.id, "dueType", e.target.value)}
                            className="bg-secondary border border-border rounded text-[10px] text-foreground px-1 py-1"
                          >
                            <option value="at_signing">At signing</option>
                            <option value="relative_days">Days after</option>
                            <option value="absolute_date">Fixed date</option>
                          </select>
                          {ms.dueType === "relative_days" && (
                            <Input
                              type="number"
                              value={ms.dueDays || ""}
                              onChange={e => updateMilestone(pkg.id, ms.id, "dueDays", Number(e.target.value) || 0)}
                              className="bg-secondary border-border text-[10px] w-12"
                              placeholder="Days"
                            />
                          )}
                          <button onClick={() => removeMilestone(pkg.id, ms.id)} className="text-muted-foreground hover:text-destructive p-0.5">
                            <X className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
