#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Supabase client (read-only usage)
// ---------------------------------------------------------------------------

const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  "https://fjnfmvzdnhgiapuawzpp.supabase.co";

const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZqbmZtdnpkbmhnaWFwdWF3enBwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5MDczOTQsImV4cCI6MjA4ODQ4MzM5NH0.xupmrDaz5IKLK5QzFwnnl8rZCDiox6bzNXvmJUXgxEQ";

const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ok(data: unknown): { content: Array<{ type: "text"; text: string }> } {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

function err(
  message: string
): { content: Array<{ type: "text"; text: string }>; isError: true } {
  return { content: [{ type: "text" as const, text: message }], isError: true };
}

/** Build a lookup map from an array of records keyed by `id`. */
function indexById<T extends { id: string }>(
  rows: T[]
): Record<string, T> {
  const map: Record<string, T> = {};
  for (const row of rows) map[row.id] = row;
  return map;
}

/** Resolve foreign keys on a project row to include human-readable names. */
function resolveProject(
  project: Record<string, unknown>,
  clients: Record<string, { company: string }>,
  locations: Record<string, { name: string }>,
  projectTypes: Record<string, { name: string }>
): Record<string, unknown> {
  return {
    ...project,
    client_name:
      clients[project.client_id as string]?.company ?? "Unknown client",
    location_name:
      locations[project.location_id as string]?.name ?? "No location",
    project_type_name:
      projectTypes[project.project_type_id as string]?.name ??
      "Unknown project type",
  };
}

/** Fetch lookup tables used for resolving project foreign keys. */
async function fetchLookups() {
  const [clientsRes, locationsRes, projectTypesRes] = await Promise.all([
    supabase.from("clients").select("id, company"),
    supabase.from("locations").select("id, name"),
    supabase.from("project_types").select("id, name"),
  ]);

  return {
    clients: indexById((clientsRes.data ?? []) as Array<{ id: string; company: string }>),
    locations: indexById((locationsRes.data ?? []) as Array<{ id: string; name: string }>),
    projectTypes: indexById((projectTypesRes.data ?? []) as Array<{ id: string; name: string }>),
  };
}

// ---------------------------------------------------------------------------
// MCP Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: "sdubmedia-calendar",
  version: "1.0.0",
});

// ---- get-calendar ----
server.tool(
  "get-calendar",
  "Get projects for a given month with resolved client, location, and project type names",
  {
    year: z.number().int().describe("Four-digit year, e.g. 2026"),
    month: z.number().int().min(1).max(12).describe("Month number 1-12"),
  },
  async ({ year, month }) => {
    const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
    const endMonth = month === 12 ? 1 : month + 1;
    const endYear = month === 12 ? year + 1 : year;
    const endDate = `${endYear}-${String(endMonth).padStart(2, "0")}-01`;

    const { data, error } = await supabase
      .from("projects")
      .select("*")
      .gte("date", startDate)
      .lt("date", endDate)
      .order("date", { ascending: true });

    if (error) return err(`Supabase error: ${error.message}`);

    const lookups = await fetchLookups();
    const resolved = (data ?? []).map((p: Record<string, unknown>) =>
      resolveProject(p, lookups.clients, lookups.locations, lookups.projectTypes)
    );

    return ok({ year, month, project_count: resolved.length, projects: resolved });
  }
);

// ---- get-project ----
server.tool(
  "get-project",
  "Get a single project by ID with all details resolved",
  {
    id: z.string().describe("The project ID"),
  },
  async ({ id }) => {
    const { data, error } = await supabase
      .from("projects")
      .select("*")
      .eq("id", id)
      .single();

    if (error) return err(`Supabase error: ${error.message}`);
    if (!data) return err(`Project not found: ${id}`);

    const lookups = await fetchLookups();
    return ok(resolveProject(data as Record<string, unknown>, lookups.clients, lookups.locations, lookups.projectTypes));
  }
);

// ---- list-projects ----
server.tool(
  "list-projects",
  "List all projects with optional status filter",
  {
    status: z
      .enum(["upcoming", "filming_done", "in_editing", "completed"])
      .optional()
      .describe("Filter by project status"),
  },
  async ({ status }) => {
    let query = supabase.from("projects").select("*").order("date", { ascending: true });
    if (status) query = query.eq("status", status);

    const { data, error } = await query;
    if (error) return err(`Supabase error: ${error.message}`);

    const lookups = await fetchLookups();
    const resolved = (data ?? []).map((p: Record<string, unknown>) =>
      resolveProject(p, lookups.clients, lookups.locations, lookups.projectTypes)
    );

    return ok({ count: resolved.length, projects: resolved });
  }
);

// ---- list-clients ----
server.tool(
  "list-clients",
  "List all clients",
  {},
  async () => {
    const { data, error } = await supabase
      .from("clients")
      .select("*")
      .order("company", { ascending: true });

    if (error) return err(`Supabase error: ${error.message}`);
    return ok({ count: (data ?? []).length, clients: data });
  }
);

// ---- get-client ----
server.tool(
  "get-client",
  "Get a single client by ID with all details",
  {
    id: z.string().describe("The client ID"),
  },
  async ({ id }) => {
    const { data, error } = await supabase
      .from("clients")
      .select("*")
      .eq("id", id)
      .single();

    if (error) return err(`Supabase error: ${error.message}`);
    if (!data) return err(`Client not found: ${id}`);
    return ok(data);
  }
);

// ---- list-crew ----
server.tool(
  "list-crew",
  "List all crew members",
  {},
  async () => {
    const { data, error } = await supabase
      .from("crew_members")
      .select("*")
      .order("name", { ascending: true });

    if (error) return err(`Supabase error: ${error.message}`);
    return ok({ count: (data ?? []).length, crew_members: data });
  }
);

// ---- list-locations ----
server.tool(
  "list-locations",
  "List all locations",
  {},
  async () => {
    const { data, error } = await supabase
      .from("locations")
      .select("*")
      .order("name", { ascending: true });

    if (error) return err(`Supabase error: ${error.message}`);
    return ok({ count: (data ?? []).length, locations: data });
  }
);

// ---- list-project-types ----
server.tool(
  "list-project-types",
  "List all project types",
  {},
  async () => {
    const { data, error } = await supabase
      .from("project_types")
      .select("*")
      .order("name", { ascending: true });

    if (error) return err(`Supabase error: ${error.message}`);
    return ok({ count: (data ?? []).length, project_types: data });
  }
);

// ---- list-marketing-expenses ----
server.tool(
  "list-marketing-expenses",
  "List marketing expenses with optional month filter",
  {
    year: z.number().int().optional().describe("Four-digit year to filter by"),
    month: z
      .number()
      .int()
      .min(1)
      .max(12)
      .optional()
      .describe("Month number 1-12 to filter by (requires year)"),
  },
  async ({ year, month }) => {
    let query = supabase
      .from("marketing_expenses")
      .select("*")
      .order("date", { ascending: true });

    if (year && month) {
      const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
      const endMonth = month === 12 ? 1 : month + 1;
      const endYear = month === 12 ? year + 1 : year;
      const endDate = `${endYear}-${String(endMonth).padStart(2, "0")}-01`;
      query = query.gte("date", startDate).lt("date", endDate);
    } else if (year) {
      query = query.gte("date", `${year}-01-01`).lt("date", `${year + 1}-01-01`);
    }

    const { data, error } = await query;
    if (error) return err(`Supabase error: ${error.message}`);

    const total = (data ?? []).reduce(
      (sum: number, e: Record<string, unknown>) => sum + Number(e.amount ?? 0),
      0
    );

    return ok({ count: (data ?? []).length, total_amount: total, expenses: data });
  }
);

// ---- list-retainer-payments ----
server.tool(
  "list-retainer-payments",
  "List retainer payments with optional client_id filter",
  {
    client_id: z.string().optional().describe("Filter by client ID"),
  },
  async ({ client_id }) => {
    let query = supabase
      .from("retainer_payments")
      .select("*")
      .order("date", { ascending: true });

    if (client_id) query = query.eq("client_id", client_id);

    const { data, error } = await query;
    if (error) return err(`Supabase error: ${error.message}`);

    const totalHours = (data ?? []).reduce(
      (sum: number, p: Record<string, unknown>) => sum + Number(p.hours ?? 0),
      0
    );

    return ok({
      count: (data ?? []).length,
      total_hours: totalHours,
      payments: data,
    });
  }
);

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("SDub Media Calendar MCP server running on stdio");
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
