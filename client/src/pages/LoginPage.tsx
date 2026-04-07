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
      `}</style>

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
