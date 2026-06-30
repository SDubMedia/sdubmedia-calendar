// ============================================================
// useSignatureCanvas — Shared signature drawing logic for the three
// signing surfaces (owner countersign on EditContractPage, public
// SignContractPage, and ProjectDetailSheet's owner countersign).
//
// Uses PointerEvents (with mouse/touch fallback) so Apple Pencil
// works on iPad. Pencil fires pointer events with pointerType='pen';
// the old touch-only handlers ignored it entirely.
// ============================================================

import { useCallback, useRef, useState } from "react";

// Pointer events cover mouse + touch + Apple Pencil. When they're supported
// (everywhere relevant), ignore the duplicate touch/mouse events so a single
// stroke isn't drawn 2-3× (the cause of stray dots / jitter on iPad).
const SUPPORTS_POINTER = typeof window !== "undefined" && "PointerEvent" in window;

interface UseSignatureCanvasOptions {
  strokeStyle?: string;   // default: white (works on dark canvas)
  lineWidth?: number;     // default: 2
}

export function useSignatureCanvas(opts: UseSignatureCanvasOptions = {}) {
  const { strokeStyle = "#ffffff", lineWidth = 2 } = opts;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasInk, setHasInk] = useState(false);

  function getXY(e: React.PointerEvent | React.MouseEvent | React.TouchEvent, c: HTMLCanvasElement): [number, number] {
    const rect = c.getBoundingClientRect();
    if ("touches" in e) {
      const t = e.touches[0] || e.changedTouches?.[0];
      return [(t?.clientX ?? 0) - rect.left, (t?.clientY ?? 0) - rect.top];
    }
    return [e.clientX - rect.left, e.clientY - rect.top];
  }

  const start = useCallback((e: React.PointerEvent | React.MouseEvent | React.TouchEvent) => {
    // With pointer support, only act on the pointer event (skip the duplicate
    // touch/mouse events for the same gesture).
    if (SUPPORTS_POINTER && !("pointerId" in e)) return;
    setIsDrawing(true);
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    // Capture the pointer so we keep getting move/up events even if
    // the finger / Pencil drifts off the canvas mid-stroke.
    if ("pointerId" in e && c.setPointerCapture) {
      try { c.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    }
    const [x, y] = getXY(e, c);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }, []);

  const move = useCallback((e: React.PointerEvent | React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    if (SUPPORTS_POINTER && !("pointerId" in e)) return;
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = strokeStyle;
    // Apple Pencil samples faster than the browser fires events — draw every
    // in-between (coalesced) point so fast strokes stay smooth, not jagged.
    const native = "pointerId" in e ? (e.nativeEvent as PointerEvent) : null;
    const coalesced = native && typeof native.getCoalescedEvents === "function" ? native.getCoalescedEvents() : null;
    if (coalesced && coalesced.length) {
      const rect = c.getBoundingClientRect();
      for (const ev of coalesced) ctx.lineTo(ev.clientX - rect.left, ev.clientY - rect.top);
    } else {
      const [x, y] = getXY(e, c);
      ctx.lineTo(x, y);
    }
    ctx.stroke();
    if (!hasInk) setHasInk(true);
  }, [isDrawing, lineWidth, strokeStyle, hasInk]);

  const stop = useCallback(() => setIsDrawing(false), []);

  const clear = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    setHasInk(false);
  }, []);

  const toDataUrl = useCallback((mime: string = "image/png"): string => {
    const c = canvasRef.current;
    if (!c) return "";
    return c.toDataURL(mime);
  }, []);

  return {
    canvasRef,
    isDrawing,
    hasInk,
    canvasProps: {
      ref: canvasRef,
      // PointerEvents handle mouse + touch + Apple Pencil uniformly.
      // We still wire Mouse/Touch as a fallback for browsers / web
      // views that don't fire Pointer events (rare in 2026, but cheap).
      onPointerDown: start,
      onPointerMove: move,
      onPointerUp: stop,
      onPointerCancel: stop,
      onPointerLeave: stop,
      onMouseDown: start,
      onMouseMove: move,
      onMouseUp: stop,
      onMouseLeave: stop,
      onTouchStart: start,
      onTouchMove: move,
      onTouchEnd: stop,
    },
    clear,
    toDataUrl,
  };
}
