// ============================================================
// DateCheckPage — public "check your date" (/date/:slug)
//
// What a couple lands on from a flyer QR. One date box, one answer, and a
// short form that drops straight into the Pipeline. No calendar, no names,
// nothing about who else is booked.
// ============================================================

import { useMemo, useState } from "react";
import { useParams } from "wouter";
import { CalendarCheck, CalendarX, ArrowRight, Loader2 } from "lucide-react";

type Result = { available: boolean; businessName: string } | null;

function fmt(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

export default function DateCheckPage() {
  const { slug = "" } = useParams<{ slug: string }>();
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const [date, setDate] = useState("");
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<Result>(null);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ name: "", email: "", phone: "", venue: "", message: "" });
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const today = new Date().toISOString().slice(0, 10);

  const check = async () => {
    if (!date) { setError("Pick your date first."); return; }
    setError(""); setResult(null); setSent(false); setChecking(true);
    try {
      const res = await fetch("/api/date-check", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug, date }) });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Couldn't check that date.");
      setResult(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't check that date.");
    } finally { setChecking(false); }
  };

  const send = async () => {
    if (!form.name.trim() || !form.email.trim()) { setError("Your name and email are all we need."); return; }
    setError(""); setSending(true);
    try {
      const source = params.get("utm_campaign") ? ` (from the ${params.get("utm_campaign")} flyer)` : "";
      const note = [
        `Date check: ${fmt(date)} — ${result?.available ? "open" : "already booked"}${source}.`,
        form.venue.trim() ? `Venue: ${form.venue.trim()}` : "",
        form.message.trim(),
      ].filter(Boolean).join("\n");
      const res = await fetch("/api/capture-pipeline-lead", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, name: form.name.trim(), email: form.email.trim(), phone: form.phone.trim(), projectType: "Wedding", eventDateTime: date, message: note }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Couldn't send that.");
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send that.");
    } finally { setSending(false); }
  };

  const input = "w-full rounded-lg border border-white/15 bg-white/5 px-4 py-3 text-base text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-sky-400";

  return (
    <div className="min-h-screen bg-[#0b0f19] text-white flex items-start justify-center px-5 py-10 sm:py-16">
      <div className="w-full max-w-md">
        <p className="text-xs uppercase tracking-[0.2em] text-white/50">{result?.businessName || "Check your date"}</p>
        <h1 className="mt-2 text-3xl font-semibold" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>Is your date open?</h1>
        <p className="mt-2 text-sm text-white/70">Pick your wedding date and we'll tell you right away.</p>

        <div className="mt-6 flex flex-col sm:flex-row gap-2">
          <input type="date" min={today} value={date} onChange={e => { setDate(e.target.value); setResult(null); setSent(false); }} className={input} aria-label="Your date" />
          <button onClick={check} disabled={checking} className="rounded-lg bg-sky-500 hover:bg-sky-400 disabled:opacity-60 px-5 py-3 font-medium inline-flex items-center justify-center gap-2">
            {checking ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />} Check
          </button>
        </div>
        {error && <p className="mt-3 text-sm text-rose-300">{error}</p>}

        {result && !sent && (
          <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-5">
            {result.available ? (
              <div className="flex items-start gap-3">
                <CalendarCheck className="w-6 h-6 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium">Good news. {fmt(date)} is open.</p>
                  <p className="text-sm text-white/70 mt-1">Tell us a little about your day and we'll hold it while we talk.</p>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-3">
                <CalendarX className="w-6 h-6 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium">We're already booked on {fmt(date)}.</p>
                  <p className="text-sm text-white/70 mt-1">Leave your details anyway. Dates move, and we can point you to someone great if ours doesn't.</p>
                </div>
              </div>
            )}
            <div className="mt-5 space-y-3">
              <input className={input} placeholder="Your name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} autoComplete="name" />
              <input className={input} type="email" placeholder="Email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} autoComplete="email" />
              <input className={input} type="tel" placeholder="Phone (optional)" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} autoComplete="tel" />
              <input className={input} placeholder="Venue (optional)" value={form.venue} onChange={e => setForm(f => ({ ...f, venue: e.target.value }))} />
              <textarea className={input} rows={3} placeholder="Anything you want us to know" value={form.message} onChange={e => setForm(f => ({ ...f, message: e.target.value }))} />
              <button onClick={send} disabled={sending} className="w-full rounded-lg bg-sky-500 hover:bg-sky-400 disabled:opacity-60 px-5 py-3 font-medium inline-flex items-center justify-center gap-2">
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : null} {result.available ? "Hold my date" : "Send anyway"}
              </button>
            </div>
          </div>
        )}

        {sent && (
          <div className="mt-6 rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-5">
            <p className="font-medium">Got it. We'll be in touch shortly.</p>
            <p className="text-sm text-white/70 mt-1">Check your email for a note from us.</p>
          </div>
        )}
      </div>
    </div>
  );
}
