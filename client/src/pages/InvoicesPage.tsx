// ============================================================
// InvoicesPage — Create, manage, and send invoices
// ============================================================

import { useState, useMemo } from "react";
import { useScopedData as useApp } from "@/hooks/useScopedData";
import { buildInvoice, generateInvoiceNumberFromDB } from "@/lib/invoice";
import { supabase } from "@/lib/supabase";
import type { Invoice, InvoiceStatus } from "@/lib/types";
import { pdf } from "@react-pdf/renderer";
import InvoicePDF from "@/components/InvoicePDF";
import { Plus, Download, Send, CheckCircle, XCircle, Eye, Trash2, FileText, X, CreditCard, DollarSign, Clock } from "lucide-react";
import { toast } from "sonner";
import { getAuthToken } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import TestimonialPromptDialog from "@/components/TestimonialPromptDialog";

const STATUS_COLORS: Record<InvoiceStatus, string> = {
  draft: "bg-zinc-500/20 text-zinc-300 border-zinc-500/30",
  sent: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  paid: "bg-green-500/20 text-green-300 border-green-500/30",
  void: "bg-red-500/20 text-red-300 border-red-500/30",
};

const STATUS_LABELS: Record<InvoiceStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  paid: "Paid",
  void: "Void",
};

function formatDate(d: string): string {
  if (!d) return "";
  const [y, m, day] = d.split("-");
  return `${m}/${day}/${y}`;
}

function formatCurrency(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Get first and last day of previous month as YYYY-MM-DD */
function getCurrentMonthRange(): [string, string] {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return [fmt(first), fmt(last)];
}

export default function InvoicesPage() {
  const { data, addInvoice, updateInvoice, deleteInvoice } = useApp();
  const [showCreate, setShowCreate] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState("");
  const [periodStart, setPeriodStart] = useState(() => getCurrentMonthRange()[0]);
  const [periodEnd, setPeriodEnd] = useState(() => getCurrentMonthRange()[1]);
  const [creating, setCreating] = useState(false);
  const [previewInvoice, setPreviewInvoice] = useState<Invoice | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<InvoiceStatus | "all">("all");
  const [creatingPaymentLink, setCreatingPaymentLink] = useState<string | null>(null);
  const [paymentLinks, setPaymentLinks] = useState<Record<string, string>>({});
  const [testimonialOpen, setTestimonialOpen] = useState(false);

  async function createPaymentLink(invoiceId: string) {
    const orgId = data.organization?.id;
    if (!orgId) { toast.error("Organization not found"); return; }

    setCreatingPaymentLink(invoiceId);
    try {
      const token = await getAuthToken();
      const res = await fetch("/api/stripe-payment?action=create-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ invoiceId, orgId }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Failed to create payment link");

      if (result.url) {
        setPaymentLinks(prev => ({ ...prev, [invoiceId]: result.url }));
        toast.success("Payment link created!");
      }
    } catch (e: any) {
      toast.error(e.message || "Failed to create payment link");
    } finally {
      setCreatingPaymentLink(null);
    }
  }
  const [filterClient, setFilterClient] = useState<string>("all");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [sendEmail, setSendEmail] = useState("");
  const [sendMessage, setSendMessage] = useState("");

  // Filter invoices
  const filteredInvoices = useMemo(() => {
    return data.invoices.filter(inv => {
      if (filterStatus !== "all" && inv.status !== filterStatus) return false;
      if (filterClient !== "all" && inv.clientId !== filterClient) return false;
      return true;
    });
  }, [data.invoices, filterStatus, filterClient]);

  // Preview line items before creating
  const previewLineItems = useMemo(() => {
    if (!selectedClientId || !periodStart || !periodEnd) return [];
    const client = data.clients.find(c => c.id === selectedClientId);
    if (!client) return [];
    const draft = buildInvoice(client, data.projects, data.projectTypes, data.locations, data.invoices, periodStart, periodEnd, data.organization);
    return draft.lineItems;
  }, [selectedClientId, periodStart, periodEnd, data]);

  const previewTotal = previewLineItems.reduce((s, li) => s + li.amount, 0);

  const handleCreate = async () => {
    const client = data.clients.find(c => c.id === selectedClientId);
    if (!client) { toast.error("Please select a client"); return; }
    if (previewLineItems.length === 0) { toast.error("No projects found in this date range"); return; }

    setCreating(true);
    try {
      const draft = buildInvoice(client, data.projects, data.projectTypes, data.locations, data.invoices, periodStart, periodEnd, data.organization);
      // Get invoice number from DB to avoid collisions with soft-deleted invoices
      draft.invoiceNumber = await generateInvoiceNumberFromDB(supabase);
      await addInvoice(draft);
      toast.success(`Invoice ${draft.invoiceNumber} created`);
      setShowCreate(false);
      setSelectedClientId("");
    } catch (err: any) {
      toast.error(err.message || "Failed to create invoice");
    } finally {
      setCreating(false);
    }
  };

  const handleDownload = async (invoice: Invoice) => {
    try {
      const blob = await pdf(<InvoicePDF invoice={invoice} />).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${invoice.invoiceNumber}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (_err: any) {
      toast.error("Failed to generate PDF");
    }
  };

  const handlePreview = async (invoice: Invoice) => {
    try {
      const blob = await pdf(<InvoicePDF invoice={invoice} />).toBlob();
      const url = URL.createObjectURL(blob);
      setPreviewInvoice(invoice);
      setPreviewUrl(url);
    } catch (_err: any) {
      toast.error("Failed to generate preview");
    }
  };

  const closePreview = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewInvoice(null);
    setPreviewUrl(null);
  };

  const handleMarkPaid = async (id: string) => {
    try {
      // Check if this is the org's first-ever paid invoice (before we flip it).
      const wasFirstPaid =
        !data.invoices.some((i) => i.status === "paid") &&
        !data.organization?.testimonialPromptedAt;
      await updateInvoice(id, { status: "paid", paidDate: new Date().toISOString().slice(0, 10) });
      toast.success("Invoice marked as paid");
      if (wasFirstPaid) {
        // Small delay so the mark-paid toast lands first.
        setTimeout(() => setTestimonialOpen(true), 400);
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to update");
    }
  };

  const handleVoid = async (id: string) => {
    try {
      await updateInvoice(id, { status: "void" });
      toast.success("Invoice voided");
    } catch (err: any) {
      toast.error(err.message || "Failed to void");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteInvoice(id);
      toast.success("Invoice deleted");
      setConfirmDelete(null);
    } catch (err: any) {
      toast.error(err.message || "Failed to delete");
    }
  };

  const openSendDialog = (inv: Invoice) => {
    const client = data.clients.find(c => c.id === inv.clientId);
    setSendingId(inv.id);
    setSendEmail(client?.email || inv.clientInfo.email || "");
    setSendMessage("");
  };

  const handleSendEmail = async () => {
    if (!sendingId || !sendEmail) { toast.error("Please enter an email address"); return; }
    const invoice = data.invoices.find(i => i.id === sendingId);
    if (!invoice) return;

    try {
      const blob = await pdf(<InvoicePDF invoice={invoice} />).toBlob();
      const formData = new FormData();
      formData.append("pdf", blob, `${invoice.invoiceNumber}.pdf`);
      formData.append("invoiceId", invoice.id);
      formData.append("recipientEmail", sendEmail);
      formData.append("subject", `Invoice ${invoice.invoiceNumber} from Slate by SDub Media`);
      formData.append("message", sendMessage);
      formData.append("invoiceNumber", invoice.invoiceNumber);
      formData.append("total", String(invoice.total));
      formData.append("clientName", invoice.clientInfo.contactName || invoice.clientInfo.company || "");

      const token = await getAuthToken();
      const res = await fetch("/api/send-invoice", { method: "POST", body: formData, headers: { "Authorization": `Bearer ${token}` } });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed to send" }));
        throw new Error(err.error || "Failed to send");
      }

      await updateInvoice(invoice.id, { status: "sent" });
      toast.success(`Invoice emailed to ${sendEmail}`);
      setSendingId(null);
    } catch (err: any) {
      toast.error(err.message || "Failed to send invoice");
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-border bg-card/50">
        <div>
          <h1 className="text-xl font-semibold text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            Invoices
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Create and manage client invoices</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-3 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors text-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Create Invoice</span>
        </button>
      </div>

      <div className="flex-1 overflow-auto p-3 sm:p-6 space-y-5">
        {/* Summary Stats */}
        {data.invoices.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {(() => {
              const outstanding = data.invoices.filter(i => i.status === "sent").reduce((s, i) => s + i.total, 0);
              const thisMonth = new Date().toISOString().slice(0, 7);
              const paidThisMonth = data.invoices.filter(i => i.status === "paid" && i.paidDate?.startsWith(thisMonth)).reduce((s, i) => s + i.total, 0);
              const draftCount = data.invoices.filter(i => i.status === "draft").length;
              const totalPaid = data.invoices.filter(i => i.status === "paid").reduce((s, i) => s + i.total, 0);
              return (
                <>
                  <div className="bg-card border border-border rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <Clock className="w-4 h-4 text-amber-400" />
                      <span className="text-xs text-muted-foreground">Outstanding</span>
                    </div>
                    <p className="text-xl font-bold text-foreground font-mono">{formatCurrency(outstanding)}</p>
                    <p className="text-[10px] text-muted-foreground">{data.invoices.filter(i => i.status === "sent").length} sent</p>
                  </div>
                  <div className="bg-card border border-border rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <DollarSign className="w-4 h-4 text-green-400" />
                      <span className="text-xs text-muted-foreground">Paid This Month</span>
                    </div>
                    <p className="text-xl font-bold text-foreground font-mono">{formatCurrency(paidThisMonth)}</p>
                  </div>
                  <div className="bg-card border border-border rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <CheckCircle className="w-4 h-4 text-blue-400" />
                      <span className="text-xs text-muted-foreground">Total Collected</span>
                    </div>
                    <p className="text-xl font-bold text-foreground font-mono">{formatCurrency(totalPaid)}</p>
                  </div>
                  <div className="bg-card border border-border rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <FileText className="w-4 h-4 text-zinc-400" />
                      <span className="text-xs text-muted-foreground">Drafts</span>
                    </div>
                    <p className="text-xl font-bold text-foreground">{draftCount}</p>
                    <p className="text-[10px] text-muted-foreground">{data.invoices.length} total invoices</p>
                  </div>
                </>
              );
            })()}
          </div>
        )}

        {/* Create Invoice Form */}
        {showCreate && (
          <div className="bg-card border border-border rounded-lg p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                Create New Invoice
              </h3>
              <button onClick={() => setShowCreate(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-muted-foreground uppercase tracking-wider block mb-1">Client</label>
                <select
                  value={selectedClientId}
                  onChange={e => setSelectedClientId(e.target.value)}
                  className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="">Select client...</option>
                  {data.clients.map(c => (
                    <option key={c.id} value={c.id}>{c.company}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground uppercase tracking-wider block mb-1">Period Start</label>
                <input
                  type="date"
                  value={periodStart}
                  onChange={e => setPeriodStart(e.target.value)}
                  className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground uppercase tracking-wider block mb-1">Period End</label>
                <input
                  type="date"
                  value={periodEnd}
                  onChange={e => setPeriodEnd(e.target.value)}
                  className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>

            {/* Preview line items */}
            {selectedClientId && previewLineItems.length > 0 && (
              <div className="border border-border rounded-md overflow-hidden">
                <div className="bg-secondary/50 px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Line Items Preview
                </div>
                <div className="divide-y divide-border">
                  {previewLineItems.map((li, i) => (
                    <div key={i} className="flex items-center justify-between px-3 py-2 text-sm">
                      <div className="flex-1 min-w-0">
                        <span className="text-muted-foreground mr-2">{formatDate(li.date)}</span>
                        <span className="text-foreground">{li.description}</span>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground shrink-0">
                        <span>{li.quantity % 1 === 0 ? li.quantity : li.quantity.toFixed(1)} × {formatCurrency(li.unitPrice)}</span>
                        <span className="font-semibold text-foreground">{formatCurrency(li.amount)}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex justify-end px-3 py-2 bg-secondary/30 border-t border-border">
                  <span className="text-sm font-semibold text-foreground">Total: {formatCurrency(previewTotal)}</span>
                </div>
              </div>
            )}

            {selectedClientId && previewLineItems.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">No projects found for this client in the selected date range.</p>
            )}

            <div className="flex justify-end">
              <button
                onClick={handleCreate}
                disabled={creating || previewLineItems.length === 0}
                className="px-4 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors text-sm font-medium disabled:opacity-50"
              >
                {creating ? "Creating..." : "Create Invoice"}
              </button>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <select
            value={filterClient}
            onChange={e => setFilterClient(e.target.value)}
            className="bg-background border border-border rounded-md px-3 py-1.5 text-sm text-foreground"
          >
            <option value="all">All Clients</option>
            {data.clients.map(c => (
              <option key={c.id} value={c.id}>{c.company}</option>
            ))}
          </select>
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value as InvoiceStatus | "all")}
            className="bg-background border border-border rounded-md px-3 py-1.5 text-sm text-foreground"
          >
            <option value="all">All Statuses</option>
            <option value="draft">Draft</option>
            <option value="sent">Sent</option>
            <option value="paid">Paid</option>
            <option value="void">Void</option>
          </select>
        </div>

        {/* Invoice List */}
        <div className="space-y-3">
          {filteredInvoices.length === 0 ? (
            <div className="bg-card border border-border rounded-lg p-8 text-center">
              <FileText className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">No invoices yet</p>
              <p className="text-sm text-muted-foreground/60 mt-1">Create your first invoice to get started.</p>
            </div>
          ) : (
            filteredInvoices.map(inv => {
              const client = data.clients.find(c => c.id === inv.clientId);
              return (
                <div key={inv.id} className="bg-card border border-border rounded-lg p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-semibold text-foreground">{inv.invoiceNumber}</span>
                        <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded border", STATUS_COLORS[inv.status])}>
                          {STATUS_LABELS[inv.status]}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">{client?.company || inv.clientInfo.company}</p>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-xs text-muted-foreground">
                        <span>Period: {formatDate(inv.periodStart)} — {formatDate(inv.periodEnd)}</span>
                        <span>Issued: {formatDate(inv.issueDate)}</span>
                        {inv.paidDate && <span>Paid: {formatDate(inv.paidDate)}</span>}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-lg font-semibold text-foreground">{formatCurrency(inv.total)}</p>
                      <p className="text-xs text-muted-foreground">{inv.lineItems.length} item{inv.lineItems.length !== 1 ? "s" : ""}</p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-border">
                    <button onClick={() => handlePreview(inv)} className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-secondary text-muted-foreground hover:text-foreground transition-colors">
                      <Eye className="w-3.5 h-3.5" /> Preview
                    </button>
                    <button onClick={() => handleDownload(inv)} className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-secondary text-muted-foreground hover:text-foreground transition-colors">
                      <Download className="w-3.5 h-3.5" /> Download
                    </button>
                    {(inv.status === "draft" || inv.status === "sent") && (
                      <button onClick={() => openSendDialog(inv)} className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-blue-500/20 text-blue-300 hover:bg-blue-500/30 transition-colors">
                        <Send className="w-3.5 h-3.5" /> Email
                      </button>
                    )}
                    {(inv.status === "draft" || inv.status === "sent") && (
                      <button onClick={() => handleMarkPaid(inv.id)} className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-green-500/20 text-green-300 hover:bg-green-500/30 transition-colors">
                        <CheckCircle className="w-3.5 h-3.5" /> Mark Paid
                      </button>
                    )}
                    {inv.status !== "void" && inv.status !== "paid" && !paymentLinks[inv.id] && (
                      <button
                        onClick={() => createPaymentLink(inv.id)}
                        disabled={creatingPaymentLink === inv.id}
                        className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-green-500/10 text-green-400 hover:bg-green-500/20 transition-colors"
                      >
                        <CreditCard className="w-3.5 h-3.5" />
                        {creatingPaymentLink === inv.id ? "Creating..." : "Payment Link"}
                      </button>
                    )}
                    {paymentLinks[inv.id] && (
                      <div className="flex items-center gap-1">
                        <a href={paymentLinks[inv.id]} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-green-500/20 text-green-300 hover:bg-green-500/30 transition-colors">
                          <CreditCard className="w-3.5 h-3.5" /> Open Link
                        </a>
                        <button
                          onClick={() => {
                            const input = document.createElement("textarea");
                            input.value = paymentLinks[inv.id];
                            document.body.appendChild(input);
                            input.select();
                            document.execCommand("copy");
                            document.body.removeChild(input);
                            toast.success("Link copied!");
                          }}
                          className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                        >
                          Copy
                        </button>
                      </div>
                    )}
                    {inv.status !== "void" && inv.status !== "paid" && (
                      <button onClick={() => handleVoid(inv.id)} className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors">
                        <XCircle className="w-3.5 h-3.5" /> Void
                      </button>
                    )}
                    {(inv.status === "draft" || inv.status === "void") && (
                      confirmDelete === inv.id ? (
                        <div className="flex items-center gap-1 ml-auto">
                          <button onClick={() => handleDelete(inv.id)} className="text-xs px-2 py-1 rounded bg-red-500/20 text-red-400 hover:bg-red-500/30">Confirm</button>
                          <button onClick={() => setConfirmDelete(null)} className="text-xs px-2 py-1 rounded bg-secondary text-muted-foreground">Cancel</button>
                        </div>
                      ) : (
                        <button onClick={() => setConfirmDelete(inv.id)} className="flex items-center gap-1 text-xs px-2 py-1 rounded text-muted-foreground hover:text-red-400 transition-colors ml-auto">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )
                    )}
                  </div>

                  {/* Send Email Inline Form */}
                  {sendingId === inv.id && (
                    <div className="mt-3 p-3 bg-secondary/50 rounded-lg space-y-3 border border-border">
                      {!sendEmail && (
                        <div className="text-xs text-amber-400 bg-amber-400/10 border border-amber-400/20 rounded-md px-3 py-2">
                          This client has no email on file. Add one on the <a href="/clients" className="underline hover:text-amber-300">Clients page</a> or enter one below.
                        </div>
                      )}
                      <div>
                        <label className="text-xs text-muted-foreground uppercase tracking-wider block mb-1">Recipient Email</label>
                        <input
                          type="email"
                          value={sendEmail}
                          onChange={e => setSendEmail(e.target.value)}
                          className="w-full bg-background border border-border rounded-md px-3 py-1.5 text-xs text-foreground"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground uppercase tracking-wider block mb-1">Message (optional)</label>
                        <textarea
                          value={sendMessage}
                          onChange={e => setSendMessage(e.target.value)}
                          rows={2}
                          placeholder="Add a personal message..."
                          className="w-full bg-background border border-border rounded-md px-3 py-1.5 text-xs text-foreground resize-none"
                        />
                      </div>
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => setSendingId(null)} className="text-xs px-3 py-1.5 rounded bg-secondary text-muted-foreground hover:text-foreground">
                          Cancel
                        </button>
                        <button onClick={handleSendEmail} className="text-xs px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-500">
                          Send Invoice
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* PDF Preview Modal */}
      {previewInvoice && previewUrl && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-lg w-full max-w-4xl h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h3 className="text-sm font-semibold text-foreground">{previewInvoice.invoiceNumber}</h3>
              <div className="flex items-center gap-2">
                <button onClick={() => handleDownload(previewInvoice)} className="flex items-center gap-1 text-xs px-3 py-1.5 rounded bg-primary text-primary-foreground hover:bg-primary/90">
                  <Download className="w-3.5 h-3.5" /> Download
                </button>
                <button onClick={closePreview} className="text-muted-foreground hover:text-foreground p-1">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <iframe src={previewUrl} className="flex-1 w-full rounded-b-lg" title="Invoice Preview" />
          </div>
        </div>
      )}

      <TestimonialPromptDialog
        open={testimonialOpen}
        onClose={() => setTestimonialOpen(false)}
        trigger="first_paid_invoice"
        defaultCompany={data.organization?.name}
      />
    </div>
  );
}
