// ============================================================
// Vercel Serverless — Parse Chase PDF statement
// Uses unpdf (pure JS, no native deps)
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";

export const config = {
  api: { bodyParser: { sizeLimit: "10mb" } },
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST required" });

  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const { fileData } = req.body;
    if (!fileData) return res.status(400).json({ error: "Missing fileData (base64)" });

    const { extractText } = await import("unpdf");
    const buffer = Buffer.from(fileData, "base64");
    const uint8 = new Uint8Array(buffer);
    const result = await extractText(uint8);

    // extractText returns { totalPages, text } where text can be string or string[]
    const rawText = Array.isArray(result.text) ? result.text.join("\n") : String(result.text || "");
    const lines = rawText.split("\n").map((l: string) => l.trim()).filter(Boolean);

    // Find statement year
    const yearMatch = rawText.match(/statement\s+(?:closing\s+)?date[:\s]*\d{2}\/\d{2}\/(\d{4})/i)
      || rawText.match(/opening.*closing.*(\d{4})/i)
      || rawText.match(/(\d{4})\s+totals/i)
      || rawText.match(/(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}.*?(\d{4})/i);
    const statementYear = yearMatch ? (yearMatch[1] || yearMatch[2]) : String(new Date().getFullYear());

    const transactions: { date: string; description: string; amount: number }[] = [];

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

    return res.status(200).json({ transactions, count: transactions.length, rawLineCount: lines.length, text: rawText });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Failed to parse PDF" });
  }
}
