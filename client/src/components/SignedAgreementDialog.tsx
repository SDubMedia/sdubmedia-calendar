// ============================================================
// SignedAgreementDialog — view an executed 1099 independent-contractor
// agreement: the exact text that was signed, plus the contractor's signature
// and the owner's countersignature (image or typed) with dates. Used by both
// the staff member (their own copy) and the owner (on the Staff page). Includes
// a "Download PDF" for a saveable/printable copy (react-pdf, same as contracts).
// ============================================================

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { pdf, Document, Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer";
import type { StaffAgreement, ContractSignature } from "@/lib/types";

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  try { return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }); }
  catch { return ""; }
}

// ---- On-screen signature block ----
function SigBlock({ role, sig, dateLabel, at }: { role: string; sig: ContractSignature | null; dateLabel: string; at: string | null }) {
  return (
    <div className="rounded-lg border border-border bg-secondary/40 p-3">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{role}</p>
      {sig ? (
        <>
          <p className="text-sm font-medium text-foreground mt-0.5">{sig.name}</p>
          {sig.signatureType === "drawn" ? (
            <img src={sig.signatureData} alt="signature" className="h-10 mt-1 object-contain" style={{ maxWidth: 180 }} />
          ) : (
            <p className="mt-1 text-lg text-foreground" style={{ fontFamily: "'Cormorant', Georgia, serif", fontStyle: "italic" }}>{sig.signatureData}</p>
          )}
          <p className="text-[11px] text-muted-foreground mt-1">{dateLabel} {fmtDate(at)}</p>
        </>
      ) : (
        <p className="text-sm text-muted-foreground mt-1 italic">Awaiting {role.toLowerCase()} signature</p>
      )}
    </div>
  );
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  agreement: StaffAgreement;
  text: string;         // effective agreement text (snapshot or current)
  orgName: string;      // the company (owner's org)
  ownerName: string;    // fallback name for the countersignature block
}

export default function SignedAgreementDialog({ open, onOpenChange, agreement, text, orgName, ownerName }: Props) {
  const [downloading, setDownloading] = useState(false);
  const title = agreement.agreementTitle || "1099 Independent-Contractor Agreement";

  async function download() {
    setDownloading(true);
    try {
      const blob = await pdf(
        <AgreementPDF agreement={agreement} text={text} orgName={orgName} ownerName={ownerName} title={title} />,
      ).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `1099-agreement-${(agreement.staffSignature?.name || "staff").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't build the PDF");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">{orgName}{agreement.staffSignedAt ? ` · Executed ${fmtDate(agreement.staffSignedAt)}` : ""}</p>
          <div className="rounded-lg border border-border bg-secondary/30 p-3 max-h-[40vh] overflow-y-auto">
            <p className="text-[13px] leading-relaxed text-foreground whitespace-pre-wrap">{text || "(agreement text unavailable)"}</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <SigBlock role="Contractor" sig={agreement.staffSignature} dateLabel="Signed" at={agreement.staffSignedAt} />
            <SigBlock role="Company" sig={agreement.ownerSignature} dateLabel="Countersigned" at={agreement.ownerSignedAt} />
          </div>
          <Button onClick={download} disabled={downloading} className="w-full gap-2">
            <Download className="w-4 h-4" /> {downloading ? "Preparing…" : "Download PDF"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---- PDF copy ----
const ink = "#1e293b", muted = "#64748b", line = "#e2e8f0";
const s = StyleSheet.create({
  page: { padding: 48, fontSize: 11, fontFamily: "Helvetica", color: ink, lineHeight: 1.55 },
  header: { marginBottom: 24, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: line },
  orgName: { fontSize: 15, fontFamily: "Helvetica-Bold", color: ink },
  meta: { fontSize: 9, color: muted, marginTop: 2 },
  title: { fontSize: 17, fontFamily: "Helvetica-Bold", color: ink, marginBottom: 16 },
  body: { fontSize: 10.5, color: ink, marginBottom: 6, lineHeight: 1.6 },
  spacer: { height: 6 },
  sigSection: { marginTop: 22, paddingTop: 14, borderTopWidth: 1, borderTopColor: line },
  sigSectionTitle: { fontSize: 8, color: muted, fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 },
  sigBlock: { marginBottom: 14, padding: 10, backgroundColor: "#f8fafc", borderRadius: 4 },
  sigRole: { fontSize: 8, color: muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 },
  sigName: { fontSize: 12, fontFamily: "Helvetica-Bold", color: ink },
  sigTyped: { fontSize: 15, fontFamily: "Times-Italic", color: ink, marginTop: 4 },
  sigImage: { width: 150, height: 42, objectFit: "contain", marginTop: 4 },
  sigMeta: { fontSize: 8, color: muted, marginTop: 6 },
  footer: { position: "absolute", bottom: 24, left: 48, right: 48, fontSize: 7, color: muted, textAlign: "center", borderTopWidth: 1, borderTopColor: line, paddingTop: 8 },
});

function pdfSig(role: string, sig: ContractSignature | null, dateLabel: string, at: string | null) {
  if (!sig) return (
    <View style={s.sigBlock} key={role}>
      <Text style={s.sigRole}>{role}</Text>
      <Text style={s.sigMeta}>Awaiting signature</Text>
    </View>
  );
  return (
    <View style={s.sigBlock} key={role} wrap={false}>
      <Text style={s.sigRole}>{role}</Text>
      <Text style={s.sigName}>{sig.name}</Text>
      {sig.signatureType === "drawn"
        ? <Image style={s.sigImage} src={sig.signatureData} />
        : <Text style={s.sigTyped}>{sig.signatureData}</Text>}
      <Text style={s.sigMeta}>{dateLabel} {fmtDate(at)}{sig.ip ? ` · IP ${sig.ip}` : ""}</Text>
    </View>
  );
}

function AgreementPDF({ agreement, text, orgName, ownerName, title }: { agreement: StaffAgreement; text: string; orgName: string; ownerName: string; title: string }) {
  const lines = (text || "").split("\n");
  void ownerName; // fallback name reserved; countersignature currently renders from the agreement row
  return (
    <Document>
      <Page size="LETTER" style={s.page}>
        <View style={s.header}>
          <Text style={s.orgName}>{orgName || "Company"}</Text>
          {agreement.staffSignedAt && <Text style={s.meta}>Executed {fmtDate(agreement.staffSignedAt)}</Text>}
        </View>
        <Text style={s.title}>{title}</Text>
        {lines.map((ln, i) => ln.trim() === "" ? <View key={i} style={s.spacer} /> : <Text key={i} style={s.body}>{ln}</Text>)}
        <View style={s.sigSection}>
          <Text style={s.sigSectionTitle}>Signatures</Text>
          {pdfSig("Contractor", agreement.staffSignature, "Signed", agreement.staffSignedAt)}
          {pdfSig("Company", agreement.ownerSignature, "Countersigned", agreement.ownerSignedAt)}
        </View>
        <Text style={s.footer} fixed>{orgName ? `${orgName} · ` : ""}Generated by Slate</Text>
      </Page>
    </Document>
  );
}
