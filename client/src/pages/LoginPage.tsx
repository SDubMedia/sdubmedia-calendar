// ============================================================
// LoginPage — Email + Password login
// Animated gradient mesh background (TradingView-inspired)
// ============================================================

import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export default function LoginPage() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error("Please enter email and password");
      return;
    }
    setLoading(true);
    try {
      await signIn(email, password);
    } catch (err: any) {
      toast.error(err.message || "Login failed");
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
        @keyframes grainShift {
          0%, 100% { transform: translate(0, 0); }
          10% { transform: translate(-2px, -3px); }
          20% { transform: translate(3px, 1px); }
          30% { transform: translate(-1px, 2px); }
          40% { transform: translate(2px, -2px); }
          50% { transform: translate(-3px, 1px); }
          60% { transform: translate(1px, 3px); }
          70% { transform: translate(-2px, -1px); }
          80% { transform: translate(3px, -3px); }
          90% { transform: translate(-1px, 2px); }
        }
      `}</style>

      {/* === EFFECT 1: Film Grain (full screen overlay) === */}
      <div className="absolute inset-0 z-[1] opacity-[0.04] pointer-events-none" style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='1'/%3E%3C/svg%3E")`,
        backgroundSize: "128px 128px",
        animation: "grainShift 0.5s steps(5) infinite",
      }} />

      {/* === EFFECT 2: Bokeh Dots (scattered) === */}
      {[
        { size: 8, x: "15%", y: "20%", delay: "0s", dur: "4s" },
        { size: 12, x: "75%", y: "30%", delay: "1s", dur: "5s" },
        { size: 6, x: "60%", y: "70%", delay: "0.5s", dur: "3.5s" },
        { size: 10, x: "30%", y: "80%", delay: "2s", dur: "4.5s" },
        { size: 14, x: "85%", y: "15%", delay: "1.5s", dur: "5.5s" },
        { size: 7, x: "45%", y: "55%", delay: "0.8s", dur: "3.8s" },
        { size: 9, x: "10%", y: "60%", delay: "2.5s", dur: "4.2s" },
        { size: 11, x: "70%", y: "85%", delay: "0.3s", dur: "4.8s" },
      ].map((dot, i) => (
        <div key={i} className="absolute rounded-full z-[1] pointer-events-none" style={{
          width: dot.size, height: dot.size,
          left: dot.x, top: dot.y,
          background: "radial-gradient(circle, rgba(255,255,255,0.3) 0%, transparent 70%)",
          animation: `bokehFloat ${dot.dur} ease-in-out ${dot.delay} infinite`,
        }} />
      ))}

      {/* === EFFECT 3: Lens Flare === */}
      <div className="absolute z-[1] pointer-events-none" style={{
        width: 300, height: 120,
        top: "25%", left: "55%",
        background: "radial-gradient(ellipse, rgba(255,255,255,0.08) 0%, rgba(0,136,255,0.04) 40%, transparent 70%)",
        transform: "rotate(-15deg)",
        animation: "flare 15s ease-in-out infinite",
      }} />

      {/* === EFFECT 4: Scan Lines === */}
      <div className="absolute inset-0 z-[1] opacity-[0.03] pointer-events-none" style={{
        backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.1) 2px, rgba(255,255,255,0.1) 4px)",
        backgroundSize: "100% 4px",
        animation: "scanMove 0.3s linear infinite",
      }} />

      {/* === EFFECT 5: Film Strip Perforations (left & right edges) === */}
      <div className="absolute left-2 top-0 bottom-0 w-4 z-[1] opacity-[0.06] pointer-events-none" style={{
        backgroundImage: "repeating-linear-gradient(180deg, transparent 0px, transparent 14px, rgba(255,255,255,0.4) 14px, rgba(255,255,255,0.4) 22px, transparent 22px, transparent 30px)",
        backgroundSize: "100% 30px",
      }} />
      <div className="absolute right-2 top-0 bottom-0 w-4 z-[1] opacity-[0.06] pointer-events-none" style={{
        backgroundImage: "repeating-linear-gradient(180deg, transparent 0px, transparent 14px, rgba(255,255,255,0.4) 14px, rgba(255,255,255,0.4) 22px, transparent 22px, transparent 30px)",
        backgroundSize: "100% 30px",
      }} />

      {/* Blob 5 — Teal (top center) */}
      <div
        className="absolute w-[420px] h-[420px] rounded-full opacity-25"
        style={{
          background: "radial-gradient(circle, #06b6d4 0%, transparent 70%)",
          top: "-8%",
          left: "40%",
          filter: "blur(85px)",
          animation: "blob5 11s ease-in-out infinite",
        }}
      />

      {/* Blob 1 — Blue */}
      <div
        className="absolute w-[500px] h-[500px] rounded-full opacity-30"
        style={{
          background: "radial-gradient(circle, #0088ff 0%, transparent 70%)",
          top: "-10%",
          left: "-5%",
          filter: "blur(80px)",
          animation: "blob1 10s ease-in-out infinite",
        }}
      />
      {/* Blob 2 — Cyan */}
      <div
        className="absolute w-[400px] h-[400px] rounded-full opacity-25"
        style={{
          background: "radial-gradient(circle, #00d4ff 0%, transparent 70%)",
          bottom: "-5%",
          right: "-5%",
          filter: "blur(80px)",
          animation: "blob2 12s ease-in-out infinite",
        }}
      />
      {/* Blob 3 — Purple */}
      <div
        className="absolute w-[450px] h-[450px] rounded-full opacity-20"
        style={{
          background: "radial-gradient(circle, #7c3aed 0%, transparent 70%)",
          top: "40%",
          right: "20%",
          filter: "blur(90px)",
          animation: "blob3 11s ease-in-out infinite",
        }}
      />
      {/* Blob 4 — Deep blue */}
      <div
        className="absolute w-[350px] h-[350px] rounded-full opacity-20"
        style={{
          background: "radial-gradient(circle, #0044cc 0%, transparent 70%)",
          bottom: "20%",
          left: "15%",
          filter: "blur(70px)",
          animation: "blob4 9s ease-in-out infinite",
        }}
      />

      {/* Login card */}
      <div className="relative z-10 w-full max-w-sm mx-4">
        <div className="text-center mb-8">
          <img src="/pwa-192x192.png" alt="SDub Media" className="w-20 h-20 mx-auto mb-4" />
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

        <form onSubmit={handleSubmit} className="bg-[#111127]/80 backdrop-blur-xl border border-white/10 rounded-xl p-6 space-y-4 shadow-2xl">
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
              placeholder="Enter your password"
              autoComplete="current-password"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500/50 transition-colors"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-lg bg-gradient-to-r from-blue-600 to-blue-500 text-white hover:from-blue-500 hover:to-blue-400 transition-all text-sm font-semibold disabled:opacity-50 shadow-lg shadow-blue-500/20"
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>
        <p className="text-center text-[10px] text-zinc-600 mt-6">getslate.net</p>
      </div>
    </div>
  );
}
