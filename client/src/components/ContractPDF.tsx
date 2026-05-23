// ============================================================
// ContractPDF — react-pdf document for fully-executed contracts.
// Rendered client-side after the owner countersigns, then attached
// to the "fully executed" email so all parties get a permanent copy.
// ============================================================

import { Document, Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer";
import type { Contract, Organization, OrgBusinessInfo } from "@/lib/types";

const ink = "#1e293b";
const muted = "#64748b";
const line = "#e2e8f0";
const accent = "#15803d";

const s = StyleSheet.create({
  page: { padding: 48, fontSize: 11, fontFamily: "Helvetica", color: ink, lineHeight: 1.55 },
  // Letterhead
  header: { flexDirection: "row", justifyContent: "space-between", marginBottom: 28, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: line },
  orgName: { fontSize: 16, fontFamily: "Helvetica-Bold", color: ink },
  orgMeta: { fontSize: 9, color: muted, marginTop: 2 },
  badge: { fontSize: 8, color: accent, fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 1 },
  // Title block
  title: { fontSize: 18, fontFamily: "Helvetica-Bold", color: ink, marginBottom: 4 },
  subtitle: { fontSize: 10, color: muted, marginBottom: 24 },
  // Body
  bodyText: { fontSize: 10.5, color: ink, marginBottom: 8, lineHeight: 1.6 },
  bodyHeading: { fontSize: 12, fontFamily: "Helvetica-Bold", color: ink, marginTop: 12, marginBottom: 4 },
  // Signatures
  sigSection: { marginTop: 24, paddingTop: 16, borderTopWidth: 1, borderTopColor: line },
  sigSectionTitle: { fontSize: 8, color: muted, fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 },
  sigBlock: { marginBottom: 16, padding: 10, backgroundColor: "#f8fafc", borderRadius: 4 },
  sigRole: { fontSize: 8, color: muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 },
  sigName: { fontSize: 12, fontFamily: "Helvetica-Bold", color: ink },
  sigTyped: { fontSize: 14, fontFamily: "Times-Italic", color: ink, marginTop: 4 },
  sigImage: { width: 140, height: 40, objectFit: "contain", marginTop: 4 },
  sigMeta: { fontSize: 8, color: muted, marginTop: 6 },
  // Footer
  footer: { position: "absolute", bottom: 24, left: 48, right: 48, fontSize: 7, color: muted, textAlign: "center", borderTopWidth: 1, borderTopColor: line, paddingTop: 8 },
});

interface SignatureLike {
  name: string;
  email: string;
  ip: string;
  timestamp: string;
  signatureData: string;
  signatureType: "drawn" | "typed";
}

function htmlToTextBlocks(html: string): { kind: "p" | "h"; text: string }[] {
  if (!html) return [];
  // Quick-and-dirty HTML → block list. Splits on closing tags so each
  // paragraph/heading becomes a row. Preserves merge-field span content.
  const cleaned = html
    .replace(/<br\s*\/?>(?=)/gi, "\n")
    .replace(/<\/(p|h[1-6]|div|li)>/gi, "</$1>__BR__")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<span\s+data-merge-field="\w+"[^>]*>([^<]+)<\/span>/g, "$1")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  const blocks: { kind: "p" | "h"; text: string }[] = [];
  for (const raw of cleaned.split("__BR__")) {
    const isHeading = /<h[1-6]/i.test(raw);
    const text = raw.replace(/<[^>]+>/g, "").replace(/\n+/g, "\n").trim();
    if (!text) continue;
    blocks.push({ kind: isHeading ? "h" : "p", text });
  }
  return blocks;
}

function renderSig(role: string, sig: SignatureLike) {
  return (
    <View style={s.sigBlock} key={`${role}-${sig.timestamp}`}>
      <Text style={s.sigRole}>{role}</Text>
      <Text style={s.sigName}>{sig.name}</Text>
      {sig.signatureType === "drawn" ? (
        <Image style={s.sigImage} src={sig.signatureData} />
      ) : (
        <Text style={s.sigTyped}>{sig.signatureData}</Text>
      )}
      <Text style={s.sigMeta}>
        {sig.email ? `${sig.email} · ` : ""}Signed {new Date(sig.timestamp).toLocaleString()} · IP {sig.ip || "unknown"}
      </Text>
    </View>
  );
}

export interface ContractPDFProps {
  contract: Contract;
  org: Organization | null;
  ownerName: string;
  clientCompany: string;
}

export function ContractPDF({ contract, org, ownerName, clientCompany }: ContractPDFProps) {
  const blocks = htmlToTextBlocks(contract.content);
  const businessInfo = (org?.businessInfo || {}) as OrgBusinessInfo;
  const orgAddressLine = [businessInfo.address, businessInfo.city, businessInfo.state, businessInfo.zip].filter(Boolean).join(", ");
  // Snapshot timestamps at render so re-renders are deterministic.
  const completedDate = contract.ownerSignedAt
    ? new Date(contract.ownerSignedAt).toLocaleDateString()
    : "";
  const generatedAt = new Date().toLocaleString();

  return (
    <Document>
      <Page size="LETTER" style={s.page}>
        {/* Letterhead */}
        <View style={s.header}>
          <View>
            <Text style={s.orgName}>{org?.name || "Slate"}</Text>
            {orgAddressLine && <Text style={s.orgMeta}>{orgAddressLine}</Text>}
            {businessInfo.email && <Text style={s.orgMeta}>{businessInfo.email}</Text>}
          </View>
          <View>
            <Text style={s.badge}>Fully executed</Text>
            {completedDate && <Text style={s.orgMeta}>{completedDate}</Text>}
          </View>
        </View>

        {/* Title */}
        <Text style={s.title}>{contract.title}</Text>
        <Text style={s.subtitle}>Between {ownerName || org?.name || "Provider"} and {clientCompany || "Client"}</Text>

        {/* Body */}
        {blocks.length === 0 ? (
          <Text style={s.bodyText}>{contract.content}</Text>
        ) : (
          blocks.map((b, i) => (
            <Text key={i} style={b.kind === "h" ? s.bodyHeading : s.bodyText}>{b.text}</Text>
          ))
        )}

        {/* Signatures */}
        <View style={s.sigSection} wrap={false}>
          <Text style={s.sigSectionTitle}>Signatures</Text>
          {contract.clientSignature && renderSig("Client", contract.clientSignature)}
          {contract.additionalSigners
            .filter(a => a.signature)
            .map(a => renderSig(a.role || "Co-signer", a.signature!))}
          {contract.ownerSignature && renderSig("Owner", contract.ownerSignature)}
        </View>

        {/* Footer */}
        <Text style={s.footer} fixed>
          {org?.name ? `${org.name} · ` : ""}Generated by Slate · {generatedAt}
        </Text>
      </Page>
    </Document>
  );
}
