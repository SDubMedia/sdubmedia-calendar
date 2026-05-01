// ============================================================
// EditContractPage — Full-page contract editor (Pixieset Studio style).
// Replaces the modal-based new/edit Dialog flow with a dedicated route
// at /contracts/:id/edit.
//
// Layout: top bar + left sidebar (Signers + Settings) + main canvas
// (WYSIWYG editor on letter-paper).
// ============================================================

import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { useApp } from "@/contexts/AppContext";
import { useAuth } from "@/contexts/AuthContext";
import type { Contract, ContractStatus, AdditionalSigner } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { ArrowLeft, Send, Eye, MoreHorizontal, Plus, X, Trash2, ExternalLink, PenTool, Copy, AlertCircle } from "lucide-react";
import { WysiwygContractEditor, type WysiwygContractEditorHandle } from "@/components/WysiwygContractEditor";
import { ContractLetterhead } from "@/components/ContractLetterhead";
import { useSignatureCanvas } from "@/hooks/useSignatureCanvas";
import DOMPurify from "dompurify";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { nanoid } from "nanoid";
import { getAuthToken } from "@/lib/supabase";

const STATUS_LABELS: Record<ContractStatus, string> = {
  draft: "DRAFT",
  sent: "SENT",
  client_signed: "AWAITING YOUR SIGNATURE",
  completed: "COMPLETED",
  void: "VOID",
};

const STATUS_BADGE_STYLE: Record<ContractStatus, string> = {
  draft: "bg-zinc-500/15 text-zinc-300 border-zinc-500/30",
  sent: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  client_signed: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  completed: "bg-green-500/15 text-green-300 border-green-500/30",
  void: "bg-red-500/15 text-red-300 border-red-500/30",
};

type SaveStatus = "idle" | "saving" | "saved" | "error";

export default function EditContractPage() {
  const [, params] = useRoute<{ id: string }>("/contracts/:id/edit");
  const id = params?.id;
  const [, setLocation] = useLocation();
  const { data, updateContract, deleteContract } = useApp();
  const { profile } = useAuth();

  const contract = useMemo(() => data.contracts.find(c => c.id === id), [data.contracts, id]);
  const client = useMemo(() => contract ? data.clients.find(cl => cl.id === contract.clientId) : null, [data.clients, contract]);
  const isDraft = contract?.status === "draft";
  const isReadOnly = !isDraft;

  // Local form state — mirrors contract fields and is autosaved on change.
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [placeholders, setPlaceholders] = useState<string[]>([]);
  const [additionalSigners, setAdditionalSigners] = useState<AdditionalSigner[]>([]);
  const [documentExpiresAt, setDocumentExpiresAt] = useState<string | null>(null);
  const [remindersEnabled, setRemindersEnabled] = useState(false);

  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [sending, setSending] = useState(false);
  const [signOpen, setSignOpen] = useState(false);
  const [addSignerOpen, setAddSignerOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);

  const editorRef = useRef<WysiwygContractEditorHandle>(null);
  const saveTimerRef = useRef<number | null>(null);
  const wasLoaded = useRef(false);

  // Hydrate from contract row on first load + when id changes.
  useEffect(() => {
    if (!contract) return;
    if (wasLoaded.current && id === contract.id) return;
    wasLoaded.current = true;
    setTitle(contract.title);
    setContent(contract.content);
    setClientEmail(contract.clientEmail);
    setFieldValues(contract.fieldValues || {});
    setAdditionalSigners(contract.additionalSigners || []);
    setDocumentExpiresAt(contract.documentExpiresAt);
    setRemindersEnabled(contract.remindersEnabled);
    setSaveStatus("idle");
  }, [contract, id]);

  // Debounced autosave for draft contracts. Pushes title/content/email/
  // field values/signers/settings on any change.
  useEffect(() => {
    if (!contract || !isDraft) return;
    if (!wasLoaded.current) return;
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    setSaveStatus("saving");
    saveTimerRef.current = window.setTimeout(async () => {
      try {
        await updateContract(contract.id, {
          title,
          content,
          clientEmail,
          fieldValues,
          additionalSigners,
          documentExpiresAt,
          remindersEnabled,
        });
        setSaveStatus("saved");
      } catch {
        setSaveStatus("error");
      }
    }, 800);
    return () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, content, clientEmail, fieldValues, additionalSigners, documentExpiresAt, remindersEnabled, isDraft]);

  // ----- Send / sign actions -----
  async function sendContract() {
    if (!contract) return;
    if (!clientEmail.trim()) { toast.error("Client email required"); return; }
    setSending(true);
    try {
      const token = await getAuthToken();
      const orgName = data.organization?.name || "Your production company";
      const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

      // Build the recipient list: primary client + each additional signer.
      // Skip signers with no email (validated below). Primary client gets the
      // owner CC'd; additional signers don't, to keep the owner's inbox quieter.
      const recipients = [
        { to: clientEmail.trim(), token: contract.signToken, cc: profile?.email || "" },
        ...additionalSigners
          .filter(s => s.email.trim())
          .map(s => ({ to: s.email.trim(), token: s.signToken, cc: "" })),
      ];

      let failed = 0;
      for (const r of recipients) {
        try {
          const res = await fetch("/api/send-contract-email", {
            method: "POST",
            headers,
            body: JSON.stringify({
              to: r.to,
              cc: r.cc,
              subject: `Contract: ${title} — ${orgName}`,
              signUrl: `${window.location.origin}/sign/${r.token}`,
              contractTitle: title,
              orgName,
            }),
          });
          if (!res.ok) failed++;
        } catch { failed++; }
      }

      if (failed === recipients.length) throw new Error("Failed to send to any signer");
      await updateContract(contract.id, { status: "sent", sentAt: new Date().toISOString() });
      const sentCount = recipients.length - failed;
      toast.success(failed > 0
        ? `Sent to ${sentCount} of ${recipients.length} signers`
        : recipients.length === 1
          ? `Contract sent to ${clientEmail.trim()}`
          : `Contract sent to ${recipients.length} signers`);
    } catch (err: any) {
      toast.error(err.message || "Failed to send");
    } finally {
      setSending(false);
    }
  }

  // Derived activity log — chronological list of every event we can
  // reconstruct from the contract row. No new schema required.
  const activityEntries = useMemo(() => {
    if (!contract) return [] as { ts: string; label: string; detail: string }[];
    const entries: { ts: string; label: string; detail: string }[] = [];
    entries.push({ ts: contract.createdAt, label: "Draft created", detail: `By ${profile?.name || "owner"}` });
    if (contract.sentAt) {
      const recipientCount = 1 + additionalSigners.length;
      entries.push({ ts: contract.sentAt, label: "Sent", detail: `To ${recipientCount} signer${recipientCount === 1 ? "" : "s"}` });
    }
    if (contract.lastReminderSentAt) {
      entries.push({ ts: contract.lastReminderSentAt, label: "Reminder sent", detail: "Unsigned signers were re-emailed" });
    }
    if (contract.clientSignedAt && contract.clientSignature) {
      entries.push({
        ts: contract.clientSignedAt,
        label: "Client signed",
        detail: `${contract.clientSignature.name || "Client"} · IP ${contract.clientSignature.ip || "unknown"}`,
      });
    }
    for (const s of additionalSigners) {
      if (s.signedAt && s.signature) {
        entries.push({
          ts: s.signedAt,
          label: `${s.role || "Signer"} signed`,
          detail: `${s.signature.name || s.name} · IP ${s.signature.ip || "unknown"}`,
        });
      }
    }
    if (contract.ownerSignedAt && contract.ownerSignature) {
      entries.push({
        ts: contract.ownerSignedAt,
        label: "Owner countersigned",
        detail: `${contract.ownerSignature.name || profile?.name || "Owner"} · contract completed`,
      });
    }
    return entries.sort((a, b) => a.ts.localeCompare(b.ts));
  }, [contract, profile, additionalSigners]);

  function copySignLink() {
    if (!contract) return;
    const url = `${window.location.origin}/sign/${contract.signToken}`;
    navigator.clipboard.writeText(url).then(() => toast.success("Sign link copied"));
  }

  // ----- Render -----
  if (!contract) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center text-center px-6">
        <div>
          <p className="text-sm text-muted-foreground mb-2">Contract not found.</p>
          <Button variant="outline" onClick={() => setLocation("/contracts")}>Back to contracts</Button>
        </div>
      </div>
    );
  }

  const saveLabel = saveStatus === "saving" ? "Saving…"
    : saveStatus === "saved" ? "All changes saved"
    : saveStatus === "error" ? "Save failed — retry"
    : "";

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* ===== Top bar ===== */}
      <div className="border-b border-border bg-card/40 px-4 sm:px-6 py-3 flex items-center gap-3 flex-wrap">
        <button onClick={() => setLocation("/contracts")} className="text-muted-foreground hover:text-foreground" title="Back to contracts">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={isReadOnly}
            className="bg-transparent border-none outline-none text-base font-semibold text-foreground min-w-0 truncate focus:ring-0 disabled:opacity-90"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}
            placeholder="Untitled contract"
          />
          <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded border tabular-nums shrink-0", STATUS_BADGE_STYLE[contract.status])}>
            {STATUS_LABELS[contract.status]}
          </span>
          {saveLabel && (
            <span className={cn("text-xs hidden sm:inline shrink-0", saveStatus === "error" ? "text-destructive" : "text-muted-foreground")}>
              {saveLabel}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground rounded-md border border-border hover:bg-secondary inline-flex items-center gap-1">
                Actions <MoreHorizontal className="w-3.5 h-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setActivityOpen(true)}>
                <AlertCircle className="w-4 h-4 mr-2" /> View activity log
              </DropdownMenuItem>
              <DropdownMenuItem onClick={copySignLink}>
                <Copy className="w-4 h-4 mr-2" /> Copy sign link
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => window.open(`/sign/${contract.signToken}`, "_blank")}>
                <ExternalLink className="w-4 h-4 mr-2" /> Open public link
              </DropdownMenuItem>
              {contract.status !== "completed" && (
                <DropdownMenuItem onClick={async () => { await updateContract(contract.id, { status: "void" }); toast.success("Contract voided"); }}>
                  <X className="w-4 h-4 mr-2" /> Void contract
                </DropdownMenuItem>
              )}
              {(contract.status === "draft" || contract.status === "void") && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={async () => {
                      if (!confirm(`Delete "${title}"? This can't be undone.`)) return;
                      await deleteContract(contract.id);
                      toast.success("Deleted");
                      setLocation("/contracts");
                    }}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="w-4 h-4 mr-2" /> Delete
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          <button
            onClick={() => setPreviewOpen(true)}
            className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground rounded-md border border-border hover:bg-secondary inline-flex items-center gap-1.5"
            title="Preview the signing surface as your client will see it"
          >
            <Eye className="w-3.5 h-3.5" /> Preview
          </button>

          {isDraft && (
            <Button onClick={sendContract} disabled={sending} className="gap-1.5">
              <Send className="w-4 h-4" /> {sending ? "Sending…" : "Send Contract"}
            </Button>
          )}
          {contract.status === "client_signed" && (() => {
            const additionalUnsigned = additionalSigners.filter(s => !s.signedAt);
            const blocked = additionalUnsigned.length > 0;
            return blocked ? (
              <Button
                disabled
                className="gap-1.5 cursor-not-allowed opacity-60"
                title={`Waiting on: ${additionalUnsigned.map(s => s.name).join(", ")}`}
              >
                <PenTool className="w-4 h-4" /> Awaiting other signers ({additionalUnsigned.length})
              </Button>
            ) : (
              <Button onClick={() => setSignOpen(true)} className="gap-1.5 bg-amber-600 hover:bg-amber-700 text-white">
                <PenTool className="w-4 h-4" /> Countersign
              </Button>
            );
          })()}
          {contract.status === "sent" && (
            <Button onClick={sendContract} disabled={sending} variant="outline" className="gap-1.5">
              <Send className="w-4 h-4" /> Resend
            </Button>
          )}
        </div>
      </div>

      {/* ===== Body ===== */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)] overflow-hidden">
        {/* Sidebar */}
        <aside className="border-r border-border bg-card/30 overflow-y-auto p-4 space-y-6 lg:max-h-[calc(100vh-58px)]">
          {/* Signers */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Signers</h3>
            <div className="space-y-2">
              {/* Client signer */}
              <SignerRow
                initial={(client?.contactName || client?.company || "?").slice(0, 1)}
                name={client?.contactName || client?.company || "Client"}
                email={clientEmail}
                role="Client"
                signed={!!contract.clientSignedAt}
                onEditEmail={isDraft ? (val) => setClientEmail(val) : undefined}
              />
              {/* Owner signer */}
              <SignerRow
                initial={(profile?.name || "?").slice(0, 1)}
                name={`${profile?.name || "Owner"} (You)`}
                email={profile?.email || ""}
                role="Owner"
                signed={!!contract.ownerSignedAt}
              />
              {/* Additional signers */}
              {additionalSigners.map(s => (
                <SignerRow
                  key={s.id}
                  initial={(s.name || "?").slice(0, 1)}
                  name={s.name}
                  email={s.email}
                  role={s.role}
                  signed={!!s.signedAt}
                  onRemove={isDraft ? () => setAdditionalSigners(arr => arr.filter(x => x.id !== s.id)) : undefined}
                />
              ))}
              {isDraft && (
                <button
                  onClick={() => setAddSignerOpen(true)}
                  className="w-full text-xs text-primary hover:text-primary/80 inline-flex items-center gap-1.5 px-2 py-1.5"
                >
                  <Plus className="w-3.5 h-3.5" /> Add signer
                </button>
              )}
            </div>
          </section>

          {/* Settings */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Settings</h3>

            <div className="space-y-1.5 mb-4">
              <Label className="text-xs flex items-center justify-between">
                <span>Document Expiry</span>
                <Switch
                  checked={!!documentExpiresAt}
                  onCheckedChange={(checked) => {
                    if (!isDraft) return;
                    if (checked) {
                      // Default to 30 days from now
                      const d = new Date();
                      d.setDate(d.getDate() + 30);
                      setDocumentExpiresAt(d.toISOString().slice(0, 10));
                    } else {
                      setDocumentExpiresAt(null);
                    }
                  }}
                  disabled={!isDraft}
                />
              </Label>
              {documentExpiresAt && (
                <Input
                  type="date"
                  value={documentExpiresAt.slice(0, 10)}
                  onChange={(e) => setDocumentExpiresAt(e.target.value || null)}
                  disabled={!isDraft}
                  className="bg-secondary border-border text-xs h-8 mt-1"
                />
              )}
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                Auto-void if the contract isn't signed by this date.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs flex items-center justify-between">
                <span>Document Reminders</span>
                <Switch
                  checked={remindersEnabled}
                  onCheckedChange={(checked) => isDraft && setRemindersEnabled(checked)}
                  disabled={!isDraft}
                />
              </Label>
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                Email unsigned signers every 3 days until the contract is completed.
              </p>
            </div>
          </section>

          {/* Status hints */}
          {contract.status === "sent" && (
            <div className="rounded-md border border-blue-500/30 bg-blue-500/5 p-3 text-xs">
              <p className="text-blue-300 font-medium mb-1">Awaiting client signature</p>
              <p className="text-muted-foreground leading-relaxed">Sent to {clientEmail} {contract.sentAt ? `on ${new Date(contract.sentAt).toLocaleDateString()}` : ""}.</p>
              {remindersEnabled && (() => {
                // Compute next reminder fire from lastReminderSentAt + 3d (or
                // sentAt + 3d if no reminder has fired yet).
                const base = contract.lastReminderSentAt || contract.sentAt;
                if (!base) return null;
                const next = new Date(new Date(base).getTime() + 3 * 86400_000);
                return <p className="text-muted-foreground leading-relaxed mt-1.5 text-[11px]">Next reminder: {next.toLocaleDateString()}</p>;
              })()}
            </div>
          )}
          {contract.status === "client_signed" && (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
              <p className="text-amber-300 font-medium mb-1 flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5" /> Your signature needed</p>
              <p className="text-muted-foreground leading-relaxed">Client signed on {contract.clientSignedAt ? new Date(contract.clientSignedAt).toLocaleDateString() : "—"}.</p>
            </div>
          )}
        </aside>

        {/* Main canvas — subtle paper-grain texture ties the editor to
            the cream-paper letterhead reading surface. */}
        <main
          className="overflow-y-auto p-4 sm:p-8"
          style={{
            backgroundImage: `url("data:image/svg+xml;utf8,${encodeURIComponent(
              `<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix type='matrix' values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.04 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>`,
            )}")`,
            backgroundRepeat: "repeat",
          }}
        >
          <div className="max-w-4xl mx-auto">
            {/* Read-only sticky banner — clear cue that the document is sealed. */}
            {!isDraft && (
              <div className={cn(
                "sticky top-0 z-10 mb-4 rounded-lg px-4 py-2.5 text-xs flex items-center gap-2 shadow-sm backdrop-blur",
                contract.status === "sent" && "bg-blue-500/10 border border-blue-500/30 text-blue-200",
                contract.status === "client_signed" && "bg-amber-500/10 border border-amber-500/30 text-amber-200",
                contract.status === "completed" && "bg-emerald-500/10 border border-emerald-500/30 text-emerald-200",
                contract.status === "void" && "bg-red-500/10 border border-red-500/30 text-red-200",
              )}>
                {contract.status === "sent" && <>📤 Sent {contract.sentAt ? `on ${new Date(contract.sentAt).toLocaleDateString()}` : ""} — awaiting signatures. Read-only.</>}
                {contract.status === "client_signed" && <>✍️ Client signed {contract.clientSignedAt ? `on ${new Date(contract.clientSignedAt).toLocaleDateString()}` : ""} — your countersign is needed. Read-only.</>}
                {contract.status === "completed" && <>✅ Completed {contract.ownerSignedAt ? `on ${new Date(contract.ownerSignedAt).toLocaleDateString()}` : ""} — fully executed.</>}
                {contract.status === "void" && <>🚫 Voided — no longer signable.</>}
              </div>
            )}

            {/* Bracket placeholder progress (only meaningful while editing) */}
            {isDraft && placeholders.length > 0 && (() => {
              const total = placeholders.length;
              const filled = placeholders.filter(p => (fieldValues[p] || "").trim() !== "").length;
              const remaining = total - filled;
              const pct = total === 0 ? 0 : Math.round((filled / total) * 100);
              return (
                <div className="rounded-lg border border-border bg-secondary/40 p-3 space-y-2 mb-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className={cn("text-xs font-semibold", remaining === 0 ? "text-emerald-300" : "text-amber-300")}>
                      {filled} of {total} fields filled
                      {remaining > 0 && <span className="text-muted-foreground font-normal"> — {remaining} to go</span>}
                      {remaining === 0 && <span className="text-muted-foreground font-normal"> — ready to send</span>}
                    </span>
                    {remaining > 0 && (
                      <button
                        onClick={() => editorRef.current?.focusFirstEmpty()}
                        className="text-xs px-2.5 py-1 rounded-md bg-primary/15 text-primary border border-primary/30 hover:bg-primary/25"
                      >
                        Next empty field →
                      </button>
                    )}
                  </div>
                  <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                    <div className={cn("h-full transition-all", remaining === 0 ? "bg-emerald-500" : "bg-amber-500")} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })()}

            {isDraft ? (
              <WysiwygContractEditor
                ref={editorRef}
                value={content}
                onChange={setContent}
                placeholder="Start typing your contract, paste from Word, or upload a PDF using the toolbar."
                minHeight="60vh"
                fieldValues={fieldValues}
                onFieldValuesChange={setFieldValues}
                onPlaceholdersChange={setPlaceholders}
              />
            ) : (
              // Read-only — render the contract as it appears to the client.
              <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                <ContractLetterhead
                  orgName={data.organization?.name}
                  ownerName={profile?.name}
                  orgLogo={data.organization?.logoUrl}
                  businessInfo={data.organization?.businessInfo}
                  intro="The contract is ready for review and signature. If you have any questions, just ask."
                />
                {/^\s*<(p|h[1-6]|ul|ol|div|span|strong|em|br)\b/i.test(content) ? (
                  <div className="px-6 sm:px-10 py-8 contract-html-light" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(content) }} />
                ) : (
                  <div className="px-6 sm:px-10 py-8 text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{content}</div>
                )}
                {contract.clientSignature && <SignatureBlock title="Client Signature" sig={contract.clientSignature} />}
                {contract.ownerSignature && <SignatureBlock title="Owner Signature" sig={contract.ownerSignature} />}
                {additionalSigners.filter(s => s.signature).map(s => (
                  <SignatureBlock key={s.id} title={`${s.name} — ${s.role}`} sig={s.signature!} />
                ))}
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Activity log — chronological derived timeline */}
      <Dialog open={activityOpen} onOpenChange={setActivityOpen}>
        <DialogContent className="bg-card border-border text-foreground max-w-md">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Activity log</DialogTitle>
            <p className="text-xs text-muted-foreground">Chronological record of every event on this contract.</p>
          </DialogHeader>
          <div className="space-y-3 py-2 max-h-[60vh] overflow-y-auto">
            {activityEntries.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No activity yet.</p>
            ) : (
              activityEntries.map((e, i) => (
                <div key={i} className="flex gap-3 pb-3 border-b border-border last:border-b-0 last:pb-0">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">{e.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{e.detail}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5 tabular-nums">{new Date(e.ts).toLocaleString()}</p>
                  </div>
                </div>
              ))
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setActivityOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview — renders the read-only client view inside the app */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="bg-card border-border text-foreground max-w-3xl max-h-[90vh] overflow-y-auto p-0">
          <DialogHeader className="px-6 pt-5 pb-3 border-b border-border">
            <DialogTitle style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Client preview</DialogTitle>
            <p className="text-xs text-muted-foreground">This is how the client sees the contract on the public sign page.</p>
          </DialogHeader>
          <div className="bg-white text-black">
            <ContractLetterhead
              orgName={data.organization?.name}
              ownerName={profile?.name}
              orgLogo={data.organization?.logoUrl}
              businessInfo={data.organization?.businessInfo}
              intro="The contract is ready for review and signature. If you have any questions, just ask."
            />
            {/^\s*<(p|h[1-6]|ul|ol|div|span|strong|em|br)\b/i.test(content) ? (
              <div className="px-6 sm:px-10 py-6 contract-html-light" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(content) }} />
            ) : (
              <div className="px-6 sm:px-10 py-6 text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{content || <em className="text-gray-400">Empty contract — start typing in the editor.</em>}</div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Add signer modal */}
      <AddSignerModal
        open={addSignerOpen}
        onClose={() => setAddSignerOpen(false)}
        onCreate={(s) => {
          setAdditionalSigners(arr => [...arr, s]);
          setAddSignerOpen(false);
        }}
      />

      {/* Owner countersign modal */}
      <CountersignModal
        open={signOpen}
        onClose={() => setSignOpen(false)}
        defaultName={profile?.name || ""}
        ownerEmail={profile?.email || ""}
        onSign={async (sig) => {
          await updateContract(contract.id, {
            ownerSignature: sig,
            ownerSignedAt: new Date().toISOString(),
            status: "completed",
          });
          toast.success("Contract signed and completed!");
          setSignOpen(false);
          // Fire "fully executed" emails to all parties. Best-effort —
          // failure here doesn't roll back the signature.
          try {
            const t = await getAuthToken();
            await fetch("/api/send-completed-contract-email", {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
              body: JSON.stringify({ contractId: contract.id, baseUrl: window.location.origin }),
            });
          } catch { /* silent — owner sees in toast already */ }
        }}
      />
    </div>
  );
}

// ---------- Sub-components ----------

function SignerRow({ initial, name, email, role, signed, onEditEmail, onRemove }: {
  initial: string;
  name: string;
  email: string;
  role: string;
  signed: boolean;
  onEditEmail?: (v: string) => void;
  onRemove?: () => void;
}) {
  return (
    <div className="rounded-md border border-border bg-card/60 p-2.5">
      <div className="flex items-center gap-2.5">
        <div className={cn("w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold shrink-0",
          signed ? "bg-emerald-500/20 text-emerald-300" : "bg-secondary text-foreground")}>
          {(initial || "?").toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-foreground truncate">{name}</p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{role}{signed ? " · signed" : ""}</p>
        </div>
        {onRemove && (
          <button onClick={onRemove} className="text-muted-foreground hover:text-destructive p-1" title="Remove signer">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      {onEditEmail ? (
        <Input
          value={email}
          onChange={(e) => onEditEmail(e.target.value)}
          className="bg-background/40 border-border text-xs h-8 mt-2"
          placeholder="email@example.com"
        />
      ) : (
        email && <p className="text-[11px] text-muted-foreground mt-1.5 truncate">{email}</p>
      )}
    </div>
  );
}

function SignatureBlock({ title, sig }: { title: string; sig: NonNullable<Contract["clientSignature"]> }) {
  return (
    <div className="bg-secondary/50 rounded-lg p-4 mx-6 sm:mx-10 mb-6">
      <p className="text-xs text-muted-foreground mb-1">{title}</p>
      {sig.signatureType === "drawn" ? (
        <img src={sig.signatureData} alt={title} className="h-12" />
      ) : (
        <p className="text-lg font-cursive italic text-foreground">{sig.signatureData}</p>
      )}
      <p className="text-[10px] text-muted-foreground mt-1">{sig.name} · {new Date(sig.timestamp).toLocaleString()}</p>
    </div>
  );
}

function AddSignerModal({ open, onClose, onCreate }: {
  open: boolean;
  onClose: () => void;
  onCreate: (s: AdditionalSigner) => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("Co-signer");
  useEffect(() => { if (!open) { setName(""); setEmail(""); setRole("Co-signer"); } }, [open]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-card border-border text-foreground max-w-sm">
        <DialogHeader>
          <DialogTitle style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Add a signer</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="bg-secondary border-border" autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="bg-secondary border-border" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Role</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger className="bg-secondary border-border"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-popover border-border">
                <SelectItem value="Co-signer">Co-signer</SelectItem>
                <SelectItem value="Business Partner">Business Partner</SelectItem>
                <SelectItem value="Second Shooter">Second Shooter</SelectItem>
                <SelectItem value="Witness">Witness</SelectItem>
                <SelectItem value="Other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => {
              if (!name.trim() || !email.trim()) { toast.error("Name and email required"); return; }
              onCreate({
                id: nanoid(8),
                name: name.trim(),
                email: email.trim(),
                role: role || "Co-signer",
                signToken: nanoid(32),
                signature: null,
                signedAt: null,
              });
            }}
          >
            Add signer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CountersignModal({ open, onClose, defaultName, ownerEmail, onSign }: {
  open: boolean;
  onClose: () => void;
  defaultName: string;
  ownerEmail: string;
  onSign: (sig: NonNullable<Contract["ownerSignature"]>) => void | Promise<void>;
}) {
  const [signatureType, setSignatureType] = useState<"typed" | "drawn">("typed");
  const [typedName, setTypedName] = useState(defaultName);
  const sig = useSignatureCanvas();

  useEffect(() => { if (open) setTypedName(defaultName); }, [open, defaultName]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-card border-border text-foreground max-w-md">
        <DialogHeader>
          <DialogTitle style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Countersign</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="flex gap-2">
            <button onClick={() => setSignatureType("typed")} className={cn("flex-1 py-2 rounded-lg border text-sm", signatureType === "typed" ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground")}>Type Name</button>
            <button onClick={() => setSignatureType("drawn")} className={cn("flex-1 py-2 rounded-lg border text-sm", signatureType === "drawn" ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground")}>Draw</button>
          </div>
          {signatureType === "typed" ? (
            <Input value={typedName} onChange={(e) => setTypedName(e.target.value)} className="bg-secondary border-border text-lg" autoFocus />
          ) : (
            <div>
              <div className="border border-border rounded-lg bg-[#1a1a2e] overflow-hidden">
                <canvas {...sig.canvasProps} width={350} height={120} className="w-full cursor-crosshair touch-none" />
              </div>
              <button onClick={sig.clear} className="text-xs text-muted-foreground hover:text-foreground mt-1">Clear</button>
            </div>
          )}
          <p className="text-[10px] text-muted-foreground">By signing, you agree this is your legal signature and you accept the contract terms.</p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={async () => {
            let signatureData: string;
            if (signatureType === "typed") {
              if (!typedName.trim()) { toast.error("Type your name"); return; }
              signatureData = typedName.trim();
            } else {
              if (!sig.hasInk) { toast.error("Draw your signature"); return; }
              signatureData = sig.toDataUrl();
            }
            await onSign({
              name: typedName.trim() || defaultName,
              email: ownerEmail,
              ip: "server-side",
              timestamp: new Date().toISOString(),
              signatureData,
              signatureType,
            });
          }}>Sign Contract</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
