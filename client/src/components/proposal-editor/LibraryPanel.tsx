// ============================================================
// LibraryPanel — draggable library cards in the proposal editor's
// right sidebar. Drag a Package or Image onto an InsertBar in the
// canvas to drop it as a new block.
//
// Click-to-add via the canvas + button is still the mobile path;
// drag-and-drop here is the desktop fast path Geoff specifically
// asked for.
// ============================================================

import { useDraggable } from "@dnd-kit/core";
import { Image as ImageIcon } from "lucide-react";
import { Link } from "wouter";
import type { Package, ProposalImage } from "@/lib/types";
import { ICON_VOCABULARY } from "@/components/proposal/icons";
import { cn } from "@/lib/utils";

export interface LibraryDragData {
  source: "package" | "image";
  packageId?: string;
  imageId?: string;
  imageDataUrl?: string;
  packageName?: string;
}

interface LibraryPanelProps {
  packages: Package[];
  images: ProposalImage[];
  // Click-to-add: parent appends the picked item to the active page so
  // mobile users (and anyone who'd rather click than drag) get parity
  // with the contract editor's `+` flow. Drag-and-drop for desktop still
  // works through the dnd-kit DragEndEvent on the parent.
  onAddPackage?: (packageId: string) => void;
  onAddImage?: (image: ProposalImage) => void;
}

export function LibraryPanel({ packages, images, onAddPackage, onAddImage }: LibraryPanelProps) {
  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Packages library
          </h3>
          <Link to="/packages" className="text-[10px] text-primary hover:underline">
            Manage
          </Link>
        </div>
        {packages.length === 0 ? (
          <p className="text-[11px] text-muted-foreground italic">
            No packages yet. <Link to="/packages" className="text-primary hover:underline">Add one</Link> to drag onto pages.
          </p>
        ) : (
          <div className="space-y-1.5">
            {packages.map(pkg => (
              <DraggablePackageCard key={pkg.id} pkg={pkg} onClickAdd={onAddPackage} />
            ))}
          </div>
        )}
      </div>

      <div>
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
          Image library
        </h3>
        {images.length === 0 ? (
          <p className="text-[11px] text-muted-foreground italic">
            No images yet. Upload one in any image block to start your library.
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-1.5">
            {images.map(img => (
              <DraggableImageThumb key={img.id} img={img} onClickAdd={onAddImage} />
            ))}
          </div>
        )}
      </div>

      <div className="text-[10px] text-muted-foreground/70 italic leading-relaxed pt-2 border-t border-border">
        Click any card to add it to the current page, or drag onto a specific spot.
      </div>
    </div>
  );
}

// ---- Draggable cards ----

function DraggablePackageCard({ pkg, onClickAdd }: { pkg: Package; onClickAdd?: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `pkg-${pkg.id}`,
    data: {
      source: "package",
      packageId: pkg.id,
      packageName: pkg.name,
    } satisfies LibraryDragData,
  });
  const Icon = ICON_VOCABULARY[pkg.icon] ?? ICON_VOCABULARY.heart;
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      // Pointer-up adds to the page when no drag started (dnd-kit's
      // distance:4 activation means clicks below 4px movement bypass
      // the drag handler entirely). onClick on top of dnd-kit listeners
      // can fight; pointerup is reliable for both mouse and touch.
      onClick={(e) => {
        if (isDragging) return;
        e.stopPropagation();
        onClickAdd?.(pkg.id);
      }}
      className={cn(
        "flex items-center gap-2 p-2 rounded border border-border bg-card cursor-pointer hover:border-primary/40 hover:bg-secondary active:cursor-grabbing transition-all",
        isDragging && "opacity-30",
      )}
      title="Click to add — or drag for precise placement"
    >
      <div className="w-8 h-8 rounded-full bg-slate-900 text-white flex items-center justify-center shrink-0">
        <Icon className="w-3.5 h-3.5" strokeWidth={1.5} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-foreground truncate">
          {pkg.name || "(unnamed)"}
        </p>
        <p className="text-[10px] text-muted-foreground font-mono">
          ${pkg.defaultPrice.toFixed(2)}
        </p>
      </div>
    </div>
  );
}

function DraggableImageThumb({ img, onClickAdd }: { img: ProposalImage; onClickAdd?: (img: ProposalImage) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `img-${img.id}`,
    data: {
      source: "image",
      imageId: img.id,
      imageDataUrl: img.imageDataUrl,
    } satisfies LibraryDragData,
  });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={(e) => {
        if (isDragging) return;
        e.stopPropagation();
        onClickAdd?.(img);
      }}
      className={cn(
        "aspect-square rounded overflow-hidden border border-border bg-card cursor-pointer hover:border-primary/40 active:cursor-grabbing transition-opacity",
        isDragging && "opacity-30",
      )}
      title={`${img.name || "Image"} — click to add`}
    >
      {img.imageDataUrl ? (
        <img src={img.imageDataUrl} alt={img.name} className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-muted-foreground">
          <ImageIcon className="w-4 h-4" />
        </div>
      )}
    </div>
  );
}
