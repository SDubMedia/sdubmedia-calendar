// Public gallery page at /deliver/:token. No auth — token is the gate.
//
// States visible to the client:
//   draft (server returns this only if you sneak in early — UI shows "not ready")
//   sent       — browse + favorite + submit
//   submitted  — locked picks visible, "Request a change" link
//   working    — locked picks visible, "Pay for extras" if pricing exists
//   delivered  — galleries archive view
//
// Proofing UX:
//   - Sticky bar shows "X / N selected · Y extra ($Z)"
//   - Hearts toggle inline; counter updates live
//   - Submit collects name+email, then either saves (within free limit)
//     or routes to Stripe Connect Checkout for the overage
//   - JSZip via CDN handles "Download all" — no server-side ZIP

import { useEffect, useMemo, useState } from "react";
import { useRoute } from "wouter";
import { ContractLetterhead } from "../components/ContractLetterhead";
import { toast } from "sonner";

interface FileItem {
  id: string;
  originalName: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  mimeType: string;
  position: number;
  url: string;
}

interface DeliveryInfo {
  id: string;
  title: string;
  coverFileId: string | null;
  status: "draft" | "sent" | "submitted" | "working" | "delivered";
  selectionLimit: number;
  perExtraPhotoCents: number;
  buyAllFlatCents: number;
  submittedAt: string | null;
  clientName: string | null;
  clientEmail: string | null;
}

interface OrgInfo {
  name: string;
  logoUrl: string;
  businessInfo: Record<string, unknown> | null;
}

interface SelectionRecord { fileId: string; isPaid: boolean }

interface CheckoutOptions {
  perPhoto?: { extras: number; unitCents: number; totalCents: number };
  flat?: { totalCents: number };
}

declare global {
  interface Window { JSZip?: unknown }
}

function money(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export default function DeliverGalleryPage() {
  const [, params] = useRoute("/deliver/:token");
  const token = params?.token || "";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [delivery, setDelivery] = useState<DeliveryInfo | null>(null);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [serverSelections, setServerSelections] = useState<SelectionRecord[]>([]);
  const [org, setOrg] = useState<OrgInfo | null>(null);

  // Local proofing state — what the client has hearted but not yet submitted
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);

  // Password gate
  const [passwordRequired, setPasswordRequired] = useState(false);
  const [password, setPassword] = useState("");
  const [pwError, setPwError] = useState("");

  // Submission UI
  const [submitOpen, setSubmitOpen] = useState(false);
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [checkoutOptions, setCheckoutOptions] = useState<CheckoutOptions | null>(null);
  const [zipping, setZipping] = useState(false);

  async function loadGallery(pwToTry?: string) {
    setLoading(true);
    setError(null);
    try {
      const res = pwToTry !== undefined
        ? await fetch(`/api/delivery-public?action=verify-password`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token, password: pwToTry }),
          })
        : await fetch(`/api/delivery-public?action=get&token=${encodeURIComponent(token)}`);
      const data = await res.json();
      if (!res.ok && !data.passwordRequired) {
        setError(data.error || "Failed to load gallery");
        return;
      }
      if (data.passwordRequired) {
        setPasswordRequired(true);
        if (pwToTry !== undefined) setPwError(data.error || "Incorrect password");
        return;
      }
      setPasswordRequired(false);
      setDelivery(data.delivery);
      setFiles(data.files || []);
      setServerSelections(data.selections || []);
      setOrg(data.org);
      // Pre-populate local picks from server (client returning to view their picks)
      const submitted = (data.selections || []).map((s: SelectionRecord) => s.fileId);
      if (submitted.length > 0 && data.delivery.status !== "sent") {
        setPicked(new Set(submitted));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (token) loadGallery();
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  const isLocked = delivery?.status === "submitted" || delivery?.status === "working" || delivery?.status === "delivered";
  const isWorking = delivery?.status === "working" || delivery?.status === "delivered";
  const proofingEnabled = (delivery?.selectionLimit ?? 0) > 0;
  const overage = Math.max(0, picked.size - (delivery?.selectionLimit ?? 0));
  const perExtraCents = delivery?.perExtraPhotoCents ?? 0;
  const flatCents = delivery?.buyAllFlatCents ?? 0;
  const hasPerPhoto = perExtraCents > 0;
  const hasFlat = flatCents > 0;
  const overagePerPhotoTotal = overage * perExtraCents;
  const recommendFlat = hasFlat && hasPerPhoto && flatCents < overagePerPhotoTotal && overage > 0;

  function togglePick(fileId: string) {
    if (isLocked) return;
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(fileId)) next.delete(fileId);
      else next.add(fileId);
      return next;
    });
  }

  async function startSubmit() {
    if (picked.size === 0) {
      toast.error("Pick at least one photo");
      return;
    }
    setSubmitOpen(true);
  }

  async function doSubmit(mode?: "per-photo" | "flat") {
    if (!clientName.trim() || !clientEmail.trim()) {
      toast.error("Name and email required");
      return;
    }
    setSubmitting(true);
    try {
      // First try the free path
      if (!mode) {
        const res = await fetch(`/api/delivery-public?action=submit`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token, fileIds: Array.from(picked),
            clientName: clientName.trim(), clientEmail: clientEmail.trim(),
            password: passwordRequired ? password : undefined,
          }),
        });
        const data = await res.json();
        if (res.status === 402 && data.needsCheckout) {
          setCheckoutOptions(data.options);
          setSubmitting(false);
          return;
        }
        if (!res.ok) throw new Error(data.error || "Submit failed");
        toast.success("Submitted!", { description: "We'll be in touch shortly." });
        setSubmitOpen(false);
        await loadGallery(); // refresh into "submitted" state
        return;
      }

      // Paid path — create Stripe Checkout session
      const res = await fetch(`/api/delivery-checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token, mode, fileIds: Array.from(picked),
          clientName: clientName.trim(), clientEmail: clientEmail.trim(),
          password: passwordRequired ? password : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error || "Checkout failed");
      window.location.assign(data.url);
    } catch (err) {
      toast.error("Couldn't submit", { description: err instanceof Error ? err.message : "Try again" });
    } finally {
      setSubmitting(false);
    }
  }

  async function requestChange() {
    const message = window.prompt("What would you like to change? (Optional)") || "";
    try {
      const res = await fetch(`/api/delivery-public?action=request-change`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, message }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      toast.success("Request sent", { description: "The team will reach out." });
    } catch (err) {
      toast.error("Couldn't send", { description: err instanceof Error ? err.message : "Try again" });
    }
  }

  async function downloadAll() {
    if (files.length === 0) return;
    setZipping(true);
    try {
      // Lazy-load JSZip from CDN — no bundle bloat for clients who don't use this
      if (!window.JSZip) {
        await new Promise<void>((resolve, reject) => {
          const s = document.createElement("script");
          s.src = "https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js";
          s.onload = () => resolve();
          s.onerror = () => reject(new Error("Failed to load ZIP library"));
          document.head.appendChild(s);
        });
      }
      const JSZipCtor = (window.JSZip as unknown as { new(): { file: (n: string, b: Blob) => void; generateAsync: (o: { type: "blob" }) => Promise<Blob> } });
      const zip = new JSZipCtor();
      // Fetch files in parallel batches of 4 to avoid hammering R2
      const batchSize = 4;
      for (let i = 0; i < files.length; i += batchSize) {
        const batch = files.slice(i, i + batchSize);
        await Promise.all(batch.map(async (f) => {
          const r = await fetch(f.url);
          if (!r.ok) throw new Error(`Failed to fetch ${f.originalName}`);
          const blob = await r.blob();
          zip.file(f.originalName, blob);
        }));
      }
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(delivery?.title || "gallery").replace(/[^\w-]+/g, "_")}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error("Download failed", { description: err instanceof Error ? err.message : "Try again" });
    } finally {
      setZipping(false);
    }
  }

  const lightboxFile = lightboxIdx !== null ? files[lightboxIdx] : null;

  // ---- Renders ----

  if (loading) {
    return <div className="min-h-screen bg-white text-black flex items-center justify-center"><div className="text-slate-500">Loading…</div></div>;
  }

  if (passwordRequired && !delivery) {
    return (
      <div className="min-h-screen bg-white text-black flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <h1 className="text-2xl font-bold mb-2 text-center">Password required</h1>
          <p className="text-slate-500 text-sm mb-6 text-center">This gallery is private.</p>
          <input
            type="password"
            value={password}
            onChange={(e) => { setPassword(e.target.value); setPwError(""); }}
            onKeyDown={(e) => e.key === "Enter" && loadGallery(password)}
            className="w-full border border-slate-300 rounded-lg px-4 py-3 text-base mb-3 outline-none focus:border-black"
            placeholder="Password"
            autoFocus
            style={{ fontSize: 16 }}
          />
          {pwError && <p className="text-red-600 text-sm mb-3">{pwError}</p>}
          <button
            onClick={() => loadGallery(password)}
            className="w-full bg-black text-white py-3 rounded-lg font-semibold"
          >
            View gallery
          </button>
        </div>
      </div>
    );
  }

  if (error || !delivery) {
    return (
      <div className="min-h-screen bg-white text-black flex items-center justify-center p-6 text-center">
        <div>
          <h1 className="text-2xl font-bold mb-2">Gallery unavailable</h1>
          <p className="text-slate-500">{error || "Not found."}</p>
        </div>
      </div>
    );
  }

  const businessInfo = (org?.businessInfo as Record<string, string> | null | undefined) || null;

  return (
    <div className="min-h-screen bg-white text-black">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
        <ContractLetterhead
          orgName={org?.name}
          orgLogo={org?.logoUrl}
          businessInfo={businessInfo}
        />

        <div className="text-center mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold mb-2">{delivery.title}</h1>
          {isWorking && <p className="text-emerald-700 text-sm">Your selections are being edited.</p>}
          {delivery.status === "submitted" && <p className="text-blue-700 text-sm">Submitted ✓ · We'll be in touch.</p>}
          {delivery.status === "delivered" && <p className="text-slate-500 text-sm">Final files delivered.</p>}
        </div>

        {/* Proofing instructions banner */}
        {proofingEnabled && delivery.status === "sent" && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-6 text-sm text-amber-900">
            <strong>Pick your {delivery.selectionLimit} favorite{delivery.selectionLimit === 1 ? "" : "s"} for editing.</strong>
            {hasPerPhoto && <> Need more? <strong>{money(perExtraCents)}</strong> per extra photo.</>}
            {hasFlat && <> {hasPerPhoto ? "Or " : "Or "}<strong>{money(flatCents)}</strong> to unlock all picks.</>}
          </div>
        )}

        {/* Action bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-6">
          <button
            onClick={downloadAll}
            disabled={zipping}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 border border-slate-300 rounded-lg text-sm font-semibold hover:bg-slate-50 disabled:opacity-50"
          >
            {zipping ? "Preparing ZIP…" : `Download all (${files.length})`}
          </button>
          {delivery.status === "submitted" && !isWorking && (
            <button onClick={requestChange} className="text-sm text-blue-700 underline">Request a change</button>
          )}
          {isWorking && hasPerPhoto && !isLocked && (
            <button onClick={() => doSubmit("per-photo")} className="text-sm text-blue-700 underline">Pay for additional picks</button>
          )}
        </div>

        {/* Photo grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {files.map((f, i) => {
            const isPicked = picked.has(f.id);
            const isPaid = serverSelections.find((s) => s.fileId === f.id)?.isPaid;
            return (
              <div
                key={f.id}
                className="relative group cursor-pointer aspect-square overflow-hidden rounded-lg bg-slate-100"
                onClick={() => setLightboxIdx(i)}
              >
                <img
                  src={f.url}
                  alt={f.originalName}
                  loading="lazy"
                  className="w-full h-full object-cover transition-transform group-hover:scale-105"
                />
                {proofingEnabled && (
                  <button
                    onClick={(e) => { e.stopPropagation(); togglePick(f.id); }}
                    disabled={isLocked}
                    className={`absolute top-2 right-2 w-9 h-9 rounded-full flex items-center justify-center text-lg shadow-md transition-all ${
                      isPicked
                        ? "bg-red-500 text-white scale-100"
                        : "bg-white/80 text-slate-400 hover:text-red-500 hover:scale-110 group-hover:opacity-100 opacity-70"
                    } ${isLocked ? "cursor-default" : ""}`}
                    aria-label={isPicked ? "Unpick" : "Pick"}
                  >
                    {isPicked ? "♥" : "♡"}
                  </button>
                )}
                {isPaid && (
                  <div className="absolute bottom-2 left-2 bg-emerald-500 text-white text-[10px] font-semibold uppercase px-2 py-0.5 rounded">
                    Paid
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Sticky proofing footer */}
        {proofingEnabled && delivery.status === "sent" && picked.size > 0 && (
          <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 p-4 shadow-lg z-30">
            <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
              <div className="text-sm">
                <strong>{picked.size}</strong> of <strong>{delivery.selectionLimit}</strong> picked
                {overage > 0 && (
                  <span className="ml-2 text-amber-700">
                    · {overage} extra {hasPerPhoto && `(${money(overagePerPhotoTotal)})`}
                  </span>
                )}
              </div>
              <button
                onClick={startSubmit}
                className="bg-black text-white px-5 py-2.5 rounded-lg font-semibold text-sm"
              >
                Submit selections →
              </button>
            </div>
          </div>
        )}

        {/* Lightbox */}
        {lightboxFile && (
          <div
            className="fixed inset-0 bg-black/95 z-40 flex items-center justify-center p-4"
            onClick={() => setLightboxIdx(null)}
          >
            <img src={lightboxFile.url} alt={lightboxFile.originalName} className="max-w-full max-h-full object-contain" />
            <button
              onClick={(e) => { e.stopPropagation(); setLightboxIdx(null); }}
              className="absolute top-4 right-4 text-white/80 text-3xl hover:text-white"
              aria-label="Close"
            >
              ×
            </button>
            {proofingEnabled && !isLocked && (
              <button
                onClick={(e) => { e.stopPropagation(); togglePick(lightboxFile.id); }}
                className={`absolute bottom-8 left-1/2 -translate-x-1/2 px-6 py-3 rounded-full font-semibold ${
                  picked.has(lightboxFile.id) ? "bg-red-500 text-white" : "bg-white text-black"
                }`}
              >
                {picked.has(lightboxFile.id) ? "♥ Picked" : "♡ Pick this one"}
              </button>
            )}
            {lightboxIdx !== null && lightboxIdx > 0 && (
              <button
                onClick={(e) => { e.stopPropagation(); setLightboxIdx(lightboxIdx - 1); }}
                className="absolute left-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white text-4xl px-3 py-2"
                aria-label="Previous"
              >‹</button>
            )}
            {lightboxIdx !== null && lightboxIdx < files.length - 1 && (
              <button
                onClick={(e) => { e.stopPropagation(); setLightboxIdx(lightboxIdx + 1); }}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white text-4xl px-3 py-2"
                aria-label="Next"
              >›</button>
            )}
          </div>
        )}

        {/* Submit modal */}
        {submitOpen && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => !submitting && setSubmitOpen(false)}>
            <div className="bg-white rounded-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
              {!checkoutOptions ? (
                <>
                  <h2 className="text-xl font-bold mb-2">Submit your picks</h2>
                  <p className="text-sm text-slate-500 mb-4">
                    {picked.size} photo{picked.size === 1 ? "" : "s"} selected.
                  </p>
                  <input
                    type="text"
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    placeholder="Your name"
                    className="w-full border border-slate-300 rounded-lg px-4 py-3 mb-3 outline-none focus:border-black"
                    style={{ fontSize: 16 }}
                  />
                  <input
                    type="email"
                    value={clientEmail}
                    onChange={(e) => setClientEmail(e.target.value)}
                    placeholder="your@email.com"
                    className="w-full border border-slate-300 rounded-lg px-4 py-3 mb-4 outline-none focus:border-black"
                    style={{ fontSize: 16 }}
                  />
                  <div className="flex gap-2">
                    <button onClick={() => setSubmitOpen(false)} disabled={submitting} className="flex-1 border border-slate-300 py-3 rounded-lg font-semibold">Cancel</button>
                    <button onClick={() => doSubmit()} disabled={submitting} className="flex-1 bg-black text-white py-3 rounded-lg font-semibold disabled:opacity-50">
                      {submitting ? "Submitting…" : "Submit"}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <h2 className="text-xl font-bold mb-2">You picked {picked.size}</h2>
                  <p className="text-sm text-slate-500 mb-4">
                    {delivery.selectionLimit} are included free. Cover the {overage} extra{overage === 1 ? "" : "s"}:
                  </p>
                  <div className="space-y-2 mb-4">
                    {checkoutOptions.perPhoto && (
                      <button
                        onClick={() => doSubmit("per-photo")}
                        disabled={submitting}
                        className={`w-full text-left p-4 rounded-lg border-2 ${recommendFlat ? "border-slate-300" : "border-black"} hover:border-black`}
                      >
                        <div className="font-semibold">Pay per photo · {money(checkoutOptions.perPhoto.totalCents)}</div>
                        <div className="text-sm text-slate-500">{checkoutOptions.perPhoto.extras} × {money(checkoutOptions.perPhoto.unitCents)}</div>
                      </button>
                    )}
                    {checkoutOptions.flat && (
                      <button
                        onClick={() => doSubmit("flat")}
                        disabled={submitting}
                        className={`w-full text-left p-4 rounded-lg border-2 ${recommendFlat ? "border-black bg-amber-50" : "border-slate-300"} hover:border-black relative`}
                      >
                        {recommendFlat && <span className="absolute top-2 right-2 text-[10px] uppercase tracking-wider text-amber-700 font-bold">Best value</span>}
                        <div className="font-semibold">Unlock all · {money(checkoutOptions.flat.totalCents)}</div>
                        <div className="text-sm text-slate-500">All {picked.size} photos for one flat fee.</div>
                      </button>
                    )}
                  </div>
                  <button onClick={() => { setCheckoutOptions(null); setSubmitOpen(false); }} disabled={submitting} className="w-full text-sm text-slate-500">Cancel</button>
                </>
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        <footer className="mt-16 pt-6 border-t border-slate-200 text-center text-xs text-slate-400">
          Powered by Slate · slate.sdubmedia.com
        </footer>
      </div>
    </div>
  );
}
