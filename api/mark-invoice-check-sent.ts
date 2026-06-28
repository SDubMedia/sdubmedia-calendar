// ============================================================
// Broker taps "Check Mailed" on one of their invoices — record the date and
// notify the owner that a check is on the way. Brokers are the client role,
// which is read-only on invoices (RLS), so this runs with the service role
// after verifying the caller is the BROKER tied to this invoice.
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { verifyAuth, getUserOrgId, errorMessage } from "./_auth.js";
import { sendPushToUser } from "./_apns.js";
import { randomUUID } from "crypto";

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLL_KEY || ""
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const caller = await verifyAuth(req);
  if (!caller) return res.status(401).json({ error: "Unauthorized" });

  const { invoiceId } = req.body ?? {};
  if (!invoiceId || typeof invoiceId !== "string") return res.status(400).json({ error: "Missing invoiceId" });

  try {
    const callerOrgId = await getUserOrgId(caller.userId);

    // Caller must be a client whose linked client record IS this invoice's
    // recipient — and that record must be a broker (only brokers get this).
    const { data: profile } = await supabase
      .from("user_profiles").select("role, client_ids, org_id").eq("id", caller.userId).single();
    if (!profile || profile.role !== "client") return res.status(403).json({ error: "Only a broker can mark a check mailed" });

    const { data: invoice } = await supabase
      .from("invoices").select("id, client_id, org_id, invoice_number, total, status, check_sent_at").eq("id", invoiceId).single();
    if (!invoice) return res.status(404).json({ error: "Invoice not found" });
    if (invoice.org_id !== callerOrgId) return res.status(403).json({ error: "Cross-org" });
    if (!Array.isArray(profile.client_ids) || !profile.client_ids.includes(invoice.client_id)) {
      return res.status(403).json({ error: "This isn't your invoice" });
    }
    if (invoice.status === "paid" || invoice.status === "void") {
      return res.status(400).json({ error: "This invoice is already settled" });
    }

    const { data: broker } = await supabase
      .from("clients").select("id, company, contact_name, client_type").eq("id", invoice.client_id).single();
    if (!broker || broker.client_type !== "broker") return res.status(403).json({ error: "Only a broker can mark a check mailed" });

    const today = new Date().toISOString().slice(0, 10);
    const { error: updErr } = await supabase.from("invoices")
      .update({ check_sent_at: today, updated_at: new Date().toISOString() }).eq("id", invoiceId);
    if (updErr) throw new Error(updErr.message);

    // Notify owners + partners — bell + push — so they know to watch the mail.
    const brokerName = broker.company || broker.contact_name || "A broker";
    const amount = `$${Number(invoice.total || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const { data: recipients } = await supabase
      .from("user_profiles").select("id").eq("org_id", callerOrgId).in("role", ["owner", "partner"]);
    for (const o of recipients || []) {
      try {
        await supabase.from("notifications").insert({
          id: randomUUID(),
          user_id: o.id,
          type: "check_mailed",
          title: `${brokerName} mailed a check`,
          message: `Invoice #${invoice.invoice_number} · ${amount} — mark it paid when it arrives`,
          link: `/invoices`,
        });
      } catch (e) { console.error("check-mailed bell failed:", e); }
      try {
        await sendPushToUser(o.id, {
          title: `${brokerName} mailed a check`,
          body: `Invoice #${invoice.invoice_number} · ${amount}`,
          data: { url: "/invoices" },
        });
      } catch (e) { console.error("check-mailed push failed:", e); }
    }

    return res.status(200).json({ ok: true, checkSentAt: today });
  } catch (err) {
    console.error("mark-invoice-check-sent error:", err);
    return res.status(500).json({ error: errorMessage(err, "Couldn't mark check mailed") });
  }
}
