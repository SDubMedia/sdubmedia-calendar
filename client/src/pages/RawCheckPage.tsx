// A bench for one question: does YOUR camera embed a preview worth showing?
//
// The extraction is format-agnostic by design, but what it finds is entirely
// up to the manufacturer — full-resolution on most Nikon and Canon bodies,
// around 1616x1080 on many Sony ones, and occasionally nothing but a
// thumbnail. That's not knowable from code; it's knowable from one file.
//
// So: drop a raw, see the preview, see its pixel dimensions against the raw's
// own, and decide whether the whole workflow is worth building on. Nothing is
// uploaded and nothing is saved — this runs entirely in the browser.

import { useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, Upload } from "lucide-react";
import { extractRawPreview, findEmbeddedJpegs, isRawFile } from "@/lib/rawPreview";

interface Result {
  fileName: string;
  fileSizeMb: string;
  candidates: number;
  previewUrl: string | null;
  width: number | null;
  height: number | null;
  previewKb: string | null;
  reason?: string;
  ms: number;
}

export default function RawCheckPage() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [notRaw, setNotRaw] = useState<string | null>(null);

  async function handleFile(file: File | null | undefined) {
    if (!file) return;
    setResult(null);
    setNotRaw(null);
    if (!isRawFile(file.name)) {
      setNotRaw(file.name);
      return;
    }
    setBusy(true);
    const started = performance.now();
    try {
      const buffer = await file.arrayBuffer();
      const candidates = findEmbeddedJpegs(buffer);
      const out = await extractRawPreview(file);
      setResult({
        fileName: file.name,
        fileSizeMb: (file.size / 1_048_576).toFixed(1),
        candidates: candidates.length,
        previewUrl: out.preview ? URL.createObjectURL(out.preview) : null,
        width: out.width,
        height: out.height,
        previewKb: out.preview ? (out.preview.size / 1024).toFixed(0) : null,
        reason: out.reason,
        ms: Math.round(performance.now() - started),
      });
    } finally {
      setBusy(false);
    }
  }

  const megapixels = result?.width && result?.height
    ? ((result.width * result.height) / 1_000_000).toFixed(1)
    : null;

  return (
    <div className="max-w-2xl mx-auto p-6">
      <Link href="/deliveries" className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-white mb-4">
        <ArrowLeft className="w-4 h-4" /> Back to galleries
      </Link>

      <h1 className="text-2xl font-bold mb-1" style={{ fontFamily: "'Space Grotesk', system-ui" }}>Raw preview check</h1>
      <p className="text-sm text-slate-400 mb-6">
        Drop one raw file from your camera. Nothing uploads and nothing is saved — this
        only answers whether the preview inside it is good enough for a client to pick from.
      </p>

      <label className="block rounded-xl border-2 border-dashed border-white/15 bg-white/[0.02] p-8 text-center cursor-pointer hover:border-[#0088ff] transition-colors">
        <input
          type="file"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
        <Upload className="w-8 h-8 mx-auto mb-2 text-slate-500" />
        <p className="text-sm text-slate-300">{busy ? "Reading…" : "Choose a raw file (.NEF, .CR2, .ARW, .CR3…)"}</p>
      </label>

      {notRaw && (
        <p className="mt-4 text-sm text-amber-400">
          "{notRaw}" isn't a raw file — pick one straight off the card.
        </p>
      )}

      {result && (
        <div className="mt-6 rounded-xl border border-white/10 bg-white/[0.02] p-5">
          <p className="text-sm font-mono text-white mb-1">{result.fileName}</p>
          <p className="text-xs text-slate-500 mb-4">
            {result.fileSizeMb} MB · {result.candidates} embedded image{result.candidates === 1 ? "" : "s"} found · read in {result.ms}ms
          </p>

          {result.previewUrl ? (
            <>
              <div className="rounded-lg overflow-hidden border border-white/10 bg-black mb-3">
                <img src={result.previewUrl} alt="Extracted preview" className="w-full h-auto max-h-[420px] object-contain" />
              </div>
              <dl className="text-sm space-y-1">
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-400">Preview size</dt>
                  <dd className="text-white font-mono">{result.width} × {result.height}{megapixels ? ` (${megapixels} MP)` : ""}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-400">Preview weight</dt>
                  <dd className="text-white font-mono">{result.previewKb} KB</dd>
                </div>
              </dl>
              <p className={`mt-4 text-sm ${(result.width ?? 0) >= 1600 ? "text-emerald-400" : "text-amber-400"}`}>
                {(result.width ?? 0) >= 1600
                  ? "Good — that's plenty for a client to choose from."
                  : "Small. Usable for picking, but they won't be able to judge much detail."}
              </p>
            </>
          ) : (
            <p className="text-sm text-red-400">
              No usable preview.{" "}
              {result.reason === "no-jpeg-found" && "This file doesn't carry an embedded JPEG the scanner can find."}
              {result.reason === "undecodable" && "Something JPEG-shaped was found but it wouldn't decode."}
              {result.reason === "read-failed" && "The file couldn't be read."}
              {" "}The raw workflow won't work for this camera — stick to exporting JPEGs.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
