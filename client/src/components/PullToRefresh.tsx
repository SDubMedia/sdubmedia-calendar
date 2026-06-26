// Pull-to-refresh for the app shell. Wraps the page area; pulling down from the
// top of whatever's scrolled triggers a full data reload. Works on touch only
// (inert on desktop), and finds the actual innermost scroller under the finger
// so it behaves on pages that scroll their own inner container (e.g. Dashboard).

import { useRef, useState, type ReactNode } from "react";
import { RefreshCw } from "lucide-react";

function closestScrollable(el: HTMLElement | null): HTMLElement | null {
  let node: HTMLElement | null = el;
  while (node && node !== document.body) {
    const oy = getComputedStyle(node).overflowY;
    if ((oy === "auto" || oy === "scroll") && node.scrollHeight > node.clientHeight) return node;
    node = node.parentElement;
  }
  return null;
}

const THRESHOLD = 70; // px pulled before a release triggers refresh

export default function PullToRefresh({ onRefresh, children }: { onRefresh: () => Promise<unknown> | void; children: ReactNode }) {
  const startY = useRef(0);
  const armed = useRef(false);
  const scroller = useRef<HTMLElement | null>(null);
  const [offset, setOffset] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  function onTouchStart(e: React.TouchEvent) {
    if (refreshing) return;
    const sc = closestScrollable(e.target as HTMLElement);
    scroller.current = sc;
    armed.current = !!sc && sc.scrollTop <= 0;
    startY.current = e.touches[0].clientY;
  }
  function onTouchMove(e: React.TouchEvent) {
    if (!armed.current || refreshing) return;
    const sc = scroller.current;
    if (sc && sc.scrollTop > 0) { armed.current = false; setOffset(0); return; }
    const dy = e.touches[0].clientY - startY.current;
    setOffset(dy > 0 ? Math.min(dy * 0.5, 90) : 0);
  }
  async function onTouchEnd() {
    if (!armed.current) { setOffset(0); return; }
    armed.current = false;
    if (offset >= THRESHOLD && !refreshing) {
      setRefreshing(true);
      try { await onRefresh(); } catch { /* ignore */ }
      setRefreshing(false);
    }
    setOffset(0);
  }

  const shown = refreshing || offset > 8;
  return (
    <div className="h-full" onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
      <div
        className="pointer-events-none fixed left-1/2 z-50 -translate-x-1/2"
        style={{
          top: `calc(env(safe-area-inset-top) + ${(refreshing ? 46 : offset)}px - 40px)`,
          opacity: shown ? 1 : 0,
          transition: offset > 0 && !refreshing ? "none" : "top 0.2s, opacity 0.2s",
        }}
      >
        <div className="rounded-full border border-border bg-card p-2 shadow-lg">
          <RefreshCw
            className={`h-4 w-4 text-primary ${refreshing ? "animate-spin" : ""}`}
            style={refreshing ? undefined : { transform: `rotate(${offset * 3}deg)` }}
          />
        </div>
      </div>
      {children}
    </div>
  );
}
