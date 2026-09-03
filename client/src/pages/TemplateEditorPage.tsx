// ============================================================
// TemplateEditorPage — Full-page multi-section document builder
// 3-column layout: page sidebar | document editor | properties
// ============================================================

import { useState, useEffect, useRef } from "react";
import { useParams, useLocation } from "wouter";
import { useApp } from "@/contexts/AppContext";
import type { ProposalPage, ProposalPackage, ProposalLineItem, PaymentMilestone, ProposalPaymentConfig } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Plus, ArrowLeft, FileText, Receipt, CreditCard, File, ChevronUp, ChevronDown, Save, X, Image, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { postalAddress } from "@/lib/address";
import { nanoid } from "nanoid";
import { BlockEditor } from "@/components/proposal-editor/BlockEditor";
import { ProposalBlockRenderer } from "@/components/proposal/ProposalBlockRenderer";
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
  const labels = { agreement: "Agreement", invoice: "Invoice", payment: "Payment", custom: "Introduction" };
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

/**
 * Dual-mode editor. Default: proposal TEMPLATES. With proposalMode, it edits
 * an EXISTING proposal in place (same block canvas, saved via updateProposal)
 * so an owner can revise a live draft/sent proposal without rebuilding it
 * from a template. Accepted proposals are locked: the signed record must
 * match what the client saw.
 */
export default function TemplateEditorPage({ proposalMode = false }: { proposalMode?: boolean }) {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { data, addProposalTemplate, updateProposalTemplate, updateProposal, addProposal, addClient } = useApp();

  const isNew = !proposalMode && params.id === "new";
  const existing = isNew || proposalMode ? null : data.proposalTemplates.find(t => t.id === params.id);
  const existingProposal = proposalMode ? data.proposals.find(pr => pr.id === params.id) : null;

  // Template state
  const [name, setName] = useState("");
  const [coverImageUrl, setCoverImageUrl] = useState("");
  const [pages, setPages] = useState<ProposalPage[]>([emptyPage("agreement", 0)]);
  const [packages, setPackages] = useState<ProposalPackage[]>([]);
  // Master contract that auto-generates a draft on client acceptance.
  const [contractTemplateId, setContractTemplateId] = useState<string | null>(null);
  // When true, accepting this proposal emails the client a self-serve model release link.
  const [needsModelRelease, setNeedsModelRelease] = useState(false);
  const [activePageId, setActivePageId] = useState<string>("");
  const [renamingPageId, setRenamingPageId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [showProperties, setShowProperties] = useState(true);
  // Left sidebar (page list) — collapse to maximize canvas width on desktop.
  const [showPageList, setShowPageList] = useState(true);

  // Legacy fields for backward compat
  const [legacyPayment, setLegacyPayment] = useState<ProposalPaymentConfig>({ option: "none", depositPercent: 50, depositAmount: 0 });

  // ---- Proposal mode ----
  // Direct line-item pricing (proposals without packages price this way) and
  // the booking details / PO that drive the client form and the invoice.
  const [pLineItems, setPLineItems] = useState<ProposalLineItem[]>([]);
  const [bookingStart, setBookingStart] = useState("");
  const [bookingEnd, setBookingEnd] = useState("");
  const [bookingVenueName, setBookingVenueName] = useState("");
  const [bookingAddress, setBookingAddress] = useState("");
  const [bookingCityState, setBookingCityState] = useState("");
  const [bookingZip, setBookingZip] = useState("");
  const [poNumber, setPoNumber] = useState("");
  const [bookingDateText, setBookingDateText] = useState("");
  const hydratedProposalIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!proposalMode) return;
    if (!existingProposal) {
      // Proposals load async; only bail once data is present and the id is
      // genuinely unknown.
      if (data.proposals.length > 0) { toast.error("Proposal not found"); setLocation("/proposals"); }
      return;
    }
    if (existingProposal.acceptedAt) {
      toast.error("This proposal has been signed and can no longer be edited");
      setLocation("/proposals");
      return;
    }
    // Hydrate once per proposal id. Without this guard, any realtime change
    // to data.proposals (another row updating, a send elsewhere) re-fires
    // this effect via the .length dep and wipes in-progress edits.
    if (hydratedProposalIdRef.current === existingProposal.id) return;
    hydratedProposalIdRef.current = existingProposal.id;
    setName(existingProposal.title);
    const pgs = existingProposal.pages.length > 0 ? existingProposal.pages : [emptyPage("custom", 0)];
    setPages(pgs);
    setActivePageId(pgs[0].id);
    setPackages(existingProposal.packages || []);
    setContractTemplateId(existingProposal.contractTemplateId ?? null);
    setNeedsModelRelease(!!existingProposal.needsModelRelease);
    setLegacyPayment(existingProposal.paymentConfig || { option: "none", depositPercent: 50, depositAmount: 0 });
    setPLineItems(existingProposal.lineItems || []);
    const cfv = existingProposal.clientFieldValues || {};
    setBookingStart(cfv.event_start_date || "");
    setBookingEnd(cfv.event_end_date || "");
    setBookingVenueName(cfv.event_venue_name || "");
    setBookingAddress(cfv.event_address || "");
    setBookingCityState(cfv.event_city_state || "");
    setBookingZip(cfv.event_zip || "");
    setPoNumber(cfv.po_number || "");
    setBookingDateText(cfv.event_date || "");
    // Narrow deps by design: realtime refreshes hand back new object
    // references every few seconds and would wipe in-progress edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proposalMode, existingProposal?.id, data.proposals.length]);


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
      setPLineItems(existing.lineItems || []);
    } else if (isNew) {
      // Four pages, in the order a client reads them: your own opening page,
      // then the agreement, the invoice and payment.
      //
      // A new template used to open on an AGREEMENT page, so the natural move
      // was to build the introduction onto it. That left the first page titled
      // "Agreement" and no empty agreement page for the linked contract to
      // appear on — the exact tangle Geoff hit. Starting with an Introduction
      // page keeps the contract's page free for the contract.
      const intro = emptyPage("custom", 0);
      setPages([intro, emptyPage("agreement", 1), emptyPage("invoice", 2), emptyPage("payment", 3)]);
      setActivePageId(intro.id);
    }
    // Deliberately narrow deps: re-running on every realtime update of `existing`
    // would clobber the user's in-progress edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing?.id, isNew]);

  // Open on the first page, and recover if the selected one isn't in this
  // template.
  //
  // This only filled a BLANK selection, so the id survived navigating from one
  // template to another. The second template then had a selected page id that
  // belonged to the first, matched nothing, and showed "Select a page from the
  // sidebar" on a template that plainly had pages — you had to click one every
  // time. Same on delete, and after a reload that restored a stale id.
  useEffect(() => {
    if (pages.length === 0) return;
    const stillHere = pages.some(p => p.id === activePageId);
    if (!activePageId || !stillHere) setActivePageId(pages[0].id);
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
    if (!name.trim()) { toast.error(proposalMode ? "Proposal title required" : "Template name required"); return; }
    setSaving(true);
    if (proposalMode) {
      try {
        const subtotal = pLineItems.reduce((sum, li) => sum + (Number(li.amount) || 0), 0);
        // Booking values: blank input removes the key, so the client-facing
        // form asks for it again. Unknown keys (a client's earlier answers)
        // are preserved untouched.
        const cfv: Record<string, string> = { ...(existingProposal?.clientFieldValues || {}) };
        const setOrClear = (k: string, v: string) => { if (v.trim()) cfv[k] = v.trim(); else delete cfv[k]; };
        setOrClear("event_start_date", bookingStart);
        setOrClear("event_end_date", bookingEnd);
        setOrClear("event_venue_name", bookingVenueName);
        setOrClear("event_address", bookingAddress);
        setOrClear("event_city_state", bookingCityState);
        setOrClear("event_zip", bookingZip);
        setOrClear("po_number", poNumber);
        setOrClear("event_date", bookingDateText);
        await updateProposal(params.id!, {
          title: name.trim(),
          pages,
          packages,
          contractTemplateId,
          needsModelRelease,
          lineItems: pLineItems,
          subtotal,
          total: subtotal + (existingProposal?.taxAmount || 0),
          paymentConfig: legacyPayment,
          clientFieldValues: cfv,
        });
        toast.success("Proposal saved");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Save failed");
      } finally {
        setSaving(false);
      }
      return;
    }
    try {
      const payload = {
        name: name.trim(),
        coverImageUrl,
        pages,
        packages,
        contractTemplateId,
        lineItems: pLineItems,
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

  // Preview a template the same way a proposal previews: build a disposable
  // draft proposal from the template's current (unsaved) content and open
  // its real client-facing view. Templates have no client, no view token and
  // no public route of their own — reusing the proposal preview machinery is
  // far less risky than inventing a second, template-only renderer that has
  // to stay in sync with every future ViewProposalPage change. Left as a
  // visible "PREVIEW — <name>" draft so it's obvious and easy to delete;
  // never sent, never mistaken for a real client's proposal.
  const [previewing, setPreviewing] = useState(false);
  async function previewTemplate() {
    if (proposalMode) return;
    setPreviewing(true);
    try {
      let previewClient = data.clients.find(c => c.company === "Template Previews — internal");
      if (!previewClient) {
        previewClient = await addClient({
          company: "Template Previews — internal",
          contactName: "Preview",
          phone: "",
          email: "",
          address: "", city: "", state: "", zip: "",
          billingModel: "hourly",
          billingRatePerHour: 0,
          perProjectRate: 0,
          projectTypeRates: [],
          allowedProjectTypeIds: [],
          defaultProjectTypeId: "",
          roleBillingMultipliers: [],
          clientType: "standard",
        });
      }
      const subtotal = pLineItems.reduce((sum, li) => sum + (Number(li.amount) || 0), 0);
      const created = await addProposal({
        clientId: previewClient.id,
        projectId: null,
        title: `PREVIEW — ${name.trim() || "Untitled template"}`,
        needsModelRelease: false,
        clientFieldValues: {},
        pages,
        packages,
        selectedPackageId: packages.length === 1 ? packages[0].id : null,
        selectedPackageIds: [],
        paymentMilestones: [],
        sendHistory: [],
        inboundReplies: [],
        expiresAt: null,
        pipelineStage: "inquiry",
        viewedAt: null,
        leadSource: "",
        contractTemplateId,
        lineItems: pLineItems,
        subtotal,
        taxRate: 0,
        taxAmount: 0,
        total: subtotal,
        contractContent: "",
        paymentConfig: legacyPayment,
        status: "draft",
        sentAt: null,
        acceptedAt: null,
        completedAt: null,
        clientSignature: null,
        ownerSignature: null,
        invoiceId: null,
        stripeSessionId: null,
        paidAt: null,
        clientEmail: "",
        viewToken: nanoid(32),
        notes: "",
      });
      window.open(`/proposal/${created.viewToken}?preview=1`, "_blank");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't build a preview");
    } finally {
      setPreviewing(false);
    }
  }

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-3 sm:px-4 py-2 border-b border-border bg-card/50">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
          <button onClick={() => setLocation("/proposals")} className="p-1.5 text-muted-foreground hover:text-foreground shrink-0">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="min-w-0 flex-1">
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              className="text-base sm:text-lg font-semibold text-foreground bg-transparent border-none outline-none w-full"
              placeholder="Template name..."
              style={{ fontFamily: "'Space Grotesk', sans-serif" }}
            />
            <p className="text-[10px] text-muted-foreground truncate">
              {isNew ? "New template" : "Saved template"} · {pages.length} page{pages.length !== 1 ? "s" : ""} · {packages.length} package{packages.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowPageList(!showPageList)}
            className="text-xs hidden sm:inline-flex gap-1"
            title="Toggle page list"
          >
            {showPageList ? "Hide pages" : "Show pages"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowProperties(!showProperties)}
            className="text-xs px-2 sm:px-3"
            title={showProperties ? "Hide library" : "Show library"}
          >
            <span className="hidden sm:inline">{showProperties ? "Hide library" : "Show library"}</span>
            <span className="sm:hidden">{showProperties ? "Hide" : "Library"}</span>
          </Button>
          {!proposalMode && (
            <Button variant="outline" size="sm" onClick={previewTemplate} disabled={previewing} className="gap-1.5 px-2 sm:px-3" title="Open the client-facing view">
              <ExternalLink className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{previewing ? "Opening…" : "Preview"}</span>
            </Button>
          )}
          <Button size="sm" onClick={save} disabled={saving} className="gap-1.5 px-2 sm:px-3">
            <Save className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{saving ? "Saving..." : "Save"}</span>
            <span className="sm:hidden">{saving ? "…" : "Save"}</span>
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
                  {/* Double-click to rename. updatePageLabel existed but was
                      never wired to anything, so a page was stuck with the
                      name its type gave it — a client's opening page said
                      "Agreement" with no way to change it. */}
                  {renamingPageId === page.id ? (
                    <input
                      autoFocus
                      defaultValue={page.label}
                      onClick={(e) => e.stopPropagation()}
                      onBlur={(e) => { updatePageLabel(page.id, e.target.value.trim() || page.label); setRenamingPageId(null); }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                        if (e.key === "Escape") setRenamingPageId(null);
                      }}
                      className="flex-1 min-w-0 bg-background border border-border rounded px-1 py-0.5 text-xs"
                    />
                  ) : (
                    <span
                      className="truncate flex-1"
                      title="Double-click to rename"
                      onDoubleClick={(e) => { e.stopPropagation(); setRenamingPageId(page.id); }}
                    >{page.label}</span>
                  )}
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
                  {/* An empty agreement page is a placeholder for the contract
                      you linked, so show it here. Picking a Linked Contract
                      saved the link but rendered nothing, which read as "it
                      didn't work" — the contract only appeared to the client
                      after acceptance. This is that contract, read-only:
                      edit it in Contracts, not here. */}
                  {/* An empty agreement page with nothing linked used to be a
                      blank canvas with the only relevant control hidden in the
                      right sidebar. Someone opening this for the first time
                      had no way to know the choice existed. */}
                  {activePage.type === "agreement" && !contractTemplateId && (activePage.blocks || []).length === 0 && (
                    <div className="mb-4 rounded-xl border border-dashed border-border p-6 bg-secondary/30">
                      <h3 className="text-sm font-semibold text-foreground mb-1">What should this page say?</h3>
                      <p className="text-xs text-muted-foreground mb-4">
                        This is the agreement your client reads and signs. Use one you've already written, or write it here.
                      </p>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="rounded-lg border border-border p-3 bg-background">
                          <p className="text-xs font-medium text-foreground mb-2">Use an existing agreement</p>
                          {data.contractTemplates.length > 0 ? (
                            <select
                              value=""
                              onChange={e => { if (e.target.value) setContractTemplateId(e.target.value); }}
                              className="w-full px-2 py-1.5 text-xs rounded border border-border bg-background"
                            >
                              <option value="">Choose one…</option>
                              {data.contractTemplates.map(ct => (
                                <option key={ct.id} value={ct.id}>{ct.name}</option>
                              ))}
                            </select>
                          ) : (
                            <p className="text-[11px] text-muted-foreground">
                              You don't have any yet — write one here, or create it under Contracts first.
                            </p>
                          )}
                          <p className="text-[10px] text-muted-foreground mt-2">
                            Stays in step with Contracts, so changing it there updates every proposal using it.
                          </p>
                        </div>
                        <div className="rounded-lg border border-border p-3 bg-background">
                          <p className="text-xs font-medium text-foreground mb-2">Write your own here</p>
                          <button
                            onClick={() => updatePageBlocks(activePage.id, [
                              { id: nanoid(6), type: "prose", html: "<p></p>" },
                            ])}
                            className="w-full px-2 py-1.5 text-xs rounded border border-border hover:bg-secondary"
                          >Start writing</button>
                          <p className="text-[10px] text-muted-foreground mt-2">
                            Just for this template. Nothing else changes when you edit it.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {activePage.type === "agreement" && contractTemplateId && (activePage.blocks || []).length === 0 && (() => {
                    const linked = data.contractTemplates.find(ct => ct.id === contractTemplateId);
                    if (!linked) return null;
                    const linkedPages = (linked.pages || []).slice().sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
                    return (
                      <div className="mb-4">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-xs text-muted-foreground">
                            Showing <strong className="text-foreground">{linked.name}</strong> — the contract linked to this template.
                          </p>
                          <div className="flex items-center gap-3 shrink-0">
                            <span className="text-[10px] text-muted-foreground">Read-only · edit under Contracts</span>
                            <button
                              onClick={() => setContractTemplateId(null)}
                              className="text-[10px] text-muted-foreground hover:text-foreground underline"
                            >Use a different one</button>
                          </div>
                        </div>
                        <div className="rounded-lg overflow-hidden border border-border">
                          {linkedPages.length > 0
                            ? linkedPages.map(cp => (
                                <ProposalBlockRenderer resolveMerge key={cp.id} page={cp} libraryPackages={data.packages || []} org={data.organization} className="bg-white" />
                              ))
                            : (
                              <ProposalBlockRenderer resolveMerge
                                page={{ id: "linked", type: "agreement", label: "", content: linked.content || "", sortOrder: 0 }}
                                libraryPackages={data.packages || []}
                                org={data.organization}
                                className="bg-white"
                              />
                            )}
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-2">
                          Add blocks below to put your own wording above it, or leave the page empty to show the contract alone.
                        </p>
                      </div>
                    );
                  })()}

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
                          <p className="text-xs text-gray-400">{postalAddress(data.organization.businessInfo)}</p>
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
              {proposalMode && (
                <>
                {/* Booking details: what the client form treats as known.
                    Filled = shown, never asked. Blank = asked before signing.
                    The PO prints on the generated invoice. Proposal-only — a
                    template has no real client or event date yet. */}
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Booking Details</Label>
                  <div className="space-y-2">
                    <div>
                      <p className="text-[10px] text-muted-foreground mb-0.5">Event date (as shown, e.g. "October 9–10, 2026")</p>
                      <input value={bookingDateText} onChange={e => setBookingDateText(e.target.value)} className="w-full px-2 py-1.5 text-xs rounded border border-border bg-background" placeholder="Shown to the client" />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <p className="text-[10px] text-muted-foreground mb-0.5">Start</p>
                        <input type="date" value={bookingStart} onChange={e => setBookingStart(e.target.value)} className="w-full px-2 py-1.5 text-xs rounded border border-border bg-background" />
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground mb-0.5">End</p>
                        <input type="date" value={bookingEnd} onChange={e => setBookingEnd(e.target.value)} className="w-full px-2 py-1.5 text-xs rounded border border-border bg-background" />
                      </div>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground mb-0.5">Event name (leave blank to ask the client)</p>
                      <input value={bookingVenueName} onChange={e => setBookingVenueName(e.target.value)} className="w-full px-2 py-1.5 text-xs rounded border border-border bg-background" placeholder="Venue / hotel name" />
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground mb-0.5">Event address</p>
                      <input value={bookingAddress} onChange={e => setBookingAddress(e.target.value)} className="w-full px-2 py-1.5 text-xs rounded border border-border bg-background" placeholder="Street address" />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <p className="text-[10px] text-muted-foreground mb-0.5">City and state</p>
                        <input value={bookingCityState} onChange={e => setBookingCityState(e.target.value)} className="w-full px-2 py-1.5 text-xs rounded border border-border bg-background" placeholder="Nashville, TN" />
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground mb-0.5">Zip</p>
                        <input value={bookingZip} onChange={e => setBookingZip(e.target.value)} className="w-full px-2 py-1.5 text-xs rounded border border-border bg-background" placeholder="37201" />
                      </div>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground mb-0.5">PO / Reference (prints on the invoice)</p>
                      <input value={poNumber} onChange={e => setPoNumber(e.target.value)} className="w-full px-2 py-1.5 text-xs rounded border border-border bg-background" placeholder="Client purchase order #" />
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground">Filled fields show as confirmed details; blank ones are asked before signing.</p>
                </div>
                </>
              )}

              {/* Direct pricing for proposals (and templates) that bill by
                  line items. Shown for both modes — a template's own price
                  needs to be visible and editable right here, not just
                  inherited silently when a proposal is built from it. */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Pricing</Label>
                  {pLineItems.map((li, i) => (
                    <div key={li.id} className="rounded border border-border p-2 space-y-1.5">
                      <input
                        value={li.description}
                        onChange={e => setPLineItems(items => items.map((x, xi) => xi === i ? { ...x, description: e.target.value } : x))}
                        className="w-full px-2 py-1 text-xs rounded border border-border bg-background"
                        placeholder="Line description"
                      />
                      <textarea
                        value={li.details}
                        onChange={e => setPLineItems(items => items.map((x, xi) => xi === i ? { ...x, details: e.target.value } : x))}
                        rows={3}
                        className="w-full px-2 py-1 text-xs rounded border border-border bg-background resize-y"
                        placeholder="Details shown under the line"
                      />
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">$</span>
                        <input
                          type="text" inputMode="decimal"
                          value={String(li.amount ?? 0)}
                          onChange={e => {
                            const v = parseFloat(e.target.value.replace(/[^\d.]/g, "")) || 0;
                            setPLineItems(items => items.map((x, xi) => xi === i ? { ...x, amount: v, unitPrice: v, quantity: 1 } : x));
                          }}
                          className="w-24 px-2 py-1 text-xs rounded border border-border bg-background"
                        />
                        <button onClick={() => setPLineItems(items => items.filter((_, xi) => xi !== i))} className="ml-auto p-1 text-muted-foreground hover:text-red-400" title="Remove line"><X className="w-3.5 h-3.5" /></button>
                      </div>
                    </div>
                  ))}
                  <button
                    onClick={() => setPLineItems(items => [...items, { ...emptyLineItem() }])}
                    className="w-full py-1.5 text-xs rounded border border-dashed border-border text-muted-foreground hover:text-foreground"
                  >+ Add line item</button>
                  <p className="text-xs text-foreground font-semibold">Total: ${pLineItems.reduce((sum, li) => sum + (Number(li.amount) || 0), 0).toLocaleString()}</p>
                </div>

                {/* Payment at signing */}
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Payment At Signing</Label>
                  <select
                    value={legacyPayment.option}
                    onChange={e => setLegacyPayment(pc => ({ ...pc, option: e.target.value as ProposalPaymentConfig["option"] }))}
                    className="w-full px-2 py-1.5 text-xs rounded border border-border bg-background"
                  >
                    <option value="none">None — sign only, invoice later</option>
                    <option value="deposit">Deposit at signing</option>
                    <option value="full">Full payment at signing</option>
                  </select>
                  {legacyPayment.option === "deposit" && (
                    <div className="flex items-center gap-2">
                      <input
                        type="text" inputMode="decimal"
                        value={String(legacyPayment.depositPercent ?? 0)}
                        onChange={e => setLegacyPayment(pc => ({ ...pc, depositPercent: parseFloat(e.target.value.replace(/[^\d.]/g, "")) || 0 }))}
                        className="w-16 px-2 py-1 text-xs rounded border border-border bg-background"
                      />
                      <span className="text-xs text-muted-foreground">% deposit</span>
                    </div>
                  )}
                </div>

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

              {/* Model Releases — when on, accepting this proposal emails the
                  client a shareable self-serve release link for their people.
                  Proposal-only: a template has no client/project to attach a
                  release link to. */}
              {proposalMode && (
                <div className="space-y-2">
                  <label className="flex items-start gap-2 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={needsModelRelease}
                      onChange={e => setNeedsModelRelease(e.target.checked)}
                      className="mt-0.5"
                    />
                    <span className="text-muted-foreground">
                      This project needs model releases from the client's people
                    </span>
                  </label>
                  <p className="text-[10px] text-muted-foreground">
                    When the client accepts, they'll get a link to forward to anyone appearing on camera.
                  </p>
                </div>
              )}

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
