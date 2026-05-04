// ============================================================
// Public read for an invoice via its view_token. Token-gated, no
// auth — anyone with the link can see the invoice and pay.
//
// Returns just enough for the public page to render: line items,
// totals, payment methods the owner picked, plus the org's name +
// (if Venmo is selected) the org's Venmo username.
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { errorMessage } from "./_auth.js";

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLL_KEY || ""
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST required" });

  const token = typeof req.body?.token === "string" ? req.body.token.trim() : "";
  if (!token) return res.status(400).json({ error: "Missing token" });

  try {
    const { data: invoice, error } = await supabase
      .from("invoices")
      .select("*")
      .eq("view_token", token)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) throw error;
    if (!invoice) return res.status(404).json({ error: "Invoice not found or link expired" });

    const { data: org } = await supabase
      .from("organizations")
      .select("id, name, logo_url, business_info, stripe_account_id")
      .eq("id", invoice.org_id)
      .single();

    const businessInfo = (org?.business_info as { venmoUsername?: string; email?: string; phone?: string; website?: string } | null) || null;
    const rawMethods = Array.isArray(invoice.payment_methods) ? invoice.payment_methods : ["stripe"];
    const validMethods = rawMethods.filter((m: unknown): m is "stripe" | "venmo" => m === "stripe" || m === "venmo");

    return res.status(200).json({
      ok: true,
      invoice: {
        id: invoice.id,
        invoiceNumber: invoice.invoice_number,
        total: Number(invoice.total),
        subtotal: Number(invoice.subtotal),
        taxAmount: Number(invoice.tax_amount),
        status: invoice.status,
        issueDate: invoice.issue_date,
        dueDate: invoice.due_date,
        paidDate: invoice.paid_date,
        lineItems: invoice.line_items || [],
        clientInfo: invoice.client_info || {},
        notes: invoice.notes || "",
        paymentMethods: validMethods.length > 0 ? validMethods : ["stripe"],
      },
      org: {
        id: org?.id || "",
        name: org?.name || "",
        logoUrl: org?.logo_url || "",
        venmoUsername: businessInfo?.venmoUsername || "",
        stripeConnected: !!org?.stripe_account_id,
        contactEmail: businessInfo?.email || "",
        contactPhone: businessInfo?.phone || "",
        website: businessInfo?.website || "",
      },
    });
  } catch (err) {
    return res.status(500).json({ error: errorMessage(err, "Failed to load invoice") });
  }
}
