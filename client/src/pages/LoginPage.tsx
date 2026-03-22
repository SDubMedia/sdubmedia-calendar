// ============================================================
// LoginPage — Email + Password login
// Design: Dark Cinematic Studio | Amber accent on charcoal
// ============================================================

import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
// Film icon removed — using logo image instead
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
    <div className="flex h-screen items-center justify-center bg-background">
      <div className="w-full max-w-sm mx-4">
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
          <p className="text-sm text-muted-foreground mt-1">by SDub Media</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-card border border-border rounded-lg p-6 space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              className="w-full bg-secondary border border-border rounded-md px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Enter your password"
              autoComplete="current-password"
              className="w-full bg-secondary border border-border rounded-md px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors text-sm font-medium disabled:opacity-50"
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}
