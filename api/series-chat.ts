// ============================================================
// Vercel Serverless Function — AI chat for content series
// Claude can take actions: create episodes, update concepts, etc.
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import Anthropic from "@anthropic-ai/sdk";
import { verifyAuth } from "./_auth.js";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || "" });

const tools: Anthropic.Tool[] = [
  {
    name: "create_episodes",
    description: "Create multiple episodes for the series at once. Use this when brainstorming produces a list of episode ideas, or when the user asks you to create a plan/outline. Always include a title and concept for each episode.",
    input_schema: {
      type: "object" as const,
      properties: {
        episodes: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string", description: "Episode title" },
              concept: { type: "string", description: "Brief description of the episode concept (2-3 sentences)" },
              talking_points: { type: "string", description: "Key talking points or interview questions, separated by newlines" },
            },
            required: ["title", "concept"],
          },
          description: "List of episodes to create",
        },
      },
      required: ["episodes"],
    },
  },
  {
    name: "update_episode",
    description: "Update an existing episode's concept, talking points, or title. Use this when refining an episode that already exists on the board.",
    input_schema: {
      type: "object" as const,
      properties: {
        episode_number: { type: "number", description: "The episode number to update" },
        title: { type: "string", description: "New title (optional)" },
        concept: { type: "string", description: "Updated concept (optional)" },
        talking_points: { type: "string", description: "Updated talking points (optional)" },
      },
      required: ["episode_number"],
    },
  },
  {
    name: "develop_episode",
    description: "Deeply develop a specific episode with detailed talking points, visual suggestions, and production notes. Use this when the user asks to flesh out or develop a specific episode.",
    input_schema: {
      type: "object" as const,
      properties: {
        episode_number: { type: "number", description: "The episode number to develop" },
        detailed_concept: { type: "string", description: "Expanded concept with story arc and key moments" },
        talking_points: { type: "string", description: "Detailed talking points, interview questions, and key messages (each on a new line)" },
        visual_notes: { type: "string", description: "Suggestions for B-roll, locations, camera angles, graphics" },
      },
      required: ["episode_number", "detailed_concept", "talking_points"],
    },
  },
];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Verify authentication
  const user = await verifyAuth(req);
  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: "AI is not configured yet. Add ANTHROPIC_API_KEY to Vercel environment variables." });
  }

  try {
    const { message, senderName, seriesName, seriesGoal, clientName, clientContact, episodes, history } = req.body;

    if (!message) {
      return res.status(400).json({ error: "Message is required" });
    }

    // Guard against runaway token usage
    if (typeof message !== "string" || message.length > 10_000) {
      return res.status(413).json({ error: "Message too long (max 10,000 characters)" });
    }

    const episodeList = (episodes || [])
      .map((e: any) => `  Episode ${e.number}: "${e.title}" — ${e.concept || "No concept yet"} [${e.status}]`)
      .join("\n");

    const systemPrompt = `You are a creative content strategist helping SDub Media plan a video series for their client.

SERIES: ${seriesName || "Untitled Series"}
GOAL: ${seriesGoal || "Not specified"}
CLIENT: ${clientName || "Unknown"}${clientContact ? ` (Contact: ${clientContact})` : ""}

${episodeList ? `EPISODES ON THE BOARD:\n${episodeList}` : "No episodes planned yet."}

YOUR ROLE:
- Help brainstorm episode ideas, develop concepts, and write talking points
- Be specific to the client's industry and business
- Keep suggestions actionable for video production
- Think about what makes compelling video content — story arcs, hooks, emotional moments
- Suggest visual ideas, interview questions, B-roll opportunities
- Be collaborative and build on ideas from the conversation

IMPORTANT — TAKING ACTION:
You have tools to directly create and update episodes on the production board. USE THEM ACTIVELY:
- When you brainstorm episode ideas, use create_episodes to add them to the board immediately
- When refining an existing episode, use update_episode to update it on the board
- When asked to flesh out or develop an episode, use develop_episode with detailed talking points and visual notes
- Don't just describe what episodes could be — CREATE them so the team can start working
- After using a tool, briefly confirm what you did and ask what to work on next

The person you're talking to is ${senderName || "the user"}. Be conversational, creative, and enthusiastic about the project.`;

    // Build message history — cap to last 8 turns to prevent token abuse
    const claudeMessages: Anthropic.MessageParam[] = [];
    const cappedHistory = Array.isArray(history) ? history.slice(-8) : [];

    // Add history (simplified — just user/assistant text)
    for (const m of cappedHistory) {
      if (m.role === "user" || m.role === "assistant") {
        claudeMessages.push({ role: m.role, content: m.content });
      }
    }

    // Add current message
    claudeMessages.push({ role: "user", content: message });

    // Call Claude with tools
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: systemPrompt,
      messages: claudeMessages,
      tools,
    });

    // Process response — extract text and tool calls
    let textContent = "";
    const actions: any[] = [];

    for (const block of response.content) {
      if (block.type === "text") {
        textContent += block.text;
      } else if (block.type === "tool_use") {
        actions.push({
          tool: block.name,
          input: block.input,
          id: block.id,
        });
      }
    }

    // If Claude wants to use tools but also needs to continue, handle tool results
    if (response.stop_reason === "tool_use" && actions.length > 0) {
      // Build tool results and get Claude's follow-up response
      const toolResults: Anthropic.MessageParam = {
        role: "user",
        content: actions.map(a => ({
          type: "tool_result" as const,
          tool_use_id: a.id,
          content: `Action "${a.tool}" will be executed on the client side. Proceed with your response.`,
        })),
      };

      const followUp = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2048,
        system: systemPrompt,
        messages: [...claudeMessages, { role: "assistant", content: response.content }, toolResults],
        tools,
      });

      // Append follow-up text
      for (const block of followUp.content) {
        if (block.type === "text") {
          textContent += block.text;
        }
      }

      const totalTokens = (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0)
        + (followUp.usage?.input_tokens || 0) + (followUp.usage?.output_tokens || 0);

      return res.status(200).json({ content: textContent, actions, tokensUsed: totalTokens });
    }

    const tokensUsed = (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0);
    return res.status(200).json({ content: textContent, actions, tokensUsed });
  } catch (err: any) {
    console.error("Series chat error:", err);
    return res.status(500).json({ error: err.message || "AI request failed" });
  }
}
