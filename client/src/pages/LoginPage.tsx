// ============================================================
// LoginPage — Email + Password login + Sign Up
// Animated gradient mesh background (TradingView-inspired)
// ============================================================

import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { trackEvent } from "@/lib/analytics";
import { toast } from "sonner";

export default function LoginPage() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [signupSuccess, setSignupSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error("Please enter email and password");
      return;
    }
    setLoading(true);
    try {
      if (mode === "signup") {
        if (!companyName.trim()) {
          toast.error("Please enter your company name");
          setLoading(false);
          return;
        }
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { name: companyName.trim(), org_name: companyName.trim() } },
        });
        if (error) throw error;
        // Fire-and-forget welcome email. Server rate-limits to 1/24h per address.
        fetch("/api/welcome-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, name: companyName.trim() }),
        }).catch(() => {}); // never block signup on email failure
        // Stamp attribution onto a signup event so Scout can see conversions.
        // trackEvent() auto-merges utm_* from localStorage into metadata.
        trackEvent("signup_attributed", { app: "slate", email });
        setSignupSuccess(true);
      } else {
        await signIn(email, password);
      }
    } catch (err: any) {
      toast.error(err.message || "Failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex h-screen items-center justify-center bg-[#0a0a1a] overflow-hidden">
      {/* Animated gradient mesh background */}
      <style>{`
        @keyframes blob1 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          25% { transform: translate(80px, -60px) scale(1.1); }
          50% { transform: translate(-40px, 80px) scale(0.95); }
          75% { transform: translate(60px, 40px) scale(1.05); }
        }
        @keyframes blob2 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          25% { transform: translate(-60px, 40px) scale(1.05); }
          50% { transform: translate(50px, -70px) scale(1.1); }
          75% { transform: translate(-80px, -20px) scale(0.95); }
        }
        @keyframes blob3 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          25% { transform: translate(40px, 60px) scale(0.95); }
          50% { transform: translate(-60px, -40px) scale(1.1); }
          75% { transform: translate(20px, -80px) scale(1.05); }
        }
        @keyframes blob4 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(-50px, 50px) scale(1.08); }
          66% { transform: translate(70px, -30px) scale(0.92); }
        }
        @keyframes blob5 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          25% { transform: translate(-70px, 30px) scale(1.1); }
          50% { transform: translate(40px, -50px) scale(0.9); }
          75% { transform: translate(50px, 60px) scale(1.05); }
        }
        @keyframes flare {
          0%, 100% { transform: translate(-50%, -50%) scale(1); opacity: 0.3; }
          50% { transform: translate(-30%, -60%) scale(1.3); opacity: 0.5; }
        }
        @keyframes bokehFloat {
          0%, 100% { transform: translateY(0); opacity: 0.15; }
          50% { transform: translateY(-30px); opacity: 0.3; }
        }
        @keyframes scanMove {
          0% { transform: translateY(0); }
          100% { transform: translateY(4px); }
        }
      `}</style>

      {/* Bokeh Dots */}
      {[
        { size: 12, x: "75%", y: "30%", delay: "1s", dur: "5s" },
        { size: 10, x: "30%", y: "80%", delay: "2s", dur: "4.5s" },
        { size: 7, x: "45%", y: "55%", delay: "0.8s", dur: "3.8s" },
        { size: 11, x: "70%", y: "85%", delay: "0.3s", dur: "4.8s" },
      ].map((dot, i) => (
        <div key={i} className="absolute rounded-full z-[1] pointer-events-none" style={{
          width: dot.size, height: dot.size,
          left: dot.x, top: dot.y,
          background: "radial-gradient(circle, rgba(255,255,255,0.3) 0%, transparent 70%)",
          animation: `bokehFloat ${dot.dur} ease-in-out ${dot.delay} infinite`,
        }} />
      ))}

      {/* Lens Flare */}
      <div className="absolute z-[1] pointer-events-none" style={{
        width: 300, height: 120,
        top: "25%", left: "55%",
        background: "radial-gradient(ellipse, rgba(255,255,255,0.08) 0%, rgba(0,136,255,0.04) 40%, transparent 70%)",
        transform: "rotate(-15deg)",
        animation: "flare 15s ease-in-out infinite",
      }} />

      {/* Scan Lines */}
      <div className="absolute inset-0 z-[1] opacity-[0.03] pointer-events-none" style={{
        backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.1) 2px, rgba(255,255,255,0.1) 4px)",
        backgroundSize: "100% 4px",
        animation: "scanMove 0.3s linear infinite",
      }} />

      {/* Blobs */}
      <div className="absolute w-[420px] h-[420px] rounded-full opacity-25" style={{
        background: "radial-gradient(circle, #06b6d4 0%, transparent 70%)",
        top: "-8%", left: "40%", filter: "blur(85px)",
        animation: "blob5 11s ease-in-out infinite",
      }} />
      <div className="absolute w-[500px] h-[500px] rounded-full opacity-30" style={{
        background: "radial-gradient(circle, #0088ff 0%, transparent 70%)",
        top: "-10%", left: "-5%", filter: "blur(80px)",
        animation: "blob1 10s ease-in-out infinite",
      }} />
      <div className="absolute w-[400px] h-[400px] rounded-full opacity-25" style={{
        background: "radial-gradient(circle, #00d4ff 0%, transparent 70%)",
        bottom: "-5%", right: "-5%", filter: "blur(80px)",
        animation: "blob2 12s ease-in-out infinite",
      }} />
      <div className="absolute w-[450px] h-[450px] rounded-full opacity-20" style={{
        background: "radial-gradient(circle, #7c3aed 0%, transparent 70%)",
        top: "40%", right: "20%", filter: "blur(90px)",
        animation: "blob3 11s ease-in-out infinite",
      }} />
      <div className="absolute w-[350px] h-[350px] rounded-full opacity-20" style={{
        background: "radial-gradient(circle, #0044cc 0%, transparent 70%)",
        bottom: "20%", left: "15%", filter: "blur(70px)",
        animation: "blob4 9s ease-in-out infinite",
      }} />

      {/* Login card */}
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
          {signupSuccess ? (
            <div className="text-center space-y-3 py-2">
              <p className="text-sm text-white font-medium">Check your email</p>
              <p className="text-xs text-zinc-400">
                We sent a confirmation link to <span className="text-white">{email}</span>. Click it to activate your account, then sign in.
              </p>
              <button
                onClick={() => { setSignupSuccess(false); setMode("signin"); }}
                className="w-full py-2.5 rounded-lg border border-white/10 text-white text-sm font-medium hover:bg-white/5 transition-colors"
              >
                Back to Sign In
              </button>
            </div>
          ) : (
            <>
              {/* Sign In / Sign Up toggle */}
              <div className="flex gap-1 bg-white/5 rounded-lg p-1">
                <button
                  onClick={() => setMode("signin")}
                  className={`flex-1 py-2 text-xs font-medium rounded-md transition-all ${mode === "signin" ? "bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-lg shadow-blue-500/20" : "text-zinc-400 hover:text-white"}`}
                >
                  Sign In
                </button>
                <button
                  onClick={() => setMode("signup")}
                  className={`flex-1 py-2 text-xs font-medium rounded-md transition-all ${mode === "signup" ? "bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-lg shadow-blue-500/20" : "text-zinc-400 hover:text-white"}`}
                >
                  Sign Up
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                {mode === "signup" && (
                  <div className="space-y-1.5">
                    <label className="text-xs text-zinc-400 uppercase tracking-wider font-medium">Company Name</label>
                    <input
                      type="text"
                      value={companyName}
                      onChange={e => setCompanyName(e.target.value)}
                      placeholder="Your Production Company"
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500/50 transition-colors"
                    />
                  </div>
                )}
                <div className="space-y-1.5">
                  <label className="text-xs text-zinc-400 uppercase tracking-wider font-medium">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    autoComplete="email"
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500/50 transition-colors"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-zinc-400 uppercase tracking-wider font-medium">Password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder={mode === "signup" ? "Create a password (min 6 chars)" : "Enter your password"}
                    autoComplete={mode === "signup" ? "new-password" : "current-password"}
                    minLength={6}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500/50 transition-colors"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 rounded-lg bg-gradient-to-r from-blue-600 to-blue-500 text-white hover:from-blue-500 hover:to-blue-400 transition-all text-sm font-semibold disabled:opacity-50 shadow-lg shadow-blue-500/20"
                >
                  {loading
                    ? (mode === "signup" ? "Creating account..." : "Signing in...")
                    : (mode === "signup" ? "Create Account" : "Sign In")
                  }
                </button>
              </form>

              {mode === "signup" && (
                <p className="text-[10px] text-zinc-500 text-center">
                  14-day free trial. No credit card required.
                </p>
              )}
            </>
          )}
        </div>
        <div className="text-center mt-6 space-y-2">
          <div className="flex justify-center gap-3 text-[10px] text-zinc-500">
            <a href="/terms" className="hover:text-zinc-300">Terms</a>
            <span>·</span>
            <a href="/refund" className="hover:text-zinc-300">Refunds</a>
            <span>·</span>
            <a href="/privacy" className="hover:text-zinc-300">Privacy</a>
          </div>
          <p className="text-[10px] text-zinc-600">getslate.net</p>
        </div>
      </div>
    </div>
  );
}
