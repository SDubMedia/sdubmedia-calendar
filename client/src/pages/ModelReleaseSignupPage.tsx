// ============================================================
// ModelReleaseSignupPage — the PUBLIC page a client's shared link opens.
// No auth, no account: anyone the client forwards this link to fills in
// their own name/email/phone, reads the release, types their name to sign,
// and submits. Each submission is independent — nothing here assumes the
// owner set this person up ahead of time. Mirrors MiniSessionSignupPage's
// shape (same "public token → self-service form → POST" pattern), stripped
// of the scheduling/payment pieces this doesn't need.
// ============================================================

import { useEffect, useState } from "react";
import { useParams } from "wouter";
import { CheckCircle, AlertCircle } from "lucide-react";
import { formatPhoneInput } from "@/lib/utils";

interface ReleasePayload {
  orgName: string;
  releaseText: string;
}

export default function ModelReleaseSignupPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;

  const [loading, setLoading] = useState(true);
  const [release, setRelease] = useState<ReleasePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [signature, setSignature] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    fetch(`/api/model-release-public?action=get&token=${encodeURIComponent(token || "")}`)
      .then(r => r.json().then(b => ({ ok: r.ok, b })))
      .then(({ ok, b }) => {
        if (!ok) setError(b.error || "Couldn't load this release");
        else setRelease(b);
        setLoading(false);
      })
      .catch(() => { setError("Couldn't load this release"); setLoading(false); });
  }, [token]);

  // Live preview: swap the placeholder for whatever they've typed so far,
  // without re-fetching or needing the server to re-render on every
  // keystroke. The final stored copy is still rendered server-side at
  // submit time, from their actual submitted name — this is display only.
  const previewText = release ? release.releaseText.replace(/\[Your Name\]/g, name.trim() || "[Your Name]") : "";

  async function submit() {
    setFormError("");
    if (!name.trim()) { setFormError("Enter your name"); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setFormError("Enter a valid email"); return; }
    if (!agreed || !signature.trim()) { setFormError("Please read and sign the release"); return; }
    setSubmitting(true);
    try {
      const res = await fetch("/api/model-release-public?action=sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, name, email, phone, signatureName: signature }),
      });
      const body = await res.json();
      if (!res.ok) { setFormError(body.error || "Couldn't submit — try again"); setSubmitting(false); return; }
      setDone(true);
    } catch {
      setFormError("Couldn't submit — try again");
      setSubmitting(false);
    }
  }

  if (loading) return <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-500">Loading…</div>;
  if (error || !release) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-xl shadow-sm border p-8 max-w-md text-center">
          <AlertCircle className="w-8 h-8 text-gray-400 mx-auto mb-3" />
          <p className="text-gray-900 font-semibold mb-1">This link isn't available</p>
          <p className="text-sm text-gray-500">{error}</p>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-xl shadow-sm border p-8 max-w-md text-center">
          <CheckCircle className="w-8 h-8 text-emerald-600 mx-auto mb-3" />
          <p className="text-gray-900 font-semibold mb-1">You're all set</p>
          <p className="text-sm text-gray-500">Thanks, {name.trim()} — your signed release has been recorded.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-xl mx-auto space-y-4">
        <div className="bg-white rounded-xl shadow-sm border p-6 text-center">
          <p className="text-sm font-semibold text-gray-500 mb-2">{release.orgName}</p>
          <h1 className="text-2xl font-bold text-gray-900">Model Release</h1>
          <p className="mt-2 text-sm text-gray-600">
            Fill in your own details below and sign — this only takes a minute.
          </p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h2 className="font-bold text-gray-900 mb-2">Your details</h2>
          <div className="space-y-3">
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Your name"
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400" />
            <input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="Email"
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400" />
            <input value={phone} onChange={e => setPhone(formatPhoneInput(e.target.value))} type="tel" inputMode="tel" placeholder="Phone"
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400" />
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h2 className="font-bold text-gray-900 mb-2">Release</h2>
          <div className="max-h-72 overflow-y-auto rounded border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700 whitespace-pre-wrap">
            {previewText}
          </div>
          <label className="flex items-start gap-2 mt-3 text-sm text-gray-700 cursor-pointer">
            <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} className="mt-0.5" />
            <span>I've read and agree to the terms above.</span>
          </label>
          <div className="mt-3">
            <label className="block text-[11px] uppercase tracking-wider text-gray-500 mb-1">Type your full name to sign</label>
            <input value={signature} onChange={e => setSignature(e.target.value)} placeholder="Full name"
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400" />
            {signature.trim() && (
              <p className="mt-2 text-2xl italic text-gray-900" style={{ fontFamily: "cursive" }}>{signature}</p>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border p-6">
          {formError && <p className="text-sm text-red-600 mb-3">{formError}</p>}
          <button
            onClick={submit}
            disabled={submitting}
            className="w-full py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {submitting ? "Submitting…" : <><CheckCircle className="w-4 h-4" /> Sign release</>}
          </button>
        </div>

        <p className="text-center text-xs text-gray-400 pb-6">{release.orgName}</p>
      </div>
    </div>
  );
}
