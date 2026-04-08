// ============================================================
// HoneyBook Import — Fetch contract content from share link
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyAuth } from "./_auth.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST required" });

  const user = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const { url } = req.body;
  if (!url) return res.status(400).json({ error: "Missing url" });

  // Strict URL validation to prevent SSRF
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return res.status(400).json({ error: "Invalid URL" });
  }
  if (!parsedUrl.hostname.endsWith("honeybook.com") || !["http:", "https:"].includes(parsedUrl.protocol)) {
    return res.status(400).json({ error: "Not a valid HoneyBook URL" });
  }

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        "Accept": "text/html,application/xhtml+xml",
      },
    });

    if (!response.ok) {
      return res.status(200).json({
        contractContent: "",
        error: `Failed to fetch (${response.status}). Try copying the contract text manually.`,
      });
    }

    const html = await response.text();

    // Try to extract meaningful text content from the HTML
    // Remove script/style tags first
    let text = html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<nav[\s\S]*?<\/nav>/gi, "")
      .replace(/<footer[\s\S]*?<\/footer>/gi, "");

    // Convert common block elements to newlines
    text = text
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n\n")
      .replace(/<\/div>/gi, "\n")
      .replace(/<\/h[1-6]>/gi, "\n\n")
      .replace(/<\/li>/gi, "\n")
      .replace(/<li[^>]*>/gi, "• ");

    // Strip remaining tags
    text = text.replace(/<[^>]+>/g, "");

    // Clean up whitespace
    text = text
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    if (!text || text.length < 50) {
      return res.status(200).json({
        contractContent: "",
        error: "Could not extract contract text. HoneyBook may require login. Try copying the text manually.",
      });
    }

    return res.status(200).json({ contractContent: text });
  } catch (err: any) {
    return res.status(200).json({
      contractContent: "",
      error: err.message || "Failed to fetch. Try copying the contract text manually.",
    });
  }
}
