// ============================================================
// PhotoEditorCalculator — Image-based billing calculator
// Shows on project detail when a photo editor is in post-production.
// Calculates hours to bill from image count, with editable final hours.
// For partner clients, shows internal profit split.
// ============================================================

import { useState, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ImageIcon, Calculator, Save } from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import type { Project, Client, EditorBilling } from "@/lib/types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const DEFAULT_RATE_PER_IMAGE = 6;
const CLIENT_RATE_PER_HOUR = 200;

interface Props {
  project: Project;
  client: Client;
  editorName: string;
}

function calcSuggestedHours(imageCount: number, mode: "standard" | "event", perImageRate: number): number {
  const editorCost = imageCount * perImageRate;
  if (mode === "standard") {
    return (editorCost * 2) / CLIENT_RATE_PER_HOUR;
  }
  return editorCost / CLIENT_RATE_PER_HOUR + 1;
}

export default function PhotoEditorCalculator({ project, client, editorName }: Props) {
  const { updateProject } = useApp();

  const saved = project.editorBilling;
  const [imageCount, setImageCount] = useState(saved?.imageCount ?? 0);
  const [billingMode, setBillingMode] = useState<"standard" | "event">(saved?.billingMode ?? "standard");
  const [finalHours, setFinalHours] = useState(saved?.finalHours ?? 0);
  const [perImageRate, setPerImageRate] = useState(saved?.perImageRate ?? DEFAULT_RATE_PER_IMAGE);
  const [saving, setSaving] = useState(false);

  const editorCost = imageCount * perImageRate;
  const suggestedHours = calcSuggestedHours(imageCount, billingMode, perImageRate);
  const invoiceTotal = finalHours * CLIENT_RATE_PER_HOUR;
  const profit = invoiceTotal - editorCost;

  // Update final hours when image count, mode, or rate changes (only if user hasn't manually overridden)
  const [userOverride, setUserOverride] = useState(false);
  useEffect(() => {
    if (!userOverride && imageCount > 0) {
      setFinalHours(Math.round(suggestedHours * 100) / 100);
    }
  }, [imageCount, billingMode, perImageRate, suggestedHours, userOverride]);

  // Sync from saved data when project changes
  useEffect(() => {
    if (saved) {
      setImageCount(saved.imageCount);
      setBillingMode(saved.billingMode);
      setFinalHours(saved.finalHours);
      setPerImageRate(saved.perImageRate ?? DEFAULT_RATE_PER_IMAGE);
      setUserOverride(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  const handleFinalHoursChange = (val: string) => {
    setUserOverride(true);
    setFinalHours(Number(val) || 0);
  };

  const handleImageCountChange = (val: string) => {
    setUserOverride(false);
    setImageCount(Number(val) || 0);
  };

  const handleModeChange = (mode: "standard" | "event") => {
    setUserOverride(false);
    setBillingMode(mode);
  };

  const handlePerImageRateChange = (val: string) => {
    setUserOverride(false);
    setPerImageRate(Number(val) || 0);
  };

  // Auto-save whenever calculator values change (debounced)
  const [autoSaveTimer, setAutoSaveTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (imageCount <= 0) return;
    if (autoSaveTimer) clearTimeout(autoSaveTimer);
    const timer = setTimeout(async () => {
      try {
        const billing: EditorBilling = { imageCount, billingMode, finalHours, perImageRate };
        await updateProject(project.id, { editorBilling: billing });
      } catch {
        toast.error("Auto-save failed — use Save button");
      }
    }, 800);
    setAutoSaveTimer(timer);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageCount, billingMode, finalHours, perImageRate]);

  const handleSave = useCallback(async () => {
    if (imageCount <= 0) {
      toast.error("Enter an image count first");
      return;
    }
    setSaving(true);
    try {
      const billing: EditorBilling = { imageCount, billingMode, finalHours, perImageRate };
      await updateProject(project.id, { editorBilling: billing });
      toast.success("Editor billing saved");
    } catch (err: any) {
      toast.error(err.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  }, [imageCount, billingMode, finalHours, perImageRate, project.id, updateProject]);

  const hasPartnerSplit = client.partnerSplit != null;
  const split = client.partnerSplit;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider">
        <Calculator className="w-3.5 h-3.5" /> Photo Editor Billing
      </div>

      <div className="bg-secondary rounded-lg p-4 space-y-4">
        {/* Editor name */}
        <div className="flex items-center gap-2 text-sm">
          <ImageIcon className="w-4 h-4 text-muted-foreground" />
          <span className="text-muted-foreground">Editor:</span>
          <span className="font-medium">{editorName}</span>
        </div>

        {/* Image count and per-image rate */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Images Edited</label>
            <Input
              type="number"
              min={0}
              value={imageCount || ""}
              onChange={(e) => handleImageCountChange(e.target.value)}
              placeholder="Enter image count"
              className="bg-background border-border tabular-nums"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Rate per Image</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
              <Input
                type="number"
                min={0}
                step={0.5}
                value={perImageRate || ""}
                onChange={(e) => handlePerImageRateChange(e.target.value)}
                className="bg-background border-border tabular-nums pl-7"
              />
            </div>
          </div>
        </div>

        {/* Billing mode toggle */}
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground">Billing Mode</label>
          <div className="flex gap-2">
            <button
              onClick={() => handleModeChange("standard")}
              className={cn(
                "flex-1 text-sm rounded-md px-3 py-2 transition-colors border",
                billingMode === "standard"
                  ? "bg-primary/20 border-primary/40 text-primary"
                  : "bg-background border-border text-muted-foreground hover:text-foreground"
              )}
            >
              Standard (2x)
            </button>
            <button
              onClick={() => handleModeChange("event")}
              className={cn(
                "flex-1 text-sm rounded-md px-3 py-2 transition-colors border",
                billingMode === "event"
                  ? "bg-primary/20 border-primary/40 text-primary"
                  : "bg-background border-border text-muted-foreground hover:text-foreground"
              )}
            >
              Event (+1 hr)
            </button>
          </div>
        </div>

        {imageCount > 0 && (
          <>
            <Separator className="bg-border" />

            {/* Calculation breakdown */}
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>Editor Cost ({imageCount} x ${perImageRate})</span>
                <span className="tabular-nums">${editorCost.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Suggested Hours</span>
                <span className="tabular-nums">{suggestedHours.toFixed(2)} hrs</span>
              </div>
            </div>

            {/* Editable final hours */}
            <div className="space-y-1.5">
              <label className="text-xs text-primary font-medium">Final Hours to Bill</label>
              <Input
                type="number"
                min={0}
                step={0.5}
                value={finalHours || ""}
                onChange={(e) => handleFinalHoursChange(e.target.value)}
                className="bg-background border-primary/40 text-primary font-medium tabular-nums text-lg"
              />
            </div>

            {/* Invoice total */}
            <div className="bg-primary/10 border border-primary/20 rounded-md p-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Client Invoice Total</span>
                <span className="text-xl font-bold text-primary tabular-nums" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                  ${invoiceTotal.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {finalHours} hrs x ${CLIENT_RATE_PER_HOUR}/hr
              </div>
            </div>

            {/* Partner profit split (only for clients with partnerSplit configured) */}
            {hasPartnerSplit && split && profit > 0 && (
              <div className="space-y-2">
                <div className="text-xs text-muted-foreground uppercase tracking-wider">Profit Split</div>
                <div className="bg-background rounded-md p-3 space-y-2 border border-border">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Profit</span>
                    <span className="tabular-nums font-medium">${profit.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
                  </div>
                  <Separator className="bg-border" />
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{split.partnerName} ({(split.partnerPercent * 100).toFixed(0)}%)</span>
                    <span className="tabular-nums">${(profit * split.partnerPercent).toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Geoff Southworth ({(split.adminPercent * 100).toFixed(0)}%)</span>
                    <span className="tabular-nums">${(profit * split.adminPercent).toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Marketing Budget ({(split.marketingPercent * 100).toFixed(0)}%)</span>
                    <span className="tabular-nums">${(profit * split.marketingPercent).toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Save button */}
            <Button
              onClick={handleSave}
              disabled={saving}
              className="w-full bg-primary text-primary-foreground hover:bg-primary/90 gap-2"
            >
              <Save className="w-4 h-4" />
              {saving ? "Saving..." : "Save Editor Billing"}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
