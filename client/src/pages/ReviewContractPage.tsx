// ============================================================
// ReviewContractPage — owner-facing approval queue for draft contracts
// auto-generated from accepted proposals.
//
// Three actions in a slim toolbar:
//   • Approve & Send  — sets status="sent" + fires send-contract-email
//   • Edit content    — opens existing EditContractPage with the draft
//   • Send Back       — modal asks for a required reason; reverts the
//                       proposal so the client can re-select
//
// The contract preview itself uses the same DOMPurify-sanitized HTML
// rendering as ContractsPage / SignContractPage so what owner sees is
// what client will see.
// ============================================================

import { useState, useMemo } from "react";
import { useParams, useLocation } from "wouter";
import { useApp } from "@/contexts/AppContext";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Send, Edit3, Undo2, CheckCircle } from "lucide-react";
import { toast } from "sonner";
import DOMPurify from "dompurify";
import { getAuthToken } from "@/lib/supabase";

export default function ReviewContractPage() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { data, updateContract } = useApp();
  const { profile } = useAuth();
  const contract = useMemo(() => data.contracts.find(c => c.id === params.id), [data.contracts, params.id]);
  const proposal = useMemo(
    () => contract?.proposalId ? data.proposals.find(p => p.id === contract.proposalId) : null,
    [contract, data.proposals],
  );

  const [sendingApprove, setSendingApprove] = useState(false);
  const [sendBackOpen, setSendBackOpen] = useState(false);
  const [sendBackReason, setSendBackReason] = useState("");
  const [sendingBack, setSendingBack] = useState(false);

  if (!contract) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 gap-4">
        <p className="text-muted-foreground">Contract not found.</p>
        <Button variant="outline" onClick={() => setLocation("/pipeline")}>Back to Pipeline</Button>
      </div>
    );
  }

  const orgName = data.organization?.name || "";
  const sanitizedHtml = DOMPurify.sanitize(contract.content || "");

  async function handleApproveAndSend() {
    if (!contract) return;
    if (!contract.clientEmail) {
      toast.error("No client email on this contract.");
      return;
    }
    setSendingApprove(true);
    try {
      const now = new Date().toISOString();
      // 1. Update status to "sent"
      await updateContract(contract.id, {
        status: "sent",
        sentAt: now,
      });
      // 2. Email client + cc owner
      const token = await getAuthToken();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch("/api/send-contract-email", {
        method: "POST",
        headers,
        body: JSON.stringify({
          to: contract.clientEmail,
          cc: profile?.email || "",
          subject: `Contract: ${contract.title} — ${orgName}`,
          signUrl: `${window.location.origin}/sign/${contract.signToken}`,
          contractTitle: contract.title,
          orgName,
        }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || "Send failed");
      }
      toast.success("Contract sent for signature");
      setLocation("/pipeline");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to approve");
    } finally {
      setSendingApprove(false);
    }
  }

  async function handleSendBack() {
    if (!contract) return;
    if (!sendBackReason.trim()) {
      toast.error("Reason is required");
      return;
    }
    setSendingBack(true);
    try {
      const token = await getAuthToken();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch("/api/contract-send-back", {
        method: "POST",
        headers,
        body: JSON.stringify({
          contractId: contract.id,
          reason: sendBackReason.trim(),
        }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || "Send back failed");
      }
      toast.success("Sent back to client");
      setSendBackOpen(false);
      setLocation("/pipeline");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send back");
    } finally {
      setSendingBack(false);
    }
  }

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card/50">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={() => setLocation("/pipeline")} className="p-1.5 text-muted-foreground hover:text-foreground shrink-0">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="min-w-0">
            <h1 className="text-lg font-semibold text-foreground truncate" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              {contract.title}
            </h1>
            <p className="text-[11px] text-muted-foreground">
              Draft contract awaiting your approval
              {proposal && (
                <span className="ml-2">
                  · Auto-generated from accepted proposal
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSendBackOpen(true)}
            className="gap-1.5"
            disabled={sendingApprove}
          >
            <Undo2 className="w-3.5 h-3.5" /> Send Back
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setLocation(`/contracts/${contract.id}/edit`)}
            className="gap-1.5"
            disabled={sendingApprove}
          >
            <Edit3 className="w-3.5 h-3.5" /> Edit
          </Button>
          <Button
            size="sm"
            onClick={handleApproveAndSend}
            disabled={sendingApprove}
            className="gap-1.5"
          >
            {sendingApprove ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Sending…
              </>
            ) : (
              <>
                <Send className="w-3.5 h-3.5" /> Approve & Send
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Document preview */}
      <div className="flex-1 overflow-y-auto bg-secondary/30 p-4 sm:p-8">
        <div className="max-w-3xl mx-auto">
          <div className="bg-white rounded-xl shadow-md border border-border overflow-hidden">
            <div
              className="px-8 sm:px-16 py-12 sm:py-16 text-gray-800 contract-html-light"
              dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
            />
            <div className="border-t border-gray-100 px-8 sm:px-16 py-6 bg-gray-50">
              <p className="text-xs text-gray-500 flex items-center gap-1.5">
                <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                When you click Approve & Send, this contract will be emailed to <strong>{contract.clientEmail}</strong> for signature.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Send-back modal */}
      <Dialog open={sendBackOpen} onOpenChange={open => { if (!open) { setSendBackOpen(false); setSendBackReason(""); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Send back to client</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              The client's selections will be reset and they'll be able to re-do the proposal. They'll see the reason you write below.
            </p>
            <div>
              <Label htmlFor="reason">Reason (required)</Label>
              <textarea
                id="reason"
                value={sendBackReason}
                onChange={e => setSendBackReason(e.target.value)}
                rows={5}
                placeholder="e.g. The Wedding Weekend add-on isn't available for your event date — please pick a single-day package and resubmit."
                className="w-full px-3 py-2 text-sm rounded border border-border bg-background"
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setSendBackOpen(false); setSendBackReason(""); }} disabled={sendingBack}>
              Cancel
            </Button>
            <Button onClick={handleSendBack} disabled={sendingBack || !sendBackReason.trim()}>
              {sendingBack ? "Sending…" : "Send back to client"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
