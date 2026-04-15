// ============================================================
// Vercel Serverless Function — MCP Server for Claude.ai
// Implements Model Context Protocol (Streamable HTTP transport)
// Gives Claude.ai access to Slate calendar + Gmail email
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";
import { timingSafeEqual } from "crypto";

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLL_KEY || "";

function getDb() {
  return createClient(supabaseUrl, supabaseKey);
}

// ---- Tool Definitions ----
const TOOLS = [
  {
    name: "list_projects",
    description: "List projects from the Slate production calendar. Can filter by date range, status, and client. Returns project details including crew, post-production, billing, and scheduling info.",
    inputSchema: {
      type: "object",
      properties: {
        from: { type: "string", description: "Start date (YYYY-MM-DD)" },
        to: { type: "string", description: "End date (YYYY-MM-DD)" },
        status: { type: "string", description: "Filter by status: upcoming, filming_done, in_editing, completed" },
        client_id: { type: "string", description: "Filter by client ID" },
      },
    },
  },
  {
    name: "get_project",
    description: "Get full details of a single project by ID, including crew assignments, post-production entries, editor billing, and notes.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Project ID" },
      },
      required: ["id"],
    },
  },
  {
    name: "create_project",
    description: "Create a new project/event on the Slate production calendar. Requires at minimum a client_id and date. IMPORTANT: Before creating, always check for conflicts by calling list_projects and list_personal_events for the same date to make sure nothing overlaps. If there is a conflict, tell the user before proceeding.",
    inputSchema: {
      type: "object",
      properties: {
        client_id: { type: "string", description: "Client ID (use list_clients to find)" },
        project_type_id: { type: "string", description: "Project type ID (use list_project_types to find)" },
        location_id: { type: "string", description: "Location ID (use list_locations to find)" },
        date: { type: "string", description: "Project date (YYYY-MM-DD)" },
        start_time: { type: "string", description: "Start time (HH:MM)" },
        end_time: { type: "string", description: "End time (HH:MM)" },
        crew: {
          type: "array",
          description: "Crew members for filming",
          items: {
            type: "object",
            properties: {
              crewMemberId: { type: "string" },
              role: { type: "string" },
              hoursWorked: { type: "number" },
              payRatePerHour: { type: "number" },
            },
          },
        },
        post_production: {
          type: "array",
          description: "Post-production crew",
          items: {
            type: "object",
            properties: {
              crewMemberId: { type: "string" },
              role: { type: "string" },
              hoursWorked: { type: "number" },
              payRatePerHour: { type: "number" },
            },
          },
        },
        notes: { type: "string", description: "Project notes" },
      },
      required: ["client_id", "date"],
    },
  },
  {
    name: "update_project",
    description: "Update an existing project. Only include fields you want to change.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Project ID to update" },
        date: { type: "string" },
        start_time: { type: "string" },
        end_time: { type: "string" },
        status: { type: "string" },
        notes: { type: "string" },
        crew: { type: "array" },
        post_production: { type: "array" },
      },
      required: ["id"],
    },
  },
  {
    name: "soft_delete_project",
    description: "Soft-delete a project by setting its status to 'deleted'. Geoffski can hard-delete manually from the app later.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Project ID to soft-delete" },
      },
      required: ["id"],
    },
  },
  {
    name: "list_clients",
    description: "List all clients in Slate with their contact info and IDs.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "list_crew",
    description: "List all crew members with their roles, rates, and contact info.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "list_locations",
    description: "List all filming/shoot locations with addresses.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "list_project_types",
    description: "List all project types (e.g., Headshot Photography, Podcast, Awards Ceremony).",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "billing_summary",
    description: "Get billing summary data for a specific month. Returns projects and client billing info for generating reports.",
    inputSchema: {
      type: "object",
      properties: {
        year: { type: "number", description: "Year (e.g., 2026)" },
        month: { type: "number", description: "Month (1-12)" },
        client_id: { type: "string", description: "Optional: filter by client" },
      },
      required: ["year", "month"],
    },
  },
  {
    name: "list_personal_events",
    description: "List personal calendar events (My Life calendar). Can filter by date range and category.",
    inputSchema: {
      type: "object",
      properties: {
        from: { type: "string", description: "Start date (YYYY-MM-DD)" },
        to: { type: "string", description: "End date (YYYY-MM-DD)" },
        category: { type: "string", description: "Filter by category: personal, appointment, reminder" },
      },
    },
  },
  {
    name: "create_personal_event",
    description: "Create a personal event on the My Life calendar. For personal appointments, reminders, and non-work events. IMPORTANT: Before creating, always check for conflicts by calling list_projects and list_personal_events for the same date to make sure nothing overlaps. If there is a conflict, tell the user before proceeding.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Event title" },
        date: { type: "string", description: "Date (YYYY-MM-DD)" },
        start_time: { type: "string", description: "Start time (HH:MM) — omit for all-day" },
        end_time: { type: "string", description: "End time (HH:MM)" },
        location: { type: "string", description: "Location/address" },
        notes: { type: "string", description: "Notes" },
        category: { type: "string", description: "Category: personal, appointment, reminder" },
      },
      required: ["title", "date"],
    },
  },
  {
    name: "update_personal_event",
    description: "Update an existing personal event. Only include fields you want to change.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Event ID to update" },
        title: { type: "string", description: "Event title" },
        date: { type: "string", description: "Date (YYYY-MM-DD)" },
        start_time: { type: "string", description: "Start time (HH:MM)" },
        end_time: { type: "string", description: "End time (HH:MM)" },
        location: { type: "string", description: "Location/address" },
        notes: { type: "string", description: "Notes" },
        category: { type: "string", description: "Category: personal, appointment, reminder" },
      },
      required: ["id"],
    },
  },
  {
    name: "delete_personal_event",
    description: "Delete a personal event from the My Life calendar.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "Event ID" } },
      required: ["id"],
    },
  },
  {
    name: "send_email",
    description: "Send an email from ai.sdubmedia@gmail.com. Use for sending reports, invoices, notifications, or any communication to Geoffski or clients.",
    inputSchema: {
      type: "object",
      properties: {
        to: { type: "string", description: "Recipient email address" },
        subject: { type: "string", description: "Email subject line" },
        body: { type: "string", description: "Plain text email body" },
        html: { type: "string", description: "HTML email body (optional, overrides body)" },
      },
      required: ["to", "subject"],
    },
  },
];

// ---- Tool Handlers ----
async function handleToolCall(name: string, args: Record<string, any>): Promise<any> {
  const db = getDb();

  switch (name) {
    case "list_projects": {
      let query = db.from("projects").select("*").order("date", { ascending: true }).neq("status", "deleted");
      if (args.from) query = query.gte("date", args.from);
      if (args.to) query = query.lte("date", args.to);
      if (args.status) query = query.eq("status", args.status);
      if (args.client_id) query = query.eq("client_id", args.client_id);
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return data;
    }

    case "get_project": {
      const { data, error } = await db.from("projects").select("*").eq("id", args.id).single();
      if (error) throw new Error(error.message);
      return data;
    }

    case "create_project": {
      const { data, error } = await db.from("projects").insert({
        id: `proj_${Date.now()}`,
        client_id: args.client_id,
        project_type_id: args.project_type_id || "",
        location_id: args.location_id || null,
        date: args.date,
        start_time: args.start_time || "",
        end_time: args.end_time || "",
        status: "upcoming",
        crew: args.crew || [],
        post_production: args.post_production || [],
        edit_types: [],
        notes: args.notes || "",
        deliverable_url: "",
      }).select().single();
      if (error) throw new Error(error.message);
      return data;
    }

    case "update_project": {
      const { id, ...patch } = args;
      const { data, error } = await db.from("projects").update(patch).eq("id", id).select().single();
      if (error) throw new Error(error.message);
      return data;
    }

    case "soft_delete_project": {
      const { data, error } = await db.from("projects").update({ status: "deleted" }).eq("id", args.id).select().single();
      if (error) throw new Error(error.message);
      return { ...data, message: "Project soft-deleted. Hard-delete from the Slate app." };
    }

    case "list_clients": {
      const { data, error } = await db.from("clients").select("id, company, contact_name, phone, email").order("company");
      if (error) throw new Error(error.message);
      return data;
    }

    case "list_crew": {
      const { data, error } = await db.from("crew_members").select("id, name, role_rates, phone, email").order("name");
      if (error) throw new Error(error.message);
      return data;
    }

    case "list_locations": {
      const { data, error } = await db.from("locations").select("*").order("name");
      if (error) throw new Error(error.message);
      return data;
    }

    case "list_project_types": {
      const { data, error } = await db.from("project_types").select("*").order("name");
      if (error) throw new Error(error.message);
      return data;
    }

    case "list_personal_events": {
      let query = db.from("personal_events").select("*").order("date", { ascending: true });
      if (args.from) query = query.gte("date", args.from);
      if (args.to) query = query.lte("date", args.to);
      if (args.category) query = query.eq("category", args.category);
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return data;
    }

    case "create_personal_event": {
      const { data, error } = await db.from("personal_events").insert({
        id: `pe_${Date.now()}`,
        title: args.title,
        date: args.date,
        start_time: args.start_time || "",
        end_time: args.end_time || "",
        all_day: !args.start_time,
        location: args.location || "",
        notes: args.notes || "",
        category: args.category || "personal",
      }).select().single();
      if (error) throw new Error(error.message);
      return data;
    }

    case "update_personal_event": {
      const { id, ...patch } = args;
      if (patch.start_time !== undefined) patch.all_day = !patch.start_time;
      const { data, error } = await db.from("personal_events").update(patch).eq("id", id).select().single();
      if (error) throw new Error(error.message);
      return data;
    }

    case "delete_personal_event": {
      const { error } = await db.from("personal_events").delete().eq("id", args.id);
      if (error) throw new Error(error.message);
      return { success: true, message: "Event deleted" };
    }

    case "billing_summary": {
      const startDate = `${args.year}-${String(args.month).padStart(2, "0")}-01`;
      const endDate = `${args.year}-${String(args.month).padStart(2, "0")}-31`;
      let query = db.from("projects").select("*").gte("date", startDate).lte("date", endDate).neq("status", "deleted");
      if (args.client_id) query = query.eq("client_id", args.client_id);
      const { data: projects, error: pErr } = await query;
      if (pErr) throw new Error(pErr.message);
      const { data: clients, error: cErr } = await db.from("clients").select("*");
      if (cErr) throw new Error(cErr.message);
      return { projects, clients };
    }

    case "send_email": {
      const user = process.env.GMAIL_USER;
      const pass = process.env.GMAIL_APP_PASSWORD;
      if (!user || !pass) throw new Error("Gmail SMTP not configured");

      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: { user, pass },
      });

      const info = await transporter.sendMail({
        from: `SDub Media AI <${user}>`,
        to: args.to,
        subject: args.subject,
        ...(args.html ? { html: args.html } : { text: args.body || "" }),
      });

      return { success: true, messageId: info.messageId, from: user, to: args.to };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ---- MCP Protocol Handler ----
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Handle CORS for Claude.ai
  const allowedOrigins = ["https://claude.ai", "https://www.claude.ai"];
  const origin = req.headers.origin || "";
  if (allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept, Authorization, Mcp-Session-Id");
  res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // Verify API key — accept X-API-Key header, Authorization: Bearer <key>, or ?key= query param
  const xApiKey = req.headers["x-api-key"] as string | undefined;
  const authHeader = req.headers["authorization"] as string | undefined;
  const bearerKey = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined;
  const queryKey = typeof req.query?.key === "string" ? req.query.key : undefined;
  const apiKey = xApiKey || bearerKey || queryKey;
  const expectedKey = process.env.SLATE_API_KEY;
  if (!expectedKey || !apiKey || apiKey.length !== expectedKey.length) {
    return res.status(401).json({ jsonrpc: "2.0", error: { code: -32600, message: "Unauthorized — invalid or missing API key" }, id: null });
  }
  if (!timingSafeEqual(Buffer.from(apiKey), Buffer.from(expectedKey))) {
    return res.status(401).json({ jsonrpc: "2.0", error: { code: -32600, message: "Unauthorized — invalid or missing API key" }, id: null });
  }

  // GET request — Claude.ai may use this to open an SSE stream for notifications
  if (req.method === "GET") {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    // Send a keep-alive comment and hold connection open briefly
    res.write(": connected\n\n");
    // For stateless Vercel functions, we can't hold SSE open long
    // Just end gracefully — Claude.ai will reconnect as needed
    return res.end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const body = req.body;

  // Handle batch requests (array of JSON-RPC messages)
  if (Array.isArray(body)) {
    const responses = [];
    for (const msg of body) {
      const response = await handleJsonRpc(msg);
      if (response) responses.push(response);
    }
    res.setHeader("Content-Type", "application/json");
    return res.status(200).json(responses.length === 1 ? responses[0] : responses);
  }

  const response = await handleJsonRpc(body);
  if (!response) {
    // Notification — no response needed
    return res.status(202).end();
  }
  res.setHeader("Content-Type", "application/json");
  return res.status(200).json(response);
}

async function handleJsonRpc(body: any): Promise<any> {
  const { jsonrpc, id, method, params } = body;

  // Notifications (no id) don't require a response
  const isNotification = id === undefined || id === null;

  if (jsonrpc !== "2.0") {
    if (isNotification) return null;
    return { jsonrpc: "2.0", error: { code: -32600, message: "Invalid JSON-RPC" }, id };
  }

  try {
    let result: any;

    switch (method) {
      case "initialize":
        result = {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: {
            name: "slate-mcp",
            version: "1.0.0",
          },
        };
        break;

      case "notifications/initialized":
        return null; // Notification — no response

      case "tools/list":
        result = { tools: TOOLS };
        break;

      case "tools/call": {
        const { name, arguments: args } = params;
        try {
          const data = await handleToolCall(name, args || {});
          result = {
            content: [
              { type: "text", text: JSON.stringify(data, null, 2) },
            ],
          };
        } catch (err: any) {
          result = {
            content: [
              { type: "text", text: `Error: ${err.message}` },
            ],
            isError: true,
          };
        }
        break;
      }

      default:
        if (isNotification) return null;
        return {
          jsonrpc: "2.0",
          error: { code: -32601, message: `Method not found: ${method}` },
          id,
        };
    }

    if (isNotification) return null;
    return { jsonrpc: "2.0", result, id };
  } catch (err: any) {
    if (isNotification) return null;
    return {
      jsonrpc: "2.0",
      error: { code: -32603, message: err.message },
      id,
    };
  }
}
