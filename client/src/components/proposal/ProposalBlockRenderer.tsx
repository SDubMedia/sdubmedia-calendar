// ============================================================
// ProposalBlockRenderer — read-only renderer for proposal pages.
// Used in three places:
//   1. TemplateEditorPage preview pane
//   2. ProposalsPage view modal
//   3. ViewProposalPage public viewer
// Single source of truth so the three surfaces never drift.
//
// Renders ProposalBlock[] when present; otherwise falls back to the legacy
// `content` string (sanitized as HTML). This keeps every existing template
// untouched until its owner opens it in the new editor.
// ============================================================

import DOMPurify from "dompurify";
import { renderTemplatePreviewHtml } from "@/lib/mergeFieldPreview";
import { summarizeMilestone, summarizeBalance, formatMoney } from "@/lib/paymentSchedule";
import { Image as ImageIcon } from "lucide-react";
import type { ProposalBlock, ProposalPage, Package, Organization } from "@/lib/types";
import { ICON_VOCABULARY } from "./icons";

function PackageIcon({ icon, customDataUrl }: { icon: string; customDataUrl?: string }) {
  if (customDataUrl) {
    return (
      <div className="w-24 h-24 rounded-full bg-slate-900 text-white flex items-center justify-center shrink-0 overflow-hidden p-3">
        <img src={customDataUrl} alt="" className="w-full h-full object-contain" />
      </div>
    );
  }
  const Icon = ICON_VOCABULARY[icon] ?? ImageIcon;
  return (
    <div className="w-24 h-24 rounded-full bg-slate-900 text-white flex items-center justify-center shrink-0">
      <Icon className="w-10 h-10" strokeWidth={1.25} />
    </div>
  );
}

interface ProposalBlockRendererProps {
  page: ProposalPage;
  // Library packages from AppContext — resolves `package_row` blocks. Optional
  // because the public viewer (which doesn't read AppContext) may pass none;
  // missing packages render with a "package not found" placeholder.
  libraryPackages?: Package[];
  // Optional className override for the outer container.
  className?: string;
  // Interactive selection — supplied only by the client-facing viewer. When
  // absent the groups render read-only, which is what the editor preview and
  // any PDF-style render want.
  selectedPackageIds?: string[];
  onTogglePackage?: (packageId: string, group: Extract<ProposalBlock, { type: "package_group" }>) => void;
  // Resolves vendor merge fields from Settings → Business Info. Without it the
  // vendor's own details stay as placeholders.
  org?: Organization | null;
  /** Values the signer has typed, so the contract fills in live. */
  filledFields?: Record<string, string>;
  /** Supplied only by the client-facing view: makes the client's own fields
   *  editable where they sit in the sentence. */
  onFieldEdit?: (field: string, value: string) => void;
  /** Turn {{tokens}} into readable text. OPT-IN, and deliberately so: this
   *  component is also used to SERIALISE blocks into the HTML a contract
   *  template is saved as (renderBlocksToHtml in EditContractTemplatePage).
   *  Resolving by default would bake the placeholders into stored content and
   *  permanently destroy the merge fields — a saved contract would greet every
   *  future client with a frozen "Client Name" that never fills. */
  resolveMerge?: boolean;
  /** What the client has actually chosen, so the payment terms can state
   *  dollars instead of bare percentages. Absent in the builder, where
   *  nothing has been sold yet. */
  total?: number;
}

export function ProposalBlockRenderer({
  page,
  libraryPackages = [],
  className,
  selectedPackageIds,
  onTogglePackage,
  org,
  filledFields,
  onFieldEdit,
  resolveMerge = false,
  total,
}: ProposalBlockRendererProps) {
  const hasBlocks = Array.isArray(page.blocks) && page.blocks.length > 0;

  // Committed on blur, not on every keystroke: updating state mid-typing
  // re-renders the sanitized HTML and the caret jumps to the start.
  const commitEdit = (e: React.FocusEvent<HTMLDivElement>) => {
    if (!onFieldEdit) return;
    const el = e.target as HTMLElement;
    const field = el?.dataset?.mergeField;
    if (!field) return;
    onFieldEdit(field, (el.textContent || "").trim());
  };

  return (
    <div
      className={
        className ??
        "bg-white rounded-xl shadow-md border border-border overflow-hidden"
      }
    >
      {/* Page-style inner surface — generous letterboxed padding so the
          editor's Preview reads like a printed proposal page rather than a
          tight card. */}
      <div
        className="px-8 sm:px-16 py-12 sm:py-16 space-y-8 text-gray-800 min-h-[600px]"
        onBlur={onFieldEdit ? commitEdit : undefined}
      >
        {hasBlocks ? (
          page.blocks!
            // A conditional block only appears when one of its services is
            // selected. With no selection state at all (editor preview, PDF)
            // everything shows — hiding clauses from the owner would make the
            // template look broken.
            .filter((block) => {
              const need = block.showWhenPackageIds;
              if (!need || need.length === 0) return true;
              if (!selectedPackageIds) return true;
              return need.some((id) => selectedPackageIds.includes(id));
            })
            .reduce(groupPartyLines, [])
            .map((run) => {
              const views = run.blocks.map((block) => (
                <BlockView
                  key={block.id}
                  block={block}
                  libraryPackages={libraryPackages}
                  selectedPackageIds={selectedPackageIds}
                  onTogglePackage={onTogglePackage}
                  org={org}
                  filledFields={filledFields}
                  editable={!!onFieldEdit}
                  resolveMerge={resolveMerge}
                  total={total}
                />
              ));
              if (!run.tight) return views[0];
              return (
                <div key={run.key} className="space-y-0.5">
                  {run.blocks.map((block, i) => (
                    <div key={block.id}>{views[i]}</div>
                  ))}
                </div>
              );
            })
        ) : (
          <LegacyContent content={page.content} org={org} filledFields={filledFields} editable={!!onFieldEdit} resolveMerge={resolveMerge} />
        )}
      </div>
    </div>
  );
}

// ---- Legacy fallback: render existing `content` strings as sanitized HTML.
// Old templates contain raw HTML (the original reported bug was these tags
// showing as text). With sanitization + dangerouslySetInnerHTML they render
// as intended without anyone touching them.
function LegacyContent({ content, org, filledFields, editable, resolveMerge }: { content: string; org?: Organization | null; filledFields?: Record<string, string>; editable?: boolean; resolveMerge?: boolean }) {
  if (!content || !content.trim()) {
    return <p className="text-gray-400 italic text-sm">No content yet.</p>;
  }
  return (
    <div
      className="contract-html-light text-sm leading-relaxed font-serif"
      style={{ fontFamily: "'Georgia', 'Times New Roman', serif" }}
      dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(resolveMerge ? renderTemplatePreviewHtml(content, org, filledFields, editable) : content, { ADD_ATTR: ["contenteditable", "spellcheck"] }) }}
    />
  );
}

/**
 * A run of plain merge fields is one address block, not a list of sections.
 *
 * Every block sits in a `space-y-8` column, which is right for sections and
 * absurd for the four lines of a party's contact details — name, address,
 * email and phone arrived a third of a screen apart. Consecutive inline
 * fields collapse into one tight stack, which is how the Parties header is
 * meant to read.
 */
type BlockRun = { key: string; blocks: ProposalBlock[]; tight: boolean };

function groupPartyLines(runs: BlockRun[], block: ProposalBlock): BlockRun[] {
  const isInlineField = block.type === "merge_field" && !block.field?.endsWith("_block");
  const last = runs[runs.length - 1];
  if (isInlineField && last?.tight) {
    last.blocks.push(block);
    return runs;
  }
  runs.push({ key: block.id, blocks: [block], tight: isInlineField });
  return runs;
}

// ---- Per-block renderers ----

function BlockView({
  block,
  libraryPackages,
  selectedPackageIds,
  onTogglePackage,
  org,
  filledFields,
  editable,
  resolveMerge,
  total,
}: {
  block: ProposalBlock;
  libraryPackages: Package[];
  selectedPackageIds?: string[];
  onTogglePackage?: (packageId: string, group: Extract<ProposalBlock, { type: "package_group" }>) => void;
  org?: Organization | null;
  filledFields?: Record<string, string>;
  editable?: boolean;
  resolveMerge?: boolean;
  total?: number;
}) {
  switch (block.type) {
    case "hero":
      return <HeroBlock block={block} />;
    case "image":
      return <ImageBlock block={block} />;
    case "centered_title":
      return <CenteredTitleBlock block={block} />;
    case "section_divider":
      return <SectionDividerBlock block={block} />;
    case "prose":
      return <ProseBlock block={block} org={org} filledFields={filledFields} editable={editable} resolveMerge={resolveMerge} />;
    case "package_row":
      return <PackageRowBlock block={block} libraryPackages={libraryPackages} />;
    case "package_group":
      return (
        <PackageGroupBlock
          block={block}
          libraryPackages={libraryPackages}
          selectedPackageIds={selectedPackageIds}
          onTogglePackage={onTogglePackage}
        />
      );
    case "divider":
      return <hr className="border-gray-200 my-2" />;
    case "spacer":
      return <SpacerBlock block={block} />;
    case "signature":
      return <SignatureBlock block={block} org={org} resolveMerge={resolveMerge} />;
    case "merge_field":
      // Without resolveMerge this is serialisation, not reading: the literal
      // token has to survive into the saved HTML so the contract generator
      // can substitute it later.
      if (!resolveMerge) return <span>{`{{${block.field}}}`}</span>;
      if (block.field === "packages_block") {
        return (
          <SelectedServicesBlock
            libraryPackages={libraryPackages}
            selectedPackageIds={selectedPackageIds}
          />
        );
      }
      return (
        <MergeFieldInline
          field={block.field}
          org={org}
          filledFields={filledFields}
          editable={editable}
        />
      );
    case "payment_schedule":
      if (!resolveMerge) return <span>{"{{payment_schedule_block}}"}</span>;
      return <PaymentTermsBlock block={block} total={total} />;
    default: {
      // Exhaustive check — unreachable if all variants are handled.
      const _never: never = block;
      return null;
    }
  }
}

/**
 * One merge field, shown the way its reader should see it.
 *
 * Runs the same token→text pass as prose, so a field means the same thing
 * whether it was typed into a paragraph or dropped in as its own block. The
 * Parties header is built from these blocks, and it used to print
 * `{{vendor_name}}{{vendor_address}}` at the top of every agreement.
 *
 * Renders nothing when the helper returns nothing — that's the optional
 * second person on a booking that only has one.
 */
function MergeFieldInline({
  field,
  org,
  filledFields,
  editable,
}: {
  field: string;
  org?: Organization | null;
  filledFields?: Record<string, string>;
  editable?: boolean;
}) {
  const html = renderTemplatePreviewHtml(`{{${field}}}`, org, filledFields, editable);
  if (!html.trim()) return null;
  return (
    <span
      className="contract-html-light"
      dangerouslySetInnerHTML={{
        __html: DOMPurify.sanitize(html, { ADD_ATTR: ["contenteditable", "spellcheck"] }),
      }}
    />
  );
}

/**
 * What `{{packages_block}}` stands for once the client has ticked their
 * services. Same sentence the signed contract will carry (see
 * renderPackagesBlock in api/_contractGenerator.ts) so the agreement they
 * read is the agreement they get.
 */
function SelectedServicesBlock({
  libraryPackages,
  selectedPackageIds,
}: {
  libraryPackages: Package[];
  selectedPackageIds?: string[];
}) {
  const chosen = (selectedPackageIds || [])
    .map((id) => libraryPackages.find((p) => p.id === id))
    .filter((p): p is Package => !!p);

  if (chosen.length === 0) {
    return (
      <p className="text-sm text-gray-500 italic">
        The services you choose above will be listed here.
      </p>
    );
  }

  const total = chosen.reduce((sum, p) => sum + (p.defaultPrice || 0), 0);
  return (
    <div className="space-y-3">
      {chosen.map((pkg) => (
        <div key={pkg.id} className="border-t border-gray-200 pt-3">
          <p className="font-semibold text-gray-900">
            1 of {pkg.name} at {formatMoney(pkg.defaultPrice || 0)} for a total of{" "}
            {formatMoney(pkg.defaultPrice || 0)}
          </p>
          {pkg.description && (
            <p className="text-sm text-gray-700 mt-1">{pkg.description}</p>
          )}
          {!!pkg.discountFromPrice && pkg.discountFromPrice > (pkg.defaultPrice || 0) && (
            <p className="text-xs text-gray-600 mt-1">
              This is a discounted rate from <strong>{formatMoney(pkg.discountFromPrice)}</strong>
            </p>
          )}
        </div>
      ))}
      {chosen.length > 1 && (
        <div className="border-t border-gray-300 pt-2 flex items-center justify-between font-semibold text-gray-900">
          <span>Total</span>
          <span>{formatMoney(total)}</span>
        </div>
      )}
    </div>
  );
}

/** The deposit and balance in words, with real dollars once a total exists. */
function PaymentTermsBlock({
  block,
  total,
}: {
  block: Extract<ProposalBlock, { type: "payment_schedule" }>;
  total?: number;
}) {
  return (
    <div className="space-y-1 text-gray-800">
      <p>{summarizeMilestone(block.deposit, "Deposit", total)}</p>
      <p>{summarizeBalance(block.balance, block.deposit, total)}</p>
    </div>
  );
}

function HeroBlock({ block }: { block: Extract<ProposalBlock, { type: "hero" }> }) {
  const heightClass =
    block.height === "sm" ? "h-48" : block.height === "lg" ? "h-96" : "h-64";
  if (!block.imageDataUrl) {
    return (
      <div
        className={`${heightClass} bg-gray-100 rounded-lg flex items-center justify-center text-gray-400 text-sm`}
      >
        No image
      </div>
    );
  }
  return (
    <div className={`${heightClass} rounded-lg overflow-hidden`}>
      <img
        src={block.imageDataUrl}
        alt=""
        className="w-full h-full object-cover"
      />
    </div>
  );
}

function ImageBlock({ block }: { block: Extract<ProposalBlock, { type: "image" }> }) {
  if (!block.imageDataUrl) {
    return (
      <div className="bg-gray-100 rounded-lg p-8 text-center text-gray-400 text-sm">
        No image
      </div>
    );
  }
  return (
    <figure className="space-y-2">
      <img
        src={block.imageDataUrl}
        alt={block.caption ?? ""}
        className="w-full rounded-lg"
      />
      {block.caption && (
        <figcaption className="text-xs text-gray-500 text-center italic">
          {block.caption}
        </figcaption>
      )}
    </figure>
  );
}

function alignClass(align: "left" | "center" | "right" | undefined): string {
  switch (align) {
    case "left": return "text-left";
    case "right": return "text-right";
    default: return "text-center";
  }
}

function CenteredTitleBlock({
  block,
}: {
  block: Extract<ProposalBlock, { type: "centered_title" }>;
}) {
  const size = block.size ?? "lg";
  const sizeClass = size === "sm" ? "text-xl" : size === "md" ? "text-2xl" : "text-3xl";
  const Tag = (size === "sm" ? "h3" : size === "md" ? "h2" : "h1") as "h1" | "h2" | "h3";
  const fmt = [
    block.bold ? "font-bold" : "font-normal",
    block.italic ? "italic" : "",
    block.underline ? "underline" : "",
  ].filter(Boolean).join(" ");
  return (
    <Tag
      className={`${sizeClass} text-gray-900 ${fmt} ${alignClass(block.align)}`}
      style={{ fontFamily: "'Cormorant Garamond', 'Georgia', serif" }}
    >
      {block.text}
    </Tag>
  );
}

function SectionDividerBlock({
  block,
}: {
  block: Extract<ProposalBlock, { type: "section_divider" }>;
}) {
  return (
    <h2
      className={`text-xl text-gray-700 uppercase tracking-[0.25em] ${alignClass(block.align)}`}
      style={{ fontFamily: "'Cormorant Garamond', 'Georgia', serif", fontWeight: 400 }}
    >
      {block.text}
    </h2>
  );
}

function ProseBlock({ block, org, filledFields, editable, resolveMerge }: { block: Extract<ProposalBlock, { type: "prose" }>; org?: Organization | null; filledFields?: Record<string, string>; editable?: boolean; resolveMerge?: boolean }) {
  // Merge fields become readable text rather than raw braces. A client reading
  // an agreement should see "S-Dub Media" and "Event Date *", never
  // {{vendor_name}} — braces are code leaking into a legal document, and a new
  // owner has no idea what they mean.
  return (
    <div
      className="contract-html-light prose prose-sm max-w-none text-gray-700 leading-relaxed"
      dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(resolveMerge ? renderTemplatePreviewHtml(block.html, org, filledFields, editable) : block.html, { ADD_ATTR: ["contenteditable", "spellcheck"] }) }}
    />
  );
}

/** A set of services the client chooses within — "pick one collection", then
 *  "add any of these". This is display-only here; the interactive version with
 *  Select buttons and a running total lives in the client-facing proposal
 *  view. In the editor and in previews it shows the group heading, whether it
 *  is required, and the cards it contains. */
function PackageGroupBlock({
  block,
  libraryPackages,
  selectedPackageIds,
  onTogglePackage,
}: {
  block: Extract<ProposalBlock, { type: "package_group" }>;
  libraryPackages: Package[];
  selectedPackageIds?: string[];
  onTogglePackage?: (packageId: string, group: Extract<ProposalBlock, { type: "package_group" }>) => void;
}) {
  const interactive = typeof onTogglePackage === "function";
  const chosen = block.packageIds
    .map(id => libraryPackages.find(p => p.id === id))
    .filter(Boolean) as Package[];

  return (
    <div className="my-4">
      <div className="flex items-baseline justify-between border-l-2 border-gray-900 pl-3 py-2 mb-3">
        <span className="text-sm font-medium text-gray-900">
          {block.label || (block.selection === "single" ? "Select one service below" : "Select one or more services below")}
        </span>
        <span className={`text-xs ${block.requirement === "required" ? "text-gray-900" : "text-gray-400"}`}>
          {block.requirement === "required" ? "*Required" : "Optional"}
        </span>
      </div>
      {chosen.length === 0 ? (
        <p className="text-xs text-gray-400 italic border border-dashed border-gray-200 rounded p-3">
          No services added to this group yet
        </p>
      ) : (
        <div className="space-y-3">
          {chosen.map(pkg => {
            const isSelected = !!selectedPackageIds?.includes(pkg.id);
            return (
              <div
                key={pkg.id}
                className={`border rounded-lg p-4 transition-colors ${isSelected ? "border-gray-900 bg-gray-50" : "border-gray-200"}`}
              >
                <PackageRowBlock
                  block={{ id: `${block.id}-${pkg.id}`, type: "package_row", packageId: pkg.id }}
                  libraryPackages={libraryPackages}
                />
                {interactive && (
                  <div className="flex justify-end mt-3">
                    <button
                      type="button"
                      onClick={() => onTogglePackage!(pkg.id, block)}
                      className={`px-6 py-2.5 rounded text-sm font-semibold transition-colors ${
                        isSelected ? "bg-gray-200 text-gray-900 hover:bg-gray-300" : "bg-gray-900 text-white hover:bg-gray-800"
                      }`}
                    >{isSelected ? "Selected ✓" : "Select"}</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PackageRowBlock({
  block,
  libraryPackages,
}: {
  block: Extract<ProposalBlock, { type: "package_row" }>;
  libraryPackages: Package[];
}) {
  const pkg = libraryPackages.find((p) => p.id === block.packageId);
  if (!pkg) {
    return (
      <div className="text-xs text-gray-400 italic border border-dashed border-gray-200 rounded p-3">
        Package not found in library (id: {block.packageId || "(unset)"})
      </div>
    );
  }
  // Block can override the icon; otherwise use the Package's own icon.
  const iconKey = block.icon || pkg.icon;
  return (
    <div className="flex gap-6 items-start py-2">
      <PackageIcon icon={iconKey} customDataUrl={pkg.iconCustomDataUrl} />
      <div className="flex-1 min-w-0">
        <h3
          className="text-lg font-bold text-gray-900 mb-2"
          style={{ fontFamily: "'Space Grotesk', sans-serif" }}
        >
          {pkg.name || "Untitled package"}
        </h3>
        {pkg.description && (
          <p className="text-sm text-gray-700 leading-relaxed mb-3">
            {pkg.description}
          </p>
        )}
        {pkg.deliverables && pkg.deliverables.length > 0 && (
          <ul className="text-sm text-gray-700 leading-relaxed mb-3 space-y-1 list-disc pl-5">
            {pkg.deliverables.map((d, i) => (
              <li key={i}>{d}</li>
            ))}
          </ul>
        )}
        <div className="flex justify-end items-baseline gap-3 text-sm">
          {pkg.discountFromPrice && pkg.discountFromPrice > pkg.defaultPrice && (
            <span className="text-gray-400 line-through font-mono">
              ${pkg.discountFromPrice.toFixed(2)}
            </span>
          )}
          <span className="text-lg font-bold text-gray-900 font-mono">
            ${pkg.defaultPrice.toFixed(2)}
          </span>
        </div>
      </div>
    </div>
  );
}

function SpacerBlock({ block }: { block: Extract<ProposalBlock, { type: "spacer" }> }) {
  const heightClass =
    block.size === "sm" ? "h-4" : block.size === "lg" ? "h-16" : "h-8";
  return <div className={heightClass} aria-hidden="true" />;
}

function SignatureBlock({
  block,
  org,
  resolveMerge,
}: {
  block: Extract<ProposalBlock, { type: "signature" }>;
  org?: Organization | null;
  resolveMerge?: boolean;
}) {
  const defaultLabel = block.role === "client"
    ? "Client"
    : block.role === "vendor"
      ? "Vendor"
      : "Signature";
  const label = block.label ?? defaultLabel;
  // Auto-fill tokens — the contract generator substitutes `{{vendor_name}}`
  // (org name) and `{{contract_signed_date}}` (today) at signing time so
  // the rendered contract has the vendor's name printed and a real date
  // beneath every signature line. Client name stays blank — the client
  // prints their own name at signing.
  // These are printed INTO the page, so without the merge pass the client
  // reads the literal "{{contract_signed_date}}" on the line they're about to
  // sign. The block renderer resolves prose and merge-field blocks; signature
  // blocks were a third path that never went through it.
  const printNameToken = block.role === "vendor" ? "{{vendor_signer_name}}" : "";
  const dateToken = "{{contract_signed_date}}";
  const show = (token: string) => {
    if (!token) return null;
    if (!resolveMerge) return token;   // serialising — the token must survive
    return <MergeFieldInline field={token.replace(/[{}]/g, "")} org={org} />;
  };
  // Color-code the role badge so the client sees at a glance which line
  // is theirs vs. yours: emerald for vendor, indigo for client.
  const badgeStyle = block.role === "vendor"
    ? "bg-emerald-100 text-emerald-900 border-emerald-300"
    : block.role === "client"
      ? "bg-indigo-100 text-indigo-900 border-indigo-300"
      : "bg-gray-100 text-gray-700 border-gray-300";
  return (
    <div className="mt-8 mb-4">
      <div className="flex items-center gap-2 mb-3">
        <span className={`inline-block px-2.5 py-1 rounded text-xs font-bold uppercase tracking-wider border ${badgeStyle}`}>
          {label}
        </span>
        <span className="text-[11px] text-gray-500">signs below</span>
      </div>
      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2">
          <div className="h-10 border-b border-gray-400" />
          <p className="text-[11px] text-gray-500 mt-1">Signature</p>
        </div>
        <div>
          <div className="h-10 border-b border-gray-400 flex items-end pb-1 text-sm text-gray-800">
            {show(dateToken)}
          </div>
          <p className="text-[11px] text-gray-500 mt-1">Date</p>
        </div>
        <div className="col-span-2">
          <div className="h-6 border-b border-gray-400 flex items-end pb-0.5 text-sm text-gray-800">
            {show(printNameToken)}
          </div>
          <p className="text-[11px] text-gray-500 mt-1">Print name</p>
        </div>
      </div>
    </div>
  );
}
