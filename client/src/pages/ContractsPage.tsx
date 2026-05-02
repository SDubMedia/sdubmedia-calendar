// ============================================================
// ContractsPage — Create, send, and manage contracts with e-signatures
// ============================================================

import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { useScopedData as useApp } from "@/hooks/useScopedData";
import { useAuth } from "@/contexts/AuthContext";
import type { ContractTemplate, ContractStatus } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, FileText, Trash2, Edit3, Copy, X, Clapperboard, ScrollText, Handshake, Package, UserCheck, Baby, MapPin, Key, Music, Sparkles, MoreHorizontal, ArrowRight, ChevronUp, ChevronDown } from "lucide-react";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import type { LucideIcon } from "lucide-react";
import { WysiwygContractEditor } from "@/components/WysiwygContractEditor";
import { ContractLetterhead } from "@/components/ContractLetterhead";
import DOMPurify from "dompurify";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { renderTemplatePreviewHtml } from "@/lib/mergeFieldPreview";
import InvoicePageRenderer from "@/components/proposal/InvoicePageRenderer";

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
  "Equipment Rental Agreement": "Agreements",
  "Model Release": "Releases & Licensing",
  "Minor Model Release": "Releases & Licensing",
  "Location Release": "Releases & Licensing",
  "Usage License": "Releases & Licensing",
  "Music License Request": "Releases & Licensing",
};

const DEFAULT_CATEGORY_ORDER = ["Proposals", "Agreements", "Releases & Licensing", "Custom"] as const;
type CategoryName = typeof DEFAULT_CATEGORY_ORDER[number];

// LocalStorage key for the user's preferred category ordering. Stored as
// JSON (array of category names). Falls back to default if missing or
// stale (e.g., a category got renamed in a future release).
const CATEGORY_ORDER_KEY = "slate.contracts.categoryOrder.v1";

function loadCategoryOrder(): readonly CategoryName[] {
  try {
    const raw = localStorage.getItem(CATEGORY_ORDER_KEY);
    if (!raw) return DEFAULT_CATEGORY_ORDER;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_CATEGORY_ORDER;
    // Reconcile: keep saved order, but append any default categories the
    // saved order doesn't know about (forward-compat with future seeds).
    const known = new Set(DEFAULT_CATEGORY_ORDER as readonly string[]);
    const filtered = parsed.filter((x): x is CategoryName => known.has(x));
    const missing = DEFAULT_CATEGORY_ORDER.filter(c => !filtered.includes(c));
    return [...filtered, ...missing];
  } catch {
    return DEFAULT_CATEGORY_ORDER;
  }
}

function saveCategoryOrder(order: readonly CategoryName[]): void {
  try { localStorage.setItem(CATEGORY_ORDER_KEY, JSON.stringify(order)); } catch { /* private mode */ }
}

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
  "Equipment Rental Agreement": Package,
  "Model Release": UserCheck,
  "Minor Model Release": Baby,
  "Location Release": MapPin,
  "Usage License": Key,
  "Music License Request": Music,
};

function templateIcon(name: string): LucideIcon {
  return TEMPLATE_ICONS[name] || FileText;
}


export default function ContractsPage() {
  const { data, addContractTemplate, updateContractTemplate, deleteContractTemplate, updateContract, deleteContract, addProposalTemplate } = useApp();
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

  // Custom category ordering — persisted to localStorage so it sticks
  // across sessions on the same device. Use ↑↓ buttons on each category
  // header to reorder.
  const [categoryOrder, setCategoryOrder] = useState<readonly CategoryName[]>(() => loadCategoryOrder());

  function moveCategory(name: CategoryName, dir: -1 | 1) {
    setCategoryOrder(prev => {
      const idx = prev.indexOf(name);
      const newIdx = idx + dir;
      if (idx < 0 || newIdx < 0 || newIdx >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
      saveCategoryOrder(next);
      return next;
    });
  }

  function openEditTemplate(tpl: ContractTemplate) {
    // Phase B: route to the full-page block-based editor instead of the
    // legacy WysiwygContractEditor dialog.
    setLocation(`/contracts/templates/${tpl.id}/edit`);
  }

  function openNewTemplate() {
    setLocation("/contracts/templates/new/edit");
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

  // From the template detail panel, "Use in new contract" sends the user
  // to the wizard. The wizard's step-3 list pre-selects via ?template=<id>.
  function applyTemplateToNewContract(tpl: ContractTemplate) {
    setDetailTplId(null);
    setLocation(`/contracts/new?template=${encodeURIComponent(tpl.id)}`);
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
          <button onClick={() => setLocation("/trash")} className="px-3 py-1.5 rounded-md text-xs font-medium transition-colors text-muted-foreground hover:text-foreground hover:bg-secondary" title="View archived items">
            Archive
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-3 sm:p-6">
        {tab === "contracts" ? (
          <div className="space-y-4">
            <Button onClick={() => setLocation("/contracts/new")} className="gap-2">
              <Plus className="w-4 h-4" /> New Contract
            </Button>

            {data.contracts.length === 0 ? (
              <div className="rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-10 text-center">
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-primary/15 mb-4">
                  <Sparkles className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-1.5" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                  You haven't sent your first contract
                </h3>
                <p className="text-sm text-muted-foreground max-w-md mx-auto mb-6">
                  {data.contractTemplates.length === 0
                    ? "Build a reusable template first, then create + send your first contract."
                    : `Pick from ${data.contractTemplates.length} lawyer-vetted templates and send your first contract in under a minute.`}
                </p>
                <Button onClick={() => setLocation("/contracts/new")} className="gap-2">
                  <Plus className="w-4 h-4" /> Start your first contract
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {(() => {
                  // Action-required rows pinned to the top (Pixieset-style)
                  // so the user sees what's blocking them first.
                  const sorted = [...data.contracts].sort((a, b) => {
                    const aPriority = a.status === "client_signed" ? 0 : a.status === "sent" ? 1 : a.status === "draft" ? 2 : 3;
                    const bPriority = b.status === "client_signed" ? 0 : b.status === "sent" ? 1 : b.status === "draft" ? 2 : 3;
                    if (aPriority !== bPriority) return aPriority - bPriority;
                    return b.updatedAt.localeCompare(a.updatedAt);
                  });
                  return sorted.map(c => {
                    const client = data.clients.find(cl => cl.id === c.clientId);
                    const isActionRequired = c.status === "client_signed";
                    return (
                      <button
                        key={c.id}
                        onClick={() => setLocation(`/contracts/${c.id}/edit`)}
                        className={cn(
                          "group w-full text-left bg-card border rounded-xl p-3 sm:p-4 transition-all hover:border-primary/40 hover:shadow-md flex items-stretch gap-3",
                          isActionRequired ? "border-amber-500/40 bg-amber-500/[0.04]" : "border-border",
                        )}
                      >
                        {/* Cream-paper thumbnail — ties the list to the wizard/editor visual language */}
                        <div className="hidden sm:flex shrink-0 w-12 h-16 rounded bg-[#f6f2e8] border border-zinc-300/40 items-center justify-center">
                          <FileText className="w-5 h-5 text-zinc-700/60" strokeWidth={1.5} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="font-semibold text-foreground text-sm truncate">{c.title}</span>
                            <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded border", STATUS_COLORS[c.status])}>
                              {STATUS_LABELS[c.status]}
                            </span>
                            {isActionRequired && (
                              <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-300">⚡ Action required</span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground truncate">{client?.company || "Unknown"} · {c.clientEmail}</p>
                          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5">
                            {c.sentAt && <span className="text-[10px] text-muted-foreground">Sent {new Date(c.sentAt).toLocaleDateString()}</span>}
                            {c.clientSignedAt && <span className="text-[10px] text-green-400">Client ✓ {new Date(c.clientSignedAt).toLocaleDateString()}</span>}
                            {c.ownerSignedAt && <span className="text-[10px] text-green-400">You ✓ {new Date(c.ownerSignedAt).toLocaleDateString()}</span>}
                            {c.additionalSigners.length > 0 && (
                              <span className="text-[10px] text-muted-foreground">
                                +{c.additionalSigners.filter(s => s.signedAt).length}/{c.additionalSigners.length} co-signers
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-start gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                          {c.status !== "completed" && (
                            <button onClick={async (e) => { e.stopPropagation(); await updateContract(c.id, { status: "void" }); toast.success("Contract voided"); }} className="p-1.5 text-muted-foreground hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity" title="Void"><X className="w-4 h-4" /></button>
                          )}
                          {(c.status === "draft" || c.status === "void") && (
                            <button onClick={async (e) => { e.stopPropagation(); await deleteContract(c.id); toast.success("Archived — restore from Archive"); }} className="p-1.5 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity" title="Archive"><Trash2 className="w-4 h-4" /></button>
                          )}
                        </div>
                      </button>
                    );
                  });
                })()}
              </div>
            )}
          </div>
        ) : (
          /* Templates Tab */
          <div className="space-y-6">
            <div className="flex gap-2">
              <Button onClick={() => setLocation("/proposals/templates/new/edit")} className="gap-2">
                <Plus className="w-4 h-4" /> New Proposal Template
              </Button>
              <Button onClick={openNewTemplate} variant="outline" className="gap-2">
                <Plus className="w-4 h-4" /> New Contract Template
              </Button>
            </div>

            {data.contractTemplates.length === 0 && data.proposalTemplates.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">No templates yet. Create a reusable template.</p>
              </div>
            ) : (
              categoryOrder.map((cat, catIdx) => {
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
                    <div className="group flex items-center gap-3 pb-2 border-b border-border/60">
                      <div className={cn("shrink-0 rounded-lg border p-2", meta.tint)}>
                        <CatIcon className={cn("w-5 h-5", meta.iconColor)} strokeWidth={1.75} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-base font-semibold text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{cat}</h3>
                        <p className="text-xs text-muted-foreground mt-0.5">{meta.subtitle}</p>
                      </div>
                      <span className="text-xs text-muted-foreground tabular-nums">{total} {total === 1 ? "template" : "templates"}</span>
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => moveCategory(cat, -1)}
                          disabled={catIdx === 0}
                          className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-secondary disabled:opacity-30 disabled:cursor-not-allowed"
                          title="Move category up"
                        >
                          <ChevronUp className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => moveCategory(cat, 1)}
                          disabled={catIdx === categoryOrder.length - 1}
                          className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-secondary disabled:opacity-30 disabled:cursor-not-allowed"
                          title="Move category down"
                        >
                          <ChevronDown className="w-4 h-4" />
                        </button>
                      </div>
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
                                <button onClick={async (e) => { e.stopPropagation(); await addProposalTemplate({ name: `${tpl.name} (Copy)`, coverImageUrl: tpl.coverImageUrl, pages: tpl.pages, packages: tpl.packages, contractTemplateId: tpl.contractTemplateId ?? null, lineItems: tpl.lineItems, contractContent: tpl.contractContent, paymentConfig: tpl.paymentConfig, notes: tpl.notes }); toast.success("Duplicated"); }} className="p-2 bg-white/20 rounded-lg hover:bg-white/30 text-white" title="Duplicate"><Copy className="w-4 h-4" /></button>
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
                      {/* Contract templates — match proposal card style: centered
                          serif title on cream paper, no raw HTML excerpt. */}
                      {contractsForCat.map(tpl => {
                        const Icon = templateIcon(tpl.name);
                        return (
                          <div
                            key={`c-${tpl.id}`}
                            className="group bg-card border border-border rounded-xl overflow-hidden hover:border-primary/40 hover:shadow-lg hover:-translate-y-0.5 transition-all cursor-pointer"
                            onClick={() => setDetailTplId(tpl.id)}
                          >
                            <div className="aspect-[4/3] relative overflow-hidden bg-[#f6f2e8]">
                              <div className="absolute inset-0 flex items-center justify-center px-4 text-center">
                                <div>
                                  <Icon className="w-8 h-8 mx-auto mb-2 text-zinc-700/40" strokeWidth={1.5} />
                                  <div className="text-zinc-800 leading-tight" style={{ fontFamily: "'Source Serif Pro', 'Georgia', serif", fontStyle: "italic", fontSize: "13px" }}>
                                    {tpl.name}
                                  </div>
                                </div>
                              </div>
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

      {/* Template Detail — desktop modal, mobile bottom-sheet feel via responsive
          full-screen + pinned-bottom CTA. One layout, breakpoint-driven. */}
      <Dialog open={!!detailTpl} onOpenChange={(open) => !open && setDetailTplId(null)}>
        <DialogContent
          className={cn(
            "bg-card border-border text-foreground p-0 gap-0 overflow-hidden flex flex-col",
            // Mobile: full viewport, no rounding
            "max-w-[100vw] w-[100vw] h-[100dvh] rounded-none",
            // Desktop: standard centered modal
            "sm:max-w-3xl sm:w-auto sm:h-auto sm:max-h-[90dvh] sm:rounded-lg",
          )}
        >
          {detailTpl && (() => {
            const Icon = templateIcon(detailTpl.name);
            const cat = TEMPLATE_CATEGORIES[detailTpl.name] || "Custom";
            const useCta = () => applyTemplateToNewContract(detailTpl);
            const editCta = () => { setDetailTplId(null); openEditTemplate(detailTpl); };
            const dupCta = async () => {
              const copy = await addContractTemplate({ name: `${detailTpl.name} (Copy)`, content: detailTpl.content });
              toast.success("Duplicated — opening your copy");
              setDetailTplId(copy.id);
            };
            const delCta = async () => {
              if (!confirm(`Archive "${detailTpl.name}"? You can restore it from the Archive page.`)) return;
              await deleteContractTemplate(detailTpl.id);
              setDetailTplId(null);
              toast.success("Template archived");
            };
            return (
              <>
                {/* Sticky header — title + category + secondary-actions menu + desktop CTA */}
                <div className="flex items-center gap-2 sm:gap-3 px-4 sm:px-6 py-3 border-b border-border shrink-0">
                  <div className="shrink-0 rounded-lg bg-primary/10 p-2">
                    <Icon className="w-5 h-5 text-primary" strokeWidth={1.75} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <DialogTitle className="text-base sm:text-lg leading-tight truncate" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                      {detailTpl.name}
                    </DialogTitle>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70 mt-0.5">{cat}</p>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary touch-manipulation"
                        aria-label="More actions"
                      >
                        <MoreHorizontal className="w-5 h-5" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={editCta}>
                        <Edit3 className="w-4 h-4 mr-2" /> Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={dupCta}>
                        <Copy className="w-4 h-4 mr-2" /> Duplicate
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={delCta} className="text-destructive focus:text-destructive">
                        <Trash2 className="w-4 h-4 mr-2" /> Archive
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <Button onClick={useCta} className="hidden sm:inline-flex">
                    Use in new contract <ArrowRight className="w-4 h-4 ml-1.5" />
                  </Button>
                </div>

                {/* Body — fills remaining height, scrolls internally. Inline stat
                    line replaces the old 3-card grid; preview owns the fold. */}
                <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-3 space-y-3 min-h-0">
                  <p className="text-xs text-muted-foreground">
                    Used in <span className="text-foreground font-medium tabular-nums">{detailUsage.count}</span>{" "}
                    {detailUsage.count === 1 ? "contract" : "contracts"}
                    <span className="mx-1.5">·</span>
                    Last used <span className="text-foreground font-medium">{detailUsage.lastUsed ? new Date(detailUsage.lastUsed).toLocaleDateString() : "Never"}</span>
                    <span className="mx-1.5">·</span>
                    <span className="text-foreground font-medium tabular-nums">{detailTpl.content.length.toLocaleString()}</span> chars
                  </p>
                  {Array.isArray(detailTpl.pages) && detailTpl.pages.length > 0 ? (
                    // Multi-page template — render each page as its own card.
                    // Invoice pages auto-render via InvoicePageRenderer with
                    // sample milestone data so the owner can see what the
                    // client will see at signing time.
                    <div className="space-y-3">
                      {[...detailTpl.pages].sort((a, b) => a.sortOrder - b.sortOrder).map((page, idx) => (
                        <div key={page.id} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                          {idx === 0 && (
                            <ContractLetterhead
                              orgName={data.organization?.name}
                              ownerName={profile?.name}
                              orgLogo={data.organization?.logoUrl}
                              businessInfo={data.organization?.businessInfo}
                              intro="Preview — this is what your client will see when you send it."
                            />
                          )}
                          {page.type === "invoice" ? (
                            <InvoicePageRenderer
                              contractTitle={detailTpl.name}
                              org={data.organization}
                              client={null}
                              milestones={[
                                { id: "p1", label: "Deposit (50%)", type: "percent", percent: 50, dueType: "at_signing", status: "due" },
                                { id: "p2", label: "Balance (50%)", type: "percent", percent: 50, dueType: "absolute_date", dueDate: "2026-06-14", status: "pending" },
                              ]}
                            />
                          ) : (
                            <div
                              className="px-6 sm:px-10 py-8 contract-html-light"
                              dangerouslySetInnerHTML={{
                                __html: DOMPurify.sanitize(
                                  renderTemplatePreviewHtml(page.content || "", data.organization),
                                  { ADD_ATTR: ["class"] },
                                ),
                              }}
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
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
                          dangerouslySetInnerHTML={{
                            __html: DOMPurify.sanitize(
                              renderTemplatePreviewHtml(detailTpl.content, data.organization),
                              { ADD_ATTR: ["class"] },
                            ),
                          }}
                        />
                      ) : (
                        <div
                          className="px-6 sm:px-10 py-8 text-sm text-gray-700 leading-relaxed whitespace-pre-wrap"
                          style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif" }}
                        >
                          {detailTpl.content || "Empty template"}
                        </div>
                      )}
                    </div>
                  )}
                  <p className="text-[10px] text-muted-foreground/60 text-center pb-1">This is what your client sees when you send it</p>
                </div>

                {/* Mobile-only pinned CTA — safe-area-aware so it clears the iOS home indicator */}
                <div
                  className="sm:hidden border-t border-border bg-card p-3 shrink-0"
                  style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}
                >
                  <Button onClick={useCta} className="w-full" size="lg">
                    Use in new contract <ArrowRight className="w-4 h-4 ml-1.5" />
                  </Button>
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

    </div>
  );
}
