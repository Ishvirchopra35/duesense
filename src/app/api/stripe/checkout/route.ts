import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import Stripe from "stripe";

export const runtime = "nodejs";

export async function POST() {
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  const stripePriceId = process.env.STRIPE_PRICE_ID;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!stripeSecretKey || !stripePriceId || !supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json(
      { error: "Stripe or Supabase environment is not configured." },
      { status: 500 }
    );
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      set() {},
      remove() {},
    },
  });

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const stripe = new Stripe(stripeSecretKey);
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: stripePriceId, quantity: 1 }],
    success_url: `${siteUrl}/dashboard?checkout=success`,
    cancel_url: `${siteUrl}/dashboard?checkout=cancel`,
    metadata: {
      userId: user.id,
    },
    subscription_data: {
      metadata: {
        userId: user.id,
      },
    },
  });

  return NextResponse.json({ url: session.url });
}
