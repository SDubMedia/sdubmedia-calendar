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

export default function SignContractPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;

  const [loading, setLoading] = useState(true);
  const [contract, setContract] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [signed, setSigned] = useState(false);
  const [signing, setSigning] = useState(false);

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
          <p className="text-gray-500">{error}</p>
        </div>
      </div>
    );
  }

  if (signed) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-md text-center">
          <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-gray-900 mb-2">Contract Signed!</h1>
          <p className="text-gray-500">Thank you for signing. The contract owner will be notified and will countersign shortly.</p>
        </div>
      </div>
    );
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
        {/* Contract document — letterhead + body in one paper-like card */}
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <ContractLetterhead
            orgName={contract?.orgName}
            ownerName={contract?.ownerName}
            orgLogo={contract?.orgLogo}
            businessInfo={contract?.orgBusinessInfo}
            intro="The contract is ready for review and signature. If you have any questions, just ask."
          />
          {/* Body */}
          {/^\s*<(p|h[1-6]|ul|ol|div|span|strong|em|br)\b/i.test(contract?.content || "") ? (
            <div
              className="px-6 sm:px-10 py-8 text-gray-700 contract-html-light"
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(contract?.content || "") }}
            />
          ) : (
            <div className="px-6 sm:px-10 py-8 text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
              {contract?.content}
            </div>
          )}
        </div>

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
