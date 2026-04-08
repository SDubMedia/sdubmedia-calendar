// ============================================================
// Stripe Webhook — Handle subscription and payment events
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "");
const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLL_KEY || ""
);

export const config = {
  api: { bodyParser: false },
};

async function getRawBody(req: VercelRequest): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST required" });

  const sig = req.headers["stripe-signature"];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event: Stripe.Event;

  if (!webhookSecret) {
    return res.status(500).json({ error: "STRIPE_WEBHOOK_SECRET not configured — refusing to process unverified webhooks" });
  }
  if (!sig) {
    return res.status(400).json({ error: "Missing stripe-signature header" });
  }

  try {
    const body = await getRawBody(req);
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err: any) {
    return res.status(400).json({ error: `Webhook signature verification failed: ${err.message}` });
  }

  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      const orgId = sub.metadata?.orgId;
      const plan = sub.metadata?.plan || "basic";
      if (orgId) {
        await supabase.from("organizations").update({
          plan: sub.status === "active" || sub.status === "trialing" ? plan : "free",
        }).eq("id", orgId);
      }
      break;
    }

    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const orgId = sub.metadata?.orgId;
      if (orgId) {
        await supabase.from("organizations").update({ plan: "free" }).eq("id", orgId);
      }
      break;
    }

    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      // Handle invoice payment completion
      if (session.mode === "payment" && session.metadata?.invoiceId) {
        const today = new Date().toISOString().slice(0, 10);
        await supabase.from("invoices").update({
          status: "paid",
          paid_date: today,
        }).eq("id", session.metadata.invoiceId);

        // Mark linked projects as paid
        const { data: invoice } = await supabase.from("invoices").select("line_items").eq("id", session.metadata.invoiceId).single();
        if (invoice?.line_items) {
          const projectIds = (invoice.line_items as any[]).map((li: any) => li.projectId).filter(Boolean);
          for (const pid of projectIds) {
            await supabase.from("projects").update({ paid_date: today }).eq("id", pid);
          }
        }
      }
      break;
    }
  }

  return res.status(200).json({ received: true });
}
