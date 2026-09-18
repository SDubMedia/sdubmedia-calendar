// ============================================================
// Flyer designs, drawn on a canvas so the on-screen preview and the print
// export are the exact same picture. Every size is 300 dpi. Every design
// works in both a tall card and the wide half page.
//
// Pure layout + drawing; data loading lives in the page.
// ============================================================

import { PDFDocument } from "pdf-lib";
import { drawQr, QR_DARK, type QrBrand } from "./qrRender";

export const LETTER_W = 2550;
export const LETTER_H = 3300;

/** Print sizes at 300 dpi. Rack cards (4×9) are what venue vendor racks
 *  hold; 5×7 sits on open-house tables; letter for boards; the wide half
 *  page prints two to a sheet. */
export const FLYER_SIZES = {
  "letter":   { label: "Letter flyer · 8.5×11", w: 2550, h: 3300 },
  "5x7":      { label: "Table card · 5×7", w: 1500, h: 2100 },
  "rack-4x9": { label: "Rack card · 4×9", w: 1200, h: 2700 },
  "half-landscape": { label: "Half page, wide · 8.5×5.5", w: 2550, h: 1650 },
} as const;
export type FlyerSize = keyof typeof FLYER_SIZES;

/** The three layouts that came out on top for venue racks and tables:
 *  full-bleed photo (wins the rack), colour-block split (converts best),
 *  white-frame editorial (reads most premium; best on tables). */
export const FLYER_DESIGNS = {
  fullbleed:  { label: "Full photo", blurb: "One photo edge to edge, words over a bottom gradient, QR bottom-left." },
  colorblock: { label: "Color block", blurb: "Photo up top, solid colour block below with the QR on a cream tile." },
  editorial:  { label: "White frame", blurb: "Warm white page, photo in a frame, wordmark on top, QR bottom-right." },
} as const;
export type FlyerDesign = keyof typeof FLYER_DESIGNS;

export interface PhotoRef { fileId: string; deliveryId: string }

export interface FlyerContent {
  design: FlyerDesign;
  proofLine: string;        // small trust line above the headline, e.g. "Drakewood Farm Preferred Videographer"
  headline: string;
  subheadline: string;
  body: string;
  cta: string;              // text beside the QR, e.g. "Scan to check your date"
  qrCodeId: string | null;  // one of the org's dynamic QR codes
  hero: PhotoRef | null;
  photos: PhotoRef[];       // up to 3 supporting photos (designs use as many as fit)
  accent: string;           // hex colour for rules, tags and the CTA
  showContact: boolean;     // print phone / email / website from business info
  showShortLink: boolean;   // print the code's link under the QR for people who won't scan
  qrColor: "black" | "blue" | "accent";
}

export const MAX_SMALL_PHOTOS = 3;

export const defaultFlyerContent = (): FlyerContent => ({
  design: "colorblock",
  proofLine: "Nashville wedding films",
  headline: "Your wedding, the way it actually felt.",
  subheadline: "Real moments, beautifully filmed. Delivered fast.",
  body: "From the first look to the last song on a packed dance floor, we film the day the way you'll want to remember it.",
  cta: "Scan to check your date",
  qrCodeId: null,
  hero: null,
  photos: [],
  accent: "#0f52d9",
  showContact: true,
  showShortLink: true,
  qrColor: "black",
});

export interface FlyerAssets {
  images: Map<string, HTMLImageElement>;   // fileId → loaded photo
  qrUrl: string | null;                    // the code's public link, or null for a placeholder
  size?: FlyerSize;
  brand: QrBrand;
  wordmark?: HTMLImageElement | null;
  contact: { name: string; phone: string; email: string; website: string };
}

// ---------------------------------------------------------------- helpers
const SERIF = "'Playfair Display', Georgia, 'Times New Roman', serif";
const SANS = "Inter, 'Helvetica Neue', Arial, sans-serif";

/** Word-wrap `text` to `maxWidth` using the current ctx.font. Honors \n. */
export function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const para of (text || "").split("\n")) {
    const words = para.split(/\s+/).filter(Boolean);
    if (words.length === 0) { lines.push(""); continue; }
    let line = "";
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = w; }
      else line = test;
    }
    lines.push(line);
  }
  return lines;
}

/** Draw `img` into the box, cropped to fill it (object-fit: cover). */
function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const s = Math.max(w / img.width, h / img.height);
  const dw = img.width * s, dh = img.height * s;
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  ctx.restore();
}

function photoOrPlaceholder(ctx: CanvasRenderingContext2D, img: HTMLImageElement | null | undefined, x: number, y: number, w: number, h: number, label: string) {
  if (img) drawCover(ctx, img, x, y, w, h);
  else placeholder(ctx, x, y, w, h, label);
}

function placeholder(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, label: string) {
  ctx.save();
  ctx.fillStyle = "#e5e7eb"; ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = "#9ca3af"; ctx.lineWidth = Math.max(3, w * 0.004); ctx.setLineDash([30, 24]); ctx.strokeRect(x + 3, y + 3, w - 6, h - 6);
  ctx.fillStyle = "#6b7280"; ctx.font = `500 ${Math.max(24, Math.min(w, h) * 0.08)}px ${SANS}`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(label, x + w / 2, y + h / 2);
  ctx.restore();
}

/** Small-caps tag in the accent colour. Returns its height. */
function chip(ctx: CanvasRenderingContext2D, text: string, x: number, baseline: number, size: number, fill: string, color = "#ffffff", align: "left" | "center" = "left"): number {
  ctx.save();
  ctx.font = `600 ${size}px ${SANS}`; ctx.textBaseline = "alphabetic";
  const label = text.toUpperCase(); const lw = ctx.measureText(label).width;
  const padX = size * 0.7, h = size * 1.9;
  const left = align === "center" ? x - (lw + 2 * padX) / 2 : x;
  ctx.fillStyle = fill; ctx.fillRect(left, baseline - size * 1.35, lw + 2 * padX, h);
  ctx.fillStyle = color; ctx.textAlign = "left"; ctx.fillText(label, left + padX, baseline);
  ctx.restore();
  return h;
}

function qrBrandFor(c: FlyerContent, a: FlyerAssets): QrBrand {
  const dark = c.qrColor === "black" ? "#000000" : c.qrColor === "accent" ? c.accent : QR_DARK;
  return { ...a.brand, dark };
}

/** QR on a white card with padding, optional short link under it. Returns the card's box. */
async function qrCard(ctx: CanvasRenderingContext2D, c: FlyerContent, a: FlyerAssets, x: number, y: number, size: number, linkSize: number, shadow = false) {
  const pad = Math.round(size * 0.09);
  const linkH = c.showShortLink && a.qrUrl ? linkSize * 1.9 : 0;
  const box = { x: x - pad, y: y - pad, w: size + 2 * pad, h: size + 2 * pad + linkH };
  ctx.save();
  if (shadow) { ctx.shadowColor = "rgba(0,0,0,0.35)"; ctx.shadowBlur = size * 0.12; ctx.shadowOffsetY = size * 0.03; }
  ctx.fillStyle = "#ffffff";
  roundedRect(ctx, box.x, box.y, box.w, box.h, pad * 0.8); ctx.fill();
  ctx.restore();
  if (a.qrUrl) {
    const qc = document.createElement("canvas");
    await drawQr(qc, a.qrUrl, size, qrBrandFor(c, a));
    ctx.drawImage(qc, x, y, size, size);
    if (c.showShortLink) {
      ctx.save(); ctx.fillStyle = "#6b7280"; ctx.font = `500 ${linkSize}px ${SANS}`; ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
      ctx.fillText(a.qrUrl.replace(/^https?:\/\//, ""), x + size / 2, y + size + pad + linkSize * 0.9);
      ctx.restore();
    }
  } else {
    placeholder(ctx, x, y, size, size, "Pick a QR code");
  }
  return box;
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

/** Contact lines (name, phone, email, website). Returns the height used. */
function contactLines(ctx: CanvasRenderingContext2D, a: FlyerAssets, x: number, y: number, size: number, color: string, align: CanvasTextAlign = "left"): number {
  const lines = [a.contact.name, a.contact.phone, a.contact.email, a.contact.website].filter(Boolean);
  ctx.save(); ctx.fillStyle = color; ctx.font = `500 ${size}px ${SANS}`; ctx.textAlign = align; ctx.textBaseline = "alphabetic";
  let yy = y;
  for (const line of lines) { ctx.fillText(line, x, yy); yy += size * 1.35; }
  ctx.restore();
  return yy - y;
}

function wordmark(ctx: CanvasRenderingContext2D, a: FlyerAssets, right: number, bottom: number, maxW: number, maxH: number, onDark = false) {
  if (!a.wordmark) return;
  const s = Math.min(maxW / a.wordmark.width, maxH / a.wordmark.height);
  const w = a.wordmark.width * s, h = a.wordmark.height * s;
  if (onDark) {   // the wordmark is dark-on-transparent; give it a white plate on photos
    const p = h * 0.28;
    ctx.save(); ctx.fillStyle = "rgba(255,255,255,0.92)"; roundedRect(ctx, right - w - p, bottom - h - p, w + 2 * p, h + 2 * p, p * 0.6); ctx.fill(); ctx.restore();
  }
  ctx.drawImage(a.wordmark, right - w, bottom - h, w, h);
}

const FONTS = ["700 120px 'Playfair Display'", "italic 600 60px 'Playfair Display'", "400 58px Inter", "500 70px Inter", "600 56px Inter"];
export async function ensureFlyerFonts(): Promise<void> {
  try { await Promise.all(FONTS.map(f => document.fonts.load(f))); } catch { /* fall back to system fonts */ }
}

interface Frame { ctx: CanvasRenderingContext2D; W: number; H: number; u: (n: number) => number; wide: boolean; tall: boolean }

function begin(canvas: HTMLCanvasElement, a: FlyerAssets, scale: number): Frame | null {
  const size = FLYER_SIZES[a.size || "letter"];
  const W = size.w, H = size.h;
  canvas.width = Math.round(W * scale); canvas.height = Math.round(H * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, W, H);
  ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
  // Type and spacing scale with the short side, so a rack card and a half
  // page are the same design at different widths.
  const k = Math.min(W, H) / 1650;
  return { ctx, W, H, u: (n: number) => Math.round(n * k), wide: W > H, tall: H / W > 1.6 };
}

/**
 * Draw the flyer at full print resolution onto `canvas`. `scale` shrinks the
 * backing store for on-screen previews (1 = print size).
 */
export async function renderFlyer(canvas: HTMLCanvasElement, c: FlyerContent, a: FlyerAssets, scale = 1): Promise<void> {
  const f = begin(canvas, a, scale);
  if (!f) return;
  if (c.design === "fullbleed") return renderFullBleed(f, c, a);
  if (c.design === "editorial") return renderWhiteFrame(f, c, a);
  return renderColorBlock(f, c, a);
}

// ---------------------------------------------------------------- helpers for the designs
function tint(hex: string, amount: number): string {
  // mix a hex colour toward white (amount 0..1)
  const n = parseInt(hex.replace("#", ""), 16); if (Number.isNaN(n)) return hex;
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const m = (v: number) => Math.round(v + (255 - v) * amount);
  return `rgb(${m(r)},${m(g)},${m(b)})`;
}
const CREAM = "#f7f1e6";

/** Headline lines (serif, mixed case) drawn from a top baseline; returns the bottom. */
function headline(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, lh: number, maxW: number, color: string, max = 2, align: CanvasTextAlign = "left"): number {
  ctx.save(); ctx.font = `700 ${size}px ${SERIF}`; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = "alphabetic";
  const lines = wrapText(ctx, text, maxW).slice(0, max);
  let yy = y;
  for (const line of lines) { ctx.fillText(line, x, yy); yy += lh; }
  ctx.restore();
  return yy - lh;
}
function lines(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, lh: number, maxW: number, color: string, max: number, align: CanvasTextAlign = "left", weight = "400", family = SANS, style = ""): number {
  ctx.save(); ctx.font = `${style} ${weight} ${size}px ${family}`.trim(); ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = "alphabetic";
  const ls = wrapText(ctx, text, maxW).slice(0, max);
  let yy = y;
  for (const line of ls) { ctx.fillText(line, x, yy); yy += lh; }
  ctx.restore();
  return yy;
}

// ---------------------------------------------------------------- 1. full-bleed photo
async function renderFullBleed(f: Frame, c: FlyerContent, a: FlyerAssets) {
  const { ctx, W, H, u, wide } = f;
  const hero = c.hero ? a.images.get(c.hero.fileId) : null;
  photoOrPlaceholder(ctx, hero, 0, 0, W, H, "Choose a hero photo");
  ctx.fillStyle = "rgba(0,0,0,0.10)"; ctx.fillRect(0, 0, W, H);        // light wash for text safety
  if (wide) {
    // Gradient from the left edge; everything lives in the left 45%.
    const g = ctx.createLinearGradient(0, 0, W * 0.55, 0);
    g.addColorStop(0, "rgba(0,0,0,0.82)"); g.addColorStop(0.7, "rgba(0,0,0,0.45)"); g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W * 0.55, H);
    const M = Math.round(W * 0.06), colW = Math.round(W * 0.45) - M;
    wordmark(ctx, a, M + u(300), M + u(80), u(300), u(80), true);
    const qrSize = Math.max(300, u(380)), pad = Math.round(qrSize * 0.09);
    const qrY = H - M - pad - (c.showShortLink ? u(50) : 0) - qrSize;
    await qrCard(ctx, c, a, M + pad, qrY, qrSize, u(24), true);
    const tx = M + qrSize + 2 * pad + u(40);
    let ty = qrY + u(70);
    ty = lines(ctx, c.cta, tx, ty, u(40), u(48), colW - qrSize - 2 * pad - u(40), "#ffffff", 3, "left", "700", SERIF);
    if (c.showContact) contactLines(ctx, a, tx, ty + u(10), u(26), "rgba(255,255,255,0.9)");
    // Headline block sits above the QR, anchored to it.
    let y = qrY - pad - u(60);
    if (c.subheadline) { lines(ctx, c.subheadline, M, y, u(38), u(46), colW, "rgba(255,255,255,0.95)", 2, "left", "400", SANS); y -= u(70); }
    const hs = u(96), hl = u(104);
    ctx.font = `700 ${hs}px ${SERIF}`; const n = wrapText(ctx, c.headline, colW).slice(0, 3).length;
    y -= (n - 1) * hl; headline(ctx, c.headline, M, y, hs, hl, colW, "#ffffff", 3);
    if (c.proofLine) chip(ctx, c.proofLine, M, y - hl * 0.9, u(28), c.accent);
    return;
  }
  // Tall: gradient from 45% down; headline block from 62%; QR bottom-left with CTA to its right.
  const g = ctx.createLinearGradient(0, H * 0.45, 0, H);
  g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(0.5, "rgba(0,0,0,0.4)"); g.addColorStop(1, "rgba(0,0,0,0.78)");
  ctx.fillStyle = g; ctx.fillRect(0, H * 0.45, W, H * 0.55);
  const gt = ctx.createLinearGradient(0, 0, 0, H * 0.16); gt.addColorStop(0, "rgba(0,0,0,0.35)"); gt.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = gt; ctx.fillRect(0, 0, W, H * 0.16);
  const M = Math.round(W * 0.08);
  if (a.wordmark) {   // top centre, white plate
    const maxW = W * 0.4, maxH = H * 0.045;
    const s = Math.min(maxW / a.wordmark.width, maxH / a.wordmark.height);
    const w = a.wordmark.width * s, h = a.wordmark.height * s;
    wordmark(ctx, a, W / 2 + w / 2, H * 0.06 + h, maxW, maxH, true);
  }
  const qrSize = Math.max(300, Math.round(W * 0.34)), pad = Math.round(qrSize * 0.09);
  const qrY = Math.round(H * 0.94) - qrSize;
  await qrCard(ctx, c, a, M, qrY, qrSize, u(24), true);
  const tx = M + qrSize + pad + u(40), tw = W - M - tx;
  let ty = qrY + qrSize * 0.42;
  ty = lines(ctx, c.cta, tx, ty, u(40), u(48), tw, "#ffffff", 3, "left", "700", SERIF);
  if (c.showContact) contactLines(ctx, a, tx, ty + u(8), u(26), "rgba(255,255,255,0.9)");
  // Headline block: anchored above the QR card.
  let y = qrY - pad - u(56);
  if (c.subheadline) { lines(ctx, c.subheadline, M, y, u(38), u(46), W - 2 * M, "rgba(255,255,255,0.95)", 2, "left", "400", SANS); y -= u(72); }
  const hs = Math.round(W * 0.075), hl = Math.round(hs * 1.1);
  ctx.font = `700 ${hs}px ${SERIF}`; const n = wrapText(ctx, c.headline, W - 2 * M).slice(0, 3).length;
  y -= (n - 1) * hl; headline(ctx, c.headline, M, y, hs, hl, W - 2 * M, "#ffffff", 3);
  if (c.proofLine) chip(ctx, c.proofLine, M, y - hl * 0.9, u(28), c.accent);
}

// ---------------------------------------------------------------- 2. colour-block split
async function renderColorBlock(f: Frame, c: FlyerContent, a: FlyerAssets) {
  const { ctx, W, H, u, wide } = f;
  const hero = c.hero ? a.images.get(c.hero.fileId) : null;
  const smalls = c.photos.slice(0, MAX_SMALL_PHOTOS);
  const block = c.accent, ink = CREAM, soft = tint(c.accent, 0.75);
  if (wide) {
    // Photo left 55%, block right 45%.
    const pw = Math.round(W * 0.55);
    photoOrPlaceholder(ctx, hero, 0, 0, pw, H, "Choose a hero photo");
    ctx.fillStyle = block; ctx.fillRect(pw, 0, W - pw, H);
    const M = u(90), x0 = pw + M, bw = W - pw - 2 * M, cx = pw + (W - pw) / 2;
    wordmark(ctx, a, W - M, M + u(70), u(260), u(70), true);
    let y = M + u(180);
    if (c.proofLine) { chip(ctx, c.proofLine, x0, y, u(26), ink, block); y += u(80); }
    y = headline(ctx, c.headline.toUpperCase(), x0, y + u(70), u(70), u(82), bw, ink, 3) + u(70);
    y = lines(ctx, c.subheadline, x0, y, u(34), u(44), bw, soft, 2, "left", "400", SANS, "italic") + u(6);
    const qrSize = Math.max(300, u(360)), pad = Math.round(qrSize * 0.09);
    const tileH = qrSize + 2 * pad + (c.showShortLink ? u(50) : 0);
    const ctaH = u(110) + (c.showContact ? u(120) : 0);
    const qrY = H - M - ctaH - tileH + pad;
    const bodyMax = Math.max(0, Math.floor((qrY - pad - u(30) - y) / u(46)));
    lines(ctx, c.body, x0, y + u(10), u(32), u(46), bw, soft, bodyMax);
    await qrCard(ctx, c, a, cx - qrSize / 2, qrY, qrSize, u(24));
    let ty = qrY + tileH + u(10);
    ty = lines(ctx, c.cta, cx, ty, u(42), u(50), bw, ink, 2, "center", "700", SERIF);
    if (c.showContact) contactLines(ctx, a, cx, ty + u(6), u(26), soft, "center");
    return;
  }
  // Tall: photo top 58% (+ strip to 70%), block below.
  const photoH = Math.round(H * 0.58);
  photoOrPlaceholder(ctx, hero, 0, 0, W, photoH, "Choose a hero photo");
  wordmark(ctx, a, Math.round(W * 0.03) + u(260), Math.round(H * 0.03) + u(70), u(260), u(70), true);
  let top = photoH;
  if (smalls.length) {
    const stripH = Math.round(H * 0.12), gap = Math.round(W * 0.02);
    const cellW = (W - gap * (smalls.length + 1)) / smalls.length;
    ctx.fillStyle = block; ctx.fillRect(0, photoH, W, stripH);
    smalls.forEach((p, i) => photoOrPlaceholder(ctx, a.images.get(p.fileId), gap + i * (cellW + gap), photoH + gap, cellW, stripH - gap, "Loading…"));
    top = photoH + stripH;
  }
  ctx.fillStyle = block; ctx.fillRect(0, top, W, H - top);
  const M = Math.round(W * 0.1), cx = W / 2, bw = W - 2 * M;
  let y = top + Math.round(H * 0.06);
  if (c.proofLine) { chip(ctx, c.proofLine, cx, y, u(26), ink, block, "center"); y += u(80); }
  const hs = Math.round(W * 0.06);
  y = headline(ctx, c.headline.toUpperCase(), cx, y + hs, hs, Math.round(hs * 1.18), bw, ink, 2, "center") + Math.round(hs * 1.1);
  y = lines(ctx, c.subheadline, cx, y, Math.round(hs * 0.4), Math.round(hs * 0.52), bw, soft, 2, "center", "400", SANS, "italic");
  const qrSize = Math.max(300, Math.round(W * 0.42)), pad = Math.round(qrSize * 0.09);
  const tileH = qrSize + 2 * pad + (c.showShortLink ? u(50) : 0);
  const ctaH = u(120) + (c.showContact ? u(112) : 0);
  const qrY = H - Math.round(H * 0.035) - ctaH - tileH + pad;
  const bodyMax = Math.max(0, Math.floor((qrY - pad - u(30) - y) / u(46)));
  lines(ctx, c.body, cx, y + u(14), u(32), u(46), bw, soft, bodyMax, "center");
  await qrCard(ctx, c, a, cx - qrSize / 2, qrY, qrSize, u(24));
  let ty = qrY + tileH + u(6);
  ty = lines(ctx, c.cta, cx, ty, u(44), u(52), bw, ink, 2, "center", "700", SERIF);
  if (c.showContact) contactLines(ctx, a, cx, ty + u(4), u(26), soft, "center");
}

// ---------------------------------------------------------------- 3. white-frame editorial
async function renderWhiteFrame(f: Frame, c: FlyerContent, a: FlyerAssets) {
  const { ctx, W, H, u, wide } = f;
  ctx.fillStyle = "#F7F4EF"; ctx.fillRect(0, 0, W, H);
  const hero = c.hero ? a.images.get(c.hero.fileId) : null;
  const smalls = c.photos.slice(0, 1);
  const M = Math.round(W * 0.07), ix0 = M, ix1 = W - M, iw = ix1 - ix0;
  const inkDark = "#1f2937", inkSoft = "#4b5563";
  // Masthead: wordmark centred + hairline.
  const y = Math.round(H * (wide ? 0.09 : 0.07));
  if (a.wordmark) {
    const maxW = iw * 0.35, maxH = Math.round(H * (wide ? 0.06 : 0.03));
    const s = Math.min(maxW / a.wordmark.width, maxH / a.wordmark.height);
    const w = a.wordmark.width * s, h = a.wordmark.height * s;
    ctx.drawImage(a.wordmark, W / 2 - w / 2, y - h / 2, w, h);
  }
  const ruleY = Math.round(H * (wide ? 0.16 : 0.11));
  ctx.fillStyle = "#9ca3af"; ctx.fillRect(ix0, ruleY, iw, Math.max(2, u(2)));
  if (wide) {
    // Photo left half of the inner area, full inner height; words + QR right.
    const top = Math.round(H * 0.2), bottom = H - M;
    const pw = Math.round(iw * 0.5) - u(20);
    photoOrPlaceholder(ctx, hero, ix0, top, pw, bottom - top, "Choose a hero photo");
    const x0 = ix0 + pw + u(40), rw = ix1 - x0;
    let yy = top + u(30);
    if (c.proofLine) { chip(ctx, c.proofLine, x0, yy, u(24), c.accent); yy += u(80); }
    yy = headline(ctx, c.headline, x0, yy + u(60), u(74), u(84), rw, inkDark, 2, "left") + u(90);
    yy = lines(ctx, c.subheadline, x0, yy, u(32), u(42), rw, inkSoft, 2, "left", "600", SERIF, "italic") + u(8);
    const qrSize = Math.max(300, u(340)), pad = Math.round(qrSize * 0.09);
    const qrX = ix1 - qrSize, qrY = bottom - qrSize - (c.showShortLink ? u(48) : 0);
    const bodyMax = Math.max(0, Math.floor((qrY - u(60) - yy) / u(44)));
    lines(ctx, c.body, x0, yy + u(10), u(30), u(44), rw, inkDark, bodyMax);
    await qrCard(ctx, c, a, qrX, qrY, qrSize, u(24));
    const tw = qrX - pad - u(40) - x0;
    let ty = qrY + qrSize * 0.55;
    ty = lines(ctx, c.cta.toUpperCase(), x0, ty, u(30), u(40), tw, inkDark, 2, "left", "600", SANS);
    if (c.showContact) contactLines(ctx, a, x0, ty + u(4), u(24), inkSoft);
    return;
  }
  // Tall: photo from 14% to 64% (or two frames), headline at 67%, body, QR bottom-right.
  const top = Math.round(H * 0.14), pbottom = Math.round(H * 0.64);
  if (smalls.length) {
    const gap = Math.round(iw * 0.03), half = (iw - gap) / 2;
    photoOrPlaceholder(ctx, hero, ix0, top, half, pbottom - top, "Choose a hero photo");
    photoOrPlaceholder(ctx, a.images.get(smalls[0].fileId), ix0 + half + gap, top, half, pbottom - top, "Loading…");
  } else {
    photoOrPlaceholder(ctx, hero, ix0, top, iw, pbottom - top, "Choose a hero photo");
  }
  let yy = Math.round(H * 0.67);
  if (c.proofLine) { chip(ctx, c.proofLine, ix0, yy, u(24), c.accent); yy += u(76); }
  const hs = Math.round(W * 0.055);
  yy = headline(ctx, c.headline, ix0, yy + hs, hs, Math.round(hs * 1.15), iw, inkDark, 2) + Math.round(hs * 1.15);
  const qrSize = Math.max(300, Math.round(W * 0.28)), pad = Math.round(qrSize * 0.09);
  const qrX = ix1 - qrSize, qrY = H - M - qrSize - (c.showShortLink ? u(48) : 0);
  yy = lines(ctx, c.subheadline, ix0, yy, Math.round(hs * 0.42), Math.round(hs * 0.55), iw * 0.6, inkSoft, 2, "left", "600", SERIF, "italic");
  const bodyMax = Math.max(0, Math.min(3, Math.floor((qrY - u(90) - yy) / u(44))));
  lines(ctx, c.body, ix0, yy + u(12), u(30), u(44), iw * 0.6, inkDark, bodyMax);
  await qrCard(ctx, c, a, qrX, qrY, qrSize, u(24));
  const tw = qrX - pad - u(40) - ix0;
  let ty = qrY + qrSize * 0.55;
  ty = lines(ctx, c.cta.toUpperCase(), ix0, ty, u(30), u(40), tw, inkDark, 2, "left", "600", SANS);
  if (c.showContact) contactLines(ctx, a, ix0, ty + u(4), u(24), inkSoft);
}

// ---------------------------------------------------------------- loading + export
/**
 * Fetch a photo in a way the canvas can draw AND export. Fetching (no-store,
 * so an <img> elsewhere can't have cached a no-CORS copy of the same URL) gives
 * a same-origin blob. If storage refuses the fetch — it does for localhost,
 * which isn't in the bucket's allowed origins — fall back to a plain <img>:
 * the preview still draws, but the canvas is "tainted" and can't be exported.
 * That case is flagged on the image so the export button can say so.
 */
export async function loadPhoto(url: string): Promise<HTMLImageElement> {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`Photo failed to load (${res.status})`);
    const blob = await res.blob();
    return await decode(URL.createObjectURL(blob));
  } catch (err) {
    console.warn("[flyer] direct fetch blocked, previewing without export", err);
    const img = await decode(url);
    img.dataset.tainted = "1";
    return img;
  }
}

function decode(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Photo failed to load"));
    img.src = src;
  });
}

/** True when any photo came in through the fallback path (see loadPhoto). */
export function hasTaintedPhotos(images: Map<string, HTMLImageElement>): boolean {
  for (const img of images.values()) if (img.dataset.tainted) return true;
  return false;
}

export async function loadDataImage(src: string): Promise<HTMLImageElement | null> {
  if (!src) return null;
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** PDF page at the true print size (points = pixels × 72 / 300). */
export async function flyerPdf(pngDataUrl: string, size: FlyerSize = "letter"): Promise<Uint8Array> {
  const { w, h } = FLYER_SIZES[size];
  const pw = (w * 72) / 300, ph = (h * 72) / 300;
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([pw, ph]);
  const png = await pdf.embedPng(pngDataUrl);
  page.drawImage(png, { x: 0, y: 0, width: pw, height: ph });
  return pdf.save();
}
