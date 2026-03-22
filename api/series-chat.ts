// ============================================================
// Vercel Serverless Function — AI chat for content series
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || "" });

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: "AI is not configured yet. Add ANTHROPIC_API_KEY to Vercel environment variables." });
  }

  try {
    const { message, senderName, seriesName, seriesGoal, clientName, clientContact, episodes, history } = req.body;

    if (!message) {
      return res.status(400).json({ error: "Message is required" });
    }

    const episodeList = (episodes || [])
      .map((e: any) => `  Episode ${e.number}: "${e.title}" — ${e.concept || "No concept yet"} [${e.status}]`)
      .join("\n");

    const systemPrompt = `You are a creative content strategist helping SDub Media plan a video series for their client.

SERIES: ${seriesName || "Untitled Series"}
GOAL: ${seriesGoal || "Not specified"}
CLIENT: ${clientName || "Unknown"}${clientContact ? ` (Contact: ${clientContact})` : ""}

${episodeList ? `EPISODES PLANNED SO FAR:\n${episodeList}` : "No episodes planned yet."}

YOUR ROLE:
- Help brainstorm episode ideas, develop concepts, and write talking points
- Be specific to the client's industry and business
- Keep suggestions actionable for video production
- Think about what makes compelling video content
- Consider the overall narrative arc of the series
- Suggest visual ideas, interview questions, B-roll opportunities
- Be collaborative and build on ideas from the conversation

The person you're talking to is ${senderName || "the user"}. Be conversational, creative, and enthusiastic about the project.`;

    // Build message history for Claude
    const claudeMessages = (history || [])
      .filter((m: any) => m.role === "user" || m.role === "assistant")
      .map((m: any) => ({ role: m.role as "user" | "assistant", content: m.content }));

    // Add current message
    claudeMessages.push({ role: "user" as const, content: message });

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2048,
      system: systemPrompt,
      messages: claudeMessages,
    });

    const content = response.content
      .filter(block => block.type === "text")
      .map(block => block.type === "text" ? block.text : "")
      .join("");

    const tokensUsed = (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0);

    return res.status(200).json({ content, tokensUsed });
  } catch (err: any) {
    console.error("Series chat error:", err);
    return res.status(500).json({ error: err.message || "AI request failed" });
  }
}
