// ============================================================
// useSignatureCanvas — Shared signature drawing logic for the three
// signing surfaces (owner countersign on EditContractPage, public
// SignContractPage, and ProjectDetailSheet's owner countersign).
// Returns ref + handlers + clear/serialize helpers.
// ============================================================

import { useCallback, useRef, useState } from "react";

interface UseSignatureCanvasOptions {
  strokeStyle?: string;   // default: white (works on dark canvas)
  lineWidth?: number;     // default: 2
}

export function useSignatureCanvas(opts: UseSignatureCanvasOptions = {}) {
  const { strokeStyle = "#ffffff", lineWidth = 2 } = opts;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasInk, setHasInk] = useState(false);

  const start = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    setIsDrawing(true);
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const rect = c.getBoundingClientRect();
    const x = "touches" in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = "touches" in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;
    ctx.beginPath();
    ctx.moveTo(x, y);
  }, []);

  const move = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const rect = c.getBoundingClientRect();
    const x = "touches" in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = "touches" in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = "round";
    ctx.strokeStyle = strokeStyle;
    ctx.lineTo(x, y);
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
