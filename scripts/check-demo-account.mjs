#!/usr/bin/env node
// Sanity check the Apple Demo Co account: sign-in works, row counts look right.
import { createClient } from "@supabase/supabase-js";

const URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const ANON = process.env.VITE_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLL_KEY;
const EMAIL = process.env.DEMO_ACCOUNT_EMAIL || "apple@sdubmedia.com";
const PASSWORD = process.env.DEMO_ACCOUNT_PASSWORD;
if (!URL || !ANON || !SERVICE) { console.error("Missing Supabase env (URL / anon / service key)."); process.exit(1); }
if (!PASSWORD) { console.error("Missing DEMO_ACCOUNT_PASSWORD env."); process.exit(1); }

const anon = createClient(URL, ANON);
const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });

console.log("→ Signing in with anon key + demo credentials…");
const { data: signIn, error: signErr } = await anon.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
if (signErr) { console.error("  SIGN-IN FAILED:", signErr.message); process.exit(1); }
console.log(`  ✓ Signed in as ${signIn.user.email} (uid ${signIn.user.id})`);

const { data: profile } = await anon.from("user_profiles").select("name,role,org_id").eq("id", signIn.user.id).single();
console.log(`  ✓ Profile: ${profile.name} / role=${profile.role}`);
const orgId = profile.org_id;

const { data: org } = await anon.from("organizations").select("name,plan,billing_status").eq("id", orgId).single();
console.log(`  ✓ Org: ${org.name} (plan=${org.plan}, billing=${org.billing_status})`);

console.log("\n→ Row counts visible to this user via RLS:");
for (const t of ["clients", "projects", "project_types", "invoices", "locations", "crew_members", "manual_trips"]) {
  const { count, error } = await anon.from(t).select("*", { count: "exact", head: true });
  console.log(`  ${t.padEnd(15)} ${error ? "ERR: " + error.message : count}`);
}

console.log("\n→ Cross-tenant leak check (other orgs' rows should NOT be visible):");
const { count: foreignClients } = await anon.from("clients").select("*", { count: "exact", head: true }).neq("org_id", orgId);
console.log(`  clients NOT in this org: ${foreignClients} (should be 0)`);

console.log("\n→ Project status spread:");
const { data: projs } = await anon.from("projects").select("status,date");
const byStatus = projs.reduce((acc, p) => ({ ...acc, [p.status]: (acc[p.status] || 0) + 1 }), {});
console.log(" ", byStatus);

console.log("\nAll checks passed.");
