// ============================================================
// EditContractTemplatePage — multi-page contract template editor.
// HoneyBook-style Smart File: each template can have multiple pages
// (Agreement / Invoice / Payment / Custom). The Invoice page renders
// from the contract's payment milestones at view time — no authoring
// required there.
//
// Backward compat: legacy templates with only `blocks` get wrapped
// into a single Agreement page on first open.
// ============================================================

import { useState, useEffect, useRef } from "react";
import { useParams, useLocation } from "wouter";
import { useApp } from "@/contexts/AppContext";
import type { ProposalBlock, ProposalPage, ProposalPageType, ContractTemplate, PaymentMilestone } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Save, FileText, Receipt, DollarSign, Sparkles, ChevronUp, ChevronDown, X, Plus } from "lucide-react";
import { toast } from "sonner";
import { BlockEditor } from "@/components/proposal-editor/BlockEditor";
import { ContractMergeFieldPanel } from "@/components/proposal-editor/ContractMergeFieldPanel";
import { insertIntoActiveProse } from "@/components/proposal-editor/proseFocusRegistry";
import { ProposalBlockRenderer } from "@/components/proposal/ProposalBlockRenderer";
import InvoicePageRenderer from "@/components/proposal/InvoicePageRenderer";
import { renderToStaticMarkup } from "react-dom/server";
import { nanoid } from "nanoid";
import { cn } from "@/lib/utils";

const PAGE_ICONS: Record<ProposalPageType, typeof FileText> = {
  agreement: FileText,
  invoice: Receipt,
  payment: DollarSign,
  custom: Sparkles,
};

// Sample milestones used for the Invoice page preview in the editor.
// Real milestones substitute in at signing time on the public portal.
const PREVIEW_MILESTONES: PaymentMilestone[] = [
  { id: "preview1", label: "Deposit (50%)", type: "percent", percent: 50, dueType: "at_signing", status: "due" },
  { id: "preview2", label: "Balance (50%)", type: "percent", percent: 50, dueType: "absolute_date", dueDate: "2026-06-14", status: "pending" },
];

export default function EditContractTemplatePage() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { data, addContractTemplate, updateContractTemplate } = useApp();

  const isNew = params.id === "new";
  const existing = isNew ? null : data.contractTemplates.find(t => t.id === params.id);

  const [name, setName] = useState("");
  const [pages, setPages] = useState<ProposalPage[]>([]);
  const [activePageId, setActivePageId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showLibrary, setShowLibrary] = useState(true);
  const [showPageList, setShowPageList] = useState(true);

  const hydratedRef = useRef(false);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [autosaveStatus, setAutosaveStatus] = useState<"idle" | "saving" | "error">("idle");
  const canvasScrollRef = useRef<HTMLDivElement>(null);

  // Refs that mirror current state for the save-during-blur race.
  const nameRef = useRef(name);
  const pagesRef = useRef(pages);
  const setNameAndRef = (next: string) => { nameRef.current = next; setName(next); };
  const setPagesAndRef = (next: ProposalPage[]) => { pagesRef.current = next; setPages(next); };

  const activePage = pages.find(p => p.id === activePageId) || pages[0] || null;

  function updatePageBlocks(pageId: string, nextBlocks: ProposalBlock[]) {
    const next = pages.map(p => p.id === pageId ? { ...p, blocks: nextBlocks } : p);
    setPagesAndRef(next);
  }

  function updatePageLabel(pageId: string, label: string) {
    const next = pages.map(p => p.id === pageId ? { ...p, label } : p);
    setPagesAndRef(next);
  }

  function addPage(type: ProposalPageType) {
    const labelMap: Record<ProposalPageType, string> = {
      agreement: "Agreement",
      invoice: "Invoice",
      payment: "Payment Schedule",
      custom: "New Page",
    };
    const id = nanoid(8);
    const newPage: ProposalPage = {
      id,
      type,
      label: labelMap[type],
      content: "",
      blocks: type === "invoice" ? [] : [],
      sortOrder: pages.length,
    };
    setPagesAndRef([...pages, newPage]);
    setActivePageId(id);
  }

  function removePage(pageId: string) {
    if (pages.length <= 1) {
      toast.error("Can't remove the only page");
      return;
    }
    const next = pages.filter(p => p.id !== pageId).map((p, i) => ({ ...p, sortOrder: i }));
    setPagesAndRef(next);
    if (activePageId === pageId) setActivePageId(next[0]?.id || null);
  }

  function movePage(pageId: string, dir: -1 | 1) {
    const idx = pages.findIndex(p => p.id === pageId);
    const newIdx = idx + dir;
    if (idx < 0 || newIdx < 0 || newIdx >= pages.length) return;
    const next = [...pages];
    [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
    setPagesAndRef(next.map((p, i) => ({ ...p, sortOrder: i })));
  }

  function addMergeField(fieldKey: string, label: string) {
    if (!activePage) return;
    const isBlockField = fieldKey.endsWith("_block");
    if (!isBlockField && insertIntoActiveProse(fieldKey, label)) return;
    const nextBlocks = [
      ...(activePage.blocks || []),
      { id: nanoid(6), type: "merge_field", field: fieldKey } as ProposalBlock,
    ];
    updatePageBlocks(activePage.id, nextBlocks);
  }

  // Hydrate on first load. Three branches:
  //  1. existing.pages non-empty → use them (new multi-page templates)
  //  2. existing.blocks non-empty → wrap into a single Agreement page
  //  3. existing.content non-empty → wrap as a legacy prose block in
  //     a single Agreement page
  //  4. brand new template → start with one empty Agreement page
  useEffect(() => {
    if (existing) {
      setNameAndRef(existing.name);
      if (existing.pages && existing.pages.length > 0) {
        setPagesAndRef(existing.pages);
        setActivePageId(existing.pages[0].id);
      } else if (existing.blocks && existing.blocks.length > 0) {
        const wrapped: ProposalPage = { id: nanoid(8), type: "agreement", label: "Agreement", content: "", blocks: existing.blocks, sortOrder: 0 };
        setPagesAndRef([wrapped]);
        setActivePageId(wrapped.id);
      } else if (existing.content) {
        const wrapped: ProposalPage = {
          id: nanoid(8),
          type: "agreement",
          label: "Agreement",
          content: "",
          blocks: [{ id: "legacy", type: "prose", html: existing.content } as ProposalBlock],
          sortOrder: 0,
        };
        setPagesAndRef([wrapped]);
        setActivePageId(wrapped.id);
      } else {
        const fresh: ProposalPage = { id: nanoid(8), type: "agreement", label: "Agreement", content: "", blocks: [], sortOrder: 0 };
        setPagesAndRef([fresh]);
        setActivePageId(fresh.id);
      }
    } else if (isNew) {
      // Brand new — seed with an Agreement page so the canvas isn't empty.
      const fresh: ProposalPage = { id: nanoid(8), type: "agreement", label: "Agreement", content: "", blocks: [], sortOrder: 0 };
      setPagesAndRef([fresh]);
      setActivePageId(fresh.id);
    }
    const t = setTimeout(() => { hydratedRef.current = true; }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing?.id, isNew]);

  // Autosave 900ms after last edit.
  useEffect(() => {
    if (!hydratedRef.current) return;
    if (isNew) return;
    if (!name.trim()) return;
    if (saving) return;
    const handle = setTimeout(() => {
      void save({ silent: true });
    }, 900);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, pages]);

  async function save(opts?: { silent?: boolean }) {
    const silent = opts?.silent ?? false;
    const currentName = nameRef.current;
    const currentPages = pagesRef.current;
    if (!currentName.trim()) {
      if (!silent) toast.error("Template name required");
      return;
    }
    const scrollSnapshot = canvasScrollRef.current?.scrollTop ?? 0;
    setSaving(true);
    if (silent) setAutosaveStatus("saving");
    try {
      // Backward-compat artifacts: render the FIRST agreement page's blocks
      // to flat HTML and store as `content`. The contract generator reads
      // `template.content` for merge-field substitution. Multi-page rendering
      // happens at view time on /sign/<token>.
      const agreementPage = currentPages.find(p => p.type === "agreement") || currentPages[0];
      const renderedHtml = agreementPage ? renderBlocksToHtml(agreementPage.blocks || []) : "";
      const firstBlocks = agreementPage?.blocks || [];

      if (isNew) {
        const tpl = await addContractTemplate({
          name: currentName.trim(),
          content: renderedHtml,
          blocks: firstBlocks,
          pages: currentPages,
        } as Omit<ContractTemplate, "id" | "createdAt" | "updatedAt">);
        if (!silent) toast.success("Template created");
        setLocation(`/contracts/templates/${tpl.id}/edit`);
      } else {
        await updateContractTemplate(params.id!, {
          name: currentName.trim(),
          content: renderedHtml,
          blocks: firstBlocks,
          pages: currentPages,
        });
        if (!silent) toast.success("Template saved");
      }
      setLastSavedAt(Date.now());
      setAutosaveStatus("idle");
    } catch (err) {
      if (!silent) toast.error(err instanceof Error ? err.message : "Save failed");
      else setAutosaveStatus("error");
    } finally {
      setSaving(false);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (canvasScrollRef.current) canvasScrollRef.current.scrollTop = scrollSnapshot;
        });
      });
    }
  }

  if (!isNew && !existing) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 gap-4">
        <p className="text-muted-foreground">Contract template not found.</p>
        <Button variant="outline" onClick={() => setLocation("/contracts")}>Back to Contracts</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-card/50">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={() => setLocation("/contracts")} className="p-1.5 text-muted-foreground hover:text-foreground shrink-0">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="min-w-0">
            <input
              value={name}
              onChange={e => setNameAndRef(e.target.value)}
              className="text-lg font-semibold text-foreground bg-transparent border-none outline-none w-full max-w-xs sm:max-w-md"
              placeholder="Template name…"
              style={{ fontFamily: "'Space Grotesk', sans-serif" }}
            />
            <p className="text-[10px] text-muted-foreground">
              {pages.length} page{pages.length === 1 ? "" : "s"} · {isNew ? "New template" : "Saved"} · Auto-fills with client + package data when sent
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <AutosaveStatus status={autosaveStatus} lastSavedAt={lastSavedAt} isNew={isNew} />
          <Button variant="outline" size="sm" onClick={() => setShowPageList(!showPageList)} className="text-xs hidden md:inline-flex">
            {showPageList ? "Hide pages" : "Show pages"}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowLibrary(!showLibrary)} className="text-xs hidden md:inline-flex">
            {showLibrary ? "Hide library" : "Show library"}
          </Button>
          <Button size="sm" onClick={() => save()} disabled={saving} className="gap-1.5">
            <Save className="w-3.5 h-3.5" />
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>

      {/* Mobile page-tabs */}
      <div className="md:hidden flex items-center gap-1.5 px-3 py-2 border-b border-border bg-card/30 overflow-x-auto">
        {[...pages].sort((a, b) => a.sortOrder - b.sortOrder).map(page => {
          const Icon = PAGE_ICONS[page.type];
          return (
            <button
              key={page.id}
              onClick={() => setActivePageId(page.id)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap",
                activePageId === page.id
                  ? "bg-primary/10 text-primary border border-primary/30"
                  : "text-muted-foreground",
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

      {/* 3-column layout: page list + canvas + library */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left sidebar — page thumbnails */}
        {showPageList && (
          <div className="w-48 border-r border-border bg-card/30 flex-col overflow-hidden shrink-0 hidden md:flex">
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {[...pages].sort((a, b) => a.sortOrder - b.sortOrder).map(page => {
                const Icon = PAGE_ICONS[page.type];
                return (
                  <div
                    key={page.id}
                    onClick={() => setActivePageId(page.id)}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer text-xs transition-colors group",
                      activePageId === page.id
                        ? "bg-primary/10 text-primary border border-primary/30"
                        : "text-muted-foreground hover:text-foreground hover:bg-secondary",
                    )}
                  >
                    <Icon className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate flex-1">{page.label}</span>
                    <div className="flex gap-0.5 opacity-0 group-hover:opacity-100">
                      <button onClick={e => { e.stopPropagation(); movePage(page.id, -1); }} className="p-0.5 hover:text-foreground"><ChevronUp className="w-3 h-3" /></button>
                      <button onClick={e => { e.stopPropagation(); movePage(page.id, 1); }} className="p-0.5 hover:text-foreground"><ChevronDown className="w-3 h-3" /></button>
                      {pages.length > 1 && (
                        <button onClick={e => { e.stopPropagation(); removePage(page.id); }} className="p-0.5 hover:text-destructive"><X className="w-3 h-3" /></button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="p-2 border-t border-border space-y-1">
              <button onClick={() => addPage("agreement")} className="flex items-center gap-2 w-full px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-secondary">
                <FileText className="w-3 h-3" /> Agreement Page
              </button>
              <button onClick={() => addPage("invoice")} className="flex items-center gap-2 w-full px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-secondary">
                <Receipt className="w-3 h-3" /> Invoice Page
              </button>
              <button onClick={() => addPage("payment")} className="flex items-center gap-2 w-full px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-secondary">
                <DollarSign className="w-3 h-3" /> Payment Page
              </button>
              <button onClick={() => addPage("custom")} className="flex items-center gap-2 w-full px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-secondary">
                <Sparkles className="w-3 h-3" /> Custom Page
              </button>
            </div>
          </div>
        )}

        {/* Canvas — switches by active page type */}
        <div ref={canvasScrollRef} className="flex-1 overflow-y-auto bg-secondary/30 p-4 sm:p-8">
          {activePage ? (
            <div className="max-w-3xl mx-auto">
              <div className="flex items-center gap-2 mb-3">
                <input
                  value={activePage.label}
                  onChange={e => updatePageLabel(activePage.id, e.target.value)}
                  className="text-sm font-semibold text-foreground bg-transparent border-none outline-none"
                  placeholder="Page title…"
                />
                <span className="text-[10px] text-muted-foreground uppercase">{activePage.type}</span>
              </div>

              {activePage.type === "invoice" ? (
                <div className="bg-secondary/50 border border-dashed border-border rounded-xl p-1">
                  <div className="bg-amber-50 text-amber-900 text-xs rounded-t px-3 py-1.5 mb-1">
                    Preview — at signing time, this auto-fills with the client's actual milestones.
                  </div>
                  <InvoicePageRenderer
                    contractTitle={name || "Sample Contract"}
                    org={data.organization}
                    client={null}
                    milestones={PREVIEW_MILESTONES}
                  />
                </div>
              ) : (
                <BlockEditor
                  blocks={activePage.blocks || []}
                  onChange={blocks => updatePageBlocks(activePage.id, blocks)}
                  libraryPackages={data.packages}
                  kind="contract"
                />
              )}
            </div>
          ) : (
            <p className="text-center text-muted-foreground p-8">No page selected.</p>
          )}
        </div>

        {/* Right sidebar — merge field library (hidden on Invoice page) */}
        {showLibrary && activePage?.type !== "invoice" && (
          <div className="w-72 border-l border-border bg-card overflow-y-auto shrink-0 hidden md:block">
            <div className="p-4">
              <ContractMergeFieldPanel onAddField={addMergeField} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Render a blocks array to a flat HTML string for backward compat. The
 * contract generator reads template.content for merge-field substitution
 * and the existing single-page renderers read it too.
 */
function renderBlocksToHtml(blocks: ProposalBlock[]): string {
  const fakePage = {
    id: "rendered",
    type: "agreement" as const,
    label: "",
    content: "",
    blocks,
    sortOrder: 0,
  };
  return renderToStaticMarkup(<ProposalBlockRenderer page={fakePage} libraryPackages={[]} />);
}

function AutosaveStatus({
  status,
  lastSavedAt,
  isNew,
}: {
  status: "idle" | "saving" | "error";
  lastSavedAt: number | null;
  isNew: boolean;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (lastSavedAt == null) return;
    setNow(Date.now());
    const i = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(i);
  }, [lastSavedAt]);

  if (isNew) return null;
  if (status === "saving") return <span className="text-[11px] text-muted-foreground">Saving…</span>;
  if (status === "error") return <span className="text-[11px] text-destructive">Save failed — retry</span>;
  if (lastSavedAt == null) return null;
  const seconds = Math.max(1, Math.round((now - lastSavedAt) / 1000));
  const label = seconds < 60
    ? `Saved · ${seconds}s ago`
    : seconds < 3600
      ? `Saved · ${Math.round(seconds / 60)}m ago`
      : `Saved`;
  return <span className="text-[11px] text-emerald-600">{label}</span>;
}
