// Public page reached from the password-reset email link.
// Supabase handles the magic-link token in the URL automatically (the
// supabase client's detectSessionInUrl=true picks it up on init), so by
// the time this page mounts we usually have a session in place. We then
// call updateUser to set the new password, sign the user out, and bounce
// them to /login so they can sign in with the new password fresh.

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSession, setHasSession] = useState<boolean | null>(null);

  // On mount, confirm Supabase picked up the magic-link session from the URL.
  // If not, the link is expired/invalid/already-used.
  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setHasSession(!!data.session);
      if (!data.session) {
        setError("This reset link is invalid or has expired. Request a new one from the sign-in page.");
      }
    });
    return () => { cancelled = true; };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    if (password !== confirm) {
      toast.error("Passwords don't match");
      return;
    }
    setLoading(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      // Sign out so any lingering reset session is cleared. Forces them to
      // log in fresh with the new password (proves it works end-to-end).
      await supabase.auth.signOut();
      setDone(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to reset password");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex h-screen items-center justify-center bg-[#0a0a1a] overflow-hidden">
      {/* Subtle gradient — matches LoginPage feel without the full bokeh treatment */}
      <div className="absolute w-[500px] h-[500px] rounded-full opacity-20 pointer-events-none" style={{
        background: "radial-gradient(circle, #0088ff 0%, transparent 70%)",
        top: "-10%", left: "-5%", filter: "blur(80px)",
      }} />
      <div className="absolute w-[400px] h-[400px] rounded-full opacity-15 pointer-events-none" style={{
        background: "radial-gradient(circle, #00d4ff 0%, transparent 70%)",
        bottom: "-5%", right: "-5%", filter: "blur(80px)",
      }} />

      <div className="relative z-10 w-full max-w-sm mx-4">
        <div className="text-center mb-8">
          <img src="/pwa-192x192.png" alt="Slate" className="w-20 h-20 mx-auto mb-4" />
          <h1 className="font-bold bg-clip-text text-transparent" style={{
            fontFamily: "'Outfit', sans-serif",
            textTransform: "uppercase",
            letterSpacing: "0.2em",
            fontSize: "2.25rem",
            backgroundImage: "linear-gradient(135deg, #00d4ff, #0066ff)",
          }}>
            Slate
          </h1>
          <p className="text-sm text-zinc-500 mt-1">by SDub Media</p>
        </div>

        <div className="bg-[#111127]/80 backdrop-blur-xl border border-white/10 rounded-xl p-6 space-y-4 shadow-2xl">
          {done ? (
            <div className="text-center space-y-3 py-2">
              <p className="text-sm text-white font-medium">Password updated</p>
              <p className="text-xs text-zinc-400">You can now sign in with your new password.</p>
              <a
                href="/login"
                className="block w-full py-2.5 rounded-lg bg-gradient-to-r from-blue-600 to-blue-500 text-white text-sm font-semibold hover:from-blue-500 hover:to-blue-400 transition-all text-center shadow-lg shadow-blue-500/20"
              >
                Go to Sign In
              </a>
            </div>
          ) : hasSession === null ? (
            <p className="text-center text-sm text-zinc-400 py-4">Verifying reset link…</p>
          ) : !hasSession ? (
            <div className="text-center space-y-3 py-2">
              <p className="text-sm text-red-400 font-medium">Invalid or expired link</p>
              <p className="text-xs text-zinc-400">{error}</p>
              <a
                href="/login"
                className="block w-full py-2.5 rounded-lg border border-white/10 text-white text-sm font-medium hover:bg-white/5 transition-colors text-center"
              >
                Back to Sign In
              </a>
            </div>
          ) : (
            <>
              <div className="space-y-1">
                <h2 className="text-sm font-semibold text-white">Set a new password</h2>
                <p className="text-xs text-zinc-400">Pick something at least 6 characters.</p>
              </div>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs text-zinc-400 uppercase tracking-wider font-medium">New password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="New password"
                    autoComplete="new-password"
                    autoFocus
                    minLength={6}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500/50 transition-colors"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-zinc-400 uppercase tracking-wider font-medium">Confirm password</label>
                  <input
                    type="password"
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    placeholder="Confirm password"
                    autoComplete="new-password"
                    minLength={6}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500/50 transition-colors"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 rounded-lg bg-gradient-to-r from-blue-600 to-blue-500 text-white hover:from-blue-500 hover:to-blue-400 transition-all text-sm font-semibold disabled:opacity-50 shadow-lg shadow-blue-500/20"
                >
                  {loading ? "Saving..." : "Set new password"}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
