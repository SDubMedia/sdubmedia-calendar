// Public endpoint: client pays for over-limit selections via Stripe Connect.
// Called when /api/delivery-public action=submit returns 402 with checkout options.
//
// Body: { token, mode: "per-photo" | "flat", fileIds: string[], clientName, clientEmail, password? }
//
// Returns { url } — Stripe Checkout session URL on the org's connected account.
// On payment success, the existing stripe-webhook handler reads metadata and
// calls saveSelectionsAndAlert to finalize.

import type { VercelRequest, VercelResponse } from "@vercel/node";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { errorMessage, isAllowedUrl } from "./_auth.js";
import { verifyPassword } from "./_password.js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "");
const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLL_KEY || ""
);

const SLATE_BASE_URL = "https://slate.sdubmedia.com";
const MAX_PICKS_IN_METADATA = 40; // Stripe metadata value capped at 500 chars

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST required" });

  const body = (req.body || {}) as Record<string, unknown>;
  const token = typeof body.token === "string" ? body.token : "";
  const mode = body.mode === "flat" ? "flat" : "per-photo";
  const fileIds = Array.isArray(body.fileIds)
    ? body.fileIds.filter((x): x is string => typeof x === "string")
    : [];
  const clientName = typeof body.clientName === "string" ? body.clientName.trim() : "";
  const clientEmail = typeof body.clientEmail === "string" ? body.clientEmail.trim() : "";
  const password = typeof body.password === "string" ? body.password : undefined;

  if (!token) return res.status(400).json({ error: "Missing token" });
  if (!clientName || !clientEmail) return res.status(400).json({ error: "Name and email required" });
  if (fileIds.length === 0) return res.status(400).json({ error: "No selections" });
  if (fileIds.length > MAX_PICKS_IN_METADATA) {
    return res.status(400).json({ error: `Too many picks for paid checkout (max ${MAX_PICKS_IN_METADATA}). Submit in batches.` });
  }

  try {
    const { data: delivery, error } = await supabase
      .from("deliveries")
      .select("id, org_id, title, status, password_hash, selection_limit, per_extra_photo_cents, buy_all_flat_cents, project_id")
      .eq("token", token)
      .single();
    if (error || !delivery) return res.status(404).json({ error: "Gallery not found" });

    if (delivery.password_hash && (!password || !verifyPassword(password, delivery.password_hash))) {
      return res.status(401).json({ error: "Incorrect password" });
    }
    if (delivery.status === "delivered") return res.status(400).json({ error: "Gallery already finalized" });

    // Compute amount based on mode
    let unitAmount = 0;
    let productName = "";
    if (mode === "flat") {
      if (delivery.buy_all_flat_cents <= 0) return res.status(400).json({ error: "Flat option not available on this gallery" });
      unitAmount = delivery.buy_all_flat_cents;
      productName = `${delivery.title} — unlock all picks`;
    } else {
      if (delivery.per_extra_photo_cents <= 0) return res.status(400).json({ error: "Per-photo option not available on this gallery" });
      const overage = Math.max(0, fileIds.length - delivery.selection_limit);
      if (overage <= 0) return res.status(400).json({ error: "No overage to pay for — submit selections directly" });
      unitAmount = overage * delivery.per_extra_photo_cents;
      productName = `${delivery.title} — ${overage} extra photo${overage === 1 ? "" : "s"}`;
    }

    // Get the org's Stripe Connect account
    const { data: org } = await supabase
      .from("organizations")
      .select("stripe_account_id")
      .eq("id", delivery.org_id)
      .single();
    if (!org?.stripe_account_id) {
      return res.status(503).json({ error: "Payments not configured for this gallery's owner. Contact them directly." });
    }

    const origin = (req.headers.origin as string) || "";
    const successUrl = isAllowedUrl(origin) ? `${origin}/deliver/${token}?paid=1` : `${SLATE_BASE_URL}/deliver/${token}?paid=1`;
    const cancelUrl = isAllowedUrl(origin) ? `${origin}/deliver/${token}` : `${SLATE_BASE_URL}/deliver/${token}`;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: clientEmail,
      line_items: [{
        price_data: {
          currency: "usd",
          product_data: {
            name: productName,
          },
          unit_amount: unitAmount,
        },
        quantity: 1,
      }],
      metadata: {
        // Read by stripe-webhook on checkout.session.completed
        kind: "delivery_extras",
        deliveryId: delivery.id,
        orgId: delivery.org_id,
        token,
        clientName,
        clientEmail,
        fileIds: JSON.stringify(fileIds),
        mode,
      },
      success_url: successUrl,
      cancel_url: cancelUrl,
    }, {
      stripeAccount: org.stripe_account_id,
    });

    return res.status(200).json({ ok: true, url: session.url });
  } catch (err) {
    return res.status(500).json({ error: errorMessage(err, "Failed to create checkout session") });
  }
}
