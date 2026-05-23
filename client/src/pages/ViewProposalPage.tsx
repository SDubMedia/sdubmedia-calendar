// ============================================================
// ViewProposalPage — Public page for client to review, sign, & pay
// No auth required — accessed via unique token link
// V2: Package selection → Agreement pages → Sign → Pay milestones
// ============================================================

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useSearch } from "wouter";
import { CheckCircle, AlertCircle, DollarSign, Check } from "lucide-react";
import { ProposalBlockRenderer } from "@/components/proposal/ProposalBlockRenderer";

export default function ViewProposalPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const search = useSearch();
  const searchParams = new URLSearchParams(search);
  const paidParam = searchParams.get("paid");
  const sessionIdParam = searchParams.get("session_id");

  const [loading, setLoading] = useState(true);
  const [proposal, setProposal] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  // Set when the proposal's expires_at has passed. Renders a dedicated
  // "link expired" screen instead of the live form.
  const [expired, setExpired] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [paymentVerified, setPaymentVerified] = useState(false);
  const [verifyingPayment, setVerifyingPayment] = useState(false);

  // Package selection (V2)
  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(null);

  const [signatureType, setSignatureType] = useState<"typed" | "drawn">("typed");
  const [typedName, setTypedName] = useState("");
  const [signerEmail, setSignerEmail] = useState("");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  // Load proposal + track view
  useEffect(() => {
    fetch(`/api/proposal-view?token=${token}`).catch(() => {});

    fetch(`/api/proposal-accept?action=get&token=${token}`)
      .then(async r => ({ status: r.status, body: await r.json() }))
      .then(({ status, body }) => {
        if (body.error) {
          setError(body.error);
          if (status === 410 || body.expired) setExpired(true);
        } else {
          setProposal(body);
          setSignerEmail(body.clientEmail || "");
          if (body.alreadyAccepted) setAccepted(true);
          if (body.paidAt) setPaymentVerified(true);
          // Restore in-progress selections from localStorage if the client
          // closed the tab and came back. Server-stored selectedPackageId
          // (if set) takes precedence; only fall back to local draft when
          // nothing is committed yet. Lets the partner-review use case work
          // without losing picks.
          const draftKey = `slate.proposal-draft.${token}`;
          let restoredPackage: string | null = null;
          let restoredEmail: string | null = null;
          try {
            const raw = localStorage.getItem(draftKey);
            if (raw) {
              const draft = JSON.parse(raw);
              if (typeof draft.selectedPackageId === "string") restoredPackage = draft.selectedPackageId;
              if (typeof draft.signerEmail === "string") restoredEmail = draft.signerEmail;
            }
          } catch { /* corrupt localStorage — ignore */ }

          if (body.selectedPackageId) setSelectedPackageId(body.selectedPackageId);
          else if (restoredPackage && (body.packages || []).some((p: { id: string }) => p.id === restoredPackage)) {
            setSelectedPackageId(restoredPackage);
          }
          else if (body.packages?.length === 1) setSelectedPackageId(body.packages[0].id);

          if (restoredEmail && !body.clientEmail) setSignerEmail(restoredEmail);
        }
        setLoading(false);
      })
      .catch(() => { setError("Failed to load proposal"); setLoading(false); });
  }, [token]);

  // Persist in-progress selections to localStorage so closing the tab
  // doesn't lose them. Cleared on successful submit. Skipped while loading
  // so the initial-load setSelectedPackageId() doesn't overwrite a future
  // restore. Per-token key isolates drafts across multiple proposals.
  useEffect(() => {
    if (loading || !token) return;
    if (accepted) return; // don't save after submit
    const draftKey = `slate.proposal-draft.${token}`;
    try {
      localStorage.setItem(draftKey, JSON.stringify({
        selectedPackageId,
        signerEmail,
        savedAt: Date.now(),
      }));
    } catch { /* private mode / quota — ignore */ }
  }, [loading, token, accepted, selectedPackageId, signerEmail]);

  // Verify payment on return from Stripe
  useEffect(() => {
    if (paidParam === "true" && sessionIdParam && token && !paymentVerified) {
      setVerifyingPayment(true);
      fetch(`/api/proposal-accept?action=verify-payment&token=${token}&sessionId=${sessionIdParam}`)
        .then(r => r.json())
        .then(data => {
          if (data.paid) { setPaymentVerified(true); setAccepted(true); }
          setVerifyingPayment(false);
        })
        .catch(() => setVerifyingPayment(false));
    }
  }, [paidParam, sessionIdParam, token, paymentVerified]);

  // Canvas drawing
  const startDraw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    setIsDrawing(true);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const x = ("touches" in e) ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = ("touches" in e) ? e.touches[0].clientY - rect.top : e.clientY - rect.top;
    ctx.beginPath(); ctx.moveTo(x, y);
  }, []);

  const draw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const x = ("touches" in e) ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = ("touches" in e) ? e.touches[0].clientY - rect.top : e.clientY - rect.top;
    ctx.lineWidth = 2; ctx.lineCap = "round"; ctx.strokeStyle = "#000000";
    ctx.lineTo(x, y); ctx.stroke();
  }, [isDrawing]);

  const stopDraw = useCallback(() => setIsDrawing(false), []);

  async function handleAccept() {
    if (!typedName.trim() && signatureType === "typed") return;
    if (!signerEmail.trim()) return;

    let signatureData: string;
    if (signatureType === "typed") {
      signatureData = typedName.trim();
    } else {
      const canvas = canvasRef.current;
      if (!canvas) return;
      signatureData = canvas.toDataURL("image/png");
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/proposal-accept?action=accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          selectedPackageId,
          signature: { name: typedName.trim() || "Client", email: signerEmail, signatureData, signatureType },
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error);

      // Submit succeeded — drop the localStorage draft so a future visit
      // doesn't try to restore stale selections.
      try { localStorage.removeItem(`slate.proposal-draft.${token}`); } catch { /* ignore */ }

      if (result.paymentRequired && result.checkoutUrl) {
        window.location.assign(result.checkoutUrl);
        return;
      }
      if (result.paymentRequired && result.paymentError) {
        setError(result.paymentError);
        setAccepted(true);
        return;
      }
      setAccepted(true);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  // ---- STATES ----

  if (loading || verifyingPayment) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-400">{verifyingPayment ? "Verifying payment..." : "Loading proposal..."}</p>
        </div>
      </div>
    );
  }

  if (expired) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-md text-center">
          <AlertCircle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-gray-900 mb-2">This link has expired</h1>
          <p className="text-gray-500">
            For security, this proposal link is no longer active. Please reach out to the sender to request a fresh link.
          </p>
        </div>
      </div>
    );
  }

  if (error && !proposal) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-md text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-gray-900 mb-2">Proposal Unavailable</h1>
          <p className="text-gray-500">{error}</p>
        </div>
      </div>
    );
  }

  if (accepted || paymentVerified) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-md text-center">
          <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-gray-900 mb-2">
            {paymentVerified ? "Proposal Accepted & Paid!" : "Proposal Accepted!"}
          </h1>
          <p className="text-gray-500">
            {paymentVerified
              ? "Thank you! Your payment has been received."
              : "Thank you for accepting. We'll be in touch shortly."}
          </p>
          {error && <p className="text-sm text-red-500 mt-3">{error}</p>}
        </div>
      </div>
    );
  }

  // ---- MAIN VIEW ----
  const packages = proposal?.packages || [];
  const hasPackages = packages.length > 0;
  const selectedPkg = hasPackages ? packages.find((p: any) => p.id === selectedPackageId) : null;

  // Fallback to legacy lineItems if no packages
  const lineItems = selectedPkg?.lineItems || proposal?.lineItems || [];
  const total = selectedPkg?.totalPrice || proposal?.total || 0;
  const milestones = selectedPkg?.paymentMilestones || [];

  // Legacy payment config fallback
  const paymentConfig = proposal?.paymentConfig || { option: "none" };
  const hasMilestones = milestones.length > 0;
  const firstMilestone = milestones.find((m: any) => m.dueType === "at_signing");
  const paymentAmount = hasMilestones && firstMilestone
    ? (firstMilestone.type === "percent" ? total * (firstMilestone.percent || 0) / 100 : firstMilestone.fixedAmount || 0)
    : paymentConfig.option === "full" ? total
    : paymentConfig.option === "deposit" ? Math.round(total * (paymentConfig.depositPercent / 100) * 100) / 100
    : 0;

  // Agreement pages
  const agreementPages = (proposal?.pages || []).filter((p: any) => p.type === "agreement" || p.type === "custom");
  const hasPages = agreementPages.length > 0;

  // Branding extracted once per render — header + footer both consume it.
  const orgLogo: string = proposal?.orgLogo || "";
  const orgBI: Record<string, string> = proposal?.orgBusinessInfo || {};
  const orgAddressLine = [orgBI.address, orgBI.city, orgBI.state, orgBI.zip].filter(Boolean).join(", ");

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Branded header — logo if set, otherwise the company name */}
      <div className="bg-white border-b px-6 py-5">
        <div className="max-w-3xl mx-auto flex items-center gap-4">
          {orgLogo ? (
            <img src={orgLogo} alt={proposal?.orgName || ""} className="h-10 w-auto object-contain" />
          ) : null}
          <div className="min-w-0">
            <p className="text-sm text-gray-500">{proposal?.orgName || "Proposal"}</p>
            <h1 className="text-lg font-bold text-gray-900 truncate">{proposal?.title}</h1>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-6">

        {/* ---- PACKAGE SELECTION ---- */}
        {hasPackages && packages.length > 1 && (
          <div className="bg-white rounded-xl shadow-sm border p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Choose Your Package</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {packages.map((pkg: any) => (
                <button
                  key={pkg.id}
                  onClick={() => setSelectedPackageId(pkg.id)}
                  className={`text-left p-5 rounded-xl border-2 transition-all ${
                    selectedPackageId === pkg.id
                      ? "border-blue-500 bg-blue-50 shadow-md"
                      : "border-gray-200 hover:border-gray-300 hover:shadow-sm"
                  }`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="text-base font-bold text-gray-900">{pkg.name}</h3>
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                      selectedPackageId === pkg.id ? "border-blue-500 bg-blue-500" : "border-gray-300"
                    }`}>
                      {selectedPackageId === pkg.id && <Check className="w-3 h-3 text-white" />}
                    </div>
                  </div>
                  {pkg.description && <p className="text-sm text-gray-500 mb-3">{pkg.description}</p>}
                  <div className="space-y-1 mb-3">
                    {pkg.lineItems?.map((li: any) => (
                      <p key={li.id || li.description} className="text-xs text-gray-600">- {li.description}</p>
                    ))}
                  </div>
                  <p className="text-xl font-bold text-gray-900 font-mono">${pkg.totalPrice?.toFixed(2)}</p>
                  {pkg.paymentMilestones?.length > 0 && (
                    <p className="text-xs text-gray-400 mt-1">
                      {pkg.paymentMilestones.length} payment{pkg.paymentMilestones.length !== 1 ? "s" : ""}
                    </p>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Single package or legacy services display */}
        {(!hasPackages || packages.length === 1) && lineItems.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4">
              {hasPackages && selectedPkg ? selectedPkg.name : "Services"}
            </h2>
            {hasPackages && selectedPkg?.description && (
              <p className="text-sm text-gray-500 mb-4">{selectedPkg.description}</p>
            )}
            <div className="divide-y divide-gray-100">
              {lineItems.map((li: any) => (
                <div key={li.id || li.description} className="py-3 flex justify-between items-start">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{li.description}</p>
                    {li.details && <p className="text-xs text-gray-500 mt-0.5">{li.details}</p>}
                    {li.quantity > 1 && <p className="text-xs text-gray-400 mt-0.5">{li.quantity} x ${Number(li.unitPrice).toFixed(2)}</p>}
                  </div>
                  <p className="text-sm font-semibold text-gray-900 font-mono">${(li.quantity * li.unitPrice).toFixed(2)}</p>
                </div>
              ))}
            </div>
            <div className="border-t border-gray-200 mt-2 pt-3 flex justify-between">
              <span className="text-sm font-bold text-gray-900">Total</span>
              <span className="text-lg font-bold text-gray-900 font-mono">${total.toFixed(2)}</span>
            </div>
          </div>
        )}

        {/* ---- PAYMENT SCHEDULE (milestones) ---- */}
        {hasMilestones && selectedPackageId && (
          <div className="bg-white rounded-xl shadow-sm border p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Payment Schedule</h2>
            <div className="space-y-3">
              {milestones.map((ms: any, idx: number) => {
                const amount = ms.type === "percent" ? total * (ms.percent || 0) / 100 : ms.fixedAmount || 0;
                return (
                  <div key={ms.id || idx} className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-full border-2 border-gray-300 flex items-center justify-center text-xs font-bold text-gray-400 shrink-0">
                      {idx + 1}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900">{ms.label}</p>
                      <p className="text-xs text-gray-400">
                        {ms.dueType === "at_signing" ? "Due at signing" : ms.dueType === "relative_days" ? `Due ${ms.dueDays} days after signing` : ms.dueDate ? `Due ${ms.dueDate}` : ""}
                      </p>
                    </div>
                    <p className="text-sm font-semibold text-gray-900 font-mono">${amount.toFixed(2)}</p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ---- AGREEMENT PAGES (V2 multi-page) ----
             Each page renders via ProposalBlockRenderer, which uses page.blocks
             when present and falls back to sanitized page.content for legacy
             templates. Fixes the original rendering bug where raw HTML tags
             were displayed as text in a whitespace-pre-wrap div. */}
        {hasPages && agreementPages.map((page: any) => (
          <div key={page.id} className="space-y-2">
            <h2 className="text-lg font-bold text-gray-900 px-2">{page.label || "Agreement"}</h2>
            <ProposalBlockRenderer page={page} libraryPackages={proposal?.libraryPackages || []} />
          </div>
        ))}

        {/* Fallback: legacy contractContent (proposal has no pages array yet) */}
        {!hasPages && proposal?.contractContent && (
          <div className="space-y-2">
            <h2 className="text-lg font-bold text-gray-900 px-2">Agreement</h2>
            <ProposalBlockRenderer
              page={{
                id: "legacy",
                type: "agreement",
                label: "Agreement",
                content: proposal.contractContent,
                sortOrder: 0,
              }}
              libraryPackages={proposal?.libraryPackages || []}
            />
          </div>
        )}

        {/* ---- SIGN & ACCEPT ---- */}
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-4">
            {paymentAmount > 0 ? "Sign & Pay" : "Accept Proposal"}
          </h2>

          {hasPackages && !selectedPackageId && packages.length > 1 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
              <p className="text-sm text-amber-700">Please select a package above before signing.</p>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="text-sm text-gray-500 block mb-1">Your Full Name</label>
              <input value={typedName} onChange={e => setTypedName(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-gray-900" placeholder="Full legal name" />
            </div>
            <div>
              <label className="text-sm text-gray-500 block mb-1">Your Email</label>
              <input value={signerEmail} onChange={e => setSignerEmail(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-gray-900" placeholder="email@example.com" />
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
                  <canvas ref={canvasRef} width={600} height={150} className="w-full cursor-crosshair touch-none"
                    onMouseDown={startDraw} onMouseMove={draw} onMouseUp={stopDraw} onMouseLeave={stopDraw}
                    onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={stopDraw} />
                </div>
                <button onClick={() => { const c = canvasRef.current; if (c) c.getContext("2d")?.clearRect(0, 0, c.width, c.height); }} className="text-xs text-gray-400 mt-1 hover:text-gray-600">Clear</button>
              </div>
            )}

            <p className="text-xs text-gray-400">
              By clicking below, you agree this constitutes your legal electronic signature and you accept the services and terms above.
            </p>

            {error && <p className="text-sm text-red-500">{error}</p>}

            <button
              onClick={handleAccept}
              disabled={submitting || (!typedName.trim() && signatureType === "typed") || !signerEmail.trim() || (hasPackages && packages.length > 1 && !selectedPackageId)}
              className="w-full py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {submitting ? "Processing..." : (
                <>
                  {paymentAmount > 0 && <DollarSign className="w-4 h-4" />}
                  {paymentAmount > 0 ? `Sign & Pay $${paymentAmount.toFixed(2)}` : "Accept Proposal"}
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Business info footer — clients see the contractor's company name,
          address, phone, and email instead of just "Powered by Slate". */}
      <div className="border-t border-gray-200 mt-6">
        <div className="max-w-3xl mx-auto px-6 py-5 text-center text-xs text-gray-500 space-y-1">
          {proposal?.orgName && (
            <p className="font-semibold text-gray-700">{proposal.orgName}</p>
          )}
          {orgAddressLine && <p>{orgAddressLine}</p>}
          <p>
            {orgBI.phone && <span>{orgBI.phone}</span>}
            {orgBI.phone && orgBI.email && <span className="mx-1.5">·</span>}
            {orgBI.email && <span>{orgBI.email}</span>}
          </p>
          <p className="text-gray-300 pt-2">Powered by Slate</p>
        </div>
      </div>
    </div>
  );
}
