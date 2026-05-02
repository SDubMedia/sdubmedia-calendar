// ============================================================
// BlockEditor — live canvas-style editor for proposal pages.
//
// Each block is rendered exactly as the client will see it (via the shared
// ProposalBlockRenderer's BlockView) and decorated with hover controls
// (edit / move up / move down / delete). A thin `+` insertion bar appears
// between every block (and above/below the stack) — click it to insert a
// new block, with secondary pickers for Package (from library) and Image
// (from library) sources.
//
// Mobile-friendly: click-to-add via the + button picker. Drag-and-drop
// from the right sidebar is the desktop fast-path (Task 12 — separate).
// ============================================================

import React, { useState, useRef } from "react";
import { createPortal } from "react-dom";
import DOMPurify from "dompurify";
import { cleanPastedText } from "@/lib/cleanPaste";
import { registerProseEditor, saveProseSelection, clearActiveProse } from "./proseFocusRegistry";
import { tokensToChips, chipsToTokens } from "./chipTransform";
import {
  Image as ImageIcon,
  Type,
  Minus,
  Heading,
  Heading2,
  Plus,
  ChevronUp,
  ChevronDown,
  Pencil,
  Trash2,
  Box,
  PenTool,
  Package as PackageIconLucide,
  Check,
  AlignLeft,
  AlignCenter,
  AlignRight,
} from "lucide-react";
import { nanoid } from "nanoid";
import { useDroppable } from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import type { ProposalBlock, Package, ProposalImage } from "@/lib/types";
import { useApp } from "@/contexts/AppContext";
import { PACKAGE_ICON_KEYS, ICON_VOCABULARY } from "@/components/proposal/icons";
import { usePasteCleaner } from "@/lib/usePasteCleaner";

interface BlockEditorProps {
  blocks: ProposalBlock[];
  onChange: (blocks: ProposalBlock[]) => void;
  libraryPackages: Package[];
  // "proposal" (default) shows hero/image/package_row in the picker; merge_field is hidden.
  // "contract" hides hero/image/package_row; merge_field is shown.
  kind?: "proposal" | "contract";
}

// ---- Block-type catalog used by the + picker ----

type StructuralBlockType = Exclude<ProposalBlock["type"], "package_row" | "image">;

const STRUCTURAL_TYPES: Array<{
  type: StructuralBlockType;
  label: string;
  icon: typeof ImageIcon;
  description: string;
  // When set, only show this block type if `kind` matches. Otherwise it shows
  // for all editor kinds. Lets the contract editor show merge_field while
  // hiding hero, and the proposal editor show hero while hiding merge_field
  // (proposals don't generate contracts directly — packages_block belongs in
  // the contract template, not on a proposal page).
  onlyKind?: "proposal" | "contract";
  // Optional preset for centered_title — lets a single block type appear
  // multiple times in the picker with different default sizes (Title vs.
  // Subheading) without inventing extra block types.
  presetSize?: "sm" | "md" | "lg";
  // Optional preset for signature — lets the picker show separate
  // "Client signature" and "Vendor signature" entries that drop the same
  // block type with the role pre-set.
  presetRole?: "client" | "vendor";
}> = [
  { type: "hero", label: "Hero image", icon: ImageIcon, description: "Full-width banner", onlyKind: "proposal" },
  { type: "centered_title", label: "Title", icon: Heading, description: "Large serif heading" },
  { type: "centered_title", label: "Subheading", icon: Heading2, description: "Smaller serif heading", presetSize: "sm" as const },
  { type: "section_divider", label: "Section divider", icon: Heading2, description: 'Tracked uppercase label' },
  { type: "prose", label: "Text", icon: Type, description: "Paragraphs (HTML allowed)" },
  { type: "divider", label: "Divider line", icon: Minus, description: "Thin horizontal line" },
  { type: "spacer", label: "Spacer", icon: Box, description: "Vertical space" },
  { type: "signature", label: "Client signature", icon: PenTool, description: "Where the client signs", presetRole: "client" as const },
  { type: "signature", label: "Vendor signature", icon: PenTool, description: "Where you (vendor) sign", presetRole: "vendor" as const },
  { type: "payment_schedule", label: "Payment schedule", icon: Box, description: "Deposit + balance terms (calculated at signing)", onlyKind: "contract" },
  { type: "merge_field", label: "Merge field", icon: Type, description: "Auto-fill: client name, packages, payment schedule, etc.", onlyKind: "contract" },
];

function emptyBlock(type: ProposalBlock["type"]): ProposalBlock {
  const id = nanoid(6);
  switch (type) {
    case "hero":
      return { id, type, imageDataUrl: "", height: "md" };
    case "image":
      return { id, type, imageDataUrl: "", caption: "" };
    case "centered_title":
      // Empty text → placeholder shows; user types into a clean field
      // (no "delete the word Title first" friction).
      return { id, type, text: "" };
    case "section_divider":
      return { id, type, text: "" };
    case "prose":
      return { id, type, html: "<p></p>" };
    case "package_row":
      return { id, type, packageId: "" };
    case "divider":
      return { id, type };
    case "spacer":
      return { id, type, size: "md" };
    case "signature":
      return { id, type, label: "Signature required" };
    case "merge_field":
      return { id, type, field: "client_name" };
    case "payment_schedule":
      return {
        id, type,
        deposit: { kind: "percent", value: 50, dueType: "at_signing" },
        balance: { dueType: "on_event_date" },
      };
  }
}

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

const MAX_IMAGE_BYTES = 500_000;

// ---- Top-level editor ----

type PickerKind = "block" | "package" | "image";

export function BlockEditor({ blocks, onChange, libraryPackages, kind = "proposal" }: BlockEditorProps) {
  const [pickerAt, setPickerAt] = useState<{ index: number; kind: PickerKind } | null>(null);
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null);

  function insertAt(idx: number, block: ProposalBlock) {
    const next = [...blocks];
    next.splice(idx, 0, block);
    onChange(next);
    setPickerAt(null);
    setEditingBlockId(block.id);
  }

  function removeBlock(id: string) {
    onChange(blocks.filter(b => b.id !== id));
    if (editingBlockId === id) setEditingBlockId(null);
  }

  function moveBlock(id: string, dir: -1 | 1) {
    const idx = blocks.findIndex(b => b.id === id);
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= blocks.length) return;
    const next = [...blocks];
    [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
    onChange(next);
  }

  function updateBlock(id: string, partial: Partial<ProposalBlock>) {
    onChange(blocks.map(b => (b.id === id ? ({ ...b, ...partial } as ProposalBlock) : b)));
  }

  return (
    <div
      className="bg-white rounded-xl shadow-md border border-border overflow-hidden"
      onClick={() => { setEditingBlockId(null); setPickerAt(null); }}
    >
      <div
        className="px-8 sm:px-16 py-12 sm:py-16 text-gray-800 min-h-[600px]"
        onClick={e => e.stopPropagation()}
      >
        {blocks.length === 0 && (
          <EmptyDropZone onAdd={() => setPickerAt({ index: 0, kind: "block" })} />
        )}

        {blocks.map((block, idx) => (
          <div key={block.id}>
            <InsertBar
              show={pickerAt?.index === idx}
              onAdd={() => setPickerAt({ index: idx, kind: "block" })}
              insertIndex={idx}
            />

            <EditableBlock
              block={block}
              isEditing={editingBlockId === block.id}
              onStartEdit={() => setEditingBlockId(block.id)}
              onMoveUp={() => moveBlock(block.id, -1)}
              onMoveDown={() => moveBlock(block.id, 1)}
              onDelete={() => removeBlock(block.id)}
              canMoveUp={idx > 0}
              canMoveDown={idx < blocks.length - 1}
              libraryPackages={libraryPackages}
              onUpdate={partial => updateBlock(block.id, partial)}
            />
          </div>
        ))}

        {blocks.length > 0 && (
          <InsertBar
            show={pickerAt?.index === blocks.length}
            onAdd={() => setPickerAt({ index: blocks.length, kind: "block" })}
            insertIndex={blocks.length}
          />
        )}

        {pickerAt && (
          <BlockPickerPopover
            kind={pickerAt.kind}
            editorKind={kind}
            libraryPackages={libraryPackages}
            onPickStructural={(type, presetSize, presetRole) => {
              const block = emptyBlock(type);
              if (block.type === "centered_title" && presetSize) block.size = presetSize;
              if (block.type === "signature" && presetRole) block.role = presetRole;
              insertAt(pickerAt.index, block);
            }}
            onPickPackage={pkgId => {
              const block: ProposalBlock = { id: nanoid(6), type: "package_row", packageId: pkgId };
              insertAt(pickerAt.index, block);
            }}
            onPickImage={img => {
              const block: ProposalBlock = {
                id: nanoid(6),
                type: "image",
                imageDataUrl: img.imageDataUrl,
                caption: "",
              };
              insertAt(pickerAt.index, block);
            }}
            onAdvanceTo={kind => setPickerAt({ ...pickerAt, kind })}
            onClose={() => setPickerAt(null)}
          />
        )}
      </div>
    </div>
  );
}

// ---- Empty state ----

function EmptyDropZone({ onAdd }: { onAdd: () => void }) {
  return (
    <button
      onClick={onAdd}
      className="w-full border-2 border-dashed border-gray-200 rounded-lg py-16 text-center hover:border-primary/50 hover:bg-primary/5 transition-colors group"
    >
      <Plus className="w-8 h-8 mx-auto text-gray-300 group-hover:text-primary mb-2" />
      <p className="text-sm text-gray-400 group-hover:text-primary">
        Add your first block
      </p>
    </button>
  );
}

// ---- Insertion bar between blocks ----

function InsertBar({
  show,
  onAdd,
  insertIndex,
}: {
  show: boolean;
  onAdd: () => void;
  insertIndex: number;
}) {
  // Drop zone for drag-from-library. dnd-kit collision detection picks the
  // closest droppable, so even a tight 3px bar works as a drop target.
  const { isOver, setNodeRef } = useDroppable({
    id: `insert-${insertIndex}`,
    data: { insertIndex },
  });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "relative h-2 group transition-all",
        (show || isOver) && "h-7",
      )}
    >
      <button
        onClick={(e) => { e.stopPropagation(); onAdd(); }}
        className={cn(
          // Persistent + button (low opacity at rest, full on hover/active).
          // Discoverability beats minimalism.
          "absolute inset-x-0 top-1/2 -translate-y-1/2 flex items-center justify-center transition-opacity",
          show || isOver
            ? "opacity-100"
            : "opacity-50 hover:opacity-100 group-hover:opacity-100",
        )}
        aria-label="Add block"
      >
        <span
          className={cn(
            "rounded-full p-1 shadow-sm transition-all",
            isOver ? "bg-primary text-white scale-125" : "bg-primary text-white",
          )}
        >
          <Plus className="w-3 h-3" />
        </span>
      </button>
      {isOver && (
        <div className="absolute inset-x-4 top-1/2 -translate-y-1/2 h-0.5 bg-primary rounded" />
      )}
    </div>
  );
}

// ---- Editable block — hover controls + click to edit ----

interface EditableBlockProps {
  block: ProposalBlock;
  isEditing: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  libraryPackages: Package[];
  onStartEdit: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
  onUpdate: (partial: Partial<ProposalBlock>) => void;
}

function EditableBlock(props: EditableBlockProps) {
  const { block, isEditing, canMoveUp, canMoveDown, libraryPackages, onStartEdit, onMoveUp, onMoveDown, onDelete, onUpdate } = props;
  return (
    <div
      className={cn(
        "relative group rounded -mx-2 px-2 py-0.5 transition-colors",
        isEditing ? "bg-primary/5 ring-2 ring-primary/20" : "hover:bg-secondary/30",
      )}
      onClick={(e) => { e.stopPropagation(); onStartEdit(); }}
    >
      {/* Hover-controls strip — sits ABOVE the block so it never overlaps
          the block's content (titles, hero images, etc). z-10 keeps it above
          neighboring blocks; the negative top puts it in the InsertBar gap. */}
      <div
        className={cn(
          "absolute right-1 -top-3 flex items-center gap-0.5 bg-card border border-border rounded shadow-sm transition-opacity z-10",
          isEditing ? "opacity-100" : "opacity-0 group-hover:opacity-100"
        )}
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={onMoveUp}
          disabled={!canMoveUp}
          className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
          title="Move up"
        >
          <ChevronUp className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={onMoveDown}
          disabled={!canMoveDown}
          className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
          title="Move down"
        >
          <ChevronDown className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={onDelete}
          className="p-1 text-muted-foreground hover:text-destructive"
          title="Delete"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* The block itself — every block edits in place. No dark panel. */}
      <BlockPreview block={block} onUpdate={onUpdate} libraryPackages={libraryPackages} />
    </div>
  );
}

// ---- BlockPreview: dispatches to per-block inline-editable components.
// Every block edits in place — no dark panels, no toggling between
// "preview" and "edit" modes. What you see IS the editor.

function BlockPreview({
  block,
  onUpdate,
  libraryPackages,
}: {
  block: ProposalBlock;
  onUpdate: (partial: Partial<ProposalBlock>) => void;
  libraryPackages: Package[];
}) {
  switch (block.type) {
    case "hero":
      return <HeroBlockEditable block={block} onUpdate={onUpdate} />;
    case "image":
      return <ImageBlockEditable block={block} onUpdate={onUpdate} />;
    case "centered_title": {
      const size = block.size ?? "lg";
      const sizeClass = size === "sm" ? "text-xl" : size === "md" ? "text-2xl" : "text-3xl";
      const padClass = size === "sm" ? "py-2" : size === "md" ? "py-3" : "py-4";
      const fmt = [
        block.bold ? "font-bold" : "font-normal",
        block.italic ? "italic" : "",
        block.underline ? "underline" : "",
      ].filter(Boolean).join(" ");
      return (
        <AlignableText
          value={block.text}
          align={block.align ?? "center"}
          onChangeText={text => onUpdate({ text })}
          onChangeAlign={align => onUpdate({ align })}
          placeholder={size === "sm" ? "Subheading" : size === "md" ? "Heading" : "Title"}
          className={`${sizeClass} ${padClass} text-gray-900 ${fmt} block`}
          style={{ fontFamily: "'Cormorant Garamond', 'Georgia', serif" }}
          sizeToggle={
            <SizeToggle
              value={size}
              onChange={s => onUpdate({ size: s })}
            />
          }
          formatToggle={
            <FormatToggle
              bold={!!block.bold}
              italic={!!block.italic}
              underline={!!block.underline}
              onToggleBold={() => onUpdate({ bold: !block.bold })}
              onToggleItalic={() => onUpdate({ italic: !block.italic })}
              onToggleUnderline={() => onUpdate({ underline: !block.underline })}
            />
          }
        />
      );
    }
    case "section_divider":
      return (
        <AlignableText
          value={block.text}
          align={block.align ?? "center"}
          onChangeText={text => onUpdate({ text: text.toUpperCase() })}
          onChangeAlign={align => onUpdate({ align })}
          placeholder="SECTION DIVIDER"
          className="text-xl text-gray-700 uppercase tracking-[0.25em] py-3 block"
          style={{ fontFamily: "'Cormorant Garamond', 'Georgia', serif", fontWeight: 400 }}
        />
      );
    case "prose":
      return <ProseBlockEditable block={block} onUpdate={onUpdate} />;
    case "package_row":
      return (
        <PackageRowInlineEditable
          block={block}
          libraryPackages={libraryPackages}
        />
      );
    case "divider":
      return <hr className="border-gray-200 my-2" />;
    case "spacer":
      return <SpacerBlockEditable block={block} onUpdate={onUpdate} />;
    case "signature":
      return <SignatureBlockEditable block={block} onUpdate={onUpdate} />;
    case "merge_field":
      return <MergeFieldBlockEditable block={block} onUpdate={onUpdate} />;
    case "payment_schedule":
      return <PaymentScheduleBlockEditable block={block} onUpdate={onUpdate} />;
    default: {
      const _never: never = block;
      return null;
    }
  }
}

// ---- Hero / Image inline-editable blocks ----

function HeroBlockEditable({
  block,
  onUpdate,
}: {
  block: Extract<ProposalBlock, { type: "hero" }>;
  onUpdate: (partial: Partial<ProposalBlock>) => void;
}) {
  const heightClass = block.height === "sm" ? "h-48" : block.height === "lg" ? "h-96" : "h-64";
  return (
    <ImageBlockShell
      heightClass={heightClass}
      imageDataUrl={block.imageDataUrl}
      onImageChange={imageDataUrl => onUpdate({ imageDataUrl })}
      placeholder="Hero image — click to upload"
      heightControls={
        <HeightToggle
          value={block.height ?? "md"}
          onChange={height => onUpdate({ height })}
        />
      }
    />
  );
}

function ImageBlockEditable({
  block,
  onUpdate,
}: {
  block: Extract<ProposalBlock, { type: "image" }>;
  onUpdate: (partial: Partial<ProposalBlock>) => void;
}) {
  return (
    <figure className="space-y-2">
      <ImageBlockShell
        heightClass="max-h-96"
        imageDataUrl={block.imageDataUrl}
        onImageChange={imageDataUrl => onUpdate({ imageDataUrl })}
        placeholder="Image — click to upload"
      />
      <ClickableText
        value={block.caption ?? ""}
        onChange={caption => onUpdate({ caption })}
        placeholder="Caption (optional)"
        className="text-xs text-gray-500 text-center italic block"
      />
    </figure>
  );
}

// ImageBlockShell — shared upload/library/replace UI for hero + image.
// Empty state: clickable area triggers file picker. With image: hover
// reveals a small floating toolbar (Replace / Library / Height / Remove).
function ImageBlockShell({
  heightClass,
  imageDataUrl,
  onImageChange,
  placeholder,
  heightControls,
}: {
  heightClass: string;
  imageDataUrl: string;
  onImageChange: (dataUrl: string) => void;
  placeholder: string;
  heightControls?: React.ReactNode;
}) {
  const { addProposalImage, data } = useApp();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showLibrary, setShowLibrary] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    if (file.size > MAX_IMAGE_BYTES) {
      setError(`Image is ${(file.size / 1000).toFixed(0)}KB — please use one under ${MAX_IMAGE_BYTES / 1000}KB.`);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const dataUrl = await fileToDataUrl(file);
      // Save to library so it's reusable.
      await addProposalImage({
        name: file.name,
        imageDataUrl: dataUrl,
        width: 0,
        height: 0,
        sortOrder: Date.now(),
      });
      onImageChange(dataUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  function triggerUpload(e: React.MouseEvent) {
    e.stopPropagation();
    fileInputRef.current?.click();
  }

  return (
    <div className="relative group">
      <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />

      {!imageDataUrl ? (
        <button
          onClick={triggerUpload}
          className={cn(
            heightClass,
            "w-full bg-gray-50 rounded-lg flex flex-col items-center justify-center gap-2 text-gray-400 text-sm border-2 border-dashed border-gray-200 hover:border-primary/40 hover:bg-primary/5 hover:text-foreground transition-colors cursor-pointer",
          )}
          disabled={busy}
        >
          <ImageIcon className="w-6 h-6" />
          <span>{busy ? "Uploading…" : placeholder}</span>
          {data.proposalImages.length > 0 && (
            <span
              onClick={(e) => { e.stopPropagation(); setShowLibrary(true); }}
              className="text-[11px] text-primary hover:underline cursor-pointer"
            >
              or pick from library ({data.proposalImages.length})
            </span>
          )}
        </button>
      ) : (
        <>
          <div className={cn(heightClass, "rounded-lg overflow-hidden")}>
            <img src={imageDataUrl} alt="" className="w-full h-full object-cover" />
          </div>
          {/* Floating toolbar — appears on hover at top-left of the image. */}
          <div
            className="absolute top-2 left-2 flex items-center gap-1 bg-card/95 backdrop-blur border border-border rounded-md shadow-md p-1 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={e => e.stopPropagation()}
          >
            <button
              onClick={triggerUpload}
              className="text-[11px] px-2 py-1 rounded hover:bg-secondary text-foreground flex items-center gap-1"
              disabled={busy}
              title="Replace image"
            >
              <ImageIcon className="w-3 h-3" />
              {busy ? "Uploading…" : "Replace"}
            </button>
            {data.proposalImages.length > 0 && (
              <button
                onClick={() => setShowLibrary(true)}
                className="text-[11px] px-2 py-1 rounded hover:bg-secondary text-foreground"
                title="Pick from library"
              >
                Library
              </button>
            )}
            {heightControls}
            <button
              onClick={() => onImageChange("")}
              className="text-[11px] px-2 py-1 rounded hover:bg-destructive/10 text-destructive"
              title="Remove"
            >
              Remove
            </button>
          </div>
        </>
      )}

      {error && (
        <p className="text-xs text-destructive mt-1" onClick={e => e.stopPropagation()}>{error}</p>
      )}

      {showLibrary && (
        <ImageLibraryPopover
          library={data.proposalImages}
          currentValue={imageDataUrl}
          onPick={(dataUrl) => { onImageChange(dataUrl); setShowLibrary(false); }}
          onClose={() => setShowLibrary(false)}
        />
      )}
    </div>
  );
}

function HeightToggle({
  value,
  onChange,
}: {
  value: "sm" | "md" | "lg";
  onChange: (next: "sm" | "md" | "lg") => void;
}) {
  return (
    <div className="flex items-center gap-0.5 border-l border-border pl-1 ml-1">
      {(["sm", "md", "lg"] as const).map(size => (
        <button
          key={size}
          onClick={() => onChange(size)}
          className={cn(
            "text-[11px] px-1.5 py-1 rounded",
            value === size
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-secondary",
          )}
          title={size === "sm" ? "Short" : size === "lg" ? "Tall" : "Medium height"}
        >
          {size === "sm" ? "S" : size === "lg" ? "L" : "M"}
        </button>
      ))}
    </div>
  );
}

function ImageLibraryPopover({
  library,
  currentValue,
  onPick,
  onClose,
}: {
  library: ProposalImage[];
  currentValue: string;
  onPick: (dataUrl: string) => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-30 bg-black/30 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-popover border border-border rounded-xl shadow-2xl w-full max-w-lg max-h-[70vh] overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <h3 className="text-sm font-semibold">Pick from image library</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <Plus className="w-4 h-4 rotate-45" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          {library.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">No images uploaded yet.</p>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {library.map(img => (
                <button
                  key={img.id}
                  onClick={() => onPick(img.imageDataUrl)}
                  className={cn(
                    "aspect-square rounded overflow-hidden border-2 transition-colors",
                    currentValue === img.imageDataUrl
                      ? "border-primary"
                      : "border-transparent hover:border-border",
                  )}
                  title={img.name}
                >
                  <img src={img.imageDataUrl} alt={img.name} className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---- Prose block (WYSIWYG via contenteditable) ----
// Click-to-edit shows the rendered text with the same styling as preview;
// no raw HTML visible. Bold/italic/etc. render live as the user types
// using browser-native rich-text commands. On blur, the contenteditable's
// innerHTML is sanitized via DOMPurify before being saved.

function ProseBlockEditable({
  block,
  onUpdate,
}: {
  block: Extract<ProposalBlock, { type: "prose" }>;
  onUpdate: (partial: Partial<ProposalBlock>) => void;
}) {
  const [editing, setEditing] = useState(false);
  // Bumped each time edit mode opens so the ProseContentEditable below
  // remounts with a fresh `initialHtml` (instead of using Date.now() in
  // the key, which is impure-during-render and trips react-hooks/purity).
  const [editSession, setEditSession] = useState(0);

  if (editing) {
    return (
      <ProseContentEditable
        key={`edit-${block.id}-${editSession}`}
        initialHtml={block.html}
        onCommit={(html) => {
          if (html !== block.html) onUpdate({ html });
          setEditing(false);
        }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  return (
    <div
      onClick={(e) => { e.stopPropagation(); setEditSession(s => s + 1); setEditing(true); }}
      className="prose prose-sm max-w-none text-gray-700 leading-relaxed py-2 cursor-text rounded -mx-1 px-1 hover:bg-primary/5 transition-colors merge-chip-host"
      dangerouslySetInnerHTML={{ __html: block.html ? tokensToChips(block.html) : "<p class='text-gray-300 italic'>Click to add text…</p>" }}
      title="Click to edit"
    />
  );
}

function ProseContentEditable({
  initialHtml,
  onCommit,
  onCancel,
}: {
  initialHtml: string;
  onCommit: (html: string) => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Floating selection-toolbar position. Set to a bounding rect when the
  // user has highlighted text inside the editor; null otherwise.
  const [bubbleRect, setBubbleRect] = useState<DOMRect | null>(null);

  // Watch selection changes while this editor is focused. When the user
  // drags-to-select a range of text, surface a floating toolbar right above
  // the selection so they don't have to glance at the top toolbar.
  React.useEffect(() => {
    function onSelectionChange() {
      const el = ref.current;
      if (!el) return;
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
        setBubbleRect(null);
        return;
      }
      const range = sel.getRangeAt(0);
      // Only show the bubble if the selection is INSIDE this prose editor
      // (avoids cross-editor flicker if multiple are mounted).
      if (!el.contains(range.commonAncestorContainer)) {
        setBubbleRect(null);
        return;
      }
      const rect = range.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) {
        setBubbleRect(null);
        return;
      }
      setBubbleRect(rect);
    }
    document.addEventListener("selectionchange", onSelectionChange);
    return () => document.removeEventListener("selectionchange", onSelectionChange);
  }, []);

  // Populate the contenteditable's innerHTML once on mount. We deliberately
  // do NOT pass dangerouslySetInnerHTML on every render — that would fight
  // with the browser's edits and reset the cursor on every keystroke.
  React.useEffect(() => {
    const el = ref.current;
    if (el) {
      // Force the browser to use <p> as the paragraph separator on Enter.
      // Chrome defaults to <div>, which our DOMPurify allow-list strips at
      // commit time — silently merging line breaks into one line. Setting
      // this once before placing the cursor fixes the whole Enter flow.
      try { document.execCommand("defaultParagraphSeparator", false, "p"); } catch { /* old browsers */ }
      // Convert {{field}} tokens to visual chip spans on mount so the user
      // sees pills, not raw braces. Reverse happens in commit() before save.
      el.innerHTML = tokensToChips(initialHtml || "<p></p>");
      el.focus();
      // Place cursor at end
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
      // Register with the focus registry so the right-sidebar chip-click
      // handler can insert merge fields at the caret instead of appending
      // a new block.
      registerProseEditor(el);
      saveProseSelection();
    }
    return () => {
      if (el) clearActiveProse(el);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function commit() {
    const raw = ref.current?.innerHTML ?? "";
    // Allow <div> and align="…" so browser-generated paragraph wrappers
    // and alignment markup survive sanitization. Chrome's execCommand
    // (Enter, justifyCenter, etc.) emits one of those forms — without them,
    // line breaks merge and alignment silently disappears on save.
    let cleaned = DOMPurify.sanitize(raw, {
      ALLOWED_TAGS: ["p", "div", "br", "strong", "em", "u", "b", "i", "h1", "h2", "h3", "h4", "ul", "ol", "li", "a", "span"],
      ALLOWED_ATTR: ["href", "target", "rel", "style", "align", "class", "contenteditable", "data-field"],
    });
    // Chip spans → {{field}} tokens. The persisted HTML always uses the
    // canonical token form so the contract generator's regex substitution
    // works at signing time and PDF/email surfaces stay agnostic of chips.
    cleaned = chipsToTokens(cleaned);
    // Normalize <div> → <p> so the public renderer + Tailwind `prose` styles
    // see a consistent shape regardless of browser.
    cleaned = cleaned
      .replace(/<div(\s[^>]*)?>/gi, "<p$1>")
      .replace(/<\/div>/gi, "</p>");
    // Convert align="center" attributes to inline text-align style so the
    // rendered HTML aligns even if a future sanitizer drops the attribute.
    cleaned = cleaned.replace(
      /<(p|h[1-4])([^>]*?)\s+align="(left|center|right|justify)"([^>]*)>/gi,
      (_m, tag: string, pre: string, align: string, post: string) => {
        const styleMatch = (pre + post).match(/\sstyle="([^"]*)"/i);
        if (styleMatch) {
          const merged = `${pre}${post}`.replace(styleMatch[0], ` style="${styleMatch[1]}; text-align: ${align}"`);
          return `<${tag}${merged}>`;
        }
        return `<${tag}${pre}${post} style="text-align: ${align}">`;
      },
    );
    // Browsers collapse empty <p></p> to 0 height when rendered. The user
    // hits Enter to add visual spacing; preserve it by giving each empty
    // paragraph a <br> so it has line-box height in the saved HTML.
    cleaned = cleaned.replace(/<p>\s*<\/p>/g, "<p><br></p>");
    onCommit(cleaned);
  }

  function exec(cmd: string, value?: string) {
    // Keep focus on the editor so the command applies to the current selection.
    ref.current?.focus();
    document.execCommand(cmd, false, value);
  }

  return (
    <div onClick={e => e.stopPropagation()} className="space-y-1">
      {/* Inline formatting toolbar — operates on whatever is selected (or the
          paragraph the caret is in for alignment commands). */}
      <div className="flex items-center gap-0.5 bg-card border border-border rounded p-0.5 w-fit">
        <button onMouseDown={e => { e.preventDefault(); exec("bold"); }} className="p-1 text-muted-foreground hover:text-foreground hover:bg-secondary rounded" title="Bold">
          <strong className="text-xs">B</strong>
        </button>
        <button onMouseDown={e => { e.preventDefault(); exec("italic"); }} className="p-1 text-muted-foreground hover:text-foreground hover:bg-secondary rounded" title="Italic">
          <em className="text-xs">I</em>
        </button>
        <button onMouseDown={e => { e.preventDefault(); exec("underline"); }} className="p-1 text-muted-foreground hover:text-foreground hover:bg-secondary rounded" title="Underline">
          <span className="text-xs underline">U</span>
        </button>
        <span className="w-px h-4 bg-border mx-1" />
        <button onMouseDown={e => { e.preventDefault(); exec("justifyLeft"); }} className="p-1 text-muted-foreground hover:text-foreground hover:bg-secondary rounded" title="Align left">
          <AlignLeft className="w-3.5 h-3.5" />
        </button>
        <button onMouseDown={e => { e.preventDefault(); exec("justifyCenter"); }} className="p-1 text-muted-foreground hover:text-foreground hover:bg-secondary rounded" title="Align center">
          <AlignCenter className="w-3.5 h-3.5" />
        </button>
        <button onMouseDown={e => { e.preventDefault(); exec("justifyRight"); }} className="p-1 text-muted-foreground hover:text-foreground hover:bg-secondary rounded" title="Align right">
          <AlignRight className="w-3.5 h-3.5" />
        </button>
        <span className="w-px h-4 bg-border mx-1" />
        <button onMouseDown={e => { e.preventDefault(); exec("insertUnorderedList"); }} className="p-1 text-muted-foreground hover:text-foreground hover:bg-secondary rounded" title="Bulleted list">
          <span className="text-xs">•</span>
        </button>
        <button onMouseDown={e => { e.preventDefault(); exec("insertOrderedList"); }} className="p-1 text-muted-foreground hover:text-foreground hover:bg-secondary rounded" title="Numbered list">
          <span className="text-xs">1.</span>
        </button>
        <span className="w-px h-4 bg-border mx-1" />
        <span className="text-[10px] text-muted-foreground px-1" title="Press Shift+Enter for a tight line break, Enter for a new paragraph">
          ⇧⏎ tight line
        </span>
      </div>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onBlur={commit}
        onFocus={() => { registerProseEditor(ref.current); saveProseSelection(); }}
        onKeyUp={saveProseSelection}
        onMouseUp={saveProseSelection}
        onKeyDown={e => {
          if (e.key === "Escape") { e.preventDefault(); onCancel(); return; }
          // Shift+Enter → soft return (<br>): keeps lines tightly spaced,
          // unlike Enter which starts a new paragraph with margin. Force
          // insertLineBreak so all browsers behave the same (Safari/Chrome
          // sometimes insert a <div> on plain Shift+Enter, which renders
          // with the same paragraph margin and defeats the purpose).
          if (e.key === "Enter" && e.shiftKey) {
            e.preventDefault();
            document.execCommand("insertLineBreak");
          }
        }}
        onPaste={(e) => {
          // Always strip rich-text formatting on paste — pull plain text and
          // run it through cleanPastedText to fix PDF kerning artifacts.
          e.preventDefault();
          const pasted = e.clipboardData.getData("text/plain");
          const cleaned = cleanPastedText(pasted);
          if (document.execCommand) {
            document.execCommand("insertText", false, cleaned);
          } else {
            const sel = window.getSelection();
            if (sel && sel.rangeCount > 0) {
              const range = sel.getRangeAt(0);
              range.deleteContents();
              range.insertNode(document.createTextNode(cleaned));
              range.collapse(false);
            }
          }
        }}
        className="prose prose-sm max-w-none text-gray-700 leading-relaxed py-2 cursor-text rounded -mx-1 px-1 outline-none ring-2 ring-primary/30 bg-white min-h-[80px]"
      />
      {bubbleRect && <SelectionBubble rect={bubbleRect} exec={exec} />}
    </div>
  );
}

// ---- Floating selection toolbar ----
// Appears just above the highlighted text inside a prose editor. Buttons
// preventDefault on mousedown so clicking them doesn't blur the editor and
// drop the selection. Positioned in fixed coordinates relative to the
// viewport using the selection's bounding rect.

function SelectionBubble({
  rect,
  exec,
}: {
  rect: DOMRect;
  exec: (cmd: string, value?: string) => void;
}) {
  // Center horizontally on the selection, sit ~6px above its top edge.
  // If there's not enough room above (selection is near top of viewport),
  // flip to below the selection. Clamped to viewport edges so the bubble
  // can never render offscreen.
  const TOOLBAR_WIDTH = 220;
  const TOOLBAR_HEIGHT = 32;
  // 14px gap above the selection (was 6) — keeps the bubble out of the way
  // of the highlighted line + the cursor caret.
  const ABOVE_GAP = 14;
  const BELOW_GAP = 10;
  const idealTop = rect.top - TOOLBAR_HEIGHT - ABOVE_GAP;
  const top = idealTop < 8 ? rect.bottom + BELOW_GAP : idealTop;
  const left = Math.max(8, Math.min(window.innerWidth - TOOLBAR_WIDTH - 8, rect.left + rect.width / 2 - TOOLBAR_WIDTH / 2));
  // Portal to document.body so any ancestor transform / overflow on the
  // editor's parents can't capture the fixed positioning. Without this,
  // the bubble was anchoring to the editor box instead of the selection.
  return createPortal(
    <div
      className="fixed z-[100] flex items-center gap-0.5 bg-popover border border-border rounded-md shadow-xl p-0.5"
      style={{ top, left, width: TOOLBAR_WIDTH }}
      onMouseDown={e => e.preventDefault()}
      onClick={e => e.stopPropagation()}
    >
      <button onMouseDown={e => { e.preventDefault(); exec("bold"); }} className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary rounded" title="Bold">
        <strong className="text-xs">B</strong>
      </button>
      <button onMouseDown={e => { e.preventDefault(); exec("italic"); }} className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary rounded" title="Italic">
        <em className="text-xs">I</em>
      </button>
      <button onMouseDown={e => { e.preventDefault(); exec("underline"); }} className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary rounded" title="Underline">
        <span className="text-xs underline">U</span>
      </button>
      <span className="w-px h-4 bg-border mx-0.5" />
      <button onMouseDown={e => { e.preventDefault(); exec("justifyLeft"); }} className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary rounded" title="Align left">
        <AlignLeft className="w-3.5 h-3.5" />
      </button>
      <button onMouseDown={e => { e.preventDefault(); exec("justifyCenter"); }} className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary rounded" title="Align center">
        <AlignCenter className="w-3.5 h-3.5" />
      </button>
      <button onMouseDown={e => { e.preventDefault(); exec("justifyRight"); }} className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary rounded" title="Align right">
        <AlignRight className="w-3.5 h-3.5" />
      </button>
      <span className="w-px h-4 bg-border mx-0.5" />
      <button onMouseDown={e => { e.preventDefault(); exec("insertUnorderedList"); }} className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary rounded" title="Bullets">
        <span className="text-xs">•</span>
      </button>
      <button onMouseDown={e => { e.preventDefault(); exec("insertOrderedList"); }} className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary rounded" title="Numbered">
        <span className="text-xs">1.</span>
      </button>
    </div>,
    document.body,
  );
}

// ---- Merge-field block ----
// Renders as a styled chip showing the human-readable label of the field
// (e.g. "Client Name", "Selected Packages"). Click to swap to a different
// field via dropdown. The renderer outputs the literal {{field}} token so
// the server-side contract generator can substitute at acceptance time.

const MERGE_FIELD_LABELS: Record<string, string> = {
  client_name: "Client Name",
  client_email: "Client Email",
  client_address: "Client Address",
  client_phone: "Client Phone",
  vendor_name: "Vendor Name",
  vendor_signer_name: "Owner Name",
  vendor_email: "Vendor Email",
  vendor_address: "Vendor Address",
  vendor_phone: "Vendor Phone",
  event_date: "Event Date",
  event_location: "Event Location",
  contract_signed_date: "Date Signed (today)",
  total_due_date: "Total Due Date",
  project_title: "Project Title",
  parties_block: "Parties Header (Vendor + Client)",
  packages_block: "Selected Packages",
  payment_schedule_block: "Payment Schedule",
};

const MERGE_FIELD_KEYS = Object.keys(MERGE_FIELD_LABELS);

/**
 * Resolve vendor-side merge fields (vendor_name / email / address / phone)
 * to the org's actual Settings → Business Info values. Returns null for any
 * other field, or when the corresponding setting is empty (so the placeholder
 * label still shows and the user knows something needs configuring).
 */
function resolveVendorMergeValue(
  field: string | undefined,
  data: ReturnType<typeof useApp>["data"],
): string | null {
  if (!field) return null;
  const org = data.organization;
  if (!org) return null;
  const bi = org.businessInfo || ({} as Partial<typeof org.businessInfo>);
  switch (field) {
    case "vendor_name":
      return org.name?.trim() || null;
    case "vendor_email":
      return bi.email?.trim() || null;
    case "vendor_phone":
      return bi.phone?.trim() || null;
    case "vendor_address": {
      // Mirror the Settings page format: "945 Tynan Way Nolensville, TN 37135"
      const street = bi.address?.trim() || "";
      const cityStateZip = [
        bi.city?.trim(),
        [bi.state?.trim(), bi.zip?.trim()].filter(Boolean).join(" "),
      ].filter(Boolean).join(", ");
      const joined = [street, cityStateZip].filter(Boolean).join(" ");
      return joined.trim() || null;
    }
    default:
      return null;
  }
}

function MergeFieldBlockEditable({
  block,
  onUpdate,
}: {
  block: Extract<ProposalBlock, { type: "merge_field" }>;
  onUpdate: (partial: Partial<ProposalBlock>) => void;
}) {
  const { data } = useApp();
  const [open, setOpen] = useState(false);
  const isBlock = block.field?.endsWith("_block");

  // Special-case the multi-line block tokens — render a sample of what the
  // client will actually see when a real proposal substitutes them. Helps
  // the user visualize the contract without sending themselves a test.
  if (block.field === "packages_block") {
    return <PackagesBlockExample sample={data.packages[0]} onClickField={() => setOpen(!open)} open={open} onClose={() => setOpen(false)} onPickField={key => { onUpdate({ field: key }); setOpen(false); }} currentField={block.field} />;
  }

  // Resolve vendor fields from the org's Settings → Business Info so the
  // editor preview shows real values ("S-Dub Media", actual address, etc.)
  // instead of placeholder labels. Client/event fields stay as labels —
  // they get filled in at signing time per-contract.
  const resolved = resolveVendorMergeValue(block.field, data);
  const label = resolved ?? (MERGE_FIELD_LABELS[block.field] || block.field || "(no field)");
  const isResolved = !!resolved;

  return (
    <div className="relative inline-block">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        className={cn(
          "inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border transition-colors",
          isBlock
            ? "bg-amber-50 text-amber-900 border-amber-200 hover:bg-amber-100"
            : isResolved
              ? "bg-emerald-50 text-emerald-900 border-emerald-200 hover:bg-emerald-100"
              : "bg-blue-50 text-blue-900 border-dashed border-blue-300 hover:bg-blue-100",
        )}
        title={isResolved ? `Auto-filled from Settings — click to change field` : "Click to change merge field"}
      >
        <span className="font-medium">{label}</span>
        {isResolved && <span className="text-emerald-700/60 text-[10px] ml-0.5">*</span>}
      </button>
      {open && (
        <>
          <div
            className="fixed inset-0 z-20"
            onClick={(e) => { e.stopPropagation(); setOpen(false); }}
          />
          <div
            className="absolute z-30 left-0 top-full mt-1 bg-popover border border-border rounded-lg shadow-xl p-1 max-h-[60vh] overflow-y-auto w-72"
            onClick={e => e.stopPropagation()}
          >
            {MERGE_FIELD_KEYS.map(key => (
              <button
                key={key}
                onClick={() => { onUpdate({ field: key }); setOpen(false); }}
                className={cn(
                  "w-full flex items-center justify-between p-2 rounded text-left text-xs",
                  block.field === key
                    ? "bg-primary/10 text-primary"
                    : "hover:bg-secondary text-foreground",
                )}
              >
                <span>{MERGE_FIELD_LABELS[key]}</span>
                <code className="text-[10px] text-muted-foreground">{`{{${key}}}`}</code>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ---- Packages block live preview ----
// Renders a sample of what `{{packages_block}}` will produce at signing
// time, using the first package in the library as a stand-in. Clearly
// labeled "EXAMPLE — replaced at signing" so the user understands this
// is not the literal output. Click anywhere on the card to swap field.

function PackagesBlockExample({
  sample,
  open,
  onClickField,
  onClose,
  onPickField,
  currentField,
}: {
  sample: Package | undefined;
  open: boolean;
  onClickField: () => void;
  onClose: () => void;
  onPickField: (key: string) => void;
  currentField: string;
}) {
  return (
    <div className="relative">
      <div className="border border-amber-200 bg-amber-50/50 rounded-lg overflow-hidden">
        <button
          onClick={(e) => { e.stopPropagation(); onClickField(); }}
          className="w-full flex items-center justify-between px-3 py-1.5 bg-amber-100/60 hover:bg-amber-100 border-b border-amber-200 text-left"
          title="Click to change which block this is"
        >
          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-900">
            🧩 Selected Packages — Example
          </span>
          <span className="text-[10px] text-amber-800/70 italic">
            replaced at signing with the client's actual selections
          </span>
        </button>
        <div className="px-4 py-3">
          {sample ? (
            <div className="text-sm text-gray-800 leading-relaxed">
              <p className="font-semibold mb-1">
                1 of {sample.name} at ${sample.defaultPrice.toFixed(2)} for a total of ${sample.defaultPrice.toFixed(2)}
              </p>
              <p className="text-gray-700">{sample.description || <em className="text-gray-400">(no description on this package)</em>}</p>
              {sample.discountFromPrice && sample.discountFromPrice > sample.defaultPrice && (
                <p className="text-xs text-gray-600 mt-1">
                  This is a discounted rate from <strong>${sample.discountFromPrice.toFixed(2)}</strong>
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-gray-500 italic">
              No packages in your library yet — add one in <strong>Sales → Packages</strong> to see what this will look like.
            </p>
          )}
        </div>
      </div>
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={(e) => { e.stopPropagation(); onClose(); }} />
          <div
            className="absolute z-30 left-0 top-full mt-1 bg-popover border border-border rounded-lg shadow-xl p-1 max-h-[60vh] overflow-y-auto w-72"
            onClick={e => e.stopPropagation()}
          >
            {MERGE_FIELD_KEYS.map(key => (
              <button
                key={key}
                onClick={() => onPickField(key)}
                className={cn(
                  "w-full flex items-center justify-between p-2 rounded text-left text-xs",
                  currentField === key ? "bg-primary/10 text-primary" : "hover:bg-secondary text-foreground",
                )}
              >
                <span>{MERGE_FIELD_LABELS[key]}</span>
                <code className="text-[10px] text-muted-foreground">{`{{${key}}}`}</code>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ---- Payment schedule block ----
// Click compact rendered view → expands inline editor for deposit + balance
// terms. Click outside (or the Done button) to collapse back to the rendered
// view. Stored data is structured (not HTML) — server converts to dollar
// amounts at signing time.

function PaymentScheduleBlockEditable({
  block,
  onUpdate,
}: {
  block: Extract<ProposalBlock, { type: "payment_schedule" }>;
  onUpdate: (partial: Partial<ProposalBlock>) => void;
}) {
  const [editing, setEditing] = useState(false);

  if (!editing) {
    return (
      <button
        onClick={(e) => { e.stopPropagation(); setEditing(true); }}
        className="w-full text-left bg-emerald-50/60 hover:bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3 transition-colors"
        title="Click to edit payment schedule"
      >
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-[10px] uppercase tracking-wider font-semibold text-emerald-800">
            Payment schedule
          </span>
          <span className="text-[10px] text-emerald-700/70">
            (auto-calculated at signing)
          </span>
        </div>
        <div className="space-y-0.5 text-sm text-gray-800">
          <div>{summarizeMilestone(block.deposit, "Deposit")}</div>
          <div>{summarizeBalance(block.balance, block.deposit)}</div>
        </div>
      </button>
    );
  }

  return (
    <div
      onClick={e => e.stopPropagation()}
      className="bg-white border-2 border-emerald-300 rounded-lg p-4 space-y-4"
    >
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-emerald-800">
          Payment schedule
        </h4>
        <button
          onClick={() => setEditing(false)}
          className="text-xs px-2 py-1 rounded bg-emerald-600 text-white hover:bg-emerald-700"
        >
          Done
        </button>
      </div>

      {/* Deposit row */}
      <div className="space-y-2 pb-3 border-b border-gray-200">
        <p className="text-xs font-semibold text-gray-700">Deposit</p>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {/* Kind toggle */}
          <div className="inline-flex rounded border border-gray-300 overflow-hidden">
            {(["percent", "fixed"] as const).map(k => (
              <button
                key={k}
                onClick={() => onUpdate({ deposit: { ...block.deposit, kind: k } })}
                className={cn(
                  "px-2 py-1 text-xs",
                  block.deposit.kind === k ? "bg-emerald-600 text-white" : "bg-white text-gray-700 hover:bg-gray-50",
                )}
              >
                {k === "percent" ? "%" : "$"}
              </button>
            ))}
          </div>
          <input
            type="text"
            inputMode="decimal"
            value={block.deposit.value}
            onChange={e => {
              const v = parseFloat(e.target.value) || 0;
              onUpdate({ deposit: { ...block.deposit, value: v } });
            }}
            className="w-20 px-2 py-1 text-sm border border-gray-300 rounded"
          />
          <span className="text-xs text-gray-500">
            {block.deposit.kind === "percent" ? "of total" : "flat amount"}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-xs text-gray-600">Due:</span>
          <select
            value={block.deposit.dueType}
            onChange={e => onUpdate({ deposit: { ...block.deposit, dueType: e.target.value as typeof block.deposit.dueType } })}
            className="px-2 py-1 text-xs border border-gray-300 rounded bg-white"
          >
            <option value="at_signing">at signing</option>
            <option value="relative_days">days after signing</option>
            <option value="absolute_date">on a specific date</option>
          </select>
          {block.deposit.dueType === "relative_days" && (
            <>
              <input
                type="text"
                inputMode="numeric"
                value={block.deposit.dueDays ?? 0}
                onChange={e => onUpdate({ deposit: { ...block.deposit, dueDays: parseInt(e.target.value) || 0 } })}
                className="w-16 px-2 py-1 text-xs border border-gray-300 rounded"
              />
              <span className="text-xs text-gray-500">days</span>
            </>
          )}
          {block.deposit.dueType === "absolute_date" && (
            <input
              type="date"
              value={block.deposit.dueDate || ""}
              onChange={e => onUpdate({ deposit: { ...block.deposit, dueDate: e.target.value } })}
              className="px-2 py-1 text-xs border border-gray-300 rounded"
            />
          )}
        </div>
      </div>

      {/* Balance row */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-gray-700">Balance (remainder)</p>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-xs text-gray-600">Due:</span>
          <select
            value={block.balance.dueType}
            onChange={e => onUpdate({ balance: { ...block.balance, dueType: e.target.value as typeof block.balance.dueType } })}
            className="px-2 py-1 text-xs border border-gray-300 rounded bg-white"
          >
            <option value="on_event_date">on the event date</option>
            <option value="relative_days">days before event</option>
            <option value="absolute_date">on a specific date</option>
            <option value="at_signing">at signing (full payment)</option>
          </select>
          {block.balance.dueType === "relative_days" && (
            <>
              <input
                type="text"
                inputMode="numeric"
                value={block.balance.dueDays ?? 7}
                onChange={e => onUpdate({ balance: { ...block.balance, dueDays: parseInt(e.target.value) || 0 } })}
                className="w-16 px-2 py-1 text-xs border border-gray-300 rounded"
              />
              <span className="text-xs text-gray-500">days before</span>
            </>
          )}
          {block.balance.dueType === "absolute_date" && (
            <input
              type="date"
              value={block.balance.dueDate || ""}
              onChange={e => onUpdate({ balance: { ...block.balance, dueDate: e.target.value } })}
              className="px-2 py-1 text-xs border border-gray-300 rounded"
            />
          )}
        </div>
      </div>

      <p className="text-[11px] text-gray-500 italic">
        At signing, percentages convert to dollar amounts using the proposal's package total. Auto-reminder emails will fire on each due date once enabled.
      </p>
    </div>
  );
}

function summarizeMilestone(
  d: Extract<ProposalBlock, { type: "payment_schedule" }>["deposit"],
  defaultLabel: string,
): string {
  const amount = d.kind === "percent" ? `${d.value}%` : `$${d.value}`;
  let due: string;
  if (d.dueType === "at_signing") due = "at signing";
  else if (d.dueType === "relative_days") due = `${d.dueDays ?? 0} days after signing`;
  else if (d.dueType === "absolute_date" && d.dueDate) due = `on ${d.dueDate}`;
  else due = "—";
  return `${d.label || defaultLabel}: ${amount} due ${due}`;
}

function summarizeBalance(
  b: Extract<ProposalBlock, { type: "payment_schedule" }>["balance"],
  d: Extract<ProposalBlock, { type: "payment_schedule" }>["deposit"],
): string {
  const remainder = d.kind === "percent"
    ? `${Math.max(0, 100 - d.value)}%`
    : "Remaining balance";
  let due: string;
  if (b.dueType === "at_signing") due = "at signing";
  else if (b.dueType === "on_event_date") due = "on the event date";
  else if (b.dueType === "relative_days") due = `${b.dueDays ?? 0} days before event`;
  else if (b.dueType === "absolute_date" && b.dueDate) due = `on ${b.dueDate}`;
  else due = "—";
  return `${b.label || "Balance"}: ${remainder} due ${due}`;
}

// ---- Signature block — editor preview ----
// Shows a colored badge identifying client vs. vendor, an auto-filled
// vendor name from Settings, and a placeholder for the auto-stamped
// signing date. The renderer (ProposalBlockRenderer) emits merge-field
// tokens in those slots so the contract generator substitutes real
// values at signing time.

function SignatureBlockEditable({
  block,
  onUpdate,
}: {
  block: Extract<ProposalBlock, { type: "signature" }>;
  onUpdate: (partial: Partial<ProposalBlock>) => void;
}) {
  const { data } = useApp();
  const placeholder = block.role === "client"
    ? "Client"
    : block.role === "vendor"
      ? "Vendor"
      : "Signature";
  const badgeClass = block.role === "vendor"
    ? "bg-emerald-100 text-emerald-900 border-emerald-300"
    : block.role === "client"
      ? "bg-indigo-100 text-indigo-900 border-indigo-300"
      : "bg-gray-100 text-gray-700 border-gray-300";
  // Prefer the explicit owner name (Settings → Company → Owner Name) for
  // signature blocks; fall back to the company name if the user hasn't
  // set the owner field yet.
  const ownerName = data.organization?.businessInfo?.ownerName?.trim() || data.organization?.name || "";
  return (
    <div className="mt-6 mb-2">
      <div className="flex items-center gap-2 mb-3">
        <span className={cn("inline-block px-2.5 py-1 rounded text-xs font-bold uppercase tracking-wider border", badgeClass)}>
          <ClickableText
            value={block.label ?? ""}
            onChange={label => onUpdate({ label })}
            placeholder={placeholder}
            className="font-bold uppercase tracking-wider text-xs"
          />
        </span>
        <span className="text-[11px] text-gray-500">signs below</span>
      </div>
      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2">
          <div className="h-10 border-b border-gray-400" />
          <p className="text-[11px] text-gray-500 mt-1">Signature</p>
        </div>
        <div>
          <div className="h-10 border-b border-gray-400 flex items-end pb-1 text-xs text-gray-400 italic">
            Auto · signing date
          </div>
          <p className="text-[11px] text-gray-500 mt-1">Date</p>
        </div>
        <div className="col-span-2">
          <div className="h-6 border-b border-gray-400 flex items-end pb-0.5 text-sm">
            {block.role === "vendor"
              ? <span className="text-gray-800">{ownerName || <em className="text-gray-400">Set Owner Name in Settings → Company</em>}</span>
              : <span className="text-gray-400 italic text-xs">Client prints their name</span>}
          </div>
          <p className="text-[11px] text-gray-500 mt-1">Print name</p>
        </div>
      </div>
    </div>
  );
}

// ---- Spacer block (hover toolbar with size buttons) ----

function SpacerBlockEditable({
  block,
  onUpdate,
}: {
  block: Extract<ProposalBlock, { type: "spacer" }>;
  onUpdate: (partial: Partial<ProposalBlock>) => void;
}) {
  const heightClass = block.size === "sm" ? "h-4" : block.size === "lg" ? "h-16" : "h-8";
  return (
    <div className="relative group">
      <div className={cn(heightClass, "border-l-2 border-gray-100")} aria-hidden="true" />
      <div
        className="absolute top-1/2 -translate-y-1/2 left-3 flex items-center gap-0.5 bg-card/95 backdrop-blur border border-border rounded-md shadow-md p-1 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={e => e.stopPropagation()}
      >
        {(["sm", "md", "lg"] as const).map(size => (
          <button
            key={size}
            onClick={() => onUpdate({ size })}
            className={cn(
              "text-[11px] px-2 py-1 rounded",
              block.size === size
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-secondary",
            )}
          >
            {size === "sm" ? "Small" : size === "lg" ? "Large" : "Medium"}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---- Inline-editable package row ----
// Click the icon, name, description, or price to edit it directly. Edits
// modify the master Package in the library — change once, reflected on
// every template using it. (Per-proposal price overrides are a separate
// future feature when we ship proposal-level edits.)

function PackageRowInlineEditable({
  block,
  libraryPackages,
}: {
  block: Extract<ProposalBlock, { type: "package_row" }>;
  libraryPackages: Package[];
}) {
  const { updatePackage } = useApp();
  const pkg = libraryPackages.find(p => p.id === block.packageId);
  if (!pkg) {
    return (
      <div className="text-xs text-gray-400 italic border-2 border-dashed border-gray-200 rounded p-3 py-6 text-center">
        Pick a package from your library (use the block menu's Edit panel)
      </div>
    );
  }
  const iconKey = block.icon || pkg.icon;
  return (
    <div className="flex gap-6 items-start py-2">
      <ClickableIcon
        iconKey={iconKey}
        customDataUrl={pkg.iconCustomDataUrl}
        onChange={icon => updatePackage(pkg.id, { icon, iconCustomDataUrl: "" })}
        onCustomUpload={dataUrl => updatePackage(pkg.id, { iconCustomDataUrl: dataUrl })}
        onClearCustom={() => updatePackage(pkg.id, { iconCustomDataUrl: "" })}
      />
      <div className="flex-1 min-w-0">
        <ClickableText
          value={pkg.name}
          onChange={name => updatePackage(pkg.id, { name })}
          className="text-lg font-bold text-gray-900 mb-2 block"
          style={{ fontFamily: "'Space Grotesk', sans-serif" }}
          placeholder="Untitled package"
        />
        <ClickableText
          value={pkg.description}
          onChange={description => updatePackage(pkg.id, { description })}
          className="text-sm text-gray-700 leading-relaxed mb-3 block"
          placeholder="Click to add a description…"
          multiline
        />
        {pkg.deliverables.length > 0 && (
          <ul className="text-sm text-gray-700 leading-relaxed mb-3 space-y-1 list-disc pl-5">
            {pkg.deliverables.map((d, i) => <li key={i}>{d}</li>)}
          </ul>
        )}
        <div className="flex justify-end items-baseline gap-3 text-sm">
          {pkg.discountFromPrice && pkg.discountFromPrice > pkg.defaultPrice && (
            <ClickablePrice
              value={pkg.discountFromPrice}
              onChange={discountFromPrice => updatePackage(pkg.id, { discountFromPrice })}
              className="text-gray-400 line-through font-mono"
              hint="Crossed-out price"
            />
          )}
          <ClickablePrice
            value={pkg.defaultPrice}
            onChange={defaultPrice => updatePackage(pkg.id, { defaultPrice })}
            className="text-lg font-bold text-gray-900 font-mono"
            hint="Price"
          />
        </div>
      </div>
    </div>
  );
}

// ---- Click-to-edit primitives ----

// AlignableText — ClickableText + a small alignment toolbar (L/C/R) that
// shows when hovered or being edited. Used for centered_title and
// section_divider blocks where alignment is a per-block choice.
function AlignableText({
  value,
  align,
  onChangeText,
  onChangeAlign,
  placeholder,
  className,
  style,
  sizeToggle,
  formatToggle,
}: {
  value: string;
  align: "left" | "center" | "right";
  onChangeText: (next: string) => void;
  onChangeAlign: (next: "left" | "center" | "right") => void;
  placeholder?: string;
  className?: string;
  style?: React.CSSProperties;
  sizeToggle?: React.ReactNode;
  formatToggle?: React.ReactNode;
}) {
  const alignClass = align === "left" ? "text-left" : align === "right" ? "text-right" : "text-center";
  return (
    <div className="relative group">
      <ClickableText
        value={value}
        onChange={onChangeText}
        placeholder={placeholder}
        className={cn(className, alignClass)}
        style={style}
      />
      {/* Toolbar floats ABOVE the block (negative top) so it never overlaps
          the title text. Pointer-events isolated so hovering the block edges
          still reaches the canvas hover state. */}
      <div
        className="absolute -top-7 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-card/95 backdrop-blur border border-border rounded shadow-sm p-0.5 opacity-0 group-hover:opacity-100 transition-opacity z-20"
        onClick={e => e.stopPropagation()}
      >
        {sizeToggle}
        {sizeToggle && <span className="w-px h-4 bg-border mx-0.5" />}
        {formatToggle}
        {formatToggle && <span className="w-px h-4 bg-border mx-0.5" />}
        {(["left", "center", "right"] as const).map(a => (
          <button
            key={a}
            onClick={() => onChangeAlign(a)}
            className={cn(
              "p-1 rounded text-muted-foreground hover:text-foreground hover:bg-secondary",
              align === a && "bg-primary/10 text-primary",
            )}
            title={`Align ${a}`}
          >
            {a === "left" ? <AlignLeft className="w-3.5 h-3.5" /> : a === "right" ? <AlignRight className="w-3.5 h-3.5" /> : <AlignCenter className="w-3.5 h-3.5" />}
          </button>
        ))}
      </div>
    </div>
  );
}

// Bold / Italic / Underline toggle for centered_title.
function FormatToggle({
  bold,
  italic,
  underline,
  onToggleBold,
  onToggleItalic,
  onToggleUnderline,
}: {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  onToggleBold: () => void;
  onToggleItalic: () => void;
  onToggleUnderline: () => void;
}) {
  const btn = "px-1.5 py-0.5 rounded text-xs leading-none";
  const on = "bg-primary/10 text-primary";
  const off = "text-muted-foreground hover:text-foreground hover:bg-secondary";
  return (
    <div className="flex items-center gap-0.5">
      <button onClick={onToggleBold} className={cn(btn, bold ? on : off)} title="Bold">
        <strong>B</strong>
      </button>
      <button onClick={onToggleItalic} className={cn(btn, italic ? on : off)} title="Italic">
        <em>I</em>
      </button>
      <button onClick={onToggleUnderline} className={cn(btn, underline ? on : off)} title="Underline">
        <span className="underline">U</span>
      </button>
    </div>
  );
}

// Size toggle for centered_title — S / M / L pills.
function SizeToggle({
  value,
  onChange,
}: {
  value: "sm" | "md" | "lg";
  onChange: (next: "sm" | "md" | "lg") => void;
}) {
  return (
    <div className="flex items-center gap-0.5">
      {(["sm", "md", "lg"] as const).map(s => (
        <button
          key={s}
          onClick={() => onChange(s)}
          className={cn(
            "px-1.5 py-0.5 rounded text-[10px] font-semibold tabular-nums",
            value === s
              ? "bg-primary/10 text-primary"
              : "text-muted-foreground hover:text-foreground hover:bg-secondary",
          )}
          title={`${s === "sm" ? "Subheading" : s === "md" ? "Heading" : "Title"}`}
        >
          {s.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

function ClickableText({
  value,
  onChange,
  className,
  style,
  placeholder,
  multiline,
}: {
  value: string;
  onChange: (next: string) => void;
  className?: string;
  style?: React.CSSProperties;
  placeholder?: string;
  multiline?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const handlePaste = usePasteCleaner(setDraft);

  function commit() {
    if (draft !== value) onChange(draft);
    setEditing(false);
  }

  if (editing) {
    return multiline ? (
      <textarea
        autoFocus
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onPaste={handlePaste}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === "Escape") { setDraft(value); setEditing(false); }
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) commit();
        }}
        rows={10}
        className={cn(className, "w-full resize-y bg-white border border-primary/40 rounded px-2 py-1 outline-none focus:ring-2 focus:ring-primary/30 min-h-[200px]")}
        style={style}
        placeholder={placeholder}
        onClick={e => e.stopPropagation()}
      />
    ) : (
      <input
        autoFocus
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onPaste={handlePaste}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === "Escape") { setDraft(value); setEditing(false); }
          if (e.key === "Enter") commit();
        }}
        className={cn(className, "w-full bg-white border border-primary/40 rounded px-2 py-1 outline-none focus:ring-2 focus:ring-primary/30")}
        style={style}
        placeholder={placeholder}
        onClick={e => e.stopPropagation()}
      />
    );
  }

  return (
    <span
      className={cn(className, "cursor-text rounded -mx-1 px-1 hover:bg-primary/5 transition-colors")}
      style={style}
      onClick={(e) => { e.stopPropagation(); setDraft(value); setEditing(true); }}
      title="Click to edit"
    >
      {value || (placeholder && <span className="text-gray-300 italic">{placeholder}</span>)}
    </span>
  );
}

function ClickablePrice({
  value,
  onChange,
  className,
  hint,
}: {
  value: number;
  onChange: (next: number) => void;
  className?: string;
  hint?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));

  function commit() {
    const n = Number(draft.replace(/[^\d.]/g, ""));
    if (!Number.isNaN(n) && n !== value) onChange(n);
    setEditing(false);
  }

  if (editing) {
    return (
      <span className={cn(className, "inline-flex items-baseline")} onClick={e => e.stopPropagation()}>
        <span>$</span>
        <input
          autoFocus
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={e => {
            if (e.key === "Escape") { setDraft(String(value)); setEditing(false); }
            if (e.key === "Enter") commit();
          }}
          className="bg-white border border-primary/40 rounded px-1 outline-none focus:ring-2 focus:ring-primary/30 w-24 text-right font-mono"
          inputMode="decimal"
        />
      </span>
    );
  }

  return (
    <span
      className={cn(className, "cursor-text rounded -mx-1 px-1 hover:bg-primary/5 transition-colors")}
      onClick={(e) => { e.stopPropagation(); setDraft(String(value)); setEditing(true); }}
      title={hint ? `${hint} — click to edit` : "Click to edit"}
    >
      ${value.toFixed(2)}
    </span>
  );
}

function ClickableIcon({
  iconKey,
  customDataUrl,
  onChange,
  onCustomUpload,
  onClearCustom,
}: {
  iconKey: string;
  customDataUrl?: string;
  onChange: (next: string) => void;
  onCustomUpload?: (dataUrl: string) => void;
  onClearCustom?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const Icon = ICON_VOCABULARY[iconKey] ?? ICON_VOCABULARY.heart;

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    if (file.size > MAX_ICON_BYTES) {
      setError(`Icon is ${(file.size / 1000).toFixed(0)}KB — please use one under ${MAX_ICON_BYTES / 1000}KB.`);
      return;
    }
    try {
      const dataUrl = await fileToDataUrl(file);
      setError("");
      onCustomUpload?.(dataUrl);
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    }
  }

  return (
    <div className="relative">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        className="w-24 h-24 rounded-full bg-slate-900 text-white flex items-center justify-center shrink-0 hover:ring-4 hover:ring-primary/30 transition-shadow overflow-hidden"
        title="Click to change icon"
      >
        {customDataUrl ? (
          <img src={customDataUrl} alt="" className="w-full h-full object-contain p-3" />
        ) : (
          <Icon className="w-10 h-10" strokeWidth={1.25} />
        )}
      </button>
      {open && (
        <>
          <div
            className="fixed inset-0 z-20"
            onClick={(e) => { e.stopPropagation(); setOpen(false); }}
          />
          <div
            className="absolute z-30 left-0 top-full mt-2 bg-popover border border-border rounded-lg shadow-xl p-3 w-64 space-y-3"
            onClick={e => e.stopPropagation()}
          >
            <div className="grid grid-cols-4 gap-1.5">
              {PACKAGE_ICON_KEYS.map(key => {
                const I = ICON_VOCABULARY[key];
                return (
                  <button
                    key={key}
                    onClick={() => { onChange(key); setOpen(false); }}
                    className={cn(
                      "w-12 h-12 rounded-full flex items-center justify-center border-2 transition-colors",
                      iconKey === key && !customDataUrl
                        ? "bg-slate-900 text-white border-primary"
                        : "bg-secondary text-muted-foreground border-transparent hover:border-border",
                    )}
                    title={key}
                  >
                    <I className="w-5 h-5" strokeWidth={1.5} />
                  </button>
                );
              })}
            </div>
            {onCustomUpload && (
              <div className="border-t border-border pt-3 space-y-2">
                <p className="text-[10px] text-muted-foreground">
                  <strong>Or upload your own.</strong> Recommended: 96×96px or larger, transparent PNG / SVG.
                </p>
                <label className="flex items-center justify-center gap-2 py-2 border-2 border-dashed border-border rounded cursor-pointer hover:border-primary/50 hover:bg-secondary/30 transition-colors text-xs text-muted-foreground">
                  <input type="file" accept="image/png,image/svg+xml,image/jpeg" onChange={handleUpload} className="hidden" />
                  Upload icon (≤{MAX_ICON_BYTES / 1000}KB)
                </label>
                {customDataUrl && onClearCustom && (
                  <button
                    onClick={() => { onClearCustom(); setOpen(false); }}
                    className="w-full text-xs text-muted-foreground hover:text-destructive py-1"
                  >
                    Remove custom icon
                  </button>
                )}
                {error && <p className="text-[10px] text-destructive">{error}</p>}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

const MAX_ICON_BYTES = 50_000;


// ---- Block picker popover ----

function BlockPickerPopover({
  kind,
  editorKind,
  libraryPackages,
  onPickStructural,
  onPickPackage,
  onPickImage,
  onAdvanceTo,
  onClose,
}: {
  kind: PickerKind;
  editorKind: "proposal" | "contract";
  libraryPackages: Package[];
  onPickStructural: (type: StructuralBlockType, presetSize?: "sm" | "md" | "lg", presetRole?: "client" | "vendor") => void;
  onPickPackage: (packageId: string) => void;
  onPickImage: (img: ProposalImage) => void;
  onAdvanceTo: (kind: PickerKind) => void;
  onClose: () => void;
}) {
  const { data } = useApp();
  return (
    <div
      className="fixed inset-0 z-30 bg-black/30 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-popover border border-border rounded-xl shadow-2xl w-full max-w-md max-h-[80vh] overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <h3 className="text-sm font-semibold">
            {kind === "block" ? "Add a block" : kind === "package" ? "Pick a package" : "Pick an image"}
          </h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <Plus className="w-4 h-4 rotate-45" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {kind === "block" && (
            <>
              {editorKind === "proposal" && (
                <>
                  <button
                    onClick={() => onAdvanceTo("package")}
                    className="w-full flex items-center gap-3 p-2.5 rounded text-left hover:bg-secondary"
                  >
                    <PackageIconLucide className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">Package</p>
                      <p className="text-[11px] text-muted-foreground">Pick from your packages library</p>
                    </div>
                  </button>
                  <button
                    onClick={() => onAdvanceTo("image")}
                    className="w-full flex items-center gap-3 p-2.5 rounded text-left hover:bg-secondary"
                  >
                    <ImageIcon className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">Image</p>
                      <p className="text-[11px] text-muted-foreground">Pick or upload to your image library</p>
                    </div>
                  </button>
                  <div className="h-px bg-border my-2" />
                </>
              )}
              {STRUCTURAL_TYPES
                .filter(t => !t.onlyKind || t.onlyKind === editorKind)
                .map(({ type, label, icon: Icon, description, presetSize, presetRole }) => (
                  <button
                    key={`${type}-${label}`}
                    onClick={() => onPickStructural(type, presetSize, presetRole)}
                    className="w-full flex items-center gap-3 p-2.5 rounded text-left hover:bg-secondary"
                  >
                    <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">{label}</p>
                      <p className="text-[11px] text-muted-foreground">{description}</p>
                    </div>
                  </button>
                ))}
            </>
          )}
          {kind === "package" && (
            <PackagePicker libraryPackages={libraryPackages} onPick={onPickPackage} />
          )}
          {kind === "image" && (
            <ImagePickerInPopover library={data.proposalImages} onPick={onPickImage} />
          )}
        </div>
      </div>
    </div>
  );
}

function PackagePicker({ libraryPackages, onPick }: { libraryPackages: Package[]; onPick: (id: string) => void }) {
  if (libraryPackages.length === 0) {
    return (
      <div className="p-6 text-center text-sm text-muted-foreground">
        No packages yet. Build one in <strong>Sales → Packages</strong>, then come back here.
      </div>
    );
  }
  return (
    <div className="space-y-1">
      {libraryPackages.map(pkg => {
        const Icon = ICON_VOCABULARY[pkg.icon] ?? ICON_VOCABULARY.heart;
        return (
          <button
            key={pkg.id}
            onClick={() => onPick(pkg.id)}
            className="w-full flex items-center gap-3 p-2.5 rounded text-left hover:bg-secondary"
          >
            <div className="w-10 h-10 rounded-full bg-slate-900 text-white flex items-center justify-center shrink-0">
              <Icon className="w-4 h-4" strokeWidth={1.5} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{pkg.name || "(unnamed)"}</p>
              <p className="text-[11px] text-muted-foreground line-clamp-1">{pkg.description}</p>
            </div>
            <span className="text-sm font-mono text-foreground shrink-0">${pkg.defaultPrice.toFixed(2)}</span>
          </button>
        );
      })}
    </div>
  );
}

function ImagePickerInPopover({ library, onPick }: { library: ProposalImage[]; onPick: (img: ProposalImage) => void }) {
  const { addProposalImage } = useApp();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    if (file.size > MAX_IMAGE_BYTES) {
      setError(`Image is ${(file.size / 1000).toFixed(0)}KB — please use one under ${MAX_IMAGE_BYTES / 1000}KB.`);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const dataUrl = await fileToDataUrl(file);
      const img = await addProposalImage({
        name: file.name,
        imageDataUrl: dataUrl,
        width: 0,
        height: 0,
        sortOrder: Date.now(),
      });
      onPick(img);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <label className="block w-full p-3 border-2 border-dashed border-border rounded text-center cursor-pointer hover:border-primary/50 hover:bg-secondary/30 transition-colors text-sm text-muted-foreground">
        <input type="file" accept="image/*" onChange={handleFile} className="hidden" disabled={busy} />
        {busy ? "Uploading…" : "Upload new image (≤500KB)"}
      </label>
      {error && <p className="text-xs text-destructive">{error}</p>}
      {library.length === 0 ? (
        <p className="text-center text-xs text-muted-foreground py-4">No images uploaded yet.</p>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {library.map(img => (
            <button
              key={img.id}
              onClick={() => onPick(img)}
              className="aspect-square rounded overflow-hidden border-2 border-transparent hover:border-primary transition-colors"
            >
              <img src={img.imageDataUrl} alt={img.name} className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Unused import suppressor — Pencil + Check imported for potential future
// inline-edit affordances; safe to remove if linter complains.
void Pencil;
void Check;
