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
import { Image as ImageIcon } from "lucide-react";
import type { ProposalBlock, ProposalPage, Package } from "@/lib/types";
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
}

export function ProposalBlockRenderer({
  page,
  libraryPackages = [],
  className,
}: ProposalBlockRendererProps) {
  const hasBlocks = Array.isArray(page.blocks) && page.blocks.length > 0;

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
      <div className="px-8 sm:px-16 py-12 sm:py-16 space-y-8 text-gray-800 min-h-[600px]">
        {hasBlocks ? (
          page.blocks!.map((block) => (
            <BlockView key={block.id} block={block} libraryPackages={libraryPackages} />
          ))
        ) : (
          <LegacyContent content={page.content} />
        )}
      </div>
    </div>
  );
}

// ---- Legacy fallback: render existing `content` strings as sanitized HTML.
// Old templates contain raw HTML (the original reported bug was these tags
// showing as text). With sanitization + dangerouslySetInnerHTML they render
// as intended without anyone touching them.
function LegacyContent({ content }: { content: string }) {
  if (!content || !content.trim()) {
    return <p className="text-gray-400 italic text-sm">No content yet.</p>;
  }
  return (
    <div
      className="text-sm leading-relaxed font-serif"
      style={{ fontFamily: "'Georgia', 'Times New Roman', serif" }}
      dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(content) }}
    />
  );
}

// ---- Per-block renderers ----

function BlockView({
  block,
  libraryPackages,
}: {
  block: ProposalBlock;
  libraryPackages: Package[];
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
      return <ProseBlock block={block} />;
    case "package_row":
      return <PackageRowBlock block={block} libraryPackages={libraryPackages} />;
    case "divider":
      return <hr className="border-gray-200 my-2" />;
    case "spacer":
      return <SpacerBlock block={block} />;
    case "signature":
      return <SignatureBlock block={block} />;
    case "merge_field":
      // Renders inline as the literal token `{{field}}` so the contract
      // generator's server-side substitution finds and replaces it.
      return <span>{`{{${block.field}}}`}</span>;
    case "payment_schedule":
      // Renders as the same merge token used elsewhere; the server reads
      // the structured block from `template.blocks` to compute amounts.
      return <span>{"{{payment_schedule_block}}"}</span>;
    default: {
      // Exhaustive check — unreachable if all variants are handled.
      const _never: never = block;
      return null;
    }
  }
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

function ProseBlock({ block }: { block: Extract<ProposalBlock, { type: "prose" }> }) {
  return (
    <div
      className="prose prose-sm max-w-none text-gray-700 leading-relaxed"
      dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(block.html) }}
    />
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
}: {
  block: Extract<ProposalBlock, { type: "signature" }>;
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
  const printNameToken = block.role === "vendor" ? "{{vendor_signer_name}}" : "";
  const dateToken = "{{contract_signed_date}}";
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
            {dateToken}
          </div>
          <p className="text-[11px] text-gray-500 mt-1">Date</p>
        </div>
        <div className="col-span-2">
          <div className="h-6 border-b border-gray-400 flex items-end pb-0.5 text-sm text-gray-800">
            {printNameToken}
          </div>
          <p className="text-[11px] text-gray-500 mt-1">Print name</p>
        </div>
      </div>
    </div>
  );
}
