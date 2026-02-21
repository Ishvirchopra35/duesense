import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!stripeSecretKey || !webhookSecret || !supabaseUrl || !serviceRoleKey) {
    return NextResponse.json(
      { error: "Missing webhook environment configuration." },
      { status: 500 }
    );
  }

  const stripe = new Stripe(stripeSecretKey);
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing Stripe signature." }, { status: 400 });
  }

  const payload = await request.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
  } catch {
    return NextResponse.json({ error: "Invalid webhook signature." }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId = session.metadata?.userId;

    if (!userId) {
      return NextResponse.json({ error: "Missing user metadata." }, { status: 400 });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { error: upsertError } = await supabase.from("subscriptions").upsert(
      {
        user_id: userId,
        status: "premium",
        stripe_customer_id:
          typeof session.customer === "string"
            ? session.customer
            : session.customer?.id ?? null,
        stripe_subscription_id:
          typeof session.subscription === "string"
            ? session.subscription
            : session.subscription?.id ?? null,
      },
      { onConflict: "user_id" }
    );

    if (upsertError) {
      return NextResponse.json({ error: upsertError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ received: true });
}
