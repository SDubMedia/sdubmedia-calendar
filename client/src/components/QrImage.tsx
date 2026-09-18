// A branded QR drawn on a canvas. Re-renders when the link or brand changes.
import { useEffect, useRef } from "react";
import { drawQr, type QrBrand } from "@/lib/qrRender";

export default function QrImage({ url, size, brand, className, title }: { url: string; size: number; brand?: QrBrand; className?: string; title?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const mark = brand?.mark;
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    let cancelled = false;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    drawQr(c, url, Math.round(size * dpr), { mark }).then(() => {
      if (cancelled) return;
      c.style.width = `${size}px`;
      c.style.height = `${size}px`;
    }).catch(err => console.error("[QrImage]", err));
    return () => { cancelled = true; };
  }, [url, size, mark]);
  return <canvas ref={ref} className={className} title={title} aria-label={title} style={{ width: size, height: size }} />;
}
