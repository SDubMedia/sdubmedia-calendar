// ============================================================
// Vercel Serverless Function — Slate API for Claude AI
// Provides read/write access to projects, clients, crew, etc.
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

function verifyApiKey(req: VercelRequest): boolean {
  const key = req.headers["x-api-key"];
  const expected = process.env.SLATE_API_KEY;
  if (!expected) return false;
  return key === expected;
}

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLL_KEY || "";

function getDb() {
  return createClient(supabaseUrl, supabaseKey);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!verifyApiKey(req)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { action } = req.query;

  try {
    switch (action) {
      // ---- READ ----
      case "list-projects":
        return await listProjects(req, res);
      case "get-project":
        return await getProject(req, res);
      case "list-clients":
        return await listClients(res);
      case "list-crew":
        return await listCrew(res);
      case "list-locations":
        return await listLocations(res);
      case "list-project-types":
        return await listProjectTypes(res);

      // ---- WRITE ----
      case "create-project":
        return await createProject(req, res);
      case "update-project":
        return await updateProject(req, res);
      case "soft-delete-project":
        return await softDeleteProject(req, res);

      // ---- PERSONAL EVENTS ----
      case "list-personal-events":
        return await listPersonalEvents(req, res);
      case "create-personal-event":
        return await createPersonalEvent(req, res);
      case "update-personal-event":
        return await updatePersonalEvent(req, res);
      case "delete-personal-event":
        return await deletePersonalEvent(req, res);

      // ---- BILLING ----
      case "billing-summary":
        return await billingSummary(req, res);

      default:
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Internal server error" });
  }
}

// ---- Handlers ----

async function listProjects(req: VercelRequest, res: VercelResponse) {
  const db = getDb();
  const { from, to, status, client_id } = req.query;

  let query = db.from("projects").select("*").order("date", { ascending: true });
  if (from) query = query.gte("date", from as string);
  if (to) query = query.lte("date", to as string);
  if (status) query = query.eq("status", status as string);
  if (client_id) query = query.eq("client_id", client_id as string);
  // Exclude soft-deleted
  query = query.neq("status", "deleted");

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ projects: data });
}

async function getProject(req: VercelRequest, res: VercelResponse) {
  const db = getDb();
  const { id } = req.query;
  if (!id) return res.status(400).json({ error: "Missing id" });

  const { data, error } = await db.from("projects").select("*").eq("id", id).single();
  if (error) return res.status(404).json({ error: error.message });
  return res.status(200).json({ project: data });
}

async function listClients(res: VercelResponse) {
  const db = getDb();
  const { data, error } = await db.from("clients").select("id, company, contact_name, phone, email").order("company");
  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ clients: data });
}

async function listCrew(res: VercelResponse) {
  const db = getDb();
  const { data, error } = await db.from("crew_members").select("id, name, role_rates, phone, email").order("name");
  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ crew: data });
}

async function listLocations(res: VercelResponse) {
  const db = getDb();
  const { data, error } = await db.from("locations").select("*").order("name");
  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ locations: data });
}

async function listProjectTypes(res: VercelResponse) {
  const db = getDb();
  const { data, error } = await db.from("project_types").select("*").order("name");
  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ projectTypes: data });
}

async function createProject(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST required" });
  const db = getDb();
  const body = req.body;

  if (!body.client_id || !body.date) {
    return res.status(400).json({ error: "Missing required: client_id, date" });
  }

  const { data, error } = await db.from("projects").insert({
    id: body.id || `proj_${Date.now()}`,
    client_id: body.client_id,
    project_type_id: body.project_type_id || "",
    location_id: body.location_id || null,
    date: body.date,
    start_time: body.start_time || "",
    end_time: body.end_time || "",
    status: body.status || "upcoming",
    crew: body.crew || [],
    post_production: body.post_production || [],
    editor_billing: body.editor_billing || null,
    project_rate: body.project_rate ?? null,
    paid_date: body.paid_date || null,
    edit_types: body.edit_types || [],
    notes: body.notes || "",
    deliverable_url: body.deliverable_url || "",
  }).select().single();

  if (error) return res.status(500).json({ error: error.message });
  return res.status(201).json({ project: data });
}

async function updateProject(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST required" });
  const db = getDb();
  const { id } = req.query;
  if (!id) return res.status(400).json({ error: "Missing id" });

  const body = req.body;
  const patch: Record<string, any> = {};

  // Only include fields that were provided
  if (body.client_id !== undefined) patch.client_id = body.client_id;
  if (body.project_type_id !== undefined) patch.project_type_id = body.project_type_id;
  if (body.location_id !== undefined) patch.location_id = body.location_id;
  if (body.date !== undefined) patch.date = body.date;
  if (body.start_time !== undefined) patch.start_time = body.start_time;
  if (body.end_time !== undefined) patch.end_time = body.end_time;
  if (body.status !== undefined) patch.status = body.status;
  if (body.crew !== undefined) patch.crew = body.crew;
  if (body.post_production !== undefined) patch.post_production = body.post_production;
  if (body.editor_billing !== undefined) patch.editor_billing = body.editor_billing;
  if (body.project_rate !== undefined) patch.project_rate = body.project_rate;
  if (body.paid_date !== undefined) patch.paid_date = body.paid_date;
  if (body.edit_types !== undefined) patch.edit_types = body.edit_types;
  if (body.notes !== undefined) patch.notes = body.notes;
  if (body.deliverable_url !== undefined) patch.deliverable_url = body.deliverable_url;

  const { data, error } = await db.from("projects").update(patch).eq("id", id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ project: data });
}

async function softDeleteProject(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST required" });
  const db = getDb();
  const { id } = req.query;
  if (!id) return res.status(400).json({ error: "Missing id" });

  const { data, error } = await db.from("projects")
    .update({ status: "deleted" })
    .eq("id", id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ project: data, message: "Project soft-deleted. Use the app to hard delete." });
}

async function billingSummary(req: VercelRequest, res: VercelResponse) {
  const db = getDb();
  const { year, month, client_id } = req.query;

  if (!year || !month) {
    return res.status(400).json({ error: "Missing required: year, month" });
  }

  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const endDate = `${year}-${String(month).padStart(2, "0")}-31`;

  let query = db.from("projects").select("*")
    .gte("date", startDate)
    .lte("date", endDate)
    .neq("status", "deleted");

  if (client_id) query = query.eq("client_id", client_id as string);

  const { data: projects, error } = await query;
  if (error) return res.status(500).json({ error: error.message });

  const { data: clients } = await db.from("clients").select("*");

  return res.status(200).json({ projects, clients });
}

// ---- Personal Events ----

async function listPersonalEvents(req: VercelRequest, res: VercelResponse) {
  const db = getDb();
  const { from, to, category } = req.query;
  let query = db.from("personal_events").select("*").order("date", { ascending: true });
  if (from) query = query.gte("date", from as string);
  if (to) query = query.lte("date", to as string);
  if (category) query = query.eq("category", category as string);
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ events: data });
}

async function createPersonalEvent(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST required" });
  const db = getDb();
  const body = req.body;
  if (!body.title || !body.date) return res.status(400).json({ error: "Missing required: title, date" });

  const { data, error } = await db.from("personal_events").insert({
    id: `pe_${Date.now()}`,
    title: body.title,
    date: body.date,
    start_time: body.start_time || "",
    end_time: body.end_time || "",
    all_day: body.all_day ?? !body.start_time,
    location: body.location || "",
    notes: body.notes || "",
    category: body.category || "personal",
  }).select().single();

  if (error) return res.status(500).json({ error: error.message });
  return res.status(201).json({ event: data });
}

async function updatePersonalEvent(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST required" });
  const db = getDb();
  const { id } = req.query;
  if (!id) return res.status(400).json({ error: "Missing id" });
  const body = req.body;
  const patch: Record<string, any> = {};
  if (body.title !== undefined) patch.title = body.title;
  if (body.date !== undefined) patch.date = body.date;
  if (body.start_time !== undefined) patch.start_time = body.start_time;
  if (body.end_time !== undefined) patch.end_time = body.end_time;
  if (body.all_day !== undefined) patch.all_day = body.all_day;
  if (body.location !== undefined) patch.location = body.location;
  if (body.notes !== undefined) patch.notes = body.notes;
  if (body.category !== undefined) patch.category = body.category;
  const { data, error } = await db.from("personal_events").update(patch).eq("id", id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ event: data });
}

async function deletePersonalEvent(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST required" });
  const db = getDb();
  const { id } = req.query;
  if (!id) return res.status(400).json({ error: "Missing id" });
  const { error } = await db.from("personal_events").delete().eq("id", id);
  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ success: true });
}
