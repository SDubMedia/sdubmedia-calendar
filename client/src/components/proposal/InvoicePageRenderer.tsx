// ============================================================
// InvoicePageRenderer — auto-rendering invoice page for multi-page
// contracts (HoneyBook-style Smart File). Pulls payment milestones
// from the contract and renders them as line items with subtotal,
// paid amount, and balance due. No user authoring required — drop
// an "invoice" page type and the data fills in.
//
// Used both in the editor preview (with placeholder demo amounts) and
// in the public sign portal (with real amounts).
// ============================================================

import type { PaymentMilestone, Organization, Client, OrgBusinessInfo } from "@/lib/types";

interface InvoicePageRendererProps {
  // Contract metadata for header/footer
  contractTitle: string;
  contractId?: string;        // becomes the "Invoice #" base
  invoiceNumber?: string;     // explicit override (e.g. INV-0042)
  // Parties
  org?: Pick<Organization, "name" | "businessInfo" | "logoUrl"> | null;
  client?: Pick<Client, "company" | "contactName" | "email" | "address" | "city" | "state" | "zip"> | null;
  // The data
  milestones: PaymentMilestone[];
  // Optional dates
  issueDate?: string;          // ISO YYYY-MM-DD
  // Optional pay-now buttons (sign portal only). When omitted, the
  // unpaid milestones still show but without action buttons.
  onPayNow?: (milestoneId: string) => void;
}

export default function InvoicePageRenderer({
  contractTitle,
  contractId,
  invoiceNumber,
  org,
  client,
  milestones,
  issueDate,
  onPayNow,
}: InvoicePageRendererProps) {
  // Compute totals. For percent milestones we need a base — sum of any
  // fixed milestones is the "real" total; if everything's percent-based
  // the per-row amounts will be 0 (caller should pass amounts via
  // PaymentMilestone.fixedAmount in that case via a precomputation step).
  const fixedTotal = milestones.reduce((s, m) =>
    s + (m.type === "fixed" ? Number(m.fixedAmount ?? 0) : 0), 0);

  function amountFor(m: PaymentMilestone): number {
    if (m.type === "percent") {
      return Math.round(fixedTotal * (m.percent ?? 0) / 100 * 100) / 100;
    }
    return Number(m.fixedAmount ?? 0);
  }

  const subtotal = milestones.reduce((s, m) => s + amountFor(m), 0);
  const paidTotal = milestones.filter(m => m.paidAt).reduce((s, m) => s + amountFor(m), 0);
  const balanceDue = subtotal - paidTotal;

  const bi: Partial<OrgBusinessInfo> = org?.businessInfo || {};
  const orgAddressLine = [bi.address, bi.city, bi.state, bi.zip].filter(Boolean).join(", ");
  const clientAddressLine = client
    ? [client.address, client.city, client.state, client.zip].filter(Boolean).join(", ")
    : "";

  const formattedIssueDate = issueDate
    ? new Date(issueDate + "T00:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
    : new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  const invoiceNum = invoiceNumber || (contractId ? `INV-${contractId.slice(-6).toUpperCase()}` : "INV-DRAFT");

  return (
    <div className="bg-white text-gray-900 px-8 py-10 sm:px-12 sm:py-14 max-w-4xl mx-auto" style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }}>
      {/* Header */}
      <div className="flex items-start justify-between gap-6 mb-10">
        <div>
          {org?.logoUrl
            ? <img src={org.logoUrl} alt={org.name || ""} className="h-12 mb-3 object-contain" />
            : <p className="text-2xl font-semibold mb-1" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{org?.name || "Your Company"}</p>}
          {orgAddressLine && <p className="text-xs text-gray-500">{orgAddressLine}</p>}
          {bi.email && <p className="text-xs text-gray-500">{bi.email}</p>}
          {bi.phone && <p className="text-xs text-gray-500">{bi.phone}</p>}
        </div>
        <div className="text-right">
          <p className="text-3xl font-light text-gray-900" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>INVOICE</p>
          <p className="text-xs text-gray-500 mt-1.5 tabular-nums">{invoiceNum}</p>
          <p className="text-xs text-gray-500 mt-0.5">Issued {formattedIssueDate}</p>
        </div>
      </div>

      {/* Bill-to */}
      <div className="grid grid-cols-2 gap-6 mb-8">
        <div>
          <p className="text-[10px] uppercase tracking-wider font-semibold text-gray-500 mb-1.5">Bill To</p>
          <p className="text-sm font-medium text-gray-900">{client?.company || client?.contactName || "Client"}</p>
          {client?.contactName && client?.company && <p className="text-xs text-gray-600">{client.contactName}</p>}
          {client?.email && <p className="text-xs text-gray-500">{client.email}</p>}
          {clientAddressLine && <p className="text-xs text-gray-500">{clientAddressLine}</p>}
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider font-semibold text-gray-500 mb-1.5">For</p>
          <p className="text-sm font-medium text-gray-900">{contractTitle}</p>
        </div>
      </div>

      {/* Line items */}
      <table className="w-full text-sm mb-6 border-t border-gray-200">
        <thead>
          <tr className="text-left text-[10px] uppercase tracking-wider font-semibold text-gray-500 border-b border-gray-200">
            <th className="py-2.5 pr-3 w-1/2">Description</th>
            <th className="py-2.5 pr-3 hidden sm:table-cell">Due</th>
            <th className="py-2.5 pr-3 text-right">Amount</th>
            <th className="py-2.5 text-right">Status</th>
          </tr>
        </thead>
        <tbody>
          {milestones.length === 0 && (
            <tr>
              <td colSpan={4} className="py-6 text-center text-xs text-gray-400 italic">
                No line items yet — payment schedule appears here once configured.
              </td>
            </tr>
          )}
          {milestones.map((m, i) => {
            const dueLabel = m.dueType === "at_signing"
              ? "At signing"
              : m.dueDate
                ? new Date(m.dueDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                : m.dueType === "relative_days"
                  ? `${m.dueDays ?? 0} days after signing`
                  : "—";
            const paid = !!m.paidAt;
            return (
              <tr key={m.id || i} className="border-b border-gray-100">
                <td className="py-3 pr-3">
                  <p className="text-sm text-gray-900">{m.label || `Payment ${i + 1}`}</p>
                  {m.type === "percent" && (
                    <p className="text-[11px] text-gray-500">{m.percent ?? 0}% of total</p>
                  )}
                </td>
                <td className="py-3 pr-3 text-xs text-gray-600 hidden sm:table-cell">{dueLabel}</td>
                <td className="py-3 pr-3 text-right tabular-nums font-mono text-sm text-gray-900">
                  ${amountFor(m).toFixed(2)}
                </td>
                <td className="py-3 text-right">
                  {paid ? (
                    <span className="text-[10px] uppercase tracking-wider font-semibold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">Paid</span>
                  ) : onPayNow ? (
                    <button
                      onClick={() => onPayNow(m.id || `ms_${i}`)}
                      className="text-[10px] uppercase tracking-wider font-semibold text-white bg-emerald-600 hover:bg-emerald-700 px-2.5 py-1 rounded"
                    >
                      Pay
                    </button>
                  ) : (
                    <span className="text-[10px] uppercase tracking-wider font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded">Due</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Totals */}
      <div className="flex justify-end mb-8">
        <div className="w-64 space-y-1.5 text-sm">
          <div className="flex justify-between text-gray-600">
            <span>Subtotal</span>
            <span className="tabular-nums font-mono">${subtotal.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-emerald-700">
            <span>Paid</span>
            <span className="tabular-nums font-mono">−${paidTotal.toFixed(2)}</span>
          </div>
          <div className="border-t border-gray-300 pt-2 flex justify-between text-base font-semibold text-gray-900">
            <span>Balance Due</span>
            <span className="tabular-nums font-mono">${balanceDue.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-gray-200 pt-4 text-[11px] text-gray-500 leading-relaxed">
        <p>Thanks for your business. Questions about this invoice? Reply to the email this came from and we'll get back to you.</p>
      </div>
    </div>
  );
}
