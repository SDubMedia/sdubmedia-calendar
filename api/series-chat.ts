// ============================================================
// Vercel Serverless Function — AI chat for content series
// Claude can take actions: create episodes, update concepts, etc.
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import Anthropic from "@anthropic-ai/sdk";
import { verifyAuth, errorMessage } from "./_auth.js";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || "" });

const tools: Anthropic.Tool[] = [
  {
    name: "create_episodes",
    description: "Create new episodes on the production board. Use this whenever the user asks to brainstorm, outline, plan, lay out, or 'give me' episodes — do NOT write the list in chat instead. Each episode must have a title (short, specific, under 60 chars) and a concept (2-3 sentences: hook + arc + payoff). Talking points should be one per line, written like prompts a host can read on shoot day.",
    input_schema: {
      type: "object" as const,
      properties: {
        episodes: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string", description: "Short, specific, hook-y episode title. Under 60 characters. Avoid generic words like 'intro' or 'overview'." },
              concept: { type: "string", description: "Exactly 2-3 sentences. Sentence 1 = hook (why someone stops scrolling). Sentence 2 = arc (what they see/hear). Sentence 3 = payoff (what they walk away with)." },
              talking_points: { type: "string", description: "Numbered or bulleted list, one item per line. Mix interview questions, beats, and B-roll cues. Written like prompts the host can read on shoot day." },
            },
            required: ["title", "concept"],
          },
          description: "Ordered list of episodes to add to the board. Episode numbers are assigned automatically — order this array in the sequence you want them numbered.",
        },
      },
      required: ["episodes"],
    },
  },
  {
    name: "update_episode",
    description: "Update an existing episode that's already on the board. Use this when retitling, refining the concept, or rewriting talking points for a specific episode the user references by number. Reference the episode by its current episode_number — never invent new numbers.",
    input_schema: {
      type: "object" as const,
      properties: {
        episode_number: { type: "number", description: "The existing episode number on the board (must match a real episode in the list)." },
        title: { type: "string", description: "New title (optional). Keep under 60 chars and specific." },
        concept: { type: "string", description: "Updated concept (optional). 2-3 sentences: hook + arc + payoff." },
        talking_points: { type: "string", description: "Updated talking points (optional). One per line, shoot-day-ready." },
      },
      required: ["episode_number"],
    },
  },
  {
    name: "develop_episode",
    description: "Take an existing episode from a rough idea to a production-ready plan with detailed talking points and visual notes. Use this when the user asks to 'flesh out', 'develop', 'expand', or 'go deeper on' a specific episode they reference by number.",
    input_schema: {
      type: "object" as const,
      properties: {
        episode_number: { type: "number", description: "The existing episode number to develop." },
        detailed_concept: { type: "string", description: "Expanded concept (3-5 sentences) including story arc, key moments, and emotional through-line." },
        talking_points: { type: "string", description: "Production-ready talking points: numbered, one per line. Include interview questions, story beats, and key messages." },
        visual_notes: { type: "string", description: "B-roll suggestions, location ideas, camera angle notes, graphics or text overlay ideas." },
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

    type EpisodeRow = { number: number; title: string; concept: string | null; status: string; talking_points_preview?: string };
    const episodeList = ((episodes as EpisodeRow[]) || [])
      .map(e => {
        const base = `  Episode ${e.number}: "${e.title}" — ${e.concept || "No concept yet"} [${e.status}]`;
        if (e.talking_points_preview) {
          return `${base}\n    Voice sample: ${e.talking_points_preview.replace(/\n/g, " | ").slice(0, 220)}`;
        }
        return base;
      })
      .join("\n");

    const systemPrompt = `You are a content strategist for SDub Media. Your single job is to help plan a coherent video series for one specific client. Stay inside this framework — don't drift into general marketing advice or off-topic chatter.

THIS SERIES:
  Name: ${seriesName || "Untitled Series"}
  Goal: ${seriesGoal || "Not specified"}
  Client: ${clientName || "Unknown"}${clientContact ? ` (Contact: ${clientContact})` : ""}

EPISODES ALREADY ON THE BOARD:
${episodeList || "  (none yet)"}

REFERENCE EXISTING EPISODES BY NUMBER:
- Always look at the list above before suggesting anything. Don't re-suggest topics that already exist.
- When discussing an existing episode, refer to it as "Episode N: Title" — never invent new numbers.
- New episodes you create get the next available episode number automatically.

EPISODE SHAPE (every episode you create or develop must follow this):
  TITLE: short, specific, hook-y. Under 60 characters. Avoid generic words like "intro" / "overview" — be concrete about WHAT the episode is about.
  CONCEPT: 2-3 sentences. Sentence 1 = the hook (why a viewer would stop scrolling). Sentence 2 = the arc (what they'll see / hear). Sentence 3 = the payoff (what they walk away with).
  TALKING POINTS: numbered or bulleted, one per line, written like prompts a host can read on shoot day. Mix interview questions, key beats, and B-roll cues.

SERIES COHERENCE & STAYING ON MESSAGE:
- Episodes should build on each other or hit different angles of the same goal — not be a random list.
- Suggest a sensible order if creating multiple at once.
- Don't duplicate existing episode topics. If a request overlaps with one already on the board, point that out and offer to either refine the existing one (call update_episode) or create something genuinely different.
- READ THE EXISTING TALKING POINTS before writing new ones. Voice samples in the episode list above show the established tone/voice for this series. Match it. Don't introduce a new voice or pivot the topic.
- When revising an existing episode, preserve everything the user didn't explicitly ask to change. Don't rewrite the concept just because you're called — small surgical edits beat full rewrites.

CRITICAL — USE TOOLS, DON'T DESCRIBE:

When the user wants to add/brainstorm/outline/plan episodes (any phrasing
meaning that), you MUST call create_episodes. Don't write a numbered list
in chat — call the tool so episodes appear on the board.

When the user asks to develop / flesh out / expand / go deeper on a specific
episode, you MUST call develop_episode.

When the user asks to rename / retitle / change the concept of an existing
episode, you MUST call update_episode.

Default to action over description. If you're about to write a list of
episode ideas in plain text, stop and call create_episodes instead.

After using a tool, confirm in 1-2 sentences what you did and ask what's
next. Don't repeat the full episode contents back — they're on the board.

PURE-CONVERSATION QUESTIONS (e.g. "what makes a good hook?", "should we do
interviews or vlogs?") can be answered in text. The tool requirement only
applies to creating or modifying episodes.

WHEN IN DOUBT: act on the board, then ask a clarifying question. Don't sit
in chat-only mode if there's an actionable interpretation.

The person you're talking to is ${senderName || "the user"}.`;

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
    const actions: { tool: string; input: unknown; id: string }[] = [];

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
  } catch (err) {
    console.error("Series chat error:", err);
    return res.status(500).json({ error: errorMessage(err, "AI request failed") });
  }
}
