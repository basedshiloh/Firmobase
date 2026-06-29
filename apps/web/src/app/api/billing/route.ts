import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { stripe } from "@/lib/stripe";
import { getSupabase } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  if (!stripe) {
    return NextResponse.json({ error: "Billing not configured" }, { status: 503 });
  }

  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const action = body.action as string;

  if (action === "checkout") {
    return handleCheckout(userId, body.priceId, req);
  }

  if (action === "portal") {
    return handlePortal(userId, req);
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sb = getSupabase();
  if (!sb) {
    return NextResponse.json({ plan: "free", status: "active" });
  }

  const { data } = await sb
    .from("subscriptions")
    .select("plan, status, current_period_end, cancel_at_period_end")
    .eq("clerk_user_id", userId)
    .single();

  if (!data) {
    return NextResponse.json({ plan: "free", status: "active" });
  }

  return NextResponse.json(data);
}

async function handleCheckout(userId: string, priceId: string, req: NextRequest) {
  if (!stripe || !priceId) {
    return NextResponse.json({ error: "Missing priceId" }, { status: 400 });
  }

  const sb = getSupabase();
  let customerId: string | undefined;

  if (sb) {
    const { data } = await sb
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("clerk_user_id", userId)
      .single();
    if (data?.stripe_customer_id) {
      customerId = data.stripe_customer_id;
    }
  }

  const origin = req.nextUrl.origin;

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    ...(customerId ? { customer: customerId } : {}),
    payment_method_types: ["card", "p24", "blik"],
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${origin}/dashboard?billing=success`,
    cancel_url: `${origin}/pricing?billing=cancelled`,
    metadata: { clerk_user_id: userId },
    subscription_data: {
      metadata: { clerk_user_id: userId },
    },
  });

  return NextResponse.json({ url: session.url });
}

async function handlePortal(userId: string, req: NextRequest) {
  if (!stripe) {
    return NextResponse.json({ error: "Billing not configured" }, { status: 503 });
  }

  const sb = getSupabase();
  if (!sb) {
    return NextResponse.json({ error: "No subscription found" }, { status: 404 });
  }

  const { data } = await sb
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("clerk_user_id", userId)
    .single();

  if (!data?.stripe_customer_id) {
    return NextResponse.json({ error: "No subscription found" }, { status: 404 });
  }

  const origin = req.nextUrl.origin;
  const session = await stripe.billingPortal.sessions.create({
    customer: data.stripe_customer_id,
    return_url: `${origin}/dashboard`,
  });

  return NextResponse.json({ url: session.url });
}
