// ============================================================
// AI Receipt Parsing — Slate Pro feature
// Extracts vendor, date, amount, description, category from a
// receipt image. Pro tier enforced server-side.
// Categories match Slate's business_expenses schema.
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import Anthropic from "@anthropic-ai/sdk";
import { verifyAuth, getUserOrgId, errorMessage } from "./_auth.js";
import { createClient } from "@supabase/supabase-js";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLL_KEY || "";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST required" });

  const user = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const callerOrgId = await getUserOrgId(user.userId);
  if (!callerOrgId) return res.status(404).json({ error: "Org not found" });

  // Pro-tier enforcement — read plan from org
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const { data: org } = await supabase
    .from("organizations")
    .select("plan")
    .eq("id", callerOrgId)
    .maybeSingle();

  if (!org || (org.plan || "").toLowerCase() !== "pro") {
    return res.status(403).json({ error: "Receipt scanning is a Pro feature" });
  }

  const { imageBase64, mimeType } = req.body as { imageBase64?: string; mimeType?: string };
  if (!imageBase64) return res.status(400).json({ error: "imageBase64 required" });

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 500,
      messages: [{
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: (mimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp" | undefined) || "image/jpeg", data: imageBase64 },
          },
          {
            type: "text",
            text: `Extract receipt data as JSON: {"vendor": string, "date": "YYYY-MM-DD", "amount": number, "description": string, "category": "Advertising"|"Equipment"|"Meals"|"Office"|"Software"|"Vehicle"|"Other"}. Only return valid JSON, no other text.`,
          },
        ],
      }],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return res.status(422).json({ error: "Could not parse receipt" });

    const data = JSON.parse(jsonMatch[0]);
    return res.status(200).json({ data });
  } catch (err) {
    console.error(`[parse-receipt] msg=${errorMessage(err)} type=${err?.type}`);
    return res.status(500).json({ error: errorMessage(err, "Failed to parse receipt") });
  }
}
