// ============================================================
// SignContractPage — Public page for client to sign a contract
// No auth required — accessed via unique token link
// ============================================================

import { useState, useEffect } from "react";
import { useParams } from "wouter";
import { CheckCircle, AlertCircle } from "lucide-react";
import DOMPurify from "dompurify";
import { ContractLetterhead } from "@/components/ContractLetterhead";
import { useSignatureCanvas } from "@/hooks/useSignatureCanvas";
import InvoicePageRenderer from "@/components/proposal/InvoicePageRenderer";
import { ProposalBlockRenderer } from "@/components/proposal/ProposalBlockRenderer";

export default function SignContractPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;

  const [loading, setLoading] = useState(true);
  const [contract, setContract] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [signed, setSigned] = useState(false);
  const [signing, setSigning] = useState(false);
  // Set when the contract was signed but the Stripe Checkout session creation
  // failed. We still treat the sign as success and tell the client a payment
  // link will be emailed shortly. The owner can resend manually if it doesn't.
  const [paymentSoftError, setPaymentSoftError] = useState<string | null>(null);

  const [signatureType, setSignatureType] = useState<"typed" | "drawn">("typed");
  const [typedName, setTypedName] = useState("");
  const [signerEmail, setSignerEmail] = useState("");
  const sigCanvas = useSignatureCanvas({ strokeStyle: "#000000" });

  useEffect(() => {
    fetch(`/api/contract-sign?action=get&token=${token}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) setError(data.error);
        else {
          setContract(data);
          setSignerEmail(data.signer?.email || data.client_email || "");
          // For additional signers, pre-fill the typed name from their record.
          if (data.signer?.type === "additional" && data.signer?.name) {
            setTypedName(data.signer.name);
          }
          if (data.alreadySigned) setSigned(true);
        }
        setLoading(false);
      })
      .catch(() => { setError("Failed to load contract"); setLoading(false); });
  }, [token]);

  async function handleSign() {
    if (!typedName.trim() && signatureType === "typed") return;

    let signatureData: string;
    if (signatureType === "typed") {
      signatureData = typedName.trim();
    } else {
      if (!sigCanvas.hasInk) return;
      signatureData = sigCanvas.toDataUrl();
    }

    setSigning(true);
    try {
      const res = await fetch("/api/contract-sign?action=sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          signature: {
            name: typedName.trim() || "Client",
            email: signerEmail,
            signatureData,
            signatureType,
          },
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error);
      // Three branches:
      // 1) Server returned a Stripe Checkout URL → redirect immediately so
      //    the client pays the deposit on the Stripe-hosted page. Their
      //    signature is already saved server-side.
      // 2) Server reports paymentError → signature recorded but Stripe
      //    failed. Show a soft success with a payment-link-coming message.
      // 3) Plain success → no payment required, show signed confirmation.
      if (result.checkoutUrl) {
        window.location.assign(result.checkoutUrl);
        return;
      }
      if (result.paymentError) {
        setPaymentSoftError(result.paymentError);
      }
      setSigned(true);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSigning(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error && !contract) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-md text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-gray-900 mb-2">Contract Unavailable</h1>
          <p className="text-gray-500 mb-5">{error}</p>
          <button
            onClick={async () => {
              // Force a fresh fetch — bypasses any stale service worker
              // cache for the sign page.
              try {
                if (typeof caches !== "undefined") {
                  const keys = await caches.keys();
                  await Promise.all(keys.map(k => caches.delete(k)));
                }
              } catch { /* ignore — fall through to reload */ }
              window.location.reload();
            }}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium text-sm hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (signed) {
    return <PortalView contract={contract} paymentSoftError={paymentSoftError} />;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-4">
          <div>
            <p className="text-sm text-gray-400">{contract?.orgName || "Contract"}</p>
            <h1 className="text-lg font-bold text-gray-900">{contract?.title}</h1>
          </div>
          {contract?.signer?.type === "additional" && (
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-wider text-gray-400">Signing as</p>
              <p className="text-sm font-medium text-gray-900">{contract.signer.name}</p>
              <p className="text-xs text-gray-500">{contract.signer.role}</p>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-6">
        {/* Contract document — multi-page when contract.pages is set, else
            falls back to the legacy single-page content. */}
        <ContractDocumentBody contract={contract} />

        {/* Signature Section */}
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-4">Your Signature</h2>

          <div className="space-y-4">
            <div>
              <label className="text-sm text-gray-500 block mb-1">Your Full Name</label>
              <input
                value={typedName}
                onChange={e => setTypedName(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-gray-900"
                placeholder="Full legal name"
              />
            </div>

            <div>
              <label className="text-sm text-gray-500 block mb-1">Your Email</label>
              <input
                value={signerEmail}
                onChange={e => setSignerEmail(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-gray-900"
                placeholder="email@example.com"
              />
            </div>

            <div className="flex gap-2">
              <button onClick={() => setSignatureType("typed")} className={`flex-1 py-2 rounded-lg border text-sm font-medium ${signatureType === "typed" ? "border-blue-500 bg-blue-50 text-blue-600" : "border-gray-200 text-gray-500"}`}>
                Type Signature
              </button>
              <button onClick={() => setSignatureType("drawn")} className={`flex-1 py-2 rounded-lg border text-sm font-medium ${signatureType === "drawn" ? "border-blue-500 bg-blue-50 text-blue-600" : "border-gray-200 text-gray-500"}`}>
                Draw Signature
              </button>
            </div>

            {signatureType === "typed" ? (
              typedName && (
                <div className="border border-gray-200 rounded-lg p-6 bg-gray-50 text-center">
                  <p className="text-3xl italic text-gray-900" style={{ fontFamily: "cursive" }}>{typedName}</p>
                </div>
              )
            ) : (
              <div>
                <div className="border border-gray-200 rounded-lg bg-white overflow-hidden">
                  <canvas
                    {...sigCanvas.canvasProps}
                    width={600}
                    height={150}
                    className="w-full cursor-crosshair touch-none"
                  />
                </div>
                <button onClick={sigCanvas.clear} className="text-xs text-gray-400 mt-1 hover:text-gray-600">
                  Clear
                </button>
              </div>
            )}

            <p className="text-xs text-gray-400">
              By clicking "Sign Contract", you agree this constitutes your legal electronic signature and you accept the terms above. Your name, email, IP address, and timestamp will be recorded.
            </p>

            <button
              onClick={handleSign}
              disabled={signing || (!typedName.trim() && signatureType === "typed")}
              className="w-full py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {signing ? "Signing..." : "Sign Contract"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---- Portal view ----
// Renders for already-signed contracts. The same /sign/<token> URL becomes
// the client's bookmarkable dashboard for this engagement: contract status,
// project date / location, payment milestones with paid / due / overdue
// indicators. No login required — the URL token is the auth.

interface PortalMilestone {
  id?: string;
  label?: string;
  type?: "percent" | "fixed";
  percent?: number;
  fixedAmount?: number;
  dueType?: string;
  dueDate?: string;
  paidAt?: string;
}

/**
 * Renders the contract body. Multi-page (HoneyBook-style) when
 * contract.pages is set; falls back to the legacy single-page content
 * for older contracts. Each page rendered as its own paper card with
 * letterhead on top of the first agreement page only.
 */
function ContractDocumentBody({ contract }: { contract: any }) {
  const pages: Array<{ id: string; type: string; label: string; content?: string; blocks?: unknown[]; sortOrder: number }> = Array.isArray(contract?.pages) ? contract.pages : [];

  // Legacy single-page fallback.
  if (pages.length === 0) {
    const html = contract?.content || "";
    return (
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <ContractLetterhead
          orgName={contract?.orgName}
          ownerName={contract?.ownerName}
          orgLogo={contract?.orgLogo}
          businessInfo={contract?.orgBusinessInfo}
          intro="The contract is ready for review and signature. If you have any questions, just ask."
        />
        {/^\s*<(p|h[1-6]|ul|ol|div|span|strong|em|br)\b/i.test(html) ? (
          <div className="px-6 sm:px-10 py-8 text-gray-700 contract-html-light"
               dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(html) }} />
        ) : (
          <div className="px-6 sm:px-10 py-8 text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{html}</div>
        )}
      </div>
    );
  }

  // Multi-page render.
  const sorted = [...pages].sort((a, b) => a.sortOrder - b.sortOrder);
  // Letterhead goes on the first AGREEMENT page (not just the first
  // sorted page) so reordering can put an Invoice page first without
  // duplicating the contractor's header on it.
  const letterheadPageId = sorted.find(p => p.type === "agreement")?.id || sorted[0]?.id;
  const milestones: any[] = Array.isArray(contract?.payment_milestones)
    ? contract.payment_milestones
    : Array.isArray(contract?.paymentMilestones)
      ? contract.paymentMilestones
      : [];

  return (
    <div className="space-y-4">
      {sorted.map(page => {
        if (page.type === "invoice") {
          return (
            <div key={page.id} className="bg-white rounded-xl shadow-sm border overflow-hidden">
              <InvoicePageRenderer
                contractTitle={contract?.title || ""}
                contractId={contract?.id}
                org={{ name: contract?.orgName || "", businessInfo: contract?.orgBusinessInfo || {}, logoUrl: contract?.orgLogo || "" } as any}
                client={null}
                milestones={milestones}
              />
            </div>
          );
        }
        // Agreement / payment / custom — render the page's blocks via the
        // ProposalBlockRenderer (or fall back to inline content HTML).
        const html = page.content || "";
        return (
          <div key={page.id} className="bg-white rounded-xl shadow-sm border overflow-hidden">
            {/* Only the first AGREEMENT page gets the letterhead. */}
            {page.id === letterheadPageId && (
              <ContractLetterhead
                orgName={contract?.orgName}
                ownerName={contract?.ownerName}
                orgLogo={contract?.orgLogo}
                businessInfo={contract?.orgBusinessInfo}
                intro="The contract is ready for review and signature."
              />
            )}
            {Array.isArray(page.blocks) && page.blocks.length > 0 ? (
              <div className="px-6 sm:px-10 py-8">
                <ProposalBlockRenderer
                  page={{ id: page.id, type: (page.type as any), label: page.label, content: page.content || "", blocks: page.blocks as any, sortOrder: page.sortOrder }}
                  libraryPackages={[]}
                />
              </div>
            ) : html ? (
              <div className="px-6 sm:px-10 py-8 text-gray-700 contract-html-light"
                   dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(html) }} />
            ) : (
              <div className="px-6 sm:px-10 py-8 text-sm text-gray-400 italic">{page.label} — empty page</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function PortalView({ contract, paymentSoftError }: { contract: any; paymentSoftError: string | null }) {
  if (!contract) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-md text-center">
          <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-gray-900 mb-2">Contract Signed!</h1>
          <p className="text-gray-500">Thank you for signing.</p>
        </div>
      </div>
    );
  }

  const milestones: PortalMilestone[] = Array.isArray(contract.payment_milestones)
    ? contract.payment_milestones
    : Array.isArray(contract.paymentMilestones)
      ? contract.paymentMilestones
      : [];
  const total = milestones.reduce((s, m) => s + (m.type === "fixed" ? Number(m.fixedAmount ?? 0) : 0), 0);
  const paidTotal = milestones
    .filter(m => m.paidAt)
    .reduce((s, m) => s + (m.type === "percent"
      ? Math.round(total * (m.percent ?? 0) / 100 * 100) / 100
      : Number(m.fixedAmount ?? 0)), 0);
  const status = contract.status;
  const statusLabel = status === "completed"
    ? "Fully executed"
    : status === "client_signed"
      ? "Awaiting countersignature"
      : "Signed";
  const projectDateLabel = contract.projectDate
    ? new Date(contract.projectDate + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })
    : null;

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <div className="flex items-center gap-3 mb-1">
            <CheckCircle className="w-5 h-5 text-green-500" />
            <p className="text-xs uppercase tracking-wider font-semibold text-green-700">{statusLabel}</p>
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-1">{contract.title}</h1>
          {contract.orgName && <p className="text-sm text-gray-500">{contract.orgName}</p>}
          {paymentSoftError && (
            <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-xs font-semibold text-amber-900 uppercase tracking-wider mb-1">Payment link pending</p>
              <p className="text-sm text-amber-800">We'll email you a payment link shortly.</p>
            </div>
          )}
        </div>

        {projectDateLabel && (
          <div className="bg-white rounded-xl shadow-sm border p-6">
            <h2 className="text-xs uppercase tracking-wider font-semibold text-gray-500 mb-3">Your project</h2>
            <p className="text-base font-semibold text-gray-900">{projectDateLabel}</p>
            {contract.projectLocation && <p className="text-sm text-gray-500 mt-1">{contract.projectLocation}</p>}
          </div>
        )}

        {milestones.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border p-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs uppercase tracking-wider font-semibold text-gray-500">Payment schedule</h2>
              {total > 0 && (
                <p className="text-xs text-gray-500 tabular-nums">
                  ${paidTotal.toFixed(2)} of ${total.toFixed(2)} paid
                </p>
              )}
            </div>
            <div className="space-y-2">
              {milestones.map((m, i) => {
                const amount = m.type === "percent"
                  ? Math.round(total * (m.percent ?? 0) / 100 * 100) / 100
                  : Number(m.fixedAmount ?? 0);
                const due = m.dueDate
                  ? new Date(m.dueDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                  : m.dueType === "at_signing" ? "At signing" : "—";
                const isPaid = !!m.paidAt;
                return (
                  <div key={m.id || i} className="flex items-center justify-between py-2 border-b last:border-b-0 border-gray-100">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{m.label || `Payment ${i + 1}`}</p>
                      <p className="text-xs text-gray-500">{due}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-gray-900 tabular-nums">${amount.toFixed(2)}</p>
                      {isPaid
                        ? <p className="text-[10px] uppercase tracking-wider text-green-600 font-semibold">Paid</p>
                        : <p className="text-[10px] uppercase tracking-wider text-amber-600 font-semibold">Due</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Signed contract document — collapsible. Lets the client re-read
            the agreement they signed without leaving the portal. Closed by
            default so the status cards above stay focal. */}
        <details className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <summary className="px-6 py-4 cursor-pointer text-sm font-medium text-gray-700 hover:bg-gray-50 flex items-center justify-between">
            <span>View your signed contract</span>
            <span className="text-[11px] text-gray-400">Click to expand</span>
          </summary>
          <div className="border-t border-gray-100">
            <ContractDocumentBody contract={contract} />
          </div>
        </details>

        <p className="text-center text-xs text-gray-400 pt-4">
          Bookmark this page to come back anytime.
        </p>
      </div>
    </div>
  );
}
