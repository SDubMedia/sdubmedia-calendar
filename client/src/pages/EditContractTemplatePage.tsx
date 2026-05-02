// ============================================================
// EditContractTemplatePage — full-page block-based editor for master
// contract templates. Phase B.
//
// Mirrors the proposal editor's live-canvas UX (no HTML/preview toggle).
// On save, produces both a structured `blocks[]` (for round-tripping in
// the editor) AND a flat `content` HTML (so the existing rendering
// surfaces and the contract generator keep working).
// ============================================================

import { useState, useEffect, useRef } from "react";
import { useParams, useLocation } from "wouter";
import { useApp } from "@/contexts/AppContext";
import type { ProposalBlock, ContractTemplate } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Save } from "lucide-react";
import { toast } from "sonner";
import { BlockEditor } from "@/components/proposal-editor/BlockEditor";
import { ContractMergeFieldPanel } from "@/components/proposal-editor/ContractMergeFieldPanel";
import { insertIntoActiveProse } from "@/components/proposal-editor/proseFocusRegistry";
import { ProposalBlockRenderer } from "@/components/proposal/ProposalBlockRenderer";
import { renderToStaticMarkup } from "react-dom/server";
import { nanoid } from "nanoid";

export default function EditContractTemplatePage() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { data, addContractTemplate, updateContractTemplate } = useApp();

  const isNew = params.id === "new";
  const existing = isNew ? null : data.contractTemplates.find(t => t.id === params.id);

  const [name, setName] = useState("");
  const [blocks, setBlocks] = useState<ProposalBlock[]>([]);
  const [legacyContent, setLegacyContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [showLibrary, setShowLibrary] = useState(true);
  // Autosave bookkeeping. `hydratedRef` blocks the autosave from firing on
  // the initial useEffect-driven state load (which would write the existing
  // content right back to the row, churning updated_at). `lastSavedAt` drives
  // the "Saved · 12s ago" indicator next to the Save button.
  const hydratedRef = useRef(false);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [autosaveStatus, setAutosaveStatus] = useState<"idle" | "saving" | "error">("idle");
  // Ref on the scrollable canvas. Used by save() to snapshot + restore the
  // user's scroll position so a save (manual or auto) doesn't yank them
  // back to the top when the active prose block reflows from edit-mode
  // (taller, with toolbar) to display-mode.
  const canvasScrollRef = useRef<HTMLDivElement>(null);

  // Refs that mirror current state. save() reads from these so it always
  // sends the latest content, even when invoked during the mousedown/blur
  // sequence of clicking Save (which fires before React has committed the
  // setBlocks() that the blur-triggered prose commit just queued).
  //
  // Refs are updated SYNCHRONOUSLY in the wrapper setters below — not via
  // useEffect — because React 18 batches blur+click events from the same
  // gesture, so a useEffect-based sync would still see stale data when the
  // click handler reads the ref mid-batch.
  const nameRef = useRef(name);
  const blocksRef = useRef(blocks);
  const setNameAndRef = (next: string) => { nameRef.current = next; setName(next); };
  const setBlocksAndRef = (next: ProposalBlock[]) => { blocksRef.current = next; setBlocks(next); };

  // Click-to-add from the right sidebar.
  //
  // 1. Block-typed fields (parties_block, packages_block, etc.) always
  //    append as a new block — they expand to multi-line content and
  //    don't make sense inline.
  // 2. Plain fields (client_name, event_date, etc.) try to insert at the
  //    cursor position inside the currently-focused prose block. That
  //    lets users compose paragraphs like "Payment is due one day before
  //    {{event_date}}" without having to manually move tokens around.
  // 3. If no prose is focused, fall back to appending a merge_field block.
  function addMergeField(fieldKey: string, label: string) {
    const isBlockField = fieldKey.endsWith("_block");
    if (!isBlockField && insertIntoActiveProse(fieldKey, label)) {
      return;
    }
    setBlocksAndRef([
      ...blocksRef.current,
      { id: nanoid(6), type: "merge_field", field: fieldKey } as ProposalBlock,
    ]);
  }

  useEffect(() => {
    if (existing) {
      setNameAndRef(existing.name);
      if (existing.blocks && existing.blocks.length > 0) {
        setBlocksAndRef(existing.blocks);
        setLegacyContent(existing.content || "");
      } else if (existing.content) {
        // First open of a legacy template — synthesise a single prose block
        // from the existing HTML so the user can keep editing.
        setBlocksAndRef([{ id: "legacy", type: "prose", html: existing.content } as ProposalBlock]);
        setLegacyContent(existing.content);
      } else {
        setBlocksAndRef([]);
        setLegacyContent("");
      }
    }
    // Mark hydration on next tick so the autosave effect's initial fire
    // (post-state-set) is skipped — otherwise we'd round-trip the existing
    // content right back to the row on open.
    const t = setTimeout(() => { hydratedRef.current = true; }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing?.id]);

  // Autosave: 900ms after the last edit, save silently (no toast). Skips
  // pre-hydration ticks, the "saving in flight" window, and edits where
  // the name is still blank (validation would fail anyway).
  useEffect(() => {
    if (!hydratedRef.current) return;
    if (isNew) return;                 // new templates require an explicit Save first
    if (!name.trim()) return;
    if (saving) return;
    const handle = setTimeout(() => {
      void save({ silent: true });
    }, 900);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, blocks]);

  async function save(opts?: { silent?: boolean }) {
    const silent = opts?.silent ?? false;
    // Read from refs so any state update queued by the prose-blur commit
    // (which fires just before this click handler) is reflected even if
    // React hasn't re-rendered yet.
    const currentName = nameRef.current;
    const currentBlocks = blocksRef.current;
    if (!currentName.trim()) {
      if (!silent) toast.error("Template name required");
      return;
    }
    // Snapshot scroll BEFORE the save → React flushes a re-render that
    // unmounts/remounts the active prose block (edit → display mode),
    // which collapses some height. We restore to this position after
    // the layout settles via two rAFs (one to wait for React commit,
    // one to wait for the browser layout pass).
    const scrollSnapshot = canvasScrollRef.current?.scrollTop ?? 0;
    setSaving(true);
    if (silent) setAutosaveStatus("saving");
    try {
      // Render the blocks to a flat HTML string for backward compat
      // (contract generator + ContractsPage detail view read `content`).
      const renderedHtml = renderBlocksToHtml(currentBlocks);
      if (isNew) {
        const tpl = await addContractTemplate({
          name: currentName.trim(),
          content: renderedHtml,
          blocks: currentBlocks,
        } as Omit<ContractTemplate, "id" | "createdAt" | "updatedAt">);
        if (!silent) toast.success("Template created");
        setLocation(`/contracts/templates/${tpl.id}/edit`);
      } else {
        await updateContractTemplate(params.id!, {
          name: currentName.trim(),
          content: renderedHtml,
          blocks: currentBlocks,
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
      // Restore scroll after the post-save re-render. Two rAFs: the first
      // fires after React commits its update, the second after the browser
      // does layout. Without both, the assignment runs before the layout
      // has reflowed and the scrollTop snaps back to whatever the new
      // (smaller) document allows.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (canvasScrollRef.current) {
            canvasScrollRef.current.scrollTop = scrollSnapshot;
          }
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
              {isNew ? "New contract template" : "Saved template"} · Master template — auto-fills with client + package data when sent
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <AutosaveStatus status={autosaveStatus} lastSavedAt={lastSavedAt} isNew={isNew} />
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowLibrary(!showLibrary)}
            className="text-xs"
          >
            {showLibrary ? "Hide library" : "Show library"}
          </Button>
          <Button size="sm" onClick={() => save()} disabled={saving} className="gap-1.5">
            <Save className="w-3.5 h-3.5" />
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>

      {/* 2-column layout: canvas + library sidebar */}
      <div className="flex-1 flex overflow-hidden">
        {/* Canvas */}
        <div ref={canvasScrollRef} className="flex-1 overflow-y-auto bg-secondary/30 p-4 sm:p-8">
          <div className="max-w-3xl mx-auto">
            {legacyContent && blocks.length === 1 && blocks[0].type === "prose" && (blocks[0] as { id: string }).id === "legacy" && (
              <div className="mb-3 px-3 py-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-900">
                Legacy template imported as a single Text block. Split it into structured blocks (use the <strong>+</strong> buttons) and click merge fields in the right sidebar to drop in client / package / payment data.
              </div>
            )}
            <BlockEditor
              blocks={blocks}
              onChange={setBlocksAndRef}
              libraryPackages={data.packages}
              kind="contract"
            />
          </div>
        </div>

        {/* Right sidebar — merge field library */}
        {showLibrary && (
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
 * Render a blocks array to a flat HTML string for backward compat. Reuses
 * the same `ProposalBlockRenderer` markup the public viewer uses, so the
 * output renders identically wherever it's shown.
 */
function renderBlocksToHtml(blocks: ProposalBlock[]): string {
  // Wrap in a synthetic "page" since the renderer expects a ProposalPage.
  const fakePage = {
    id: "rendered",
    type: "agreement" as const,
    label: "",
    content: "",
    blocks,
    sortOrder: 0,
  };
  // libraryPackages is empty here — package_row blocks will show "package
  // not found" in the rendered HTML, but contract templates shouldn't use
  // package_row anyway. The contract generator substitutes packages_block
  // (a merge_field block) at acceptance time.
  return renderToStaticMarkup(<ProposalBlockRenderer page={fakePage} libraryPackages={[]} />);
}

/**
 * Tiny status pill next to the Save button. Shows "Saving…", "Saved · Xs ago",
 * or "Save failed" depending on the autosave state. Hidden on new templates
 * (no autosave until first explicit Save creates the row).
 */
function AutosaveStatus({
  status,
  lastSavedAt,
  isNew,
}: {
  status: "idle" | "saving" | "error";
  lastSavedAt: number | null;
  isNew: boolean;
}) {
  // Snapshot "now" in state so the relative timestamp stays pure during
  // render. Tick every 10s while there's a save to display.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (lastSavedAt == null) return;
    setNow(Date.now());
    const i = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(i);
  }, [lastSavedAt]);

  if (isNew) return null;
  if (status === "saving") {
    return <span className="text-[11px] text-muted-foreground">Saving…</span>;
  }
  if (status === "error") {
    return <span className="text-[11px] text-destructive">Save failed — retry</span>;
  }
  if (lastSavedAt == null) return null;
  const seconds = Math.max(1, Math.round((now - lastSavedAt) / 1000));
  const label = seconds < 60
    ? `Saved · ${seconds}s ago`
    : seconds < 3600
      ? `Saved · ${Math.round(seconds / 60)}m ago`
      : `Saved`;
  return <span className="text-[11px] text-emerald-600">{label}</span>;
}
