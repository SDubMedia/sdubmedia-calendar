// ============================================================
// Icon vocabulary for proposal package_row blocks.
//
// Curated Lucide icon set rendered inside a navy circle (see
// ProposalBlockRenderer's PackageIcon). Custom SVG upload is a
// Phase 2 / Growth feature — keep this list small and intentional.
//
// Lives in its own file so it can be imported by both the renderer
// and the editor without tripping react-refresh's "only export
// components" rule.
// ============================================================

import {
  Heart,
  Camera,
  Clapperboard,
  GlassWater,
  UtensilsCrossed,
  CalendarDays,
  Gauge,
  Sparkles,
  Film,
  Mic,
  Sun,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export const ICON_VOCABULARY: Record<string, LucideIcon> = {
  heart: Heart,
  camera: Camera,
  cameras: Clapperboard, // "additional videographer" maps to clapperboard
  champagne: GlassWater,
  plate: UtensilsCrossed,
  calendar: CalendarDays,
  gauge: Gauge,
  sparkles: Sparkles,
  film: Film,
  mic: Mic,
  sun: Sun,
};

export const PACKAGE_ICON_KEYS = Object.keys(ICON_VOCABULARY);
