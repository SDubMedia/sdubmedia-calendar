// ============================================================
// ViewProposalPage — Public page for client to review, sign, & pay
// No auth required — accessed via unique token link
// Unified flow: services → agreement → sign → pay (if required)
// ============================================================

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useSearch } from "wouter";
import { CheckCircle, AlertCircle, DollarSign } from "lucide-react";

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
  const [accepted, setAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [paymentVerified, setPaymentVerified] = useState(false);
  const [verifyingPayment, setVerifyingPayment] = useState(false);

  const [signatureType, setSignatureType] = useState<"typed" | "drawn">("typed");
  const [typedName, setTypedName] = useState("");
  const [signerEmail, setSignerEmail] = useState("");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  // Load proposal
  useEffect(() => {
    fetch(`/api/proposal-accept?action=get&token=${token}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) setError(data.error);
        else {
          setProposal(data);
          setSignerEmail(data.clientEmail || "");
          if (data.alreadyAccepted) setAccepted(true);
          if (data.paidAt) setPaymentVerified(true);
        }
        setLoading(false);
      })
      .catch(() => { setError("Failed to load proposal"); setLoading(false); });
  }, [token]);

  // Verify payment on return from Stripe
  useEffect(() => {
    if (paidParam === "true" && sessionIdParam && token && !paymentVerified) {
      setVerifyingPayment(true);
      fetch(`/api/proposal-accept?action=verify-payment&token=${token}&sessionId=${sessionIdParam}`)
        .then(r => r.json())
        .then(data => {
          if (data.paid) {
            setPaymentVerified(true);
            setAccepted(true);
          }
          setVerifyingPayment(false);
        })
        .catch(() => setVerifyingPayment(false));
    }
  }, [paidParam, sessionIdParam, token]);

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
    ctx.beginPath();
    ctx.moveTo(x, y);
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
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#000000";
    ctx.lineTo(x, y);
    ctx.stroke();
  }, [isDrawing]);

  const stopDraw = useCallback(() => setIsDrawing(false), []);

  async function handleAccept() {
    if (!typedName.trim() && signatureType === "typed") return;
    if (!signerEmail.trim()) return;
    setSubmitting(true);

    let signatureData = "";
    if (signatureType === "typed") {
      signatureData = typedName.trim();
    } else {
      const canvas = canvasRef.current;
      if (!canvas) return;
      signatureData = canvas.toDataURL("image/png");
    }

    try {
      const res = await fetch("/api/proposal-accept?action=accept", {
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

      if (result.paymentRequired && result.checkoutUrl) {
        // Redirect to Stripe Checkout
        window.location.href = result.checkoutUrl;
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
    const paymentNeeded = proposal?.paymentConfig?.option !== "none";
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-md text-center">
          <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-gray-900 mb-2">
            {paymentVerified ? "Proposal Accepted & Paid!" : "Proposal Accepted!"}
          </h1>
          <p className="text-gray-500">
            {paymentVerified
              ? "Thank you! Your payment has been received and the proposal owner will countersign shortly."
              : paymentNeeded
                ? "Your signature has been recorded. Complete payment to finalize."
                : "Thank you for accepting. The proposal owner will be notified and will countersign shortly."}
          </p>
          {error && <p className="text-sm text-red-500 mt-3">{error}</p>}
        </div>
      </div>
    );
  }

  // ---- MAIN VIEW ----
  const lineItems = proposal?.lineItems || [];
  const total = proposal?.total || 0;
  const paymentConfig = proposal?.paymentConfig || { option: "none" };
  const depositAmount = paymentConfig.option === "deposit"
    ? Math.round(total * (paymentConfig.depositPercent / 100) * 100) / 100
    : 0;
  const paymentAmount = paymentConfig.option === "full" ? total : paymentConfig.option === "deposit" ? depositAmount : 0;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4">
        <div className="max-w-3xl mx-auto">
          <p className="text-sm text-gray-400">{proposal?.orgName || "Proposal"}</p>
          <h1 className="text-lg font-bold text-gray-900">{proposal?.title}</h1>
        </div>
      </div>

      <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-6">

        {/* ---- SERVICES ---- */}
        {lineItems.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Services</h2>
            <div className="divide-y divide-gray-100">
              {lineItems.map((li: any, idx: number) => (
                <div key={idx} className="py-3 flex justify-between items-start">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{li.description}</p>
                    {li.details && <p className="text-xs text-gray-500 mt-0.5">{li.details}</p>}
                    {li.quantity > 1 && (
                      <p className="text-xs text-gray-400 mt-0.5">{li.quantity} × ${Number(li.unitPrice).toFixed(2)}</p>
                    )}
                  </div>
                  <p className="text-sm font-semibold text-gray-900 font-mono">${(li.quantity * li.unitPrice).toFixed(2)}</p>
                </div>
              ))}
            </div>
            <div className="border-t border-gray-200 mt-2 pt-3 flex justify-between">
              <span className="text-sm font-bold text-gray-900">Total</span>
              <span className="text-lg font-bold text-gray-900 font-mono">${total.toFixed(2)}</span>
            </div>
            {paymentConfig.option === "deposit" && (
              <p className="text-xs text-gray-500 mt-2 text-right">
                {paymentConfig.depositPercent}% deposit (<span className="font-mono font-semibold">${depositAmount.toFixed(2)}</span>) due at signing
              </p>
            )}
            {paymentConfig.option === "full" && (
              <p className="text-xs text-gray-500 mt-2 text-right">Full payment due at signing</p>
            )}
          </div>
        )}

        {/* ---- AGREEMENT ---- */}
        {proposal?.contractContent && (
          <div className="bg-white rounded-xl shadow-sm border p-6 sm:p-8">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Agreement</h2>
            <div className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap max-h-[60vh] overflow-y-auto border border-gray-100 rounded-lg p-4 bg-gray-50">
              {proposal.contractContent}
            </div>
          </div>
        )}

        {/* ---- SIGN & ACCEPT ---- */}
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-4">
            {paymentAmount > 0 ? "Sign & Pay" : "Accept Proposal"}
          </h2>

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
                    ref={canvasRef}
                    width={600}
                    height={150}
                    className="w-full cursor-crosshair touch-none"
                    onMouseDown={startDraw}
                    onMouseMove={draw}
                    onMouseUp={stopDraw}
                    onMouseLeave={stopDraw}
                    onTouchStart={startDraw}
                    onTouchMove={draw}
                    onTouchEnd={stopDraw}
                  />
                </div>
                <button onClick={() => { const c = canvasRef.current; if (c) c.getContext("2d")?.clearRect(0, 0, c.width, c.height); }} className="text-xs text-gray-400 mt-1 hover:text-gray-600">
                  Clear
                </button>
              </div>
            )}

            <p className="text-xs text-gray-400">
              By clicking below, you agree this constitutes your legal electronic signature and you accept the services and terms above. Your name, email, IP address, and timestamp will be recorded.
            </p>

            {error && <p className="text-sm text-red-500">{error}</p>}

            <button
              onClick={handleAccept}
              disabled={submitting || (!typedName.trim() && signatureType === "typed") || !signerEmail.trim()}
              className="w-full py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {submitting ? "Processing..." : (
                <>
                  {paymentAmount > 0 && <DollarSign className="w-4 h-4" />}
                  {paymentAmount > 0
                    ? `Sign & Pay $${paymentAmount.toFixed(2)}`
                    : "Accept Proposal"}
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="text-center py-6">
        <p className="text-xs text-gray-300">Powered by Slate</p>
      </div>
    </div>
  );
}
