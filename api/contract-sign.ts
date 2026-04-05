// ============================================================
// Contract Signing API — Public endpoint for client signatures
// No auth required — uses sign_token for verification
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLL_KEY || ""
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { action, token } = req.query;

  try {
    switch (action) {
      case "get": return await getContract(token as string, res);
      case "sign": return await signContract(req, res);
      default: return res.status(400).json({ error: "Unknown action" });
    }
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

async function getContract(token: string, res: VercelResponse) {
  if (!token) return res.status(400).json({ error: "Missing token" });

  const { data: contract, error } = await supabase
    .from("contracts")
    .select("id, title, content, status, client_email, client_signed_at, owner_signed_at")
    .eq("sign_token", token)
    .single();

  if (error || !contract) return res.status(404).json({ error: "Contract not found" });
  if (contract.status === "void") return res.status(400).json({ error: "This contract has been voided" });
  if (contract.client_signed_at) return res.status(200).json({ ...contract, alreadySigned: true });

  // Get org name for branding
  const { data: org } = await supabase.from("contracts").select("org_id").eq("sign_token", token).single();
  let orgName = "";
  if (org?.org_id) {
    const { data: orgData } = await supabase.from("organizations").select("name").eq("id", org.org_id).single();
    orgName = orgData?.name || "";
  }

  return res.status(200).json({ ...contract, orgName, alreadySigned: false });
}

async function signContract(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST required" });

  const { token, signature } = req.body;
  if (!token || !signature) return res.status(400).json({ error: "Missing token or signature" });

  // Verify contract exists and is in correct status
  const { data: contract } = await supabase
    .from("contracts")
    .select("id, status, client_signed_at")
    .eq("sign_token", token)
    .single();

  if (!contract) return res.status(404).json({ error: "Contract not found" });
  if (contract.client_signed_at) return res.status(400).json({ error: "Already signed" });
  if (contract.status !== "sent") return res.status(400).json({ error: "Contract is not available for signing" });

  // Add IP address to signature
  const ip = req.headers["x-forwarded-for"] || req.headers["x-real-ip"] || "unknown";
  const fullSignature = {
    ...signature,
    ip: Array.isArray(ip) ? ip[0] : ip,
    timestamp: new Date().toISOString(),
  };

  // Update contract
  const { error } = await supabase.from("contracts").update({
    client_signature: fullSignature,
    client_signed_at: new Date().toISOString(),
    status: "client_signed",
    updated_at: new Date().toISOString(),
  }).eq("id", contract.id);

  if (error) return res.status(500).json({ error: error.message });

  return res.status(200).json({ success: true });
}
