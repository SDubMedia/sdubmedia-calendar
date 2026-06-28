// ============================================================
// BrokerInvoicePreviewDialog — shows the ACTUAL invoice document a broker's
// month-end bill will produce, BEFORE it's created. Renders the real
// InvoicePDF (the exact file that gets sent) so the owner can eyeball it, then
// a Create button actually saves it. Owner-facing.
// ============================================================

import { useEffect, useState } from "react";
import { pdf } from "@react-pdf/renderer";
import InvoicePDF from "@/components/InvoicePDF";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FileText, Maximize2 } from "lucide-react";
import type { Client, Invoice } from "@/lib/types";

type InvoiceDraft = Omit<Invoice, "id" | "createdAt" | "updatedAt">;

interface Props {
  broker: Client | null;
  draft: InvoiceDraft | null;
  monthLabel: string;
  creating: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function BrokerInvoicePreviewDialog({ broker, draft, monthLabel, creating, onConfirm, onCancel }: Props) {
  const open = !!broker && !!draft;
  const [url, setUrl] = useState<string | null>(null);
  const [building, setBuilding] = useState(false);

  // Render the real invoice document to a PDF when the dialog opens. Same
  // mechanism the Invoices page uses to preview/send — this is the exact file
  // the broker receives, just not saved yet.
  useEffect(() => {
    if (!open || !draft) return;
    let cancelled = false;
    let objectUrl: string | null = null;
    setBuilding(true);
    (async () => {
      try {
        const invoice = { ...draft, id: "preview", createdAt: "", updatedAt: "" } as Invoice;
        const blob = await pdf(<InvoicePDF invoice={invoice} />).toBlob();
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      } catch {
        if (!cancelled) setUrl(null);
      } finally {
        if (!cancelled) setBuilding(false);
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setUrl(null);
    };
  }, [open, draft]);

  return (
    <Dialog open={open} onOpenChange={o => !o && onCancel()}>
      <DialogContent className="bg-card border-border text-foreground max-w-6xl w-[98vw] sm:w-[96vw] p-0 overflow-hidden flex flex-col max-h-[95vh]">
        <DialogHeader className="px-5 pt-5 pb-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <DialogTitle className="flex items-center gap-2" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                <FileText className="w-4 h-4 text-primary" /> Invoice preview
              </DialogTitle>
              <p className="text-sm text-muted-foreground mt-1">{broker?.company} · {monthLabel} — this is exactly what gets sent.</p>
            </div>
            {url && (
              <Button variant="outline" size="sm" onClick={() => window.open(url, "_blank")} className="border-border gap-1.5 shrink-0" title="Open full size to zoom in">
                <Maximize2 className="w-3.5 h-3.5" /> Full size
              </Button>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">Tip: pinch or ⌘-scroll to zoom in the preview, or tap Full size for the zoomable viewer.</p>
        </DialogHeader>

        <div className="flex-1 min-h-[80vh] bg-muted/30 border-y border-border">
          {building && <div className="h-full min-h-[80vh] flex items-center justify-center text-sm text-muted-foreground">Building preview…</div>}
          {!building && url && <iframe src={url} title="Invoice preview" className="w-full h-full min-h-[80vh]" />}
          {!building && !url && <div className="h-full min-h-[80vh] flex items-center justify-center text-sm text-muted-foreground">Couldn't build the preview.</div>}
        </div>

        <div className="flex items-center justify-end gap-2 flex-wrap px-5 py-4">
          <Button variant="outline" onClick={onCancel} disabled={creating} className="border-border">Cancel</Button>
          <Button onClick={onConfirm} disabled={creating || building} className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90">
            <FileText className="w-4 h-4" /> {creating ? "Creating…" : "Create invoice"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
