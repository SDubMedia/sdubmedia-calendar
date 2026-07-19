// ============================================================
// Vercel Serverless — Parse a bank/card PDF statement into expenses.
//
// Works across banks (Chase, Wells Fargo, Amex, Bank of America, etc.):
// we extract the statement text with unpdf (pure JS, no native deps),
// then ask Claude to pull out the charges as structured JSON. Bank
// layouts vary too much for one set of regexes, so AI handles the long
// tail. A regex pass runs as a fast, free fallback when the AI key is
// missing or the model returns nothing.
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import Anthropic from "@anthropic-ai/sdk";
import { verifyAuth, errorMessage } from "./_auth.js";

export const config = {
  api: { bodyParser: { sizeLimit: "10mb" } },
};

export interface ParsedTxn {
  date: string;        // YYYY-MM-DD
  description: string;
  amount: number;      // positive dollars
}

// Cap how much statement text we send to the model — a few pages of
// transactions fit comfortably; this guards against pathological PDFs.
const MAX_AI_CHARS = 60_000;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST required" });

  const user = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  try {
    const { fileData } = req.body;
    if (!fileData) return res.status(400).json({ error: "Missing fileData (base64)" });

    const { extractText } = await import("unpdf");
    const buffer = Buffer.from(fileData, "base64");
    const uint8 = new Uint8Array(buffer);
    const result = await extractText(uint8);

    const rawText = Array.isArray(result.text) ? result.text.join("\n") : String(result.text || "");
    const lines = rawText.split("\n").map((l: string) => l.trim()).filter(Boolean);
    const statementYear = findStatementYear(rawText);
    const closing = findStatementClosingDate(rawText);

    // Prefer AI extraction (handles any bank). Fall back to regex if the
    // key is missing or the model returns nothing useful.
    let transactions: ParsedTxn[] = [];
    let method = "regex";
    if (process.env.ANTHROPIC_API_KEY) {
      try {
        const ai = await extractWithAI(rawText, statementYear);
        if (ai.length > 0) { transactions = ai; method = "ai"; }
      } catch (err) {
        console.warn(`[parse-pdf] AI extraction failed, falling back to regex: ${errorMessage(err)}`);
      }
    }
    if (transactions.length === 0) {
      transactions = parseTransactionsRegex(lines, statementYear);
      method = "regex";
    }

    // Last resort: if the text paths found nothing (unreadable text —
    // Type3/embedded fonts, scanned or image-only PDFs), hand the raw PDF to
    // the model to read it visually.
    if (transactions.length === 0 && process.env.ANTHROPIC_API_KEY) {
      try {
        const aiPdf = await extractWithAIFromPdf(fileData, statementYear);
        if (aiPdf.length > 0) { transactions = aiPdf; method = "ai-pdf"; }
      } catch (err) {
        console.warn(`[parse-pdf] PDF-document extraction failed: ${errorMessage(err)}`);
      }
    }

    // Reassign December-on-a-January-statement charges to the prior year.
    transactions = correctYearBoundary(transactions, closing);

    return res.status(200).json({ transactions, count: transactions.length, method, rawLineCount: lines.length });
  } catch (err) {
    return res.status(500).json({ error: errorMessage(err, "Failed to parse PDF") });
  }
}

export function findStatementYear(rawText: string): string {
  const yearMatch = rawText.match(/statement\s+(?:closing\s+)?date[:\s]*\d{2}\/\d{2}\/(\d{4})/i)
    || rawText.match(/opening.*closing.*(\d{4})/i)
    || rawText.match(/(\d{4})\s+totals/i)
    || rawText.match(/(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}.*?(\d{4})/i);
  return yearMatch ? (yearMatch[1] || yearMatch[2]) : String(new Date().getFullYear());
}

// Parse a MM + (YY or YYYY) into a concrete {month, year}, or null if invalid.
function toMonthYear(mm: string, yy: string): { month: number; year: number } | null {
  const month = parseInt(mm, 10);
  let year = parseInt(yy, 10);
  if (!Number.isFinite(month) || !Number.isFinite(year) || month < 1 || month > 12) return null;
  if (yy.length === 2) year += 2000;
  return { month, year };
}

// The statement's closing month AND year, or null if not found. Both come from
// the SAME closing date so the year-boundary fix below can't disagree with
// itself. Used to place each charge in the correct year.
export function findStatementClosingDate(rawText: string): { month: number; year: number } | null {
  // "Opening/Closing Date 12/16/25 - 01/15/26" → closing = the 2nd date
  const range = rawText.match(/opening.{0,25}?closing\s+date[:\s]*\d{1,2}\/\d{1,2}\/\d{2,4}\s*[-–—]\s*(\d{1,2})\/\d{1,2}\/(\d{2,4})/i);
  if (range) { const d = toMonthYear(range[1], range[2]); if (d) return d; }
  // "Statement Closing Date: 01/15/2026"
  const single = rawText.match(/statement\s+(?:closing\s+)?date[:\s]*(\d{1,2})\/\d{1,2}\/(\d{2,4})/i);
  if (single) { const d = toMonthYear(single[1], single[2]); if (d) return d; }
  return null;
}

// Place each charge in the correct year for the statement period. A statement
// closing in, say, January lists the prior December's charges with only MM/DD.
// Months at/before the closing month are in the closing year; any month AFTER
// it wrapped from the prior year. Keyed off the closing DATE itself (month AND
// year), so a mis-detected statement year can't push a December charge two
// years back.
export function correctYearBoundary(txns: ParsedTxn[], closing: { month: number; year: number } | null): ParsedTxn[] {
  if (!closing) return txns;
  return txns.map(t => {
    const m = t.date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return t;
    const [, , mo, d] = m;
    const month = parseInt(mo, 10);
    const year = month > closing.month ? closing.year - 1 : closing.year;
    return { ...t, date: `${year}-${mo}-${d}` };
  });
}

// Generic regex fallback: matches "MM/DD [MM/DD] Description Amount" lines.
// Bank-agnostic but only catches the common single-line layouts.
export function parseTransactionsRegex(lines: string[], statementYear: string): ParsedTxn[] {
  const transactions: ParsedTxn[] = [];
  const patterns = [
    /(\d{2}\/\d{2})\s+\d{2}\/\d{2}\s+(.+?)\s+(-?\d{1,3}(?:,\d{3})*\.\d{2})$/,
    /(\d{2}\/\d{2})\s+(.+?)\s+(-?\d{1,3}(?:,\d{3})*\.\d{2})$/,
  ];
  for (const line of lines) {
    for (const pattern of patterns) {
      const match = line.match(pattern);
      if (!match) continue;
      const [, dateStr, description, amountStr] = match;
      const amount = Math.abs(parseFloat(amountStr.replace(/,/g, "")) || 0);
      if (amount === 0) break;
      if (/payment.*thank/i.test(description) || /automatic payment/i.test(description)) break;
      const [month, day] = dateStr.split("/");
      const date = `${statementYear}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
      transactions.push({ date, description: description.trim(), amount });
      break;
    }
  }
  return transactions;
}

// Normalize whatever the model returns into clean ParsedTxn rows.
export function normalizeAiTransactions(raw: unknown, fallbackYear: string): ParsedTxn[] {
  if (!Array.isArray(raw)) return [];
  const out: ParsedTxn[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    const desc = typeof o.description === "string" ? o.description.trim() : "";
    const amount = Math.abs(Number(o.amount));
    let date = typeof o.date === "string" ? o.date.trim() : "";
    // Coerce MM/DD or MM/DD/YY into YYYY-MM-DD using the statement year.
    const slash = date.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
    if (slash) {
      const yr = slash[3] ? (slash[3].length === 2 ? `20${slash[3]}` : slash[3]) : fallbackYear;
      date = `${yr}-${slash[1].padStart(2, "0")}-${slash[2].padStart(2, "0")}`;
    }
    if (!desc || !amount || amount <= 0) continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    out.push({ date, description: desc, amount });
  }
  return out;
}

const AI_MODEL = "claude-sonnet-4-20250514";

// Shared extraction instructions. `source` describes where the model is
// reading from ("text below" vs "attached PDF") so the year guidance fits.
function extractionInstructions(statementYear: string, fromPdf: boolean): string {
  return `You are extracting expenses from a bank or credit-card statement. It may come from any bank (Chase, Wells Fargo, American Express, Bank of America, Capital One, Citi, etc.).

Return ONLY a JSON array of the purchases/charges (money the account holder SPENT), each as:
{"date": "YYYY-MM-DD", "description": string, "amount": number}

Rules:
- amount is a positive number in dollars (drop any minus sign or "CR").
- EXCLUDE payments to the card, refunds, credits, deposits, interest paid to you, balance/summary lines, and "payment thank you" lines. Only outgoing charges.
- ${fromPdf
  ? "Read the year from the statement's billing period. A charge shown as MM/DD belongs to that period's year — a December charge on a January statement is the PRIOR year."
  : `If a row shows only MM/DD, use the statement year ${statementYear}.`}
- If there are no charges, return [].
- Return ONLY the JSON array, no prose, no code fences.`;
}

// Pull the JSON array out of the model's reply and normalize it.
function parseAiReply(out: string, statementYear: string): ParsedTxn[] {
  const jsonMatch = out.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return [];
  let parsed: unknown;
  try { parsed = JSON.parse(jsonMatch[0]); } catch { return []; }
  return normalizeAiTransactions(parsed, statementYear);
}

// Primary path: extract charges from the already-extracted statement TEXT.
async function extractWithAI(rawText: string, statementYear: string): Promise<ParsedTxn[]> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const text = rawText.length > MAX_AI_CHARS ? rawText.slice(0, MAX_AI_CHARS) : rawText;

  const response = await anthropic.messages.create({
    model: AI_MODEL,
    max_tokens: 4096,
    messages: [{
      role: "user",
      content: `${extractionInstructions(statementYear, false)}\n\nStatement text:\n${text}`,
    }],
  });

  const content = response.content[0];
  return parseAiReply(content && content.type === "text" ? content.text : "", statementYear);
}

// Fallback path: hand the raw PDF to the model so it can READ it visually.
// This rescues statements whose text can't be extracted — Type3/embedded
// fonts, scanned/image PDFs, or unusual encodings that unpdf returns as
// garbage. Only fires when the text paths find nothing.
async function extractWithAIFromPdf(base64Pdf: string, statementYear: string): Promise<ParsedTxn[]> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const response = await anthropic.messages.create({
    model: AI_MODEL,
    max_tokens: 8192,
    messages: [{
      role: "user",
      content: [
        {
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data: base64Pdf },
        },
        { type: "text", text: extractionInstructions(statementYear, true) },
      ],
    }],
  });

  const content = response.content[0];
  return parseAiReply(content && content.type === "text" ? content.text : "", statementYear);
}
