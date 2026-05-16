#!/usr/bin/env node
// ============================================================
// Seed an "Apple Demo Co" account for App Store reviewers.
//
// Creates:
//   - auth user apple@sdubmedia.com / HiApple2026 (email pre-confirmed)
//   - organization "Apple Demo Co" (Pro plan so review can use galleries + every paid feature)
//   - owner user_profile pointing at that org
//   - 3 project types
//   - 5 fake clients (no real PII)
//   - 8 projects spread across recent months (mix of upcoming/in_editing/completed)
//   - 1 sent invoice
//   - 2 locations (a recurring studio + a one-time venue)
//   - 3 crew members (camera, audio, editor) assigned to several projects
//   - 5 mileage entries (manual_trips) across the last ~6 weeks
//   - 10 business expenses (the Expenses page; also drives the Net Profit
//     deduction in P&L since iOS no longer has a separate Marketing Budget UI)
//
// Idempotent: re-running deletes the prior demo org + user first, then reseeds.
//
// Usage:
//   cd ~/sdubmedia-calendar
//   node --env-file=.env.local scripts/seed-demo-account.mjs
// ============================================================

import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLL_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_ROLL_KEY) in env.");
  process.exit(1);
}

const DEMO_EMAIL = "apple@sdubmedia.com";
const DEMO_PASSWORD = "HiApple2026";
const DEMO_ORG_NAME = "Apple Demo Co";
const DEMO_ORG_SLUG = "apple-demo-co";

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const id = () => randomUUID();
const today = new Date();
const isoDate = (d) => d.toISOString().slice(0, 10);
const daysFromNow = (n) => {
  const d = new Date(today);
  d.setDate(d.getDate() + n);
  return isoDate(d);
};

async function purgeExistingDemo() {
  console.log("→ Purging prior demo org (keeping auth user so live sessions stay valid)…");

  // Delete the org (cascades to clients/projects/invoices/etc via FKs).
  const { data: prior } = await supabase
    .from("organizations")
    .select("id")
    .eq("slug", DEMO_ORG_SLUG)
    .maybeSingle();

  if (prior?.id) {
    await supabase.from("organizations").delete().eq("id", prior.id);
    console.log(`  • Deleted prior org ${prior.id}`);
  }
  // NOTE: We do NOT delete the auth user. Reusing the same UID keeps any
  // currently-signed-in iOS/web session valid across reseeds.
}

async function getOrCreateAuthUser() {
  const { data: list } = await supabase.auth.admin.listUsers({ page: 1, perPage: 200 });
  const existing = list?.users?.find((u) => u.email?.toLowerCase() === DEMO_EMAIL);
  if (existing) {
    console.log(`→ Reusing existing auth user ${existing.id}`);
    // Reset the password so the documented credentials always work even
    // if someone changed it in the dashboard.
    await supabase.auth.admin.updateUserById(existing.id, { password: DEMO_PASSWORD });
    return existing.id;
  }
  console.log("→ Creating auth user…");
  const { data, error } = await supabase.auth.admin.createUser({
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
    email_confirm: true,
    user_metadata: { name: "Reviewer Demo" },
  });
  if (error) throw error;
  console.log(`  • Auth user id: ${data.user.id}`);
  return data.user.id;
}

async function createOrg() {
  console.log("→ Creating organization…");
  const orgId = id();
  const { error } = await supabase.from("organizations").insert({
    id: orgId,
    name: DEMO_ORG_NAME,
    slug: DEMO_ORG_SLUG,
    plan: "pro",
    billing_status: "ok",
    project_limit: -1,
    business_info: {
      address: "1 Apple Park Way",
      city: "Cupertino",
      state: "CA",
      zip: "95014",
      phone: "(555) 010-2026",
      email: DEMO_EMAIL,
      website: "https://example.com",
    },
    features: {
      profitLoss: false,
      partnerSplits: false,
      mileage: false,
      budget: false,
      clientHealth: false,
    },
  });
  if (error) throw error;
  console.log(`  • Org id: ${orgId}`);
  return orgId;
}

async function createProfile(userId, orgId) {
  console.log("→ Upserting owner profile (auth trigger may have inserted a stub)…");
  const { error } = await supabase
    .from("user_profiles")
    .upsert(
      {
        id: userId,
        org_id: orgId,
        email: DEMO_EMAIL,
        name: "Reviewer Demo",
        role: "owner",
        has_completed_onboarding: true,
      },
      { onConflict: "id" }
    );
  if (error) throw error;
}

async function seedProjectTypes(orgId) {
  console.log("→ Seeding project types…");
  const types = [
    { id: id(), org_id: orgId, name: "Brand Film" },
    { id: id(), org_id: orgId, name: "Social Reel" },
    { id: id(), org_id: orgId, name: "Event Coverage" },
  ];
  const { error } = await supabase.from("project_types").insert(types);
  if (error) throw error;
  return types;
}

async function seedClients(orgId) {
  console.log("→ Seeding clients…");
  const base = (extra) => ({ org_id: orgId, billing_rate_per_hour: 0, per_project_rate: 0, monthly_hours: 0, ...extra });
  const clients = [
    base({ id: id(), company: "Northwind Coffee Roasters", contact_name: "Alex Rivera", email: "alex@example.com", phone: "(555) 010-1001", billing_model: "per_project", per_project_rate: 2500 }),
    base({ id: id(), company: "Harbor & Vine Restaurant", contact_name: "Sam Patel", email: "sam@example.com", phone: "(555) 010-1002", billing_model: "per_project", per_project_rate: 1800 }),
    base({ id: id(), company: "Lumen Architecture", contact_name: "Morgan Yu", email: "morgan@example.com", phone: "(555) 010-1003", billing_model: "hourly", billing_rate_per_hour: 125 }),
    base({ id: id(), company: "Pine Ridge Outfitters", contact_name: "Jamie Cole", email: "jamie@example.com", phone: "(555) 010-1004", billing_model: "per_project", per_project_rate: 3200 }),
    base({ id: id(), company: "Maple & Co Bakery", contact_name: "Riley Chen", email: "riley@example.com", phone: "(555) 010-1005", billing_model: "per_project", per_project_rate: 1500 }),
  ];
  const { error } = await supabase.from("clients").insert(clients);
  if (error) throw error;
  return clients;
}

async function seedLocations(orgId) {
  console.log("→ Seeding locations…");
  const locations = [
    {
      id: id(),
      org_id: orgId,
      name: "Riverside Studio",
      address: "412 Mill Street",
      city: "Portland",
      state: "OR",
      zip: "97214",
      one_time_use: false,
    },
    {
      id: id(),
      org_id: orgId,
      name: "Cascade Event Hall",
      address: "1820 SE Hawthorne Blvd",
      city: "Portland",
      state: "OR",
      zip: "97214",
      one_time_use: true,
    },
  ];
  const { error } = await supabase.from("locations").insert(locations);
  if (error) throw error;
  return locations;
}

async function seedCrew(orgId) {
  console.log("→ Seeding crew members…");
  const crew = [
    // Demo owner's own crew row. Mileage / MyEarnings pages match the
    // signed-in profile to a crew member by email, so we need a crew row
    // whose email matches DEMO_EMAIL — otherwise the owner sees an empty
    // mileage report on the reviewer demo account.
    {
      id: id(),
      org_id: orgId,
      name: "Reviewer Demo",
      roles: ["Owner / Director"],
      role_rates: [],
      default_pay_rate_per_hour: 0,
      phone: "(555) 010-2026",
      email: DEMO_EMAIL,
      home_bases: [
        { id: id(), label: "Home", address: "1 Apple Park Way, Cupertino, CA 95014", isPrimary: true },
      ],
    },
    {
      id: id(),
      org_id: orgId,
      name: "Jordan Blake",
      roles: ["Camera Op"],
      role_rates: [],
      default_pay_rate_per_hour: 65,
      phone: "(555) 020-2001",
      email: "jordan.blake@example.com",
      home_bases: [
        { id: id(), label: "Home", address: "1200 NW 21st Ave, Portland, OR 97209", isPrimary: true },
      ],
    },
    {
      id: id(),
      org_id: orgId,
      name: "Casey Nguyen",
      roles: ["Audio Engineer"],
      role_rates: [],
      default_pay_rate_per_hour: 55,
      phone: "(555) 020-2002",
      email: "casey.nguyen@example.com",
      home_bases: [
        { id: id(), label: "Home", address: "3400 SE Belmont St, Portland, OR 97214", isPrimary: true },
      ],
    },
    {
      id: id(),
      org_id: orgId,
      name: "Riley Park",
      roles: ["Editor"],
      role_rates: [],
      default_pay_rate_per_hour: 60,
      phone: "(555) 020-2003",
      email: "riley.park@example.com",
      home_bases: [
        { id: id(), label: "Home", address: "8800 N Lombard St, Portland, OR 97203", isPrimary: true },
      ],
    },
  ];
  const { error } = await supabase.from("crew_members").insert(crew);
  if (error) throw error;
  return crew;
}

async function assignCrewToProjects(projects, crew) {
  console.log("→ Assigning crew to projects…");
  // crew[0] is the demo owner — exclude from automatic project crew
  // assignments. They show up via mileage trips instead.
  const [, cam, audio, editor] = crew;

  // Camera + audio crew on the 5 production projects (not the pure-edit ones),
  // editor in post on completed/in-editing projects.
  const updates = projects.map((p) => {
    const isEditOnly = p.status === "in_editing"; // assume "social reel" style sits in post
    const projectCrew = isEditOnly
      ? []
      : [
          { crewMemberId: cam.id, role: "Camera Op", hoursWorked: 6, payRatePerHour: 65 },
          { crewMemberId: audio.id, role: "Audio Engineer", hoursWorked: 6, payRatePerHour: 55 },
        ];
    const postProduction = (p.status === "completed" || p.status === "in_editing")
      ? [{ crewMemberId: editor.id, role: "Editor", hoursWorked: 4, payRatePerHour: 60 }]
      : [];
    return { id: p.id, crew: projectCrew, post_production: postProduction };
  });

  for (const u of updates) {
    const { error } = await supabase
      .from("projects")
      .update({ crew: u.crew, post_production: u.post_production })
      .eq("id", u.id);
    if (error) throw error;
  }
}

async function seedMileage(orgId, crew, locations) {
  console.log("→ Seeding mileage entries…");
  const [owner, cam, audio, editor] = crew;
  const [studio, venue] = locations;
  // Mix: most trips tied to the demo owner so the Mileage page is
  // populated for the reviewer's signed-in view. The remaining trips
  // sit on other crew so the report still has variety.
  const trips = [
    { crew: owner, loc: studio, days: -3, miles: 18, purpose: "Prep day at studio" },
    { crew: owner, loc: venue, days: -10, miles: 24, purpose: "Event coverage shoot" },
    { crew: owner, loc: studio, days: -22, miles: 18, purpose: "Brand spot principal photography" },
    { crew: cam, loc: venue, days: -10, miles: 27, purpose: "B-cam coverage" },
    { crew: audio, loc: venue, days: -10, miles: 27, purpose: "Audio setup + shoot" },
    { crew: editor, loc: studio, days: -28, miles: 14, purpose: "Color review session" },
  ];

  const rows = trips.map((t) => ({
    id: id(),
    org_id: orgId,
    crew_member_id: t.crew.id,
    location_id: t.loc.id,
    date: daysFromNow(t.days),
    destination: `${t.loc.name} — ${t.loc.city}, ${t.loc.state}`,
    purpose: t.purpose,
    round_trip_miles: t.miles,
  }));

  const { error } = await supabase.from("manual_trips").insert(rows);
  if (error) throw error;
}

async function seedMarketingExpenses(orgId, clients) {
  console.log("→ Seeding marketing expenses…");
  // Mix of categories spread across the last ~5 months. Some tied to a
  // specific client, others left general. Total ≈ $1,775 so Net Profit
  // visibly drops below Gross Profit in the P&L.
  const entries = [
    { offset: -8,   category: "Software",    name: "Adobe Creative Cloud",     amount: 89,  clientIdx: -1 },
    { offset: -15,  category: "Advertising", name: "Instagram ad spend",       amount: 250, clientIdx: 0 },
    { offset: -27,  category: "Travel",      name: "Client lunch — discovery", amount: 84,  clientIdx: 1 },
    { offset: -38,  category: "Equipment",   name: "SD cards + batteries",     amount: 312, clientIdx: -1 },
    { offset: -52,  category: "Advertising", name: "Google Ads — local SEO",   amount: 450, clientIdx: -1 },
    { offset: -70,  category: "Software",    name: "Frame.io annual",          amount: 590, clientIdx: -1 },
  ];

  const now = new Date();
  const rows = entries.map((e) => ({
    id: id(),
    org_id: orgId,
    client_id: e.clientIdx >= 0 ? clients[e.clientIdx].id : "",
    date: daysFromNow(e.offset),
    year: now.getFullYear(),
    category: e.category,
    name: e.name,
    amount: e.amount,
    notes: "",
  }));

  const { error } = await supabase.from("marketing_expenses").insert(rows);
  if (error) throw error;
}

async function seedBusinessExpenses(orgId) {
  console.log("→ Seeding business expenses (transaction-style)…");
  // Realistic mix to populate the Expenses page. Spread across recent months.
  const entries = [
    { offset: -2,  category: "Subscriptions", description: "Frame.io monthly",            amount: 25.00,  chase: "Bills & Utilities" },
    { offset: -4,  category: "Meals",         description: "Coffee meeting — Northwind",  amount: 18.40,  chase: "Food & Drink" },
    { offset: -7,  category: "Vehicle",       description: "Chevron — fuel",              amount: 62.15,  chase: "Gas" },
    { offset: -9,  category: "Software",      description: "Adobe Creative Cloud",        amount: 89.00,  chase: "Bills & Utilities" },
    { offset: -14, category: "Equipment",     description: "B&H — SanDisk SD cards",      amount: 156.32, chase: "Shopping" },
    { offset: -18, category: "Meals",         description: "Lunch meeting — Lumen",       amount: 84.00,  chase: "Food & Drink" },
    { offset: -23, category: "Advertising",   description: "Instagram ad campaign",       amount: 250.00, chase: "Advertising" },
    { offset: -31, category: "Office",        description: "USPS — shipping client SSD",  amount: 22.85,  chase: "Shipping" },
    { offset: -42, category: "Vehicle",       description: "Costco — fuel",               amount: 58.70,  chase: "Gas" },
    { offset: -55, category: "Subscriptions", description: "Google Workspace",            amount: 18.00,  chase: "Bills & Utilities" },
  ];

  const rows = entries.map((e, idx) => ({
    id: id(),
    org_id: orgId,
    date: daysFromNow(e.offset),
    description: e.description,
    category: e.category,
    chase_category: e.chase,
    amount: e.amount,
    notes: "",
    serial_number: `DEMO-${String(idx + 1).padStart(4, "0")}`,
  }));

  const { error } = await supabase.from("business_expenses").insert(rows);
  if (error) throw error;
}

async function seedProjects(orgId, clients, types) {
  console.log("→ Seeding projects…");
  const rows = [
    { clientIdx: 0, typeIdx: 0, offset: 28, status: "upcoming", notes: "Founder interview + roastery b-roll." },
    { clientIdx: 1, typeIdx: 2, offset: 14, status: "upcoming", notes: "Soft-open dinner coverage." },
    { clientIdx: 2, typeIdx: 0, offset: 5,  status: "upcoming", notes: "Studio walkthrough + principal interviews." },
    { clientIdx: 3, typeIdx: 1, offset: -3, status: "in_editing", notes: "Three :30 reels for fall campaign." },
    { clientIdx: 0, typeIdx: 1, offset: -10, status: "in_editing", notes: "Social cutdowns from last shoot." },
    { clientIdx: 4, typeIdx: 0, offset: -22, status: "completed", notes: "Holiday brand spot — delivered." },
    { clientIdx: 1, typeIdx: 1, offset: -45, status: "completed", notes: "Menu launch teasers." },
    { clientIdx: 2, typeIdx: 0, offset: -60, status: "completed", notes: "Office grand opening recap." },
  ];

  const projects = rows.map((r) => ({
    id: id(),
    org_id: orgId,
    client_id: clients[r.clientIdx].id,
    project_type_id: types[r.typeIdx].id,
    date: daysFromNow(r.offset),
    start_time: "10:00",
    end_time: "16:00",
    status: r.status,
    notes: r.notes,
    crew: [],
    post_production: [],
    edit_types: [],
  }));

  const { error } = await supabase.from("projects").insert(projects);
  if (error) throw error;
  return projects;
}

async function seedInvoice(orgId, clients, projects) {
  console.log("→ Seeding invoice…");
  const client = clients[0];
  const proj = projects.find((p) => p.client_id === client.id && p.status === "completed")
    || projects.find((p) => p.client_id === client.id);

  const lineItems = [
    {
      projectId: proj.id,
      date: proj.date,
      description: "Brand Film — production + edit",
      quantity: 1,
      unitPrice: 2500,
      amount: 2500,
    },
  ];

  const { error } = await supabase.from("invoices").insert({
    id: id(),
    org_id: orgId,
    invoice_number: "INV-1001",
    client_id: client.id,
    period_start: daysFromNow(-30),
    period_end: daysFromNow(-1),
    subtotal: 2500,
    tax_rate: 0,
    tax_amount: 0,
    total: 2500,
    status: "sent",
    issue_date: daysFromNow(-2),
    due_date: daysFromNow(28),
    line_items: lineItems,
    company_info: {
      address: "1 Apple Park Way",
      city: "Cupertino",
      state: "CA",
      zip: "95014",
      phone: "(555) 010-2026",
      email: DEMO_EMAIL,
      website: "https://example.com",
      ein: "",
    },
    client_info: {
      address: "",
      city: "",
      state: "",
      zip: "",
      phone: client.phone,
      email: client.email,
      website: "",
      ein: "",
    },
    notes: "Thanks for the partnership.",
  });
  if (error) throw error;
}

async function seedPipelineLeads(orgId, clients) {
  console.log("→ Seeding pipeline leads…");
  // Two leads at different stages so the Pipeline page renders with
  // visible movement across the stage pills (App Store reviewers see
  // an actual sales workflow instead of an empty zero-state).
  const leads = [
    {
      client_id: clients[0].id, name: "Northbound Climbing", email: "events@northboundclimbing.example",
      phone: "(555) 010-1101", project_type: "Brand Film", event_date: daysFromNow(30),
      location: "Studio A", description: "Brand spot for spring campaign — 60s hero + 6 cutdowns.",
      lead_source: "Instagram", pipeline_stage: "proposal_sent",
      recent_activity: "Sent proposal v2 with extra deliverables.",
      recent_activity_at: daysFromNow(-2),
    },
    {
      client_id: clients[1].id, name: "Harbor & Vine", email: "marketing@harborandvine.example",
      phone: "(555) 010-1102", project_type: "Social Series", event_date: daysFromNow(14),
      location: "Restaurant on-site", description: "Monthly content retainer — 4 reels + chef interview.",
      lead_source: "Referral", pipeline_stage: "follow_up",
      recent_activity: "Discovery call done; sending discovery notes.",
      recent_activity_at: daysFromNow(-1),
    },
  ];

  const rows = leads.map((l) => ({
    id: id(),
    org_id: orgId,
    ...l,
    updated_at: new Date().toISOString(),
  }));
  const { error } = await supabase.from("pipeline_leads").insert(rows);
  if (error) throw error;
}

async function seedProposalAndContract(orgId, clients, projects) {
  console.log("→ Seeding 1 sent proposal + 1 signed contract…");
  const client = clients[2];
  const project = projects.find((p) => p.client_id === client.id) || projects[0];

  // ---- Proposal (status: sent) ----
  const proposalLineItems = [
    { id: id(), description: "Full-day production", details: "Includes 2 operators + audio + lighting", quantity: 1, unitPrice: 1800, amount: 1800 },
    { id: id(), description: "Post-production", details: "Color, sound, 60s hero + 3 cutdowns", quantity: 1, unitPrice: 900, amount: 900 },
  ];
  const proposalSubtotal = proposalLineItems.reduce((s, li) => s + li.amount, 0);

  const proposalRow = {
    id: id(),
    org_id: orgId,
    client_id: client.id,
    project_id: project.id,
    title: "Spring Campaign — Brand Film",
    pages: [],
    packages: [],
    selected_package_id: null,
    payment_milestones: [],
    pipeline_stage: "proposal_sent",
    lead_source: "Instagram",
    contract_template_id: null,
    line_items: proposalLineItems,
    subtotal: proposalSubtotal,
    tax_rate: 0,
    tax_amount: 0,
    total: proposalSubtotal,
    contract_content: "",
    payment_config: {},
    status: "sent",
    sent_at: daysFromNow(-4),
    client_email: client.email,
    view_token: id().replace(/-/g, "").slice(0, 16),
    notes: "Pre-signed contract draft attached.",
    updated_at: new Date().toISOString(),
  };
  const { error: pErr } = await supabase.from("proposals").insert(proposalRow);
  if (pErr) throw pErr;

  // ---- Contract (status: completed — both signed) ----
  const otherClient = clients[3];
  const otherProject = projects.find((p) => p.client_id === otherClient.id) || projects[1];

  const contractRow = {
    id: id(),
    org_id: orgId,
    template_id: null,
    client_id: otherClient.id,
    project_id: otherProject.id,
    title: "Holiday Brand Film — Production Agreement",
    content: "This Production Services Agreement covers a one-day brand shoot, post-production, and delivery of one 60-second master plus three social cutdowns. The total fee is $2,750. A 50% retainer is due upon signing; the balance is due on delivery.",
    status: "completed",
    sent_at: daysFromNow(-12),
    client_email: otherClient.email,
    sign_token: id().replace(/-/g, "").slice(0, 16),
    client_signature: "",
    owner_signature: "",
    client_signed_at: daysFromNow(-10),
    owner_signed_at: daysFromNow(-9),
    field_values: {},
    additional_signers: [],
    document_expires_at: null,
    reminders_enabled: false,
    proposal_id: null,
    master_template_version_id: "",
    firing_log: [],
    send_back_reason: "",
    payment_milestones: [],
    pages: [],
    updated_at: new Date().toISOString(),
  };
  const { error: cErr } = await supabase.from("contracts").insert(contractRow);
  if (cErr) throw cErr;
}

async function seedServiceCategories(orgId) {
  console.log("→ Seeding service category 'Real Estate Shoot' with services + variants…");

  // ---- Category ----
  const categoryId = id();
  const now = new Date().toISOString();
  const { error: catErr } = await supabase.from("service_categories").insert({
    id: categoryId, org_id: orgId, name: "Real Estate Shoot",
    position: 0, updated_at: now,
  });
  if (catErr) throw catErr;

  // ---- Services ----
  const photosId = id();
  const videoId = id();
  const droneId = id();
  const { error: svcErr } = await supabase.from("services").insert([
    { id: photosId, org_id: orgId, category_id: categoryId, name: "Photos",        default_price: 250, position: 0, updated_at: now },
    { id: videoId,  org_id: orgId, category_id: categoryId, name: "Video",         default_price: 500, position: 1, updated_at: now },
    { id: droneId,  org_id: orgId, category_id: categoryId, name: "Drone Footage", default_price: 200, position: 2, updated_at: now },
  ]);
  if (svcErr) throw svcErr;

  // ---- Variants ----
  // Photos + Video are tiered by square footage; Drone is flat.
  const { error: varErr } = await supabase.from("service_variants").insert([
    { id: id(), org_id: orgId, service_id: photosId, label: "Under 2,000 sqft",    price: 250, position: 0, updated_at: now },
    { id: id(), org_id: orgId, service_id: photosId, label: "2,000–3,000 sqft",    price: 350, position: 1, updated_at: now },
    { id: id(), org_id: orgId, service_id: photosId, label: "3,000–5,000 sqft",    price: 500, position: 2, updated_at: now },
    { id: id(), org_id: orgId, service_id: videoId,  label: "Standard walkthrough", price: 500, position: 0, updated_at: now },
    { id: id(), org_id: orgId, service_id: videoId,  label: "Cinematic w/ drone B-roll", price: 750, position: 1, updated_at: now },
  ]);
  if (varErr) throw varErr;
}

async function seedDelivery(orgId, projects) {
  console.log("→ Seeding 1 delivery (gallery)…");
  // No real photos — Storage uploads happen via the app. But the row
  // itself populates the Deliveries page so reviewers see the gallery
  // list + cover-layout chooser instead of an empty state.
  const completed = projects.find((p) => p.status === "completed");
  if (!completed) return;

  const deliveryRow = {
    id: id(),
    org_id: orgId,
    project_id: completed.id,
    title: "Holiday Brand Film — Final Deliverables",
    cover_file_id: null,
    cover_layout: "vintage",
    cover_font: "Cormorant",
    cover_subtitle: "Delivered with care",
    cover_date: daysFromNow(-7),
    token: id().replace(/-/g, "").slice(0, 16),
    expires_at: null,
    selection_limit: 0,
    per_extra_photo_cents: 0,
    buy_all_flat_cents: 0,
    status: "delivered",
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from("deliveries").insert(deliveryRow);
  if (error) throw error;
}

async function main() {
  console.log(`Seeding demo account at ${SUPABASE_URL}`);
  await purgeExistingDemo();
  const userId = await getOrCreateAuthUser();
  const orgId = await createOrg();
  await createProfile(userId, orgId);
  const types = await seedProjectTypes(orgId);
  const clients = await seedClients(orgId);
  const locations = await seedLocations(orgId);
  const crew = await seedCrew(orgId);
  const projects = await seedProjects(orgId, clients, types);
  await assignCrewToProjects(projects, crew);
  await seedMileage(orgId, crew, locations);
  await seedBusinessExpenses(orgId);
  await seedInvoice(orgId, clients, projects);
  await seedPipelineLeads(orgId, clients);
  await seedProposalAndContract(orgId, clients, projects);
  await seedDelivery(orgId, projects);
  await seedServiceCategories(orgId);

  console.log("\nDone.");
  console.log("---------------------------------------");
  console.log(`  Email:    ${DEMO_EMAIL}`);
  console.log(`  Password: ${DEMO_PASSWORD}`);
  console.log(`  Org:      ${DEMO_ORG_NAME} (${orgId})`);
  console.log("---------------------------------------");
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
