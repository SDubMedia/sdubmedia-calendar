// ============================================================
// ReportPreview — Full-screen in-app report preview overlay
// Shows formatted report HTML in an iframe with print/close controls
// ============================================================

import { useEffect, useRef, useCallback } from "react";
import { X, Printer } from "lucide-react";

interface ReportPreviewProps {
  title: string;
  html: string;
  onClose: () => void;
}

const REPORT_STYLES = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #1a1a1a; padding: 40px; font-size: 13px; }
  h1 { font-size: 22px; font-weight: 700; margin-bottom: 4px; color: #111; }
  h2 { font-size: 15px; font-weight: 600; margin: 20px 0 8px; color: #333; border-bottom: 1px solid #e5e5e5; padding-bottom: 4px; }
  .subtitle { color: #666; font-size: 12px; margin-bottom: 24px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
  th { background: #f5f5f5; text-align: left; padding: 8px 10px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #555; border-bottom: 2px solid #e0e0e0; }
  td { padding: 7px 10px; border-bottom: 1px solid #f0f0f0; font-size: 12px; }
  tr:last-child td { border-bottom: none; }
  .total-row td { font-weight: 700; background: #f9f9f9; border-top: 2px solid #e0e0e0; }
  .stat-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 24px; }
  .stat-box { border: 1px solid #e5e5e5; border-radius: 8px; padding: 14px; }
  .stat-label { font-size: 11px; color: #888; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px; }
  .stat-value { font-size: 20px; font-weight: 700; color: #111; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; }
  .badge-green { background: #d1fae5; color: #065f46; }
  .badge-blue { background: #dbeafe; color: #1e40af; }
  .badge-amber { background: #fef3c7; color: #92400e; }
  .badge-gray { background: #f3f4f6; color: #374151; }

  /* Client Invoice Styles */
  .invoice-header { background: #1e293b; color: #fff; padding: 32px; border-radius: 8px; margin-bottom: 24px; }
  .invoice-header h1 { color: #fff; font-size: 26px; margin-bottom: 16px; }
  .invoice-header .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .invoice-header .meta-label { font-size: 11px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em; }
  .invoice-header .meta-value { font-size: 15px; font-weight: 600; color: #fff; margin-top: 2px; }

  .section { margin-bottom: 20px; }
  .section-header { background: #1e293b; color: #fff; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; padding: 8px 14px; border-radius: 4px 4px 0 0; margin-bottom: 0; border: none; }
  .section-body { border: 1px solid #e5e5e5; border-top: none; border-radius: 0 0 4px 4px; padding: 16px; }

  .hours-row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 13px; }
  .hours-row.total { font-weight: 700; border-top: 1px solid #e5e5e5; padding-top: 10px; margin-top: 6px; }
  .hours-row.highlight { font-weight: 700; color: #1e293b; border-top: 2px solid #d97706; padding-top: 10px; margin-top: 6px; }
  .hours-row.highlight .hours-value { color: #1e293b; font-size: 15px; }

  .payment-box { border: 1px solid #e5e5e5; border-top: none; border-radius: 0 0 4px 4px; padding: 20px; }
  .payment-box .amount-due { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
  .payment-box .amount-due .label { font-size: 18px; font-weight: 700; }
  .payment-box .amount-due .value { font-size: 32px; font-weight: 700; color: #111; }
  .payment-box .calc { font-size: 13px; color: #666; margin-bottom: 12px; }
  .payment-box .note { font-size: 12px; color: #888; border-top: 1px solid #e5e5e5; padding-top: 10px; }

  .provider-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
  .provider-grid .col-label { font-size: 12px; font-weight: 600; color: #555; margin-bottom: 4px; }
  .provider-grid .col-value { font-size: 14px; font-weight: 700; color: #111; }

  .snapshot-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 12px; }
  .snapshot-label { font-size: 11px; color: #888; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px; }
  .snapshot-value { font-size: 13px; color: #111; }

  .deliverables-list { list-style: none; padding: 0; }
  .deliverables-list li { padding: 3px 0; font-size: 13px; }
  .deliverables-list li::before { content: "• "; color: #888; }

  .project-card { border: 1px solid #e5e5e5; border-radius: 8px; margin-bottom: 20px; overflow: hidden; page-break-inside: avoid; }
  .project-card-header { display: flex; justify-content: space-between; align-items: flex-start; padding: 16px 20px; }
  .project-card-header .project-name { font-size: 18px; font-weight: 700; color: #111; }
  .project-card-header .project-date { font-size: 13px; color: #666; margin-top: 2px; }
  .project-card-header .hours-badge { background: #d97706; color: #fff; font-size: 13px; font-weight: 700; padding: 4px 12px; border-radius: 6px; }
  .project-card-header .hours-detail { font-size: 12px; color: #888; text-align: right; margin-top: 4px; }
  .project-card-body { padding: 0 20px 20px; }
  .project-card-divider { border: none; border-top: 2px solid #d97706; margin: 0 20px 16px; }

  .project-meta-label { font-size: 11px; font-weight: 600; color: #d97706; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px; margin-top: 12px; }
  .project-meta-value { font-size: 13px; color: #111; margin-bottom: 8px; }

  .crew-entry { display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; border: 1px solid #e5e5e5; border-radius: 6px; margin-bottom: 8px; }
  .crew-entry .crew-role { font-size: 13px; font-weight: 600; color: #111; }
  .crew-entry .crew-name { font-size: 12px; color: #666; }
  .crew-entry .crew-hours { font-size: 15px; font-weight: 700; color: #111; }

  .report-footer { border-top: 1px solid #e5e5e5; padding-top: 16px; margin-top: 32px; font-size: 12px; color: #666; }
  .report-footer p { margin-bottom: 4px; }
  .report-footer .contact { text-align: center; margin-top: 12px; color: #888; }

  @media print { body { padding: 20px; } .project-card { page-break-inside: avoid; } }
`;

export default function ReportPreview({ title, html, onClose }: ReportPreviewProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Write content into iframe once mounted
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const doc = iframe.contentDocument;
    if (!doc) return;

    doc.open();
    doc.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>${title}</title>
        <style>${REPORT_STYLES}</style>
      </head>
      <body>${html}</body>
      </html>
    `);
    doc.close();
  }, [title, html]);

  // Close on Escape key
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const handlePrint = useCallback(() => {
    const iframe = iframeRef.current;
    if (iframe?.contentWindow) {
      iframe.contentWindow.print();
    }
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card">
        <h2 className="text-sm font-semibold text-foreground truncate" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
          {title}
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors text-sm font-medium"
          >
            <Printer className="w-4 h-4" />
            Print / Save PDF
          </button>
          <button
            onClick={onClose}
            className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-muted text-muted-foreground hover:bg-muted/80 transition-colors text-sm font-medium"
          >
            <X className="w-4 h-4" />
            Close
          </button>
        </div>
      </div>

      {/* Report iframe */}
      <div className="flex-1 overflow-auto bg-neutral-200 dark:bg-neutral-800 p-4 flex justify-center">
        <iframe
          ref={iframeRef}
          className="w-full max-w-[850px] bg-white rounded-lg shadow-lg border-0"
          style={{ minHeight: "100%" }}
          title={title}
        />
      </div>
    </div>
  );
}
