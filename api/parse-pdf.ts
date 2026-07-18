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
    const closingMonth = findStatementClosingMonth(rawText);

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

    // Reassign December-on-a-January-statement charges to the prior year.
    transactions = correctYearBoundary(transactions, closingMonth, statementYear);

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

// The statement's closing month (1-12), or null if not found. Used to fix
// the year-boundary case below.
export function findStatementClosingMonth(rawText: string): number | null {
  // "Opening/Closing Date 12/16/25 - 01/15/26" → closing month = the 2nd date
  const range = rawText.match(/opening.{0,25}?closing\s+date[:\s]*\d{1,2}\/\d{1,2}\/\d{2,4}\s*[-–—]\s*(\d{1,2})\/\d{1,2}\/\d{2,4}/i);
  if (range) { const mm = parseInt(range[1], 10); if (mm >= 1 && mm <= 12) return mm; }
  // "Statement Closing Date: 01/15/2026"
  const single = rawText.match(/statement\s+(?:closing\s+)?date[:\s]*(\d{1,2})\/\d{1,2}\/\d{2,4}/i);
  if (single) { const mm = parseInt(single[1], 10); if (mm >= 1 && mm <= 12) return mm; }
  return null;
}

// Fix the year-boundary case: a statement closing in, say, January lists the
// prior December's charges with only MM/DD, so applying the statement year
// stamps them into the WRONG (future) December. Any transaction whose month
// falls AFTER the statement's closing month belongs to the previous year.
export function correctYearBoundary(txns: ParsedTxn[], closingMonth: number | null, statementYear: string): ParsedTxn[] {
  if (!closingMonth) return txns;
  const yr = parseInt(statementYear, 10);
  if (!Number.isFinite(yr)) return txns;
  return txns.map(t => {
    const m = t.date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return t;
    const [, y, mo, d] = m;
    if (parseInt(y, 10) === yr && parseInt(mo, 10) > closingMonth) {
      return { ...t, date: `${yr - 1}-${mo}-${d}` };
    }
    return t;
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

async function extractWithAI(rawText: string, statementYear: string): Promise<ParsedTxn[]> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const text = rawText.length > MAX_AI_CHARS ? rawText.slice(0, MAX_AI_CHARS) : rawText;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    messages: [{
      role: "user",
      content: `You are extracting expenses from a bank or credit-card statement. The raw text below may come from any bank (Chase, Wells Fargo, American Express, Bank of America, Capital One, Citi, etc.).

Return ONLY a JSON array of the purchases/charges (money the account holder SPENT), each as:
{"date": "YYYY-MM-DD", "description": string, "amount": number}

Rules:
- amount is a positive number in dollars (drop any minus sign or "CR").
- EXCLUDE payments to the card, refunds, credits, deposits, interest paid to you, balance/summary lines, and "payment thank you" lines. Only outgoing charges.
- If a row shows only MM/DD, use the statement year ${statementYear}.
- If there are no charges, return [].
- Return ONLY the JSON array, no prose, no code fences.

Statement text:
${text}`,
    }],
  });

  const content = response.content[0];
  const out = content && content.type === "text" ? content.text : "";
  const jsonMatch = out.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return [];
  let parsed: unknown;
  try { parsed = JSON.parse(jsonMatch[0]); } catch { return []; }
  return normalizeAiTransactions(parsed, statementYear);
}
