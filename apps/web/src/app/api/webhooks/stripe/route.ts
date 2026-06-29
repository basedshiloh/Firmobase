import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { stripe, getPlanByPriceId } from "@/lib/stripe";
import { getSupabase } from "@/lib/supabase";

type SubFields = {
  current_period_start?: number;
  current_period_end?: number;
  cancel_at_period_end?: boolean;
  status?: string;
};

function extractPeriod(sub: Stripe.Subscription): SubFields {
  const raw = sub as unknown as Record<string, unknown>;
  const item = sub.items?.data?.[0] as unknown as Record<string, unknown> | undefined;

  return {
    current_period_start:
      (raw.current_period_start as number) ??
      (item?.current_period_start as number),
    current_period_end:
      (raw.current_period_end as number) ??
      (item?.current_period_end as number),
    cancel_at_period_end: sub.cancel_at_period_end,
    status: sub.status,
  };
}

function toIso(ts: number | undefined): string | null {
  return ts ? new Date(ts * 1000).toISOString() : null;
}

export async function POST(req: NextRequest) {
  if (!stripe) {
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  const body = await req.text();
  const sig = req.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig || !webhookSecret) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const sb = getSupabase();
  if (!sb) {
    return NextResponse.json({ error: "DB unavailable" }, { status: 503 });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const clerkUserId = session.metadata?.clerk_user_id;
      if (!clerkUserId || !session.subscription || !session.customer) break;

      const subscriptionId =
        typeof session.subscription === "string"
          ? session.subscription
          : session.subscription.id;
      const customerId =
        typeof session.customer === "string"
          ? session.customer
          : session.customer.id;

      const sub = await stripe.subscriptions.retrieve(subscriptionId);
      const priceId = sub.items.data[0]?.price?.id ?? "";
      const plan = getPlanByPriceId(priceId);
      const period = extractPeriod(sub);

      await sb.from("subscriptions").upsert(
        {
          clerk_user_id: clerkUserId,
          stripe_customer_id: customerId,
          stripe_subscription_id: subscriptionId,
          plan,
          status: period.status ?? "active",
          current_period_start: toIso(period.current_period_start),
          current_period_end: toIso(period.current_period_end),
          cancel_at_period_end: period.cancel_at_period_end ?? false,
        },
        { onConflict: "clerk_user_id" },
      );
      break;
    }

    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const clerkUserId = sub.metadata?.clerk_user_id;
      if (!clerkUserId) break;

      const priceId = sub.items.data[0]?.price?.id ?? "";
      const plan =
        event.type === "customer.subscription.deleted"
          ? "free"
          : getPlanByPriceId(priceId);
      const period = extractPeriod(sub);

      await sb.from("subscriptions").upsert(
        {
          clerk_user_id: clerkUserId,
          plan,
          status: period.status ?? "active",
          current_period_start: toIso(period.current_period_start),
          current_period_end: toIso(period.current_period_end),
          cancel_at_period_end: period.cancel_at_period_end ?? false,
        },
        { onConflict: "clerk_user_id" },
      );
      break;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const raw = invoice as unknown as Record<string, unknown>;
      const subField = raw.subscription;
      const subId =
        typeof subField === "string"
          ? subField
          : (subField as Record<string, string> | null)?.id;
      if (!subId) break;

      await sb
        .from("subscriptions")
        .update({ status: "past_due" })
        .eq("stripe_subscription_id", subId);
      break;
    }
  }

  return NextResponse.json({ received: true });
}
