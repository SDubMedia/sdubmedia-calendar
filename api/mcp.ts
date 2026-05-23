// ============================================================
// Vercel Serverless Function — MCP Server for Claude.ai
// Implements Model Context Protocol (Streamable HTTP transport)
// Gives Claude.ai access to Slate calendar + Gmail email
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";
import { timingSafeEqual } from "crypto";
import { errorMessage } from "./_auth.js";

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
  // ---- Invoices ----
  {
    name: "list_invoices",
    description: "List invoices. Filter by status (draft, sent, paid, void), client, or date range. Returns invoice number, client, total, status, dates.",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", description: "Filter by status: draft, sent, paid, void" },
        client_id: { type: "string", description: "Filter by client ID" },
        from: { type: "string", description: "Issue date from (YYYY-MM-DD)" },
        to: { type: "string", description: "Issue date to (YYYY-MM-DD)" },
      },
    },
  },
  {
    name: "get_invoice",
    description: "Get full details of a single invoice by ID, including line items, company/client info, and payment dates.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "Invoice ID" } },
      required: ["id"],
    },
  },
  // ---- Proposals ----
  {
    name: "list_proposals",
    description: "List proposals. Filter by status (draft, sent, accepted, completed, void), pipeline stage, or client. Returns title, client, total, status, pipeline stage.",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", description: "Filter by status: draft, sent, accepted, completed, void" },
        pipeline_stage: { type: "string", description: "Filter by pipeline stage: inquiry, follow_up, proposal_sent, proposal_signed, retainer_paid, final_payment, in_production, delivered, review, archived" },
        client_id: { type: "string", description: "Filter by client ID" },
      },
    },
  },
  {
    name: "get_proposal",
    description: "Get full details of a single proposal by ID, including pages, packages, line items, payment milestones, and signatures.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "Proposal ID" } },
      required: ["id"],
    },
  },
  // ---- Contracts ----
  {
    name: "list_contracts",
    description: "List contracts. Filter by status (draft, sent, client_signed, completed, void) or client. Returns title, client, status, sent/signed dates.",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", description: "Filter by status: draft, sent, client_signed, completed, void" },
        client_id: { type: "string", description: "Filter by client ID" },
      },
    },
  },
  {
    name: "get_contract",
    description: "Get full details of a single contract by ID, including content, signatures, and dates.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "Contract ID" } },
      required: ["id"],
    },
  },
  // ---- Pipeline ----
  {
    name: "list_pipeline_leads",
    description: "List pipeline leads. Filter by stage (inquiry, follow_up, proposal_sent, proposal_signed, retainer_paid, final_payment, in_production, delivered, review, archived). Returns lead name, stage, event date, recent activity.",
    inputSchema: {
      type: "object",
      properties: {
        pipeline_stage: { type: "string", description: "Filter by stage" },
      },
    },
  },
  // ---- Mileage ----
  {
    name: "list_mileage",
    description: "List manual mileage trips. Filter by date range or crew member. Returns date, destination, purpose, round-trip miles.",
    inputSchema: {
      type: "object",
      properties: {
        from: { type: "string", description: "Start date (YYYY-MM-DD)" },
        to: { type: "string", description: "End date (YYYY-MM-DD)" },
        crew_member_id: { type: "string", description: "Filter by crew member ID" },
      },
    },
  },
  {
    name: "log_mileage",
    description: "Log a manual mileage trip. For office visits, gear pickups, or ad-hoc trips. You can provide round_trip_miles manually, OR provide destination_address and the system will auto-calculate the distance from the crew member's home address using Google Maps. Use list_crew to find crew member IDs.",
    inputSchema: {
      type: "object",
      properties: {
        crew_member_id: { type: "string", description: "Crew member ID" },
        date: { type: "string", description: "Trip date (YYYY-MM-DD)" },
        destination: { type: "string", description: "Where you went (name/label for the trip)" },
        destination_address: { type: "string", description: "Full street address of destination — if provided, round-trip miles will be auto-calculated from crew member's home address via Google Maps" },
        location_id: { type: "string", description: "Optional: Slate location ID if it's a known location" },
        purpose: { type: "string", description: "Business purpose of the trip" },
        round_trip_miles: { type: "number", description: "Round-trip distance in miles — omit if providing destination_address for auto-calculation" },
      },
      required: ["crew_member_id", "date", "destination", "purpose"],
    },
  },
  // ---- Business Expenses ----
  {
    name: "list_expenses",
    description: "List business expenses. Filter by date range or category (Equipment, Software, Travel, Meals, Advertising, Office, Insurance, Vehicle, Education, Subscriptions, Personal, Other).",
    inputSchema: {
      type: "object",
      properties: {
        from: { type: "string", description: "Start date (YYYY-MM-DD)" },
        to: { type: "string", description: "End date (YYYY-MM-DD)" },
        category: { type: "string", description: "Filter by category" },
      },
    },
  },
  // ---- Contractor Invoices ----
  {
    name: "list_contractor_invoices",
    description: "List contractor (1099) invoices from crew members. Filter by crew member or status (draft, sent).",
    inputSchema: {
      type: "object",
      properties: {
        crew_member_id: { type: "string", description: "Filter by crew member ID" },
        status: { type: "string", description: "Filter by status: draft, sent" },
      },
    },
  },
  // ---- Crew Availability ----
  {
    name: "crew_availability",
    description: "Check which crew members are available (not already booked) on a specific date. Returns available and booked crew with their project assignments.",
    inputSchema: {
      type: "object",
      properties: {
        date: { type: "string", description: "Date to check (YYYY-MM-DD)" },
      },
      required: ["date"],
    },
  },
  // ---- Financial Summary ----
  {
    name: "financial_summary",
    description: "Get a financial summary for a date range. Returns total revenue (paid invoices), total expenses (business expenses), total crew costs (from projects), and net profit. Also breaks down revenue by client and expenses by category.",
    inputSchema: {
      type: "object",
      properties: {
        from: { type: "string", description: "Start date (YYYY-MM-DD)" },
        to: { type: "string", description: "End date (YYYY-MM-DD)" },
      },
      required: ["from", "to"],
    },
  },
  // ---- Client Profitability ----
  {
    name: "client_profitability",
    description: "Analyze profitability per client. Returns revenue, crew costs, marketing expenses, and net profit for each client in a date range. Helps answer 'which clients are most profitable?'",
    inputSchema: {
      type: "object",
      properties: {
        from: { type: "string", description: "Start date (YYYY-MM-DD)" },
        to: { type: "string", description: "End date (YYYY-MM-DD)" },
      },
      required: ["from", "to"],
    },
  },
];

// ---- Tool Handlers ----
async function handleToolCall(name: string, args: Record<string, unknown>): Promise<unknown> {
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

    // ---- Invoices ----
    case "list_invoices": {
      let query = db.from("invoices").select("id, invoice_number, client_id, total, status, issue_date, due_date, paid_date, period_start, period_end, created_at")
        .is("deleted_at", null)
        .order("issue_date", { ascending: false });
      if (args.status) query = query.eq("status", args.status);
      if (args.client_id) query = query.eq("client_id", args.client_id);
      if (args.from) query = query.gte("issue_date", args.from);
      if (args.to) query = query.lte("issue_date", args.to);
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return data;
    }

    case "get_invoice": {
      const { data, error } = await db.from("invoices").select("*").eq("id", args.id).single();
      if (error) throw new Error(error.message);
      return data;
    }

    // ---- Proposals ----
    case "list_proposals": {
      let query = db.from("proposals").select("id, title, client_id, total, status, pipeline_stage, sent_at, accepted_at, paid_at, client_email, lead_source, created_at")
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (args.status) query = query.eq("status", args.status);
      if (args.pipeline_stage) query = query.eq("pipeline_stage", args.pipeline_stage);
      if (args.client_id) query = query.eq("client_id", args.client_id);
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return data;
    }

    case "get_proposal": {
      const { data, error } = await db.from("proposals").select("*").eq("id", args.id).single();
      if (error) throw new Error(error.message);
      return data;
    }

    // ---- Contracts ----
    case "list_contracts": {
      let query = db.from("contracts").select("id, title, client_id, status, sent_at, client_signed_at, owner_signed_at, client_email, created_at")
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (args.status) query = query.eq("status", args.status);
      if (args.client_id) query = query.eq("client_id", args.client_id);
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return data;
    }

    case "get_contract": {
      const { data, error } = await db.from("contracts").select("*").eq("id", args.id).single();
      if (error) throw new Error(error.message);
      return data;
    }

    // ---- Pipeline Leads ----
    case "list_pipeline_leads": {
      let query = db.from("pipeline_leads").select("id, name, email, phone, project_type, event_date, location, description, lead_source, pipeline_stage, proposal_id, client_id, recent_activity, recent_activity_at, created_at")
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (args.pipeline_stage) query = query.eq("pipeline_stage", args.pipeline_stage);
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return data;
    }

    // ---- Mileage ----
    case "list_mileage": {
      let query = db.from("manual_trips").select("*").order("date", { ascending: false });
      if (args.from) query = query.gte("date", args.from);
      if (args.to) query = query.lte("date", args.to);
      if (args.crew_member_id) query = query.eq("crew_member_id", args.crew_member_id);
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return data;
    }

    case "log_mileage": {
      let roundTripMiles = args.round_trip_miles;

      // Auto-calculate distance if destination_address is provided
      if (!roundTripMiles && args.destination_address) {
        // Look up crew member's home address
        const { data: crew, error: crewErr } = await db.from("crew_members")
          .select("home_address").eq("id", args.crew_member_id).single();
        if (crewErr) throw new Error(crewErr.message);
        const home = crew?.home_address;
        if (!home || !home.address) throw new Error("Crew member has no home address set — cannot auto-calculate distance. Set it in Staff page or provide round_trip_miles manually.");

        const origin = `${home.address}, ${home.city}, ${home.state} ${home.zip}`;
        const apiKey = process.env.GOOGLE_MAPS_API_KEY;
        if (!apiKey) throw new Error("Google Maps API key not configured");

        const params = new URLSearchParams({
          origins: origin,
          destinations: args.destination_address,
          units: "imperial",
          key: apiKey,
        });
        const resp = await fetch(`https://maps.googleapis.com/maps/api/distancematrix/json?${params}`);
        const distData = await resp.json();

        const element = distData.rows?.[0]?.elements?.[0];
        if (!element || element.status !== "OK") {
          throw new Error(`Could not calculate distance: ${element?.status || distData.status || "unknown"}. Provide round_trip_miles manually.`);
        }

        const oneWayMiles = Math.round((element.distance.value / 1609.344) * 10) / 10;
        roundTripMiles = Math.round(oneWayMiles * 2 * 10) / 10;
      }

      if (!roundTripMiles) throw new Error("Provide either round_trip_miles or destination_address for auto-calculation");

      const { data, error } = await db.from("manual_trips").insert({
        id: `trip_${Date.now()}`,
        crew_member_id: args.crew_member_id,
        date: args.date,
        destination: args.destination,
        location_id: args.location_id || null,
        purpose: args.purpose,
        round_trip_miles: roundTripMiles,
      }).select().single();
      if (error) throw new Error(error.message);
      return { ...data, calculatedDistance: args.destination_address ? true : false };
    }

    // ---- Business Expenses ----
    case "list_expenses": {
      let query = db.from("business_expenses").select("*").order("date", { ascending: false });
      if (args.from) query = query.gte("date", args.from);
      if (args.to) query = query.lte("date", args.to);
      if (args.category) query = query.eq("category", args.category);
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return data;
    }

    // ---- Contractor Invoices ----
    case "list_contractor_invoices": {
      let query = db.from("contractor_invoices").select("id, crew_member_id, invoice_number, recipient_type, recipient_name, period_start, period_end, total, status, created_at")
        .order("created_at", { ascending: false });
      if (args.crew_member_id) query = query.eq("crew_member_id", args.crew_member_id);
      if (args.status) query = query.eq("status", args.status);
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return data;
    }

    // ---- Crew Availability ----
    case "crew_availability": {
      const [crewResult, projectResult] = await Promise.all([
        db.from("crew_members").select("id, name, role_rates, phone, email").order("name"),
        db.from("projects").select("id, client_id, date, start_time, end_time, status, crew, post_production")
          .eq("date", args.date)
          .neq("status", "deleted")
          .neq("status", "cancelled"),
      ]);
      if (crewResult.error) throw new Error(crewResult.error.message);
      if (projectResult.error) throw new Error(projectResult.error.message);

      const bookedIds = new Set<string>();
      const assignments: Record<string, { projectId: string; role: string; time: string }[]> = {};

      for (const proj of projectResult.data || []) {
        const allCrew = [...(Array.isArray(proj.crew) ? proj.crew : []), ...(Array.isArray(proj.post_production) ? proj.post_production : [])];
        for (const entry of allCrew) {
          const cmId = entry.crewMemberId || entry.crew_member_id;
          if (!cmId) continue;
          bookedIds.add(cmId);
          if (!assignments[cmId]) assignments[cmId] = [];
          assignments[cmId].push({
            projectId: proj.id,
            role: entry.role || "crew",
            time: `${proj.start_time || "?"}-${proj.end_time || "?"}`,
          });
        }
      }

      type CrewRow = { id: string; [key: string]: unknown };
      const crewRows = (crewResult.data as CrewRow[] | null) || [];
      const available = crewRows.filter(c => !bookedIds.has(c.id));
      const booked = crewRows.filter(c => bookedIds.has(c.id)).map(c => ({
        ...c,
        assignments: assignments[c.id] || [],
      }));

      return { date: args.date, available, booked };
    }

    // ---- Financial Summary ----
    case "financial_summary": {
      const [invoicesResult, expensesResult, projectsResult, clientsResult, mktExpResult] = await Promise.all([
        db.from("invoices").select("id, client_id, total, status, paid_date, issue_date").is("deleted_at", null),
        db.from("business_expenses").select("id, amount, category, date"),
        db.from("projects").select("id, client_id, date, crew, post_production, status").neq("status", "deleted"),
        db.from("clients").select("id, company"),
        db.from("marketing_expenses").select("id, client_id, amount, date"),
      ]);
      if (invoicesResult.error) throw new Error(invoicesResult.error.message);
      if (expensesResult.error) throw new Error(expensesResult.error.message);
      if (projectsResult.error) throw new Error(projectsResult.error.message);
      if (clientsResult.error) throw new Error(clientsResult.error.message);
      if (mktExpResult.error) throw new Error(mktExpResult.error.message);

      const clientMap: Record<string, string> = {};
      for (const c of clientsResult.data || []) clientMap[c.id] = c.company;

      // Revenue from paid invoices in the date range
      type InvoiceRow = { id: string; client_id: string; total: number; status: string; paid_date: string | null; issue_date: string };
      const invoiceRows = (invoicesResult.data as InvoiceRow[] | null) || [];
      const paidInvoices = invoiceRows.filter(inv =>
        inv.status === "paid" && inv.paid_date && inv.paid_date >= String(args.from) && inv.paid_date <= String(args.to)
      );
      const totalRevenue = paidInvoices.reduce((sum, inv) => sum + (inv.total || 0), 0);

      const revenueByClient: Record<string, number> = {};
      for (const inv of paidInvoices) {
        const name = clientMap[inv.client_id] || inv.client_id;
        revenueByClient[name] = (revenueByClient[name] || 0) + (inv.total || 0);
      }

      // Business expenses in date range
      type ExpenseRow = { id: string; amount: number; category: string; date: string };
      const expenseRows = (expensesResult.data as ExpenseRow[] | null) || [];
      const periodExpenses = expenseRows.filter(exp =>
        exp.date >= String(args.from) && exp.date <= String(args.to)
      );
      const totalExpenses = periodExpenses.reduce((sum, exp) => sum + (exp.amount || 0), 0);

      const expensesByCategory: Record<string, number> = {};
      for (const exp of periodExpenses) {
        expensesByCategory[exp.category] = (expensesByCategory[exp.category] || 0) + (exp.amount || 0);
      }

      // Marketing expenses in date range
      type MktExpRow = { id: string; client_id: string | null; amount: number; date: string };
      const mktExpRows = (mktExpResult.data as MktExpRow[] | null) || [];
      const periodMktExp = mktExpRows.filter(exp =>
        exp.date >= String(args.from) && exp.date <= String(args.to)
      );
      const totalMarketingExpenses = periodMktExp.reduce((sum, exp) => sum + (exp.amount || 0), 0);

      // Crew costs from projects in date range
      type ProjectRow = { id: string; client_id: string; date: string; crew: unknown; post_production: unknown; status: string };
      const projectRows = (projectsResult.data as ProjectRow[] | null) || [];
      const periodProjects = projectRows.filter(p =>
        p.date >= String(args.from) && p.date <= String(args.to)
      );
      let totalCrewCosts = 0;
      for (const proj of periodProjects) {
        const allCrew = [...(Array.isArray(proj.crew) ? proj.crew : []), ...(Array.isArray(proj.post_production) ? proj.post_production : [])];
        for (const entry of allCrew) {
          totalCrewCosts += (entry.hoursWorked || entry.hours_worked || 0) * (entry.payRatePerHour || entry.pay_rate_per_hour || 0);
        }
      }

      return {
        period: { from: args.from, to: args.to },
        revenue: { total: totalRevenue, byClient: revenueByClient, paidInvoiceCount: paidInvoices.length },
        expenses: { total: totalExpenses, byCategory: expensesByCategory },
        marketingExpenses: { total: totalMarketingExpenses },
        crewCosts: { total: totalCrewCosts, projectCount: periodProjects.length },
        netProfit: totalRevenue - totalExpenses - totalMarketingExpenses - totalCrewCosts,
      };
    }

    // ---- Client Profitability ----
    case "client_profitability": {
      const [invoicesRes, projectsRes, clientsRes, mktExpRes] = await Promise.all([
        db.from("invoices").select("id, client_id, total, status, paid_date").is("deleted_at", null),
        db.from("projects").select("id, client_id, date, crew, post_production, status").neq("status", "deleted"),
        db.from("clients").select("id, company"),
        db.from("marketing_expenses").select("id, client_id, amount, date"),
      ]);
      if (invoicesRes.error) throw new Error(invoicesRes.error.message);
      if (projectsRes.error) throw new Error(projectsRes.error.message);
      if (clientsRes.error) throw new Error(clientsRes.error.message);
      if (mktExpRes.error) throw new Error(mktExpRes.error.message);

      const clients: Record<string, { company: string; revenue: number; crewCosts: number; marketingExpenses: number; projectCount: number }> = {};
      for (const c of clientsRes.data || []) {
        clients[c.id] = { company: c.company, revenue: 0, crewCosts: 0, marketingExpenses: 0, projectCount: 0 };
      }

      // Revenue from paid invoices
      for (const inv of invoicesRes.data || []) {
        if (inv.status !== "paid" || !inv.paid_date || inv.paid_date < args.from || inv.paid_date > args.to) continue;
        if (clients[inv.client_id]) clients[inv.client_id].revenue += inv.total || 0;
      }

      // Crew costs from projects
      for (const proj of projectsRes.data || []) {
        if (proj.date < args.from || proj.date > args.to) continue;
        if (!clients[proj.client_id]) continue;
        clients[proj.client_id].projectCount++;
        const allCrew = [...(Array.isArray(proj.crew) ? proj.crew : []), ...(Array.isArray(proj.post_production) ? proj.post_production : [])];
        for (const entry of allCrew) {
          clients[proj.client_id].crewCosts += (entry.hoursWorked || entry.hours_worked || 0) * (entry.payRatePerHour || entry.pay_rate_per_hour || 0);
        }
      }

      // Marketing expenses
      for (const exp of mktExpRes.data || []) {
        if (exp.date < args.from || exp.date > args.to) continue;
        if (clients[exp.client_id]) clients[exp.client_id].marketingExpenses += exp.amount || 0;
      }

      // Build result sorted by profit
      const result = Object.entries(clients)
        .map(([id, c]) => ({
          clientId: id,
          company: c.company,
          revenue: c.revenue,
          crewCosts: c.crewCosts,
          marketingExpenses: c.marketingExpenses,
          netProfit: c.revenue - c.crewCosts - c.marketingExpenses,
          projectCount: c.projectCount,
        }))
        .filter(c => c.revenue > 0 || c.projectCount > 0)
        .sort((a, b) => b.netProfit - a.netProfit);

      return { period: { from: args.from, to: args.to }, clients: result };
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

type JsonRpcRequest = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> };
type JsonRpcResponse = { jsonrpc: "2.0"; id?: string | number | null; result?: unknown; error?: { code: number; message: string; data?: unknown } } | null;

async function handleJsonRpc(body: JsonRpcRequest): Promise<JsonRpcResponse> {
  const { jsonrpc, id, method, params } = body;

  // Notifications (no id) don't require a response
  const isNotification = id === undefined || id === null;

  if (jsonrpc !== "2.0") {
    if (isNotification) return null;
    return { jsonrpc: "2.0", error: { code: -32600, message: "Invalid JSON-RPC" }, id };
  }

  try {
    let result: unknown;

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
        } catch (err) {
          result = {
            content: [
              { type: "text", text: `Error: ${errorMessage(err)}` },
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
  } catch (err) {
    if (isNotification) return null;
    return {
      jsonrpc: "2.0",
      error: { code: -32603, message: errorMessage(err) },
      id,
    };
  }
}
