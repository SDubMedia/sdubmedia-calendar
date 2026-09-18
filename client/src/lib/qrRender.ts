// ============================================================
// Branded QR rendering, in the browser. Brand-blue modules, the org's icon in
// the middle (error correction H leaves room for it), and print-ready
// exports: PNG at any size, SVG (vector), and a letter-size PDF sheet with
// the wordmark under the code.
// ============================================================

import QRCode from "qrcode";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

export const QR_DARK = "#0f52d9";   // deep brand blue; dark enough to scan on white
const MARK_FRACTION = 0.22;         // width of the centre mark as a share of the code

export interface QrBrand {
  /** Square icon drawn in the centre (data: or same-origin URL). */
  mark?: string;
  /** Wide wordmark for the print sheet. */
  wordmark?: string;
  name?: string;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Logo failed to load"));
    img.src = src;
  });
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Draw the code (and centre mark) onto a canvas of `size` px. */
export async function drawQr(canvas: HTMLCanvasElement, url: string, size: number, brand: QrBrand = {}): Promise<void> {
  await QRCode.toCanvas(canvas, url, {
    errorCorrectionLevel: "H",
    width: size,
    margin: 2,
    color: { dark: QR_DARK, light: "#ffffff" },
  });
  if (!brand.mark) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  let img: HTMLImageElement;
  try { img = await loadImage(brand.mark); } catch { return; }
  const box = Math.round(size * MARK_FRACTION);
  const x = Math.round((size - box) / 2), y = x;
  ctx.fillStyle = "#ffffff";
  roundRect(ctx, x, y, box, box, Math.round(box * 0.18));
  ctx.fill();
  const pad = Math.round(box * 0.12);
  const inner = box - pad * 2;
  const scale = Math.min(inner / img.width, inner / img.height);
  const w = img.width * scale, h = img.height * scale;
  ctx.drawImage(img, x + (box - w) / 2, y + (box - h) / 2, w, h);
}

export async function qrPngDataUrl(url: string, size: number, brand: QrBrand = {}): Promise<string> {
  const canvas = document.createElement("canvas");
  await drawQr(canvas, url, size, brand);
  return canvas.toDataURL("image/png");
}

/** Vector version. The mark is embedded as an image so it prints sharp at any size. */
export async function qrSvg(url: string, brand: QrBrand = {}): Promise<string> {
  let svg = await QRCode.toString(url, {
    type: "svg",
    errorCorrectionLevel: "H",
    margin: 2,
    color: { dark: QR_DARK, light: "#ffffff" },
  });
  if (!brand.mark) return svg;
  const m = svg.match(/viewBox="0 0 (\d+) (\d+)"/);
  const n = m ? Number(m[1]) : 0;
  if (!n) return svg;
  const box = n * MARK_FRACTION;
  const x = (n - box) / 2;
  const pad = box * 0.12;
  const overlay =
    `<rect x="${x}" y="${x}" width="${box}" height="${box}" rx="${box * 0.18}" fill="#ffffff"/>` +
    `<image href="${brand.mark}" x="${x + pad}" y="${x + pad}" width="${box - pad * 2}" height="${box - pad * 2}" preserveAspectRatio="xMidYMid meet"/>`;
  svg = svg.replace("</svg>", `${overlay}</svg>`);
  return svg;
}

/** Letter-size sheet: the code large and centred, name above, wordmark below. */
export async function qrPdf(url: string, title: string, brand: QrBrand = {}): Promise<Uint8Array> {
  const png = await qrPngDataUrl(url, 2400, brand);
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]);
  const font = await pdf.embedFont(StandardFonts.HelveticaBold);
  const small = await pdf.embedFont(StandardFonts.Helvetica);
  const code = await pdf.embedPng(png);
  const side = 432;
  const x = (612 - side) / 2;
  const y = 792 - 120 - side;
  if (title) {
    const size = 22;
    const w = font.widthOfTextAtSize(title, size);
    page.drawText(title, { x: (612 - Math.min(w, 540)) / 2, y: 792 - 84, size, font, color: rgb(0.06, 0.09, 0.16) });
  }
  page.drawImage(code, { x, y, width: side, height: side });
  let bottom = y - 28;
  if (brand.wordmark) {
    try {
      const wm = await pdf.embedPng(brand.wordmark);
      const maxW = 220, maxH = 90;
      const s = Math.min(maxW / wm.width, maxH / wm.height);
      const w = wm.width * s, h = wm.height * s;
      page.drawImage(wm, { x: (612 - w) / 2, y: bottom - h, width: w, height: h });
      bottom -= h + 18;
    } catch { /* wordmark isn't a PNG we can embed — skip it */ }
  }
  const link = url.replace(/^https?:\/\//, "");
  const lw = small.widthOfTextAtSize(link, 11);
  page.drawText(link, { x: (612 - lw) / 2, y: Math.max(40, bottom - 12), size: 11, font: small, color: rgb(0.45, 0.5, 0.58) });
  return pdf.save();
}

export function downloadBlob(name: string, blob: Blob) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

export function dataUrlToBlob(dataUrl: string): Blob {
  const [head, b64] = dataUrl.split(",");
  const mime = /data:([^;]+)/.exec(head)?.[1] || "application/octet-stream";
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}
