// ============================================================
// ContractorInvoicePDF — PDF template for 1099 contractor invoices
// ============================================================

import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import type { ContractorInvoice } from "@/lib/types";

const brandBlue = "#0088ff";
const charcoal = "#1e293b";
const gray = "#64748b";
const lightGray = "#f1f5f9";

const s = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: "Helvetica", color: charcoal },
  header: { flexDirection: "row", justifyContent: "space-between", marginBottom: 30 },
  brandName: { fontSize: 20, fontFamily: "Helvetica-Bold", color: charcoal },
  invoiceTitle: { fontSize: 18, fontFamily: "Helvetica-Bold", color: charcoal, textAlign: "right" },
  invoiceNumber: { fontSize: 10, color: gray, textAlign: "right", marginTop: 2 },
  infoRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 24 },
  infoBlock: { width: "45%" },
  infoLabel: { fontSize: 8, color: gray, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 },
  infoText: { fontSize: 10, lineHeight: 1.5 },
  infoBold: { fontFamily: "Helvetica-Bold" },
  metaRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 20, backgroundColor: lightGray, padding: 12, borderRadius: 4 },
  metaItem: { alignItems: "center" },
  metaLabel: { fontSize: 8, color: gray, textTransform: "uppercase", letterSpacing: 1 },
  metaValue: { fontSize: 11, fontFamily: "Helvetica-Bold", marginTop: 2 },
  table: { marginBottom: 20 },
  tableHeader: { flexDirection: "row", backgroundColor: charcoal, padding: 8, borderRadius: 4 },
  tableHeaderText: { color: "#ffffff", fontSize: 8, fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 0.5 },
  tableRow: { flexDirection: "row", padding: 8, borderBottomWidth: 1, borderBottomColor: "#e2e8f0" },
  tableRowAlt: { backgroundColor: "#f8fafc" },
  colDate: { width: "12%" },
  colDesc: { width: "30%" },
  colRole: { width: "18%" },
  colHrs: { width: "12%", textAlign: "right" },
  colRate: { width: "14%", textAlign: "right" },
  colAmount: { width: "14%", textAlign: "right" },
  totalsContainer: { alignItems: "flex-end", marginBottom: 30 },
  totalsBox: { width: 220 },
  grandTotalRow: { flexDirection: "row", justifyContent: "space-between", padding: 8, backgroundColor: brandBlue, borderRadius: 4, marginTop: 4 },
  grandTotalLabel: { fontSize: 12, fontFamily: "Helvetica-Bold", color: "#ffffff" },
  grandTotalValue: { fontSize: 12, fontFamily: "Helvetica-Bold", color: "#ffffff" },
  notes: { marginBottom: 20, padding: 12, backgroundColor: lightGray, borderRadius: 4 },
  notesLabel: { fontSize: 8, color: gray, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 },
  notesText: { fontSize: 10, lineHeight: 1.5 },
  footer: { position: "absolute", bottom: 40, left: 40, right: 40 },
  footerLine: { borderTopWidth: 1, borderTopColor: "#e2e8f0", paddingTop: 12, flexDirection: "row", justifyContent: "space-between" },
  footerText: { fontSize: 8, color: gray },
});

function formatDate(d: string): string {
  if (!d) return "";
  const [y, m, day] = d.split("-");
  return `${m}/${day}/${y}`;
}

function formatCurrency(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function ContractorInvoicePDF({ invoice }: { invoice: ContractorInvoice }) {
  const bi = invoice.businessInfo;

  return (
    <Document>
      <Page size="LETTER" style={s.page}>
        {/* Header */}
        <View style={s.header}>
          <View>
            <Text style={s.brandName}>{bi.name || "Contractor"}</Text>
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
            <Text style={[s.infoText, s.infoBold]}>{bi.name}</Text>
            {bi.address ? <Text style={s.infoText}>{bi.address}</Text> : null}
            {bi.city ? <Text style={s.infoText}>{bi.city}, {bi.state} {bi.zip}</Text> : null}
            {bi.phone ? <Text style={s.infoText}>{bi.phone}</Text> : null}
            {bi.email ? <Text style={s.infoText}>{bi.email}</Text> : null}
          </View>
          <View style={s.infoBlock}>
            <Text style={s.infoLabel}>Bill To</Text>
            <Text style={[s.infoText, s.infoBold]}>{invoice.recipientName}</Text>
          </View>
        </View>

        {/* Dates */}
        <View style={s.metaRow}>
          <View style={s.metaItem}>
            <Text style={s.metaLabel}>Issue Date</Text>
            <Text style={s.metaValue}>{formatDate(new Date().toISOString().slice(0, 10))}</Text>
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
            <Text style={[s.tableHeaderText, s.colDesc]}>Project</Text>
            <Text style={[s.tableHeaderText, s.colRole]}>Role</Text>
            <Text style={[s.tableHeaderText, s.colHrs]}>Hours</Text>
            <Text style={[s.tableHeaderText, s.colRate]}>Rate</Text>
            <Text style={[s.tableHeaderText, s.colAmount]}>Amount</Text>
          </View>
          {invoice.lineItems.map((li, i) => (
            <View key={i} style={[s.tableRow, i % 2 === 1 ? s.tableRowAlt : {}]}>
              <Text style={s.colDate}>{formatDate(li.date)}</Text>
              <Text style={s.colDesc}>{li.description}</Text>
              <Text style={s.colRole}>{li.role}</Text>
              <Text style={s.colHrs}>{li.hours % 1 === 0 ? li.hours : li.hours.toFixed(2)}</Text>
              <Text style={s.colRate}>{formatCurrency(li.rate)}</Text>
              <Text style={s.colAmount}>{formatCurrency(li.amount)}</Text>
            </View>
          ))}
        </View>

        {/* Total */}
        <View style={s.totalsContainer}>
          <View style={s.totalsBox}>
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
            <Text style={s.footerText}>{bi.name}</Text>
            <Text style={s.footerText}>Thank you!</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}
