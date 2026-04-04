// ============================================================
// Vercel Serverless Function — Parse Chase PDF/CSV statements
// Returns structured transaction data
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";

export const config = {
  api: { bodyParser: { sizeLimit: "10mb" } },
};

interface Transaction {
  date: string;
  description: string;
  amount: number;
  category: string;
}

function parseChaseCSV(text: string): Transaction[] {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map(h => h.trim().replace(/"/g, ""));
  const dateIdx = headers.findIndex(h => /transaction.*date/i.test(h));
  const descIdx = headers.findIndex(h => /description/i.test(h));
  const catIdx = headers.findIndex(h => /category/i.test(h));
  const amtIdx = headers.findIndex(h => /amount/i.test(h));
  const typeIdx = headers.findIndex(h => /type/i.test(h));

  if (dateIdx === -1 || descIdx === -1 || amtIdx === -1) return [];

  const transactions: Transaction[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const cols: string[] = [];
    let current = "";
    let inQuotes = false;
    for (const ch of line) {
      if (ch === '"') { inQuotes = !inQuotes; continue; }
      if (ch === "," && !inQuotes) { cols.push(current.trim()); current = ""; continue; }
      current += ch;
    }
    cols.push(current.trim());

    const type = typeIdx >= 0 ? cols[typeIdx] : "";
    if (/payment/i.test(type) || /return/i.test(type)) continue;

    const amount = Math.abs(parseFloat(cols[amtIdx]) || 0);
    if (amount === 0) continue;

    const dateParts = (cols[dateIdx] || "").split("/");
    const date = dateParts.length === 3
      ? `${dateParts[2]}-${dateParts[0].padStart(2, "0")}-${dateParts[1].padStart(2, "0")}`
      : cols[dateIdx];

    transactions.push({
      date,
      description: cols[descIdx] || "",
      amount,
      category: catIdx >= 0 ? cols[catIdx] : "",
    });
  }
  return transactions;
}

function parseChasePDF(text: string): Transaction[] {
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  const transactions: Transaction[] = [];

  // Chase PDF transaction lines typically look like:
  // 01/15 01/16 ADOBE *CREATIVE CLD 800-833-6687 54.99
  // or: 01/15 ADOBE *CREATIVE CLD 54.99
  const txnRegex = /^(\d{2}\/\d{2})(?:\s+\d{2}\/\d{2})?\s+(.+?)\s+(-?\d{1,}[,\d]*\.\d{2})$/;

  // Try to find the statement year from the text
  const yearMatch = text.match(/statement\s+(?:closing\s+)?date[:\s]*\d{2}\/\d{2}\/(\d{4})/i)
    || text.match(/(\d{4})\s+totals/i)
    || text.match(/(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}(?:\s*[-–]\s*\w+\s+\d{1,2})?,?\s+(\d{4})/i);
  const statementYear = yearMatch ? yearMatch[1] || yearMatch[2] : new Date().getFullYear().toString();

  for (const line of lines) {
    const match = line.match(txnRegex);
    if (!match) continue;

    const [, dateStr, description, amountStr] = match;
    const amount = Math.abs(parseFloat(amountStr.replace(/,/g, "")) || 0);
    if (amount === 0) continue;

    // Skip payment lines
    if (/payment.*thank/i.test(description) || /automatic payment/i.test(description)) continue;

    const [month, day] = dateStr.split("/");
    const date = `${statementYear}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;

    transactions.push({ date, description: description.trim(), amount, category: "" });
  }

  return transactions;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST required" });

  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const { fileData, fileType } = req.body;

    if (!fileData) {
      return res.status(400).json({ error: "Missing fileData" });
    }

    let transactions: Transaction[] = [];

    if (fileType === "csv" || fileType === "text/csv") {
      // CSV: fileData is the raw text
      transactions = parseChaseCSV(fileData);
    } else {
      // PDF: fileData is base64-encoded
      const pdfParse = (await import("pdf-parse")).default;
      const buffer = Buffer.from(fileData, "base64");
      const parsed = await pdfParse(buffer);
      transactions = parseChasePDF(parsed.text);
    }

    return res.status(200).json({ transactions, count: transactions.length });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Failed to parse statement" });
  }
}
