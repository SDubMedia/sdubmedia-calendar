// ============================================================
// MyInvoicesPage — Staff self-service contractor invoicing
// 1099 contractors can generate, save, and download invoices
// ============================================================

import { useState, useMemo, useCallback } from "react";
import { useApp } from "@/contexts/AppContext";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  FileText, Plus, Download, Trash2, Save, Building2,
} from "lucide-react";
import { toast } from "sonner";
import { pdf } from "@react-pdf/renderer";
import ContractorInvoicePDF from "@/components/ContractorInvoicePDF";
import type { ContractorInvoice, ContractorInvoiceLineItem } from "@/lib/types";

function formatCurrency(n: number): string {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function MyInvoicesPage() {
  const { data, addContractorInvoice, updateContractorInvoice, deleteContractorInvoice, updateCrewMember } = useApp();
  const { effectiveProfile: profile } = useAuth();

  const crewMember = data.crewMembers.find(c => c.id === profile?.crewMemberId);
  const myInvoices = useMemo(
    () => data.contractorInvoices.filter(inv => inv.crewMemberId === crewMember?.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [data.contractorInvoices, crewMember?.id]
  );

  // My completed projects
  const myProjects = useMemo(() => {
    if (!crewMember) return [];
    return data.projects.filter(p => {
      if (p.status !== "completed") return false;
      const inCrew = p.crew.some(c => c.crewMemberId === crewMember.id);
      const inPost = p.postProduction.some(c => c.crewMemberId === crewMember.id);
      return inCrew || inPost;
    });
  }, [data.projects, crewMember]);

  // Partner users who have clients this contractor works for
  const recipientOptions = useMemo(() => {
    const options: { value: string; label: string; type: "sdub_media" | "partner" }[] = [
      { value: "SDub Media", label: "SDub Media", type: "sdub_media" },
    ];
    // Find clients this contractor has worked for, check if they have partner splits
    const clientIds = new Set(myProjects.map(p => p.clientId));
    for (const client of data.clients) {
      if (clientIds.has(client.id) && client.partnerSplit?.partnerName) {
        const partnerName = client.partnerSplit.partnerName;
        if (!options.some(o => o.value === partnerName)) {
          options.push({ value: partnerName, label: partnerName, type: "partner" });
        }
      }
    }
    return options;
  }, [myProjects, data.clients]);

  // State for create invoice dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [recipient, setRecipient] = useState("SDub Media");
  const [notes, setNotes] = useState("");

  // State for business info dialog
  const [bizOpen, setBizOpen] = useState(false);
  const [bizName, setBizName] = useState("");
  const [bizAddress, setBizAddress] = useState("");
  const [bizCity, setBizCity] = useState("");
  const [bizState, setBizState] = useState("");
  const [bizZip, setBizZip] = useState("");

  const openBizDialog = () => {
    setBizName(crewMember?.businessName || crewMember?.name || "");
    setBizAddress(crewMember?.businessAddress || "");
    setBizCity(crewMember?.businessCity || "");
    setBizState(crewMember?.businessState || "");
    setBizZip(crewMember?.businessZip || "");
    setBizOpen(true);
  };

  const saveBizInfo = async () => {
    if (!crewMember) return;
    try {
      await updateCrewMember(crewMember.id, {
        businessName: bizName,
        businessAddress: bizAddress,
        businessCity: bizCity,
        businessState: bizState,
        businessZip: bizZip,
      });
      toast.success("Business info saved");
      setBizOpen(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to save");
    }
  };

  // Build line items from projects in date range
  const previewLineItems = useMemo((): ContractorInvoiceLineItem[] => {
    if (!periodStart || !periodEnd || !crewMember) return [];
    return myProjects
      .filter(p => p.date >= periodStart && p.date <= periodEnd)
      .flatMap(p => {
        const items: ContractorInvoiceLineItem[] = [];
        const typeName = data.projectTypes.find(t => t.id === p.projectTypeId)?.name ?? "Project";
        const locName = data.locations.find(l => l.id === p.locationId)?.name;
        const desc = locName ? `${typeName} — ${locName}` : typeName;

        // Check crew entries
        for (const e of p.crew) {
          if (e.crewMemberId === crewMember.id) {
            items.push({
              projectId: p.id, date: p.date, description: desc,
              role: e.role, hours: Number(e.hoursWorked ?? 0),
              rate: Number(e.payRatePerHour ?? 0),
              amount: Number(e.hoursWorked ?? 0) * Number(e.payRatePerHour ?? 0),
            });
          }
        }
        // Check post-production entries
        for (const e of p.postProduction) {
          if (e.crewMemberId === crewMember.id) {
            // For photo editors with image-based billing, use that
            if (e.role === "Photo Editor" && p.editorBilling) {
              const imgRate = p.editorBilling.perImageRate ?? 6;
              items.push({
                projectId: p.id, date: p.date, description: `${desc} (${p.editorBilling.imageCount} images)`,
                role: e.role, hours: p.editorBilling.imageCount,
                rate: imgRate,
                amount: p.editorBilling.imageCount * imgRate,
              });
            } else {
              items.push({
                projectId: p.id, date: p.date, description: desc,
                role: e.role, hours: Number(e.hoursWorked ?? 0),
                rate: Number(e.payRatePerHour ?? 0),
                amount: Number(e.hoursWorked ?? 0) * Number(e.payRatePerHour ?? 0),
              });
            }
          }
        }
        return items;
      });
  }, [myProjects, periodStart, periodEnd, crewMember, data.projectTypes, data.locations]);

  const previewTotal = previewLineItems.reduce((s, li) => s + li.amount, 0);

  // Generate invoice number: initials-YYYY-NNNN
  const generateInvoiceNumber = useCallback(() => {
    if (!crewMember) return "INV-0001";
    const names = crewMember.name.split(" ");
    const initials = names.map(n => n[0]?.toUpperCase() || "").join("");
    const year = new Date().getFullYear();
    const prefix = `${initials}-${year}-`;
    let maxNum = 0;
    for (const inv of myInvoices) {
      if (inv.invoiceNumber.startsWith(prefix)) {
        const num = parseInt(inv.invoiceNumber.slice(prefix.length), 10);
        if (num > maxNum) maxNum = num;
      }
    }
    return `${prefix}${String(maxNum + 1).padStart(4, "0")}`;
  }, [crewMember, myInvoices]);

  const handleCreateInvoice = async () => {
    if (!crewMember || previewLineItems.length === 0) {
      toast.error("No billable work found in this period");
      return;
    }
    const recipientOption = recipientOptions.find(o => o.value === recipient);
    const businessInfo = {
      name: crewMember.businessName || crewMember.name,
      address: crewMember.businessAddress || "",
      city: crewMember.businessCity || "",
      state: crewMember.businessState || "",
      zip: crewMember.businessZip || "",
      phone: crewMember.phone,
      email: crewMember.email,
    };
    try {
      await addContractorInvoice({
        crewMemberId: crewMember.id,
        invoiceNumber: generateInvoiceNumber(),
        recipientType: recipientOption?.type || "sdub_media",
        recipientName: recipient,
        periodStart,
        periodEnd,
        lineItems: previewLineItems,
        businessInfo,
        total: previewTotal,
        status: "draft",
        notes,
      });
      toast.success("Invoice created");
      setCreateOpen(false);
      setNotes("");
    } catch (err: any) {
      toast.error(err.message || "Failed to create invoice");
    }
  };

  const handleDownload = async (inv: ContractorInvoice) => {
    const blob = await pdf(<ContractorInvoicePDF invoice={inv} />).toBlob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${inv.invoiceNumber}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleMarkSent = async (inv: ContractorInvoice) => {
    await updateContractorInvoice(inv.id, { status: "sent" });
    toast.success("Marked as sent");
  };

  const handleDelete = async (inv: ContractorInvoice) => {
    await deleteContractorInvoice(inv.id);
    toast.success("Invoice deleted");
  };

  if (!crewMember) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        Your account is not linked to a crew member profile.
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
          My Invoices
        </h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={openBizDialog} className="gap-2 border-border">
            <Building2 className="w-4 h-4" /> Business Info
          </Button>
          <Button onClick={() => { setCreateOpen(true); setPeriodStart(""); setPeriodEnd(""); setRecipient("SDub Media"); setNotes(""); }} className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90">
            <Plus className="w-4 h-4" /> New Invoice
          </Button>
        </div>
      </div>

      {/* Business info reminder */}
      {!crewMember.businessName && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 flex items-center justify-between">
          <div>
            <div className="text-sm font-medium text-amber-300">Set up your business info</div>
            <div className="text-xs text-muted-foreground mt-1">Add your business name and address so it appears on your invoices.</div>
          </div>
          <Button variant="outline" size="sm" onClick={openBizDialog} className="border-amber-500/30 text-amber-300 hover:bg-amber-500/10">
            Set Up
          </Button>
        </div>
      )}

      {/* Invoice History */}
      {myInvoices.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <div className="text-sm">No invoices yet. Create your first one!</div>
        </div>
      ) : (
        <div className="space-y-3">
          {myInvoices.map(inv => (
            <div key={inv.id} className="bg-secondary rounded-lg p-4 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{inv.invoiceNumber}</span>
                  <Badge className={inv.status === "sent" ? "bg-green-500/20 text-green-300 border-green-500/30" : "bg-amber-500/20 text-amber-300 border-amber-500/30"}>
                    {inv.status}
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {inv.recipientName} — {new Date(inv.periodStart + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })} to {new Date(inv.periodEnd + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-lg font-bold tabular-nums text-primary" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                  {formatCurrency(inv.total)}
                </span>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDownload(inv)} title="Download PDF">
                    <Download className="w-4 h-4" />
                  </Button>
                  {inv.status === "draft" && (
                    <>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleMarkSent(inv)} title="Mark as Sent">
                        <FileText className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => handleDelete(inv)} title="Delete">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Invoice Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="w-[calc(100vw-2rem)] !max-w-[700px] max-h-[90dvh] overflow-y-auto bg-card border-border text-foreground">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Create Invoice</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Recipient */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Invoice To</Label>
              <Select value={recipient} onValueChange={setRecipient}>
                <SelectTrigger className="bg-secondary border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-popover border-border">
                  {recipientOptions.map(o => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Date Range */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Period Start</Label>
                <Input type="date" value={periodStart} onChange={e => setPeriodStart(e.target.value)} className="bg-secondary border-border" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Period End</Label>
                <Input type="date" value={periodEnd} onChange={e => setPeriodEnd(e.target.value)} className="bg-secondary border-border" />
              </div>
            </div>

            {/* Preview */}
            {previewLineItems.length > 0 && (
              <>
                <Separator className="bg-border" />
                <div className="space-y-2">
                  <div className="text-xs text-muted-foreground uppercase tracking-wider">Line Items Preview</div>
                  <div className="space-y-1">
                    {previewLineItems.map((li, i) => (
                      <div key={i} className="flex items-center justify-between bg-background rounded-md px-3 py-2 text-sm">
                        <div>
                          <div className="font-medium">{li.description}</div>
                          <div className="text-xs text-muted-foreground">{li.role} — {li.hours} {li.role === "Photo Editor" && li.rate === 6 ? "imgs" : "hrs"} x {formatCurrency(li.rate)}</div>
                        </div>
                        <span className="font-medium tabular-nums">{formatCurrency(li.amount)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-between items-center bg-primary/10 border border-primary/20 rounded-md p-3">
                    <span className="text-sm text-muted-foreground">Total</span>
                    <span className="text-xl font-bold text-primary tabular-nums" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                      {formatCurrency(previewTotal)}
                    </span>
                  </div>
                </div>
              </>
            )}

            {periodStart && periodEnd && previewLineItems.length === 0 && (
              <div className="text-center py-8 text-muted-foreground text-sm">
                No completed projects found in this period.
              </div>
            )}

            {/* Notes */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Notes (optional)</Label>
              <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Any notes for this invoice..." className="bg-secondary border-border resize-none" rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateInvoice} disabled={previewLineItems.length === 0} className="bg-primary text-primary-foreground hover:bg-primary/90 gap-2">
              <Save className="w-4 h-4" /> Create Invoice
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Business Info Dialog */}
      <Dialog open={bizOpen} onOpenChange={setBizOpen}>
        <DialogContent className="w-[calc(100vw-2rem)] !max-w-[500px] bg-card border-border text-foreground">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Business Information</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-xs text-muted-foreground">This info appears on your invoices. Use your business name or personal name.</p>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Business / Full Name</Label>
              <Input value={bizName} onChange={e => setBizName(e.target.value)} placeholder="Your name or business name" className="bg-secondary border-border" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Address</Label>
              <Input value={bizAddress} onChange={e => setBizAddress(e.target.value)} placeholder="Street address" className="bg-secondary border-border" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">City</Label>
                <Input value={bizCity} onChange={e => setBizCity(e.target.value)} className="bg-secondary border-border" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">State</Label>
                <Input value={bizState} onChange={e => setBizState(e.target.value)} className="bg-secondary border-border" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Zip</Label>
                <Input value={bizZip} onChange={e => setBizZip(e.target.value)} className="bg-secondary border-border" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setBizOpen(false)}>Cancel</Button>
            <Button onClick={saveBizInfo} className="bg-primary text-primary-foreground hover:bg-primary/90 gap-2">
              <Save className="w-4 h-4" /> Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
