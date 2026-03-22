// ============================================================
// InvoicePDF — React-PDF document for professional invoices
// ============================================================

import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import type { Invoice } from "@/lib/types";

const amber = "#0088ff";
const charcoal = "#1e293b";
const gray = "#64748b";
const lightGray = "#f1f5f9";

const s = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: "Helvetica", color: charcoal },
  // Header
  header: { flexDirection: "row", justifyContent: "space-between", marginBottom: 30 },
  brandName: { fontSize: 22, fontFamily: "Helvetica-Bold", color: amber },
  brandTagline: { fontSize: 8, color: gray, marginTop: 2 },
  invoiceTitle: { fontSize: 18, fontFamily: "Helvetica-Bold", color: charcoal, textAlign: "right" },
  invoiceNumber: { fontSize: 10, color: gray, textAlign: "right", marginTop: 2 },
  // Info blocks
  infoRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 24 },
  infoBlock: { width: "45%" },
  infoLabel: { fontSize: 8, color: gray, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 },
  infoText: { fontSize: 10, lineHeight: 1.5 },
  infoBold: { fontFamily: "Helvetica-Bold" },
  // Meta (dates, terms)
  metaRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 20, backgroundColor: lightGray, padding: 12, borderRadius: 4 },
  metaItem: { alignItems: "center" },
  metaLabel: { fontSize: 8, color: gray, textTransform: "uppercase", letterSpacing: 1 },
  metaValue: { fontSize: 11, fontFamily: "Helvetica-Bold", marginTop: 2 },
  // Table
  table: { marginBottom: 20 },
  tableHeader: { flexDirection: "row", backgroundColor: charcoal, padding: 8, borderRadius: 4 },
  tableHeaderText: { color: "#ffffff", fontSize: 8, fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 0.5 },
  tableRow: { flexDirection: "row", padding: 8, borderBottomWidth: 1, borderBottomColor: "#e2e8f0" },
  tableRowAlt: { backgroundColor: "#f8fafc" },
  colDate: { width: "15%" },
  colDesc: { width: "40%" },
  colQty: { width: "15%", textAlign: "right" },
  colRate: { width: "15%", textAlign: "right" },
  colAmount: { width: "15%", textAlign: "right" },
  // Totals
  totalsContainer: { alignItems: "flex-end", marginBottom: 30 },
  totalsBox: { width: 220 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", padding: 6 },
  totalLabel: { fontSize: 10, color: gray },
  totalValue: { fontSize: 10, fontFamily: "Helvetica-Bold" },
  grandTotalRow: { flexDirection: "row", justifyContent: "space-between", padding: 8, backgroundColor: amber, borderRadius: 4, marginTop: 4 },
  grandTotalLabel: { fontSize: 12, fontFamily: "Helvetica-Bold", color: "#ffffff" },
  grandTotalValue: { fontSize: 12, fontFamily: "Helvetica-Bold", color: "#ffffff" },
  // Footer
  footer: { position: "absolute", bottom: 40, left: 40, right: 40 },
  footerLine: { borderTopWidth: 1, borderTopColor: "#e2e8f0", paddingTop: 12, flexDirection: "row", justifyContent: "space-between" },
  footerText: { fontSize: 8, color: gray },
  notes: { marginBottom: 20, padding: 12, backgroundColor: lightGray, borderRadius: 4 },
  notesLabel: { fontSize: 8, color: gray, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 },
  notesText: { fontSize: 10, lineHeight: 1.5 },
});

function formatDate(d: string): string {
  if (!d) return "";
  const [y, m, day] = d.split("-");
  return `${m}/${day}/${y}`;
}

function formatCurrency(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function InvoicePDF({ invoice }: { invoice: Invoice }) {
  const ci = invoice.companyInfo;
  const cl = invoice.clientInfo;

  return (
    <Document>
      <Page size="LETTER" style={s.page}>
        {/* Header */}
        <View style={s.header}>
          <View>
            <Text style={s.brandName}>{ci.name || "SDub Media"}</Text>
            <Text style={s.brandTagline}>Video When It Matters Most</Text>
          </View>
          <View>
            <Text style={s.invoiceTitle}>INVOICE</Text>
            <Text style={s.invoiceNumber}>{invoice.invoiceNumber}</Text>
          </View>
        </View>

        {/* From / To */}
        <View style={s.infoRow}>
          <View style={s.infoBlock}>
            <Text style={s.infoLabel}>From</Text>
            <Text style={[s.infoText, s.infoBold]}>{ci.name}</Text>
            <Text style={s.infoText}>{ci.address}</Text>
            <Text style={s.infoText}>{ci.city}, {ci.state} {ci.zip}</Text>
            <Text style={s.infoText}>{ci.phone}</Text>
            <Text style={s.infoText}>{ci.email}</Text>
          </View>
          <View style={s.infoBlock}>
            <Text style={s.infoLabel}>Bill To</Text>
            <Text style={[s.infoText, s.infoBold]}>{cl.company}</Text>
            <Text style={s.infoText}>{cl.contactName}</Text>
            <Text style={s.infoText}>{cl.email}</Text>
            <Text style={s.infoText}>{cl.phone}</Text>
          </View>
        </View>

        {/* Dates & Terms */}
        <View style={s.metaRow}>
          <View style={s.metaItem}>
            <Text style={s.metaLabel}>Issue Date</Text>
            <Text style={s.metaValue}>{formatDate(invoice.issueDate)}</Text>
          </View>
          <View style={s.metaItem}>
            <Text style={s.metaLabel}>Service Period</Text>
            <Text style={s.metaValue}>{formatDate(invoice.periodStart)} — {formatDate(invoice.periodEnd)}</Text>
          </View>
          <View style={s.metaItem}>
            <Text style={s.metaLabel}>Payment Terms</Text>
            <Text style={s.metaValue}>Due on Receipt</Text>
          </View>
        </View>

        {/* Line Items Table */}
        <View style={s.table}>
          <View style={s.tableHeader}>
            <Text style={[s.tableHeaderText, s.colDate]}>Date</Text>
            <Text style={[s.tableHeaderText, s.colDesc]}>Description</Text>
            <Text style={[s.tableHeaderText, s.colQty]}>Hrs/Qty</Text>
            <Text style={[s.tableHeaderText, s.colRate]}>Rate</Text>
            <Text style={[s.tableHeaderText, s.colAmount]}>Amount</Text>
          </View>
          {invoice.lineItems.map((li, i) => (
            <View key={i} style={[s.tableRow, i % 2 === 1 ? s.tableRowAlt : {}]}>
              <Text style={s.colDate}>{formatDate(li.date)}</Text>
              <Text style={s.colDesc}>{li.description}</Text>
              <Text style={s.colQty}>{li.quantity % 1 === 0 ? li.quantity : li.quantity.toFixed(1)}</Text>
              <Text style={s.colRate}>{formatCurrency(li.unitPrice)}</Text>
              <Text style={s.colAmount}>{formatCurrency(li.amount)}</Text>
            </View>
          ))}
        </View>

        {/* Totals */}
        <View style={s.totalsContainer}>
          <View style={s.totalsBox}>
            <View style={s.totalRow}>
              <Text style={s.totalLabel}>Subtotal</Text>
              <Text style={s.totalValue}>{formatCurrency(invoice.subtotal)}</Text>
            </View>
            {invoice.taxRate > 0 && (
              <View style={s.totalRow}>
                <Text style={s.totalLabel}>Tax ({(invoice.taxRate * 100).toFixed(1)}%)</Text>
                <Text style={s.totalValue}>{formatCurrency(invoice.taxAmount)}</Text>
              </View>
            )}
            <View style={s.grandTotalRow}>
              <Text style={s.grandTotalLabel}>Total Due</Text>
              <Text style={s.grandTotalValue}>{formatCurrency(invoice.total)}</Text>
            </View>
          </View>
        </View>

        {/* Notes */}
        {invoice.notes && (
          <View style={s.notes}>
            <Text style={s.notesLabel}>Notes</Text>
            <Text style={s.notesText}>{invoice.notes}</Text>
          </View>
        )}

        {/* Footer */}
        <View style={s.footer}>
          <View style={s.footerLine}>
            <Text style={s.footerText}>{ci.name} — {ci.website}</Text>
            <Text style={s.footerText}>Thank you for your business!</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}
