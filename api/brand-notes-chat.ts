// ============================================================
// Brand Notes Assistant — Anthropic-backed conversation that helps
// the owner build per-client brand & voice notes. The owner answers
// guided questions; Claude drafts a concise notes blob the owner
// reviews + saves to clients.brand_notes. That blob then auto-feeds
// into series-chat so video suggestions are grounded in the brand.
//
// Two modes selected via body.mode:
//   - "chat"  → ongoing conversation, returns assistant's reply text.
//   - "draft" → end of conversation, returns a finalized brand-notes
//               markdown blob the caller can write straight to DB.
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import Anthropic from "@anthropic-ai/sdk";
import { verifyAuth, errorMessage } from "./_auth.js";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || "" });

const SYSTEM_INTERVIEW = `You are a brand strategist helping a video production owner build a brand profile for ONE specific client. Your job is to gather just enough about the client's brand, voice, audience, and product/service that future content suggestions feel like the client made them — not generic marketing advice.

INTERVIEW STYLE:
- One question per turn. Don't bombard.
- Conversational, friendly, fast. The owner is busy.
- Skip questions when the answer is already obvious from prior context.
- Aim for 5–8 turns total before wrapping. If the owner has volunteered enough, end early.

THE 5 THINGS YOU NEED TO KNOW (in this rough priority):
1. What does the client actually sell or do? Concrete products, services, deliverables.
2. Who's the audience? Demographics, but more importantly — what problem are they solving?
3. Brand voice — pick 3 adjectives. Examples: "warm and direct" / "bold, irreverent" / "professional, polished, premium".
4. What makes them different from competitors? The actual hook, not generic ones.
5. Existing socials / website you can reference (Instagram handle, website URL, anything).

WHEN ENOUGH IS ENOUGH:
- After ~5–8 user replies, you should have enough. Tell the owner you're ready to draft notes and ask if they want to add anything else. Don't keep asking forever.

DON'T:
- Don't draft the brand-notes document during the chat. The caller will request a separate "draft" pass when they're ready.
- Don't pretend to look at URLs. Just take what the owner tells you.
- Don't lecture or explain marketing concepts. Just ask + listen.`;

const SYSTEM_DRAFTER = `You are a brand strategist. Read the conversation between an owner and an interviewer about ONE client. Output a concise brand-notes document, formatted as plain markdown, ready to save to that client's record.

FORMAT (use these exact section headings):

## Who They Are
2–3 sentences. What the client sells/does, what makes them different.

## Audience
2–3 sentences. Who the audience is, what problem they're solving for them, what the audience cares about.

## Voice
3 adjectives + a one-line description of how that sounds in copy / video.

## Hooks We Should Lean Into
3–5 bullets. The angles, hooks, recurring themes that make sense for THIS client. Be specific — not "show authenticity" but "show them on-site doing the unglamorous parts of the work."

## Things to Avoid
2–3 bullets. What would feel off-brand. What other people in their space do that they wouldn't.

## Reference Links
List any URLs / social handles the owner mentioned, one per line. Skip if nothing was given.

LENGTH: target 200–400 words total. Concise > comprehensive. The owner will edit anything they want to refine.

DON'T:
- Don't invent details the owner didn't say.
- Don't include preamble like "Here are the brand notes:" — output the markdown directly.
- Don't include the section "About this document" or signatures or anything meta.`;

interface IncomingMessage {
  role: "user" | "assistant";
  content: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const user = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: "AI is not configured. Add ANTHROPIC_API_KEY to Vercel." });
  }

  try {
    const { mode, clientName, history } = req.body || {};
    if (mode !== "chat" && mode !== "draft") {
      return res.status(400).json({ error: "mode must be 'chat' or 'draft'" });
    }
    const messages = (Array.isArray(history) ? history : []) as IncomingMessage[];
    if (messages.length === 0 && mode === "draft") {
      return res.status(400).json({ error: "No conversation to draft from" });
    }
    // Cap context. Each message body capped to ~4k chars on the way in.
    const safe = messages
      .filter(m => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
      .map(m => ({ role: m.role, content: m.content.slice(0, 4000) }))
      .slice(-30);

    const safeClientName = typeof clientName === "string" ? clientName.slice(0, 200) : "";

    if (mode === "chat") {
      // Seed the conversation with a kickoff prompt if no history exists.
      const isFirstTurn = safe.length === 0 || (safe.length === 1 && safe[0].role === "user");
      const intro = isFirstTurn
        ? `\n\nThis is the start of an interview about ${safeClientName || "a client"}. Begin with a warm, short kickoff question — invite the owner to describe what the client actually does in their own words.`
        : "";
      const result = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        system: SYSTEM_INTERVIEW + intro,
        messages: safe.length > 0 ? safe : [{ role: "user" as const, content: `Let's start the interview about ${safeClientName || "this client"}.` }],
      });
      const text = result.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map(b => b.text)
        .join("\n")
        .trim();
      return res.status(200).json({ ok: true, reply: text });
    }

    // mode === "draft"
    const transcript = safe.map(m => `${m.role === "user" ? "OWNER" : "INTERVIEWER"}: ${m.content}`).join("\n\n");
    const result = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2048,
      system: SYSTEM_DRAFTER,
      messages: [
        { role: "user", content: `Client: ${safeClientName || "Unspecified"}\n\nConversation:\n\n${transcript}\n\nDraft the brand notes document.` },
      ],
    });
    const draft = result.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map(b => b.text)
      .join("\n")
      .trim();
    return res.status(200).json({ ok: true, draft });
  } catch (err) {
    return res.status(500).json({ error: errorMessage(err, "Brand notes chat failed") });
  }
}
