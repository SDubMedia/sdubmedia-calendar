import { cn } from "@/lib/utils";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Component, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

// Clear the PWA service worker + caches, then reload — so a crash caused by a
// STALE cached build self-heals to the current server code instead of looping
// the same broken bundle (the trap that strands a user after frequent deploys:
// the old SW keeps re-serving the cached crashing build on every reload).
async function recoverToFreshBuild() {
  try {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r => r.unregister()));
    }
    if (typeof caches !== "undefined") {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    }
  } catch { /* best effort — fall through to the reload regardless */ }
  window.location.reload();
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch() {
    // Auto-recover ONCE per session. The most common cause of a crash is a
    // stale cached build, so clear the SW + caches and reload to current code
    // without the user doing anything. The sessionStorage guard prevents an
    // infinite loop if the crash is a real bug in the *current* build — then
    // the crash screen shows on the next occurrence.
    try {
      if (sessionStorage.getItem("eb_recovered") !== "1") {
        sessionStorage.setItem("eb_recovered", "1");
        void recoverToFreshBuild();
      }
    } catch { /* sessionStorage unavailable — just show the screen */ }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center min-h-screen p-8 bg-background">
          <div className="flex flex-col items-center w-full max-w-2xl p-8">
            <AlertTriangle
              size={48}
              className="text-destructive mb-6 flex-shrink-0"
            />

            <h2 className="text-xl mb-4">An unexpected error occurred.</h2>

            <div className="p-4 w-full rounded bg-muted overflow-auto mb-6">
              <pre className="text-sm text-muted-foreground whitespace-break-spaces">
                {this.state.error?.stack}
              </pre>
            </div>

            <button
              onClick={() => void recoverToFreshBuild()}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg",
                "bg-primary text-primary-foreground",
                "hover:opacity-90 cursor-pointer"
              )}
            >
              <RotateCcw size={16} />
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
